# Brand: blue and green (Option B)

Date: 2026-11-07. Owner decision.

## Why

The royal purple (#4B27C9) was too close to the owner's own HOA website.
The app moves to a blue and green palette that is clearly distinct.

## Palette

| Role | Value | Use |
| --- | --- | --- |
| Primary blue | #2563EB | Buttons, links, active nav, focus ring. White text 5.2:1. |
| Primary hover | #1D4ED8 | Hover on primary. |
| Deep blue | #1E40AF | Large bands and hero areas, white text. |
| Primary subtle | #EFF6FF | Tinted background behind primary text. |
| Green | #047857 | Section labels, step badges, success, approved and done. White text 5.5:1. |
| Green subtle | #ECFDF5 | Tint behind success text. |
| Mint | #6EE7B7 | Highlight text on deep blue only. |
| Ink | #0F172A | Primary text. |
| Secondary text | #334155 | Body copy. |
| Muted | #526077 | Meta and captions. |
| Canvas | #F5F8FC | Page background. |
| Border | #E2E8F0 | Dividers and card edges. |

Green is never the primary action button: blue means "act here", green means
"done or safe".

## Dark mode (app)

Primary #60A5FA, hover #93C5FD, text on primary #0A0F1A, subtle #172554,
ring #60A5FA. Success text stays #4ACB8B, success fill #047857.

## Where it lives

`packages/ui/src/tokens.ts` is the source. PM and Eviction hubs keep their own
tints. Emails, printed letters, posters, video and the marketing site are
handled separately.
