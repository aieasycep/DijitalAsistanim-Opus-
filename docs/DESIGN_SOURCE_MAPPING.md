# Design source mapping

Two design sources were provided. Neither is production code, and neither was
packaged into the app: the Claude Design archive is an HTML/CSS prototype, and
the Figma export is a Vite web application. Both were read as specifications
and rebuilt as native React Native components.

The hierarchy, where the three disagree:

1. **The written brief** decides behaviour.
2. **The Claude Design archive** decides visual language — colour, type,
   spacing, elevation, motion.
3. **The Figma export** decides screen coverage — which screens exist and what
   is on them.

---

## What came from the visual source

|                                                             | Where it lives now                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Palette: indigo primary, warm neutral ground, dawn gradient | `packages/design-tokens/src/palette.ts`                                                                |
| Type scale and the editorial serif for briefings            | `packages/design-tokens/src/typography.ts`                                                             |
| Spacing scale, corner radii, elevation                      | `packages/design-tokens/src/spacing.ts`                                                                |
| Light and dark themes, derived rather than hand-listed      | `packages/design-tokens/src/theme.ts`                                                                  |
| The dashed "proposed" card border                           | `Card` `proposed` prop                                                                                 |
| The sunrise mark                                            | `scripts/generate-brand-assets.mjs` — drawn from the tokens, so the icon cannot drift from the palette |

Colours are tokens, never literals. A hex value in a component is a lint
error, which is what keeps dark mode from rotting.

## Screen coverage

| Design source screen      | Route                                              |
| ------------------------- | -------------------------------------------------- |
| Splash / sign-in          | `app/(auth)/index.tsx`                             |
| Email sign-in, code       | `app/(auth)/email.tsx`, `verify.tsx`               |
| Onboarding, six steps     | `app/(onboarding)/*`                               |
| Today                     | `app/(tabs)/today.tsx`                             |
| Briefing, full            | `app/briefing/index.tsx`                           |
| Flow (thread list)        | `app/(tabs)/flow.tsx`                              |
| Thread detail             | `app/thread/[id].tsx`                              |
| Reply composer            | `app/reply/[threadId].tsx`                         |
| Plan, day and week        | `app/(tabs)/plan.tsx`                              |
| Conflicts                 | `app/plan/conflicts.tsx`                           |
| Assistant                 | `app/(tabs)/assistant.tsx`                         |
| Voice                     | `app/voice.tsx`                                    |
| Approvals list and detail | `app/approvals/index.tsx`, `app/approval/[id].tsx` |
| Commitments               | `app/commitment/{index,[id],new}.tsx`              |
| Follow-ups                | `app/followups/index.tsx`                          |
| Person                    | `app/person/[id].tsx`                              |
| Meeting prep and notes    | `app/meeting/[id]/{index,note}.tsx`                |
| Event detail              | `app/event/[id].tsx`                               |
| Capture                   | `app/capture.tsx`                                  |
| Search                    | `app/search.tsx`                                   |
| Paywall                   | `app/paywall.tsx`                                  |
| Referral                  | `app/referral.tsx`                                 |
| Settings, sixteen screens | `app/settings/*`                                   |

## Where the implementation deliberately diverges

Each of these is a considered decision, not an omission.

**No web views.** The prototypes are HTML. Shipping them in a `WebView` would
have produced something that scrolls wrong, ignores the system font size, and
fails every accessibility check. Every screen is native.

**Time fields are not OS date pickers.** A briefing time is a wall-clock
preference with no date attached. Every platform picker insists on a `Date`,
which is how "07:30" quietly becomes 06:30 after a daylight-saving change.
`TimeField` edits hours and minutes directly.

**Colour is never the only signal.** Where the design distinguished states by
hue alone, the implementation adds an icon or a label. A red left border does
not exist for someone who cannot see red.

**Motion is opt-out.** Every animation checks reduce-motion, from the OS
setting and from the app's own toggle.

**No control without a handler.** `Button` requires `onPress` in its type, so
a decorative button cannot be constructed. Three controls from the designs
were removed for having nothing behind them — an immovable briefing toggle,
two source toggles with no backing preference, and a learned-preferences card
that opened nothing.

**Turkish first.** The designs were written in Turkish and the catalogue is
Turkish-canonical: English mirrors it key for key. Layouts are built for
Turkish string lengths, which are longer, rather than for English ones that
then overflow.

## The two applications share tokens, not components

The marketing site and the app render from the same
`packages/design-tokens` — the same palette, the same type scale, the same
spacing — but they do not share components. React Native primitives and DOM
elements have different enough constraints that a shared abstraction over both
ends up serving neither well. The tokens are what keeps the two looking like
one product.
