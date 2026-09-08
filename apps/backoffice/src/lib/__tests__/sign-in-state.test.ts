import { describe, expect, it } from 'vitest'
import type { AdminSignInOutcome, MfaFactorSummary } from '../auth.ts'
import { messages } from '../messages.ts'
import {
  CREDENTIALS_ATTEMPT,
  SIGN_IN_FIELDS,
  SIGN_IN_RESTART,
  initialSignInState,
  resolveSignInOutcome,
  signInError,
  signInFactorOption,
  signInMfaState,
  signInRefusalState,
  type SignInAttempt,
  type SignInState,
} from '../sign-in-state.ts'

/**
 * What the sign-in form does with each answer `auth.ts` can give it.
 *
 * `signInAdmin()` and `completeMfaSignIn()` have six outcomes between them and
 * the form has three steps. The mapping between them is the whole of the
 * sign-in flow's behaviour — which sentence an operator reads, whether they are
 * asked for a code, whether they are told to wait — and it is pure, so it is
 * covered here in full rather than through a stubbed GoTrue.
 *
 * The properties these tests exist to hold:
 *
 *  1. **Every outcome is handled.** No variant falls through to a generic
 *     error, and none of them is silently treated as a wrong password.
 *  2. **The form is never an account-existence oracle.** An address that is not
 *     an address, an address nobody has, and a wrong password all produce one
 *     identical sentence.
 *  3. **A wrong code re-asks for the code.** The password was already accepted;
 *     sending the operator back to it would be a lie about what went wrong.
 *  4. **A rate-limited attempt says "wait", not "wrong password".**
 */

const FACTOR: MfaFactorSummary = {
  id: 'f0000000-0000-4000-8000-000000000001',
  friendlyName: 'iPhone',
  factorType: 'totp',
}

const SECOND_FACTOR: MfaFactorSummary = {
  id: 'f0000000-0000-4000-8000-000000000002',
  friendlyName: 'Yedek telefon',
  factorType: 'totp',
}

const AUTH_USER = 'b0000000-0000-4000-8000-000000000001'
const ADMIN_USER = 'a0000000-0000-4000-8000-000000000001'

/** The attempt an operator answering a code makes. */
function mfaAttempt(overrides: Partial<SignInAttempt> = {}): SignInAttempt {
  return {
    step: 'mfa',
    factors: [{ id: FACTOR.id, label: 'iPhone' }],
    factorId: FACTOR.id,
    ...overrides,
  }
}

/** Every outcome `auth.ts` can produce, one of each. */
const EVERY_OUTCOME: readonly AdminSignInOutcome[] = [
  { status: 'signed_in', adminUserId: ADMIN_USER, role: 'super_admin' },
  { status: 'mfa_required', factors: [FACTOR] },
  { status: 'mfa_enrolment_required' },
  { status: 'invalid_credentials' },
  { status: 'not_admin', authUserId: AUTH_USER },
  { status: 'rate_limited', retryAfterSeconds: 900 },
]

function stateFor(outcome: AdminSignInOutcome, attempt: SignInAttempt): SignInState {
  const resolution = resolveSignInOutcome(outcome, attempt)
  if (resolution.kind !== 'state') throw new Error(`${outcome.status} does not render a state`)
  return resolution.state
}

describe('every outcome is accounted for', () => {
  it('covers all six variants and only navigates on the one that signed in', () => {
    expect(EVERY_OUTCOME).toHaveLength(6)
    expect(new Set(EVERY_OUTCOME.map((outcome) => outcome.status)).size).toBe(6)

    for (const outcome of EVERY_OUTCOME) {
      const resolution = resolveSignInOutcome(outcome, CREDENTIALS_ATTEMPT)
      expect(resolution.kind).toBe(outcome.status === 'signed_in' ? 'signed_in' : 'state')
    }
  })

  it('never answers an outcome with the infrastructure message', () => {
    // `unavailable` is what a thrown AppError produces. An outcome is a decision
    // the platform made and reporting one as an outage would send an operator to
    // check a service that is working.
    for (const outcome of EVERY_OUTCOME) {
      if (outcome.status === 'signed_in') continue
      for (const attempt of [CREDENTIALS_ATTEMPT, mfaAttempt()]) {
        expect(stateFor(outcome, attempt).error).not.toBe(messages.auth.unavailable)
      }
    }
  })

  it('leaves the form on a step it can actually render', () => {
    for (const outcome of EVERY_OUTCOME) {
      if (outcome.status === 'signed_in') continue
      for (const attempt of [CREDENTIALS_ATTEMPT, mfaAttempt()]) {
        const state = stateFor(outcome, attempt)
        // A code box with no factor behind it is a control that cannot succeed.
        if (state.step === 'mfa') {
          expect(state.factorId).not.toBeNull()
          expect(state.factors.length).toBeGreaterThan(0)
        } else {
          expect(state.factors).toEqual([])
          expect(state.factorId).toBeNull()
        }
      }
    }
  })
})

describe('the credentials step', () => {
  it('asks for the second factor when one is enrolled', () => {
    const state = stateFor({ status: 'mfa_required', factors: [FACTOR] }, CREDENTIALS_ATTEMPT)
    expect(state.step).toBe('mfa')
    expect(state.error).toBeNull()
    expect(state.factorId).toBe(FACTOR.id)
    expect(state.factors).toEqual([{ id: FACTOR.id, label: 'iPhone' }])
  })

  it('offers every factor and pre-selects the first', () => {
    const state = stateFor(
      { status: 'mfa_required', factors: [FACTOR, SECOND_FACTOR] },
      CREDENTIALS_ATTEMPT,
    )
    expect(state.factors.map((factor) => factor.id)).toEqual([FACTOR.id, SECOND_FACTOR.id])
    expect(state.factorId).toBe(FACTOR.id)
  })

  it('names a factor GoTrue left unnamed rather than showing an empty option', () => {
    expect(signInFactorOption({ id: 'x', friendlyName: null, factorType: 'totp' }).label).toBe(
      messages.auth.mfaFactorFallback,
    )
    expect(signInFactorOption({ id: 'x', friendlyName: '   ', factorType: 'totp' }).label).toBe(
      messages.auth.mfaFactorFallback,
    )
    expect(signInFactorOption(SECOND_FACTOR).label).toBe('Yedek telefon')
  })

  it('does not ask for a code it has no factor to check, and says why', () => {
    // `auth.ts` does not produce this today. If it ever did, a code box would be
    // a control that cannot succeed, so the honest answer is the enrolment page.
    const state = stateFor({ status: 'mfa_required', factors: [] }, CREDENTIALS_ATTEMPT)
    expect(state.step).toBe('enrol_mfa')
    expect(state.error).toBe(messages.auth.mfaEnrolmentRequired)
  })

  it('sends an account with no console authorization back to the start', () => {
    const state = stateFor({ status: 'not_admin', authUserId: AUTH_USER }, CREDENTIALS_ATTEMPT)
    expect(state.step).toBe('credentials')
    expect(state.error).toBe(messages.auth.notStaff)
  })

  it('names nobody: the refusal carries no address and no identifier', () => {
    const serialised = JSON.stringify(
      stateFor({ status: 'not_admin', authUserId: AUTH_USER }, CREDENTIALS_ATTEMPT),
    )
    expect(serialised).not.toContain(AUTH_USER)
  })
})

describe('the form is not an account-existence oracle', () => {
  it('answers a wrong password and an unknown address with one sentence', () => {
    // Both reach the mapping as `invalid_credentials`: GoTrue does not tell the
    // console which half was wrong, and the console does not invent the answer.
    const state = stateFor({ status: 'invalid_credentials' }, CREDENTIALS_ATTEMPT)
    expect(state.error).toBe(messages.auth.invalidCredentials)
    expect(state.step).toBe('credentials')
  })

  it('answers a malformed address with that same sentence', () => {
    // The action refuses an unparseable address through this same call rather
    // than writing its own message, so the two cannot drift apart.
    const malformed = signInRefusalState({ status: 'invalid_credentials' }, CREDENTIALS_ATTEMPT)
    const wrongPassword = stateFor({ status: 'invalid_credentials' }, CREDENTIALS_ATTEMPT)
    expect(malformed).toEqual(wrongPassword)
  })

  it('says nothing about admin status in the credentials refusal', () => {
    const state = stateFor({ status: 'invalid_credentials' }, CREDENTIALS_ATTEMPT)
    expect(state.error).not.toBe(messages.auth.notStaff)
    expect(state.error).not.toBe(messages.auth.disabled)
  })
})

describe('the MFA step', () => {
  it('re-asks for the code rather than for the password', () => {
    const state = stateFor({ status: 'invalid_credentials' }, mfaAttempt())
    expect(state.step).toBe('mfa')
    expect(state.error).toBe(messages.auth.mfaInvalidCode)
    expect(state.error).not.toBe(messages.auth.invalidCredentials)
    expect(state.factorId).toBe(FACTOR.id)
  })

  it('keeps the chooser the operator was answering', () => {
    const attempt = mfaAttempt({
      factors: [
        { id: FACTOR.id, label: 'iPhone' },
        { id: SECOND_FACTOR.id, label: 'Yedek telefon' },
      ],
      factorId: SECOND_FACTOR.id,
    })
    const state = stateFor({ status: 'invalid_credentials' }, attempt)
    expect(state.factors).toHaveLength(2)
    expect(state.factorId).toBe(SECOND_FACTOR.id)
  })

  it('rebuilds a factor list for a form submitted before hydration', () => {
    // React hands an action the *initial* state in that case, so the factor list
    // is gone and only the posted factor id survives.
    const state = signInMfaState({ step: 'mfa', factors: [], factorId: FACTOR.id })
    expect(state.step).toBe('mfa')
    expect(state.factors).toEqual([{ id: FACTOR.id, label: messages.auth.mfaFactorFallback }])
  })

  it('falls back to the password step when the attempt names no factor at all', () => {
    expect(signInMfaState({ step: 'mfa', factors: [], factorId: null })).toEqual(initialSignInState)
  })

  it('does not tell an operator on the password form that their code was wrong', () => {
    // The message follows the step the form lands on, not the step it claimed.
    const state = stateFor(
      { status: 'invalid_credentials' },
      {
        step: 'mfa',
        factors: [],
        factorId: null,
      },
    )
    expect(state.step).toBe('credentials')
    expect(state.error).toBe(messages.auth.invalidCredentials)
  })

  it('still sends a de-authorised account back to the password step', () => {
    // Disabled between the two steps: their code is fine and their account is
    // not, so there is nothing to answer where they are standing.
    const state = stateFor({ status: 'not_admin', authUserId: AUTH_USER }, mfaAttempt())
    expect(state.step).toBe('credentials')
    expect(state.error).toBe(messages.auth.notStaff)
  })
})

describe('the enrolment terminal state', () => {
  it('explains the refusal instead of offering a control that cannot work', () => {
    const state = stateFor({ status: 'mfa_enrolment_required' }, CREDENTIALS_ATTEMPT)
    expect(state.step).toBe('enrol_mfa')
    expect(state.error).toBe(messages.auth.mfaEnrolmentRequired)
    expect(state.factors).toEqual([])
  })

  it('is reached from the MFA step too, not only from the password step', () => {
    expect(stateFor({ status: 'mfa_enrolment_required' }, mfaAttempt()).step).toBe('enrol_mfa')
  })

  it('says who can fix it and why the console will not', () => {
    expect(messages.auth.mfaEnrolmentHelp).toContain('super_admin')
    expect(messages.auth.mfaEnrolmentHelp.length).toBeGreaterThan(80)
  })
})

describe('a rate-limited attempt', () => {
  it('tells the operator to wait and not that their password was wrong', () => {
    const state = stateFor({ status: 'rate_limited', retryAfterSeconds: 900 }, CREDENTIALS_ATTEMPT)
    expect(state.error).toBe(messages.auth.rateLimitedFor(15))
    expect(state.error).not.toBe(messages.auth.invalidCredentials)
    expect(state.error).toContain('15 dakika')
    expect(state.error).toContain('bekle')
  })

  it('rounds a partial minute up rather than promising a shorter wait', () => {
    const state = stateFor({ status: 'rate_limited', retryAfterSeconds: 61 }, CREDENTIALS_ATTEMPT)
    expect(state.error).toBe(messages.auth.rateLimitedFor(2))
  })

  it('never says "wait 0 minutes"', () => {
    const state = stateFor({ status: 'rate_limited', retryAfterSeconds: 0 }, CREDENTIALS_ATTEMPT)
    expect(state.error).toBe(messages.auth.rateLimitedFor(1))
  })

  it('keeps an operator who was answering a code on the code step', () => {
    const state = stateFor({ status: 'rate_limited', retryAfterSeconds: 900 }, mfaAttempt())
    expect(state.step).toBe('mfa')
    expect(state.factorId).toBe(FACTOR.id)
    expect(state.error).toBe(messages.auth.rateLimitedFor(15))
  })
})

describe('the state the form starts from', () => {
  it('is the credentials step with nothing wrong', () => {
    expect(initialSignInState).toEqual({
      error: null,
      step: 'credentials',
      factors: [],
      factorId: null,
    })
  })

  it('attaches a message without moving the operator off their step', () => {
    const attached = signInError(signInMfaState(mfaAttempt()), messages.auth.mfaCodeRequired)
    expect(attached.step).toBe('mfa')
    expect(attached.factorId).toBe(FACTOR.id)
    expect(attached.error).toBe(messages.auth.mfaCodeRequired)
  })

  it('names the fields the form and the action have to agree on', () => {
    expect(SIGN_IN_FIELDS.email).toBe('email')
    expect(SIGN_IN_FIELDS.password).toBe('password')
    expect(new Set(Object.values(SIGN_IN_FIELDS)).size).toBe(Object.keys(SIGN_IN_FIELDS).length)
    expect(SIGN_IN_RESTART).not.toBe('')
  })
})
