# Backlog verified against code, 2026-11-02

Base: local branch claude/quality-oracle at 4a27813a. Method: each open-looking line in `docs/backlog.md` was grepped in the code. Merged today and excluded: online payments, autopay, polls, voting engine, amenities, public page, message board, mail letters, 1099 summary. Migration 0079 (mailed letters) is the newest, so M8 to M14 are all dark flags.

## Ranked open work

| # | ID | Description | Evidence | Effort | Migration or owner? | Files touched | Group |
|---|---|---|---|---|---|---|---|
| 1 | C4 | Raise the `text-xs` floor from 13px to 14px; use line-clamp instead of truncate on addresses | `packages/ui/src/tokens.ts:329` (`xs: 0.8125rem`); about 778 `text-xs` uses in `apps/hoa/src/{app,components}`; `2xs` is 11px at `tokens.ts:328` | 2 | no / no | `packages/ui/src/tokens.ts`, `packages/ui/src/tokens.test.ts`, address cells in `apps/hoa/src/app/(dashboard)/{properties,dues,violations}` | A |
| 2 | B7 / BL-039 | Vendor bill pay and check mailing: pay AP invoices through the new payment rail and mail checks | No payment code on AP: `apps/hoa/src/app/(dashboard)/accounting/invoices/[id]/page.tsx` has only record-payment; no `vendor-payments` dir in `apps/hoa/src/lib` | 4 | **yes, new M15 flag / yes, keys for Lob and Stripe** | new `apps/hoa/src/lib/vendor-payments/`, `migrations/0080_*.sql`, `packages/db/src/m15.ts`, invoices page | B |
| 3 | BL-009 | Privacy-safe product analytics, remaining part | Summary table says "Partly (bdfa759f)"; only the weekly counts email exists (`packages/jobs/src/weekly-analytics.ts`), and it sends nothing until OA-38 | 1 | no / yes (OA-35, OA-38) | `packages/jobs/src/weekly-analytics.ts` | C |
| 4 | R7-4 | Resident quiet hours card on `/resident/account` | No `quiet` match in `apps/hoa/src/app/resident/account/`; language half shipped (`apps/hoa/src/lib/language-preference.ts`) | 2 | **yes (backlog says the column needs a migration) / yes** | `apps/hoa/src/app/resident/account/`, sender in `packages/jobs/src/` | D |
| 5 | BL-037 | Reserve fund tracking | No reserve feature: only `accounting/coa/FundsCard.tsx` and the estoppel certificate mention reserves | 4 | yes, new flag / no | new `apps/hoa/src/app/(dashboard)/accounting/reserves/`, migration | B2 |
| 6 | BL-033 | Law-to-bylaw findings report (FL phase 1) | No `bylaw findings` code in `apps` or `packages` (grep returns nothing) | 4 | yes / no | `packages/workflows/src/`, new route and page under `apps/hoa/src/app/(dashboard)/documents` | E |
| 7 | BL-030 | Per-state violation procedure engine beyond hearings | Hearing rules cover only the fine-hearing steps (`apps/hoa/src/lib/violation-hearings/rules.ts`, FL 720.305); no FL notice-and-cure engine | 4 | yes / no | `apps/hoa/src/lib/violation-hearings/`, `apps/hoa/src/lib/violations.ts` | F |
| 8 | B8 / BL-026 | SMS live | Code built (`apps/hoa/src/lib/sms*.ts`); Vonage sign-up blocked (`docs/owner-actions.md:93`, OA-11) | 0 | no / **yes** | none until keys | none |
| 9 | Site-1 | Real product screenshots in marketing once a demo login exists | `next.md` §00 next-work item 3 | 2 | no / **yes** (demo login, screenshots) | `apps/marketing/src/` | G |
| 10 | Site-2 | Restyle `/states/*` pages | Only `apps/marketing/src/app/states/[state]/` and `page.tsx` there; next.md says they were not restyled | 2 | no / no | `apps/marketing/src/app/states/` | G2 |
| 11 | Site-3 | Ask demo click-through to the cited section | next.md item 3; no `AskDemo` in `apps/marketing/src` | 2 | no (needs an app anchor feature first) / no | `apps/marketing/src/`, `apps/hoa/src/app/(dashboard)/documents` | G3 |
| 12 | Voice | Voice calls | Gap analysis row "Voice calls: Missing" (`docs/decisions/2026-10-31-payhoa-gap-analysis.md`) | 4 | yes / yes (Vonage) | new | none, blocked by #8 |
| 13 | Lockbox | Lockbox deposits | Gap analysis "Lockbox: Missing" | 5 | yes / yes | new | none, low value |
| 14 | BL-040 | Native app shell | Apps are `eviction hoa marketing pm`; PWA only | 5 | no / yes (store accounts) | new `apps/` | none |
| 15 | OA | Pending owner decisions: OA-40, OA-41, OA-42, OA-43, OA-32 (comments were due Nov 2) | `next.md` §00 "Waiting on Asaf" | n/a | n/a / yes | docs only | none |

Track C is now only C4 (row 1). Round 28, 27, 26, 25 and 24 code items are all in the code (see below).

## Safe to run at the same time (disjoint files)

- **A** (C4, UI tokens and app-wide classes) touches many files and can collide with anything in `apps/hoa`. Run it alone, or last, or in its own window.
- **B** (vendor bill pay) and **B2** (reserves) both want the next migration number and `packages/db`. Run one after the other.
- **C** (analytics, jobs only), **D** (account page plus jobs sender, needs migration), **E** (workflows and documents), **F** (violation-hearings) do not share files with each other.
- Marketing rows (**G, G2, G3**) touch only `apps/marketing`. Up to 10 agents with disjoint scopes are allowed there. G3 also touches the HOA documents page, so keep it away from A.
- Compatible set: C, E, F, G, G2 together, then B, then D, then A.

## Lines that claim open but are done

| Backlog line | Proof |
|---|---|
| Round 28 #1 expired invite link | `apps/hoa/src/components/auth/HashSessionHandler.tsx:25-37` redirects to `/login?error=link_expired`; `LinkErrorNotice.tsx` |
| Round 28 #2 choose a password | `apps/hoa/src/components/auth/ChoosePasswordPrompt.tsx` |
| Round 28 #3 raw auth errors | `friendlyAuthError` in `PasswordForm.tsx:58`, `SignupForm.tsx:60` |
| Round 28 #4 support line | `components/auth/auth-errors-shared.ts:4`, test `auth-screens.test.tsx:70` |
| Round 28 #5 other device | `LinkErrorNotice.tsx` and its test |
| Round 28 #7 announce confirm | `NewCommunicationWizard.tsx:1216` ("This goes to the N homes") |
| Round 28 #8 ARC confirm | `arc/[id]/ArcDecisionForm.tsx:14-49` (`DECISION_CONFIRM`, `useConfirm`) |
| Round 28 #9 toasts | `packages/ui/src/components/Toast.tsx:40-42,137-146` (8s, touch pause) |
| Round 28 #10 logo link | `components/layout/HoaSidebar.tsx:124` (`href="/"`) |
| Round 28 #11, #12, #13, #15 (C1, C2, C3, C5) | next.md §00: shipped; `lib/dashboard/do-next.test.ts` |
| Round 27 #1 to #6 | `AiRewriteButton.tsx:5,108` kit Dialog; `Wizard.tsx:413,489,728` live regions; `InboxKeyboard.tsx:65-69` toast and refresh; `inline-error-announce-ratchet.test.ts`; `TaskList.tsx:133,140` `coarse:h-11` |
| Round 26 and 25 | Marked done with SHAs in backlog; only the weekly SEO audit remains, and it is done (`docs/seo/2026-11-02-weekly-audit.md`) |
| Round 24 #1 to #7 | The line says "Done 2026-10-31" (only item 8 SEO audit was left, now done) |
| Round 8 #1 to #5 | `app/resident/dues/page.tsx:90` credit card; `(dashboard)/dues/page.tsx:33,195` credit badge; `packages/jobs/src/daily-digest-nudge.test.ts`; `packages/jobs/src/weekly-analytics.ts`; `settings/professionals/EmptyStates` |
| Round 7 #3 BL-106 | `app/api/ai/meeting-summary/route.ts:52` own bucket; `ask-community/route.ts` |
| BL-118 meeting notice .ics | `lib/meetings/meeting-ics.ts` plus `resident/meetings/[id]/calendar/route.ts` |
| BL-069 CA, TX adapters | `packages/workflows/src/W30-state-law-brain/sources/{california,texas}.ts` |
| BL-158, 160, 161, 162, 163, 166, 168 | Code present in `properties/[id]/CollectionsSection.tsx`, `compliance/ProposedRulesCard.tsx`, `GaComplaintPanel.tsx`, `resident/records/new/RecordsRequestForm.tsx`, `dues/RecordPaymentButton.tsx`, `RecordCollectionEvent.tsx`, `lib/roles.ts` |
| BL-144 bank import, BL-143 join | `accounting/bank/[accountId]/import/ImportStatementForm.tsx`; `app/join/AskToJoinForm.tsx` |
| BL-007 (0063), BL-020 (M1), A5 pricing | `docs/owner-actions.md:614` (0063 and M1 done); `packages/db/src/m1.ts:22` true; `docs/decisions/2026-11-01-one-plan.md` |
| Track A A1 to A4, Track B B1 to B6, B9 | Merged per task brief and next.md |

## Not verified

BL-160 depends on OA-32 PDFs, so its card is a stub. Quiet-hours state (row 4) was inferred from a missing account-page match, not from the sender code.
