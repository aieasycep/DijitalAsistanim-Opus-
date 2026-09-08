import { randomBytes, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { AdminFixture, AdminKey, EntityFixtures } from './state.ts'

/**
 * The fixture dataset, written straight into the real schema.
 *
 * Two shapes matter here and the rest is scenery.
 *
 *   1. **Admins across roles.** Sign-in resolves through `staff_members` and
 *      `admin_resolve_by_auth_user()`, and authorization resolves through
 *      `admin_role_permissions`, so an admin fixture is an `auth.users` row, a
 *      `staff_members` row, an `admin_users` row, and a password only this run
 *      knows. Five roles are seeded because the interesting cases are
 *      comparative: `helpdesk` may ask for Support Access and may not approve
 *      it, `ops` may approve and did not ask, `money` may not see a feature flag
 *      at all.
 *
 *   2. **One user whose own words are in the database.** Every content column
 *      the product fills — a mail subject and body, a calendar title, an
 *      assistant message, a capture, a notification, an approval, even the
 *      display name — carries the run's sentinel. The console reads that user
 *      through `bo_*` views on every one of its screens, and the whole point of
 *      those views is that not one of those strings can come back out.
 *
 * Passwords and the sentinel are generated per run: there is nothing in this
 * file to commit, and a leak of the artifacts directory is a leak of nothing
 * that outlives the process.
 */

export interface SeedResult {
  readonly admins: Readonly<Record<AdminKey, AdminFixture>>
  readonly subjectUserId: string
  readonly subjectEmail: string
  readonly otherUserId: string
  readonly otherEmail: string
  readonly entities: EntityFixtures
}

interface AdminPlan {
  readonly key: AdminKey
  readonly role: string
  readonly staffRole: string
  readonly displayName: string
}

/**
 * `staff_role` is the superseded three-tier vocabulary from 0017, and the first
 * pass's sign-in action still checks it. The mapping is the same one
 * `auth.ts`'s bridge makes: the tier stands for what the role can actually do.
 */
const ADMIN_PLAN: readonly AdminPlan[] = [
  { key: 'owner', role: 'super_admin', staffRole: 'admin', displayName: 'Nihal Süper' },
  { key: 'ops', role: 'operations', staffRole: 'ops', displayName: 'Onur Operasyon' },
  { key: 'helpdesk', role: 'support', staffRole: 'support', displayName: 'Derya Destek' },
  { key: 'money', role: 'finance', staffRole: 'support', displayName: 'Fikret Finans' },
  { key: 'viewer', role: 'readonly', staffRole: 'support', displayName: 'Rana Rapor' },
]

/** Long, random, and never the same twice. */
function password(): string {
  return `fixture-${randomBytes(18).toString('base64url')}`
}

/**
 * A string that exists nowhere else on earth, in a shape a human reviewer can
 * spot in a diff or a screenshot.
 */
export function newSentinel(): string {
  return `KAPALIZARF-${randomBytes(9).toString('hex').toUpperCase()}`
}

export async function seedFixtures(pool: Pool, sentinel: string): Promise<SeedResult> {
  const client = await pool.connect()
  try {
    await client.query('begin')

    // The credential store is the fixture GoTrue's whole user database. It lives
    // in its own schema so nothing in `public` can be mistaken for it, and it is
    // created here rather than in a migration because it must never exist in a
    // real project.
    await client.query('create schema if not exists e2e_fixture')
    await client.query(`
      create table if not exists e2e_fixture.credentials (
        user_id uuid primary key references auth.users (id) on delete cascade,
        email text not null unique,
        password text not null
      )
    `)

    const admins = {} as Record<AdminKey, AdminFixture>
    for (const plan of ADMIN_PLAN) {
      const authUserId = randomUUID()
      const adminUserId = randomUUID()
      const email = `${plan.key}@backoffice.example.com`
      const secret = password()

      await client.query(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)',
        [authUserId, email, JSON.stringify({ full_name: plan.displayName })],
      )
      await client.query(
        'insert into e2e_fixture.credentials (user_id, email, password) values ($1, $2, $3)',
        [authUserId, email, secret],
      )
      await client.query('insert into public.staff_members (user_id, role) values ($1, $2)', [
        authUserId,
        plan.staffRole,
      ])
      await client.query(
        `insert into public.admin_users (id, user_id, email, display_name, role, status)
         values ($1, $2, $3, $4, $5, 'active')`,
        [adminUserId, authUserId, email, plan.displayName, plan.role],
      )

      admins[plan.key] = {
        key: plan.key,
        adminUserId,
        authUserId,
        email,
        password: secret,
        role: plan.role,
        displayName: plan.displayName,
      }
    }

    const subject = await seedUser(client, {
      email: 'zeynep@ornekmusteri.com',
      sentinel,
      accounts: 2,
    })
    const other = await seedUser(client, {
      email: 'baris@baskafirma.com',
      sentinel: null,
      accounts: 1,
    })

    const owner = admins.owner
    const helpdesk = admins.helpdesk

    // ── The support queue ──────────────────────────────────────────────────
    const ticketId = randomUUID()
    const ticketResult = await client.query<{ reference: string }>(
      `insert into public.support_tickets
         (id, subject_user_id, status, priority, category, channel, subject, body,
          assigned_admin_user_id, opened_by_admin_user_id, due_at)
       values ($1, $2, 'open', 'high', 'sync', 'in_app', $3, $4, $5, $6, now() + interval '2 days')
       returning reference`,
      [
        ticketId,
        subject.userId,
        'Posta senkronizasyonu duruyor',
        'Kullanıcı iki gündür yeni posta göremediğini bildirdi.',
        helpdesk.adminUserId,
        helpdesk.adminUserId,
      ],
    )
    const ticketReference = ticketResult.rows[0]?.reference ?? ''
    await client.query(
      `insert into public.support_notes (ticket_id, admin_user_id, body, is_internal)
       values ($1, $2, $3, true)`,
      [
        ticketId,
        helpdesk.adminUserId,
        'Bağlantı sağlığı kontrol edildi, yeniden yetkilendirme istendi.',
      ],
    )

    // ── Product surfaces ───────────────────────────────────────────────────
    const flagId = randomUUID()
    const flagKey = 'briefing.evening_close'
    await client.query(
      `insert into public.feature_flags
         (id, key, description, enabled, kill_switch, rollout_percentage, platforms, plans, created_by)
       values ($1, $2, $3, true, false, 25, $4::app_platform[], $5::app_plan[], $6)`,
      [flagId, flagKey, 'Akşam kapanış brifingi', ['ios', 'android'], ['pro'], owner.adminUserId],
    )
    await client.query(
      `insert into public.feature_flag_overrides (flag_id, user_id, enabled, reason, created_by)
       values ($1, $2, true, $3, $4)`,
      [flagId, subject.userId, 'Destek talebi için erken açıldı', owner.adminUserId],
    )

    const announcementId = randomUUID()
    await client.query(
      `insert into public.announcements
         (id, title, body, audience, platforms, locale, starts_at, published_at, published_by, created_by)
       values ($1, $2, $3, 'all', '{}'::app_platform[], 'tr', now() - interval '1 day',
               now() - interval '1 day', $4, $4)`,
      [
        announcementId,
        'Bakım penceresi',
        'Cumartesi 02:00-04:00 arasında kısa kesinti olabilir.',
        owner.adminUserId,
      ],
    )

    const promptId = randomUUID()
    await client.query(
      `insert into public.prompt_versions
         (id, feature, version, status, body, notes, model, created_by, activated_by, activated_at)
       values ($1, 'briefing.morning', 1, 'active', $2, $3, 'claude-sonnet', $4, $4, now())`,
      [
        promptId,
        'Kullanıcının gününü üç başlıkta özetle. Yalnızca verilen bağlamı kullan.',
        'İlk sürüm.',
        owner.adminUserId,
      ],
    )

    const entitlementGrantId = randomUUID()
    await client.query(
      `insert into public.admin_entitlement_grants
         (id, user_id, kind, days, reason, granted_by, granted_at, expires_at, ticket_id)
       values ($1, $2, 'goodwill', 30, $3, $4, now(), now() + interval '30 days', $5)`,
      [
        entitlementGrantId,
        subject.userId,
        'Senkronizasyon kesintisi telafisi',
        owner.adminUserId,
        ticketId,
      ],
    )

    // ── A Support Access request waiting for a second pair of eyes ─────────
    const pendingGrantId = randomUUID()
    await client.query(
      `insert into public.support_access_grants
         (id, admin_user_id, subject_user_id, scopes, reason, ticket_id, status, requested_at, expires_at)
       values ($1, $2, $3, $4::support_access_scope[], $5, $6, 'pending_approval',
               now(), now() + interval '1 hour')`,
      [
        pendingGrantId,
        helpdesk.adminUserId,
        subject.userId,
        ['identity', 'email_subject'],
        'Kullanıcı iki gündür posta göremiyor; başlıkları görmeden hangi klasörün eksik olduğunu anlayamıyoruz.',
        ticketId,
      ],
    )

    // ── Observed health, so the status chip is a measurement ───────────────
    for (const target of ['database', 'gotrue', 'storage'] as const) {
      await client.query('select public.admin_record_health_check($1, $2, $3, $4, $5)', [
        target,
        'operational',
        42,
        null,
        'probe',
      ])
    }

    // ── A trail with something in it ──────────────────────────────────────
    await client.query(
      `select public.admin_write_audit($1, 'admin.signed_in', null, null, 'admin_user', $2, 'success', null, '{}'::jsonb)`,
      [owner.adminUserId, owner.adminUserId],
    )
    await client.query(
      `select public.admin_write_audit($1, 'feature_flag.changed', $2, null, 'feature_flag', $3, 'success', null, $4::jsonb)`,
      [
        owner.adminUserId,
        'Akşam brifingi yüzde 25 ile açıldı',
        flagId,
        JSON.stringify({ rollout_percentage: 25 }),
      ],
    )

    await client.query('commit')

    return {
      admins,
      subjectUserId: subject.userId,
      subjectEmail: subject.email,
      otherUserId: other.userId,
      otherEmail: other.email,
      entities: {
        ticketId,
        ticketReference,
        pendingGrantId,
        flagId,
        flagKey,
        promptId,
        announcementId,
        entitlementGrantId,
        emailMessageId: subject.emailMessageId,
        emailThreadId: subject.emailThreadId,
      },
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

interface SeededUser {
  readonly userId: string
  readonly email: string
  readonly emailThreadId: string
  readonly emailMessageId: string
}

interface UserPlan {
  readonly email: string
  /** When set, every content column this user owns carries it. */
  readonly sentinel: string | null
  readonly accounts: number
}

/**
 * One product user, with the volume the console counts and — for the sentinel
 * user — the content it must never show.
 */
async function seedUser(client: PoolClient, plan: UserPlan): Promise<SeededUser> {
  const userId = randomUUID()
  const mark = plan.sentinel
  const suffix = mark === null ? '' : ` ${mark}`

  await client.query('insert into auth.users (id, email) values ($1, $2)', [userId, plan.email])

  // `handle_new_user()` already created the profile, the preference rows, a free
  // subscription and a referral code — the same trigger that runs on a real
  // signup. The fixture edits what it created rather than inserting beside it,
  // so the row graph under a seeded user is the one the product produces.
  await client.query(
    `update public.profiles
        set display_name = $2,
            given_name = $3,
            onboarding_completed_at = now() - interval '40 days',
            created_at = now() - interval '60 days'
      where id = $1`,
    [userId, mark === null ? 'Barış Yılmaz' : `Zeynep ${mark}`, mark === null ? 'Barış' : mark],
  )
  await client.query(
    `update public.subscriptions
        set status = 'active',
            entitlement = 'pro',
            product_id = 'da.pro.monthly',
            store = 'app_store',
            current_period_end = now() + interval '20 days'
      where user_id = $1`,
    [userId],
  )

  const accountId = randomUUID()
  await client.query(
    `insert into public.connected_accounts
       (id, user_id, provider, kinds, external_account_id, display_name, email, status,
        granted_scopes, last_synced_at, is_primary)
     values ($1, $2, 'google', $3::account_kind[], $4, $5, $6, 'connected', $7, now() - interval '10 minutes', true)`,
    [
      accountId,
      userId,
      ['mail', 'calendar'],
      `google-${userId.slice(0, 8)}`,
      'Google Workspace',
      plan.email,
      ['https://www.googleapis.com/auth/gmail.readonly'],
    ],
  )
  await client.query(
    `insert into public.sync_states (user_id, connected_account_id, resource, status, last_run_at, next_run_at)
     values ($1, $2, 'mail', 'idle', now() - interval '9 minutes', now() + interval '5 minutes')`,
    [userId, accountId],
  )
  if (plan.accounts > 1) {
    await client.query(
      `insert into public.sync_states
         (user_id, connected_account_id, resource, status, consecutive_failures, last_error, last_run_at)
       values ($1, $2, 'calendar', 'error', 3, 'invalid_grant', now() - interval '2 hours')`,
      [userId, accountId],
    )
  }

  const threadId = randomUUID()
  const messageId = randomUUID()
  await client.query(
    `insert into public.email_threads
       (id, user_id, connected_account_id, external_thread_id, subject, participant_emails,
        last_message_at, message_count, importance, category, summary, requires_user_action)
     values ($1, $2, $3, $4, $5, $6, now() - interval '3 hours', 2, 'high', 'action_required', $7, true)`,
    [
      threadId,
      userId,
      accountId,
      `thread-${threadId.slice(0, 8)}`,
      `Teklif revizyonu${suffix}`,
      [plan.email, 'muhasebe@tedarikci.example'],
      `Karşı taraf revize teklifi bekliyor.${suffix}`,
    ],
  )
  await client.query(
    `insert into public.email_messages
       (id, user_id, thread_id, connected_account_id, external_message_id, from_email, from_name,
        to_emails, subject, snippet, body_text, sent_at, content_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() - interval '3 hours', $12)`,
    [
      messageId,
      userId,
      threadId,
      accountId,
      `message-${messageId.slice(0, 8)}`,
      'muhasebe@tedarikci.example',
      `Muhasebe${suffix}`,
      [plan.email],
      `Teklif revizyonu${suffix}`,
      `Revize teklifi ekte gönderiyoruz.${suffix}`,
      `Merhaba,\n\nRevize teklifi ekte bulabilirsiniz.${suffix}\n\nİyi çalışmalar.`,
      `hash-${messageId.slice(0, 12)}`,
    ],
  )

  await client.query(
    `insert into public.calendar_events
       (user_id, connected_account_id, external_event_id, provider, title, description, location,
        starts_at, ends_at, organizer_email)
     values ($1, $2, $3, 'google', $4, $5, 'Toplantı Odası 2',
             now() + interval '1 day', now() + interval '1 day 1 hour', $6)`,
    [
      userId,
      accountId,
      `event-${userId.slice(0, 8)}`,
      `Bütçe toplantısı${suffix}`,
      `Revize teklif görüşülecek.${suffix}`,
      plan.email,
    ],
  )

  const assistantThreadId = randomUUID()
  await client.query(
    `insert into public.assistant_threads (id, user_id, title, last_message_at, message_count)
     values ($1, $2, $3, now() - interval '1 hour', 1)`,
    [assistantThreadId, userId, `Teklif özeti${suffix}`],
  )
  await client.query(
    `insert into public.assistant_messages (user_id, thread_id, role, content, model)
     values ($1, $2, 'user', $3, null)`,
    [userId, assistantThreadId, `Bu teklifi özetler misin?${suffix}`],
  )

  await client.query(
    `insert into public.captures (user_id, kind, status, raw_text, detected_intent, analyzed_at)
     values ($1, 'photo', 'ready', $2, 'payment', now() - interval '2 hours')`,
    [userId, `Fatura tutarı 4.250 TL${suffix}`],
  )

  await client.query(
    `insert into public.notification_deliveries
       (user_id, category, dedupe_key, title, body, scheduled_for, sent_at, delivered_at)
     values ($1, 'critical_email', $2, $3, $4, now() - interval '4 hours',
             now() - interval '4 hours', now() - interval '4 hours')`,
    [
      userId,
      `critical-${userId.slice(0, 8)}`,
      `Acil e-posta${suffix}`,
      `Teklif revizyonu bekleniyor.${suffix}`,
    ],
  )

  await client.query(
    `insert into public.approval_actions
       (user_id, type, status, what, why, source_type, payload, original_payload,
        idempotency_key, expires_at)
     values ($1, 'email_send', 'pending', $2, $3, 'email', $4::jsonb, $4::jsonb, $5,
             now() + interval '12 hours')`,
    [
      userId,
      `Teklife yanıt gönder${suffix}`,
      `Karşı taraf yanıt bekliyor.${suffix}`,
      JSON.stringify({ subject: `Re: Teklif revizyonu${suffix}` }),
      `approval-${userId.slice(0, 8)}`,
    ],
  )

  await client.query(
    `insert into public.data_export_requests (user_id, status, created_at)
     values ($1, 'requested', now() - interval '6 hours')`,
    [userId],
  )

  await client.query(
    `insert into public.ai_usage_events (user_id, model, operation, tokens_in, tokens_out, cost_micros, occurred_at)
     values ($1, 'claude-sonnet', 'briefing', 1800, 420, 9100, now() - interval '5 hours'),
            ($1, 'claude-haiku', 'triage', 600, 90, 1200, now() - interval '20 hours')`,
    [userId],
  )

  return { userId, email: plan.email, emailThreadId: threadId, emailMessageId: messageId }
}
