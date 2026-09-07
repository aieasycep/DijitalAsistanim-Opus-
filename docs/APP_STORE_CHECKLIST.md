# App Store and Play submission checklist

Both stores reject this category of app for the same handful of reasons:
unexplained permissions, a privacy label that does not match the code, and a
reviewer who cannot get past sign-in. Each is addressed below.

---

## Before submitting, either store

- [ ] `pnpm verify` green on the commit being shipped
- [ ] Version and build number incremented
- [ ] Privacy policy and terms live at `/privacy` and `/terms`, reachable
      without a login
- [ ] Support address monitored — both stores email it and both expect a reply
- [ ] Account deletion working end to end in the shipped build (required by
      both stores since 2022)
- [ ] Demo mode working, because it is how the reviewer sees the app

---

## The reviewer's account

Both stores need a working account, and this app is useless without connected
mail. Do not send a reviewer a real mailbox.

**Send them demo mode.** In the review notes:

> The app has a demo mode requiring no account and no email connection. On the
> first screen, tap **"Demo'yu keşfet" / "Explore the demo"**. It is populated
> with realistic sample data — a full day of mail, meetings, commitments and
> pending approvals — and works entirely offline.

If the reviewer needs to see a real OAuth consent screen, provision a
throwaway Google account with a few seeded messages and supply it in the notes.
Do not send a reviewer an account with anyone's real mail in it.

This is also the honest answer to "why does the app need Gmail access": the
reviewer can see the briefing being built from mail without handing over their
own.

---

## App Store

### Privacy nutrition label

Declare, with **Linked to You** where the data is tied to an account:

| Category                                  | Collected | Linked | Tracking |
| ----------------------------------------- | --------- | ------ | -------- |
| Contact info (email address)              | Yes       | Yes    | No       |
| User content (emails, calendar, captures) | Yes       | Yes    | No       |
| Identifiers (user id)                     | Yes       | Yes    | No       |
| Usage data                                | Yes       | No     | No       |
| Diagnostics                               | Yes       | No     | No       |

**Tracking: No**, across the board. There is no advertising SDK and no data
broker. Answering otherwise would be false, and answering "Yes" to tracking
triggers the ATT prompt requirement for a permission the app does not need.

The label must match what the code does. `check-secrets.mjs` and the analytics
guard exist partly so this answer stays true.

### Permission strings

Every `NS*UsageDescription` in `app.config.ts` says what the app does with the
data, in Turkish, in one sentence. Apple rejects generic strings. The camera
string, for example, is not "to use the camera" but "to capture a document or a
screen and extract what is in it".

`NSUserTrackingUsageDescription` is present but the app never presents the ATT
prompt — it exists because a framework could trigger it, and the string says
plainly that the app does not track.

### Guideline 5.1.1(v) — account deletion

Settings → Privacy → Delete account. In the review notes, name that path. A
reviewer who cannot find it rejects the build.

### Guideline 3.1.1 — in-app purchase

Subscriptions go through StoreKit via RevenueCat. There is no link to an
external purchase page anywhere in the app. Referral bonuses grant days, never
a discount on the store price.

### Guideline 4.2 — minimum functionality

Not a repackaged website. The review notes should mention the native widget,
the share extension, and the fact that no screen is a web view.

### Sign in with Apple

Required, because Google sign-in is offered. Implemented with
`expo-apple-authentication` and offered with equal prominence.

### Screenshots

6.7" and 6.5" iPhone required; iPad not needed (`supportsTablet: false`).
Screenshots must show the actual app, from demo mode — not a marketing
composite. Both light and dark are worth including.

---

## Google Play

### Data safety form

Mirrors the Apple table above, plus:

- **Encrypted in transit**: yes.
- **Users can request deletion**: yes, in-app, and name the path.
- **Data shared with third parties**: yes — the model provider, for analysis,
  under contract. Declaring this is not optional and reviewers check it against
  the privacy policy.

### Notification listener declaration

This is the part that gets rejected. Play requires a specific justification for
`BIND_NOTIFICATION_LISTENER_SERVICE`, and a demonstration video.

The justification: the app reads delivery, banking and booking notifications
to build a single view of the user's day, alongside mail and calendar. It is
opt-in, it never reads one-time-code or password-manager notifications, and it
is fully functional without the permission.

The video must show: the explanation screen, the system settings screen being
opened, the permission being granted, and the resulting feature. It must also
show the app working with the permission off.

If the feature is not worth the review risk for a first release, ship without
it — every plugin and the module handle its absence, and no copy promises it.

### Target API level

`targetSdkVersion 36`. Play enforces a floor that rises annually; a build below
it cannot be uploaded at all.

### Foreground service

None is declared. Nothing time-critical runs on the device — briefings are
generated and pushed from the server, which avoids the foreground-service
declaration and its own review process.

### Ads

None, and the ads declaration says so.

---

## Store listing

**Do not claim end-to-end encryption.** The two sentences that are true and
approved:

> Veriler aktarım sırasında ve saklanırken şifrelenir.
> Verilerin reklamverenlere satılmaz.

**Do not claim the app reads other apps' notifications on iOS.** It cannot,
and a listing that implies it will be rejected on one platform and disappoint
on the other.

**Do not promise autonomy.** The product's honest claim is that it _proposes_
and the person _decides_. A listing that says "it replies for you" describes a
different app and sets up a one-star review from someone who expected it.

---

## Post-submission

- [ ] Phased release on both stores — 1% first
- [ ] Crash-free rate watched for 48 hours before widening
- [ ] The support address actually monitored during the rollout
- [ ] A rollback path ready: `eas update:rollback` for JS, halted phased
      release for native
