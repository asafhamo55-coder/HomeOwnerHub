# Professional and officer roles: CPA, Attorney, Treasurer (BL-168)

Owner request (Asaf, 2026-10-26): "add the following user with the right permissions to the system: CPA, Attorney and Trusery, brainstorm and ensure you provide each of them the right view and the right permissions."

**Interpretation (decision, reversible):** "Trusery" is read as **Treasurer**, the board officer who runs the money. If a *trustee* was meant (a person holding a home in trust), that is an owner on a unit, not a new role. The resident portal already covers it, so only the unit's owner label would change.

## Today

`apps/hoa/src/lib/auth.ts:11` has `type Role = 'admin' | 'board' | 'resident'`. RLS policies, `requireBoardOrAdmin` and the board-write-gates ratchet all branch on those three. Every board member can do everything a board can. There are no officer titles and no outside professionals.

## Principles

1. **Least privilege.** Outside professionals see only what their job needs and change almost nothing. Their writes are notes and uploads, never money, never sending.
2. **Board stays in charge.** Nothing a CPA or attorney does leaves the building without a board approval. They draft; the board approves; the app sends.
3. **Time-boxed access for outsiders.** Each grant has an expiry (default 12 months for a CPA, the life of the matter for an attorney), is renewable by the board, and can be revoked instantly.
4. **Everything audited.** Every view of a sensitive area and every write gets an audit row with ids and codes only.
5. **Residents' privacy.** Neither outsider sees the inbox, resident messages, contact details beyond what a document they are entitled to already shows, or other homes' violations unless a matter covers them.

## The three roles

### CPA (`cpa`, external accountant)

| Area | Access |
|---|---|
| Accounting: ledger, journal, chart of accounts, bank reconciliations, invoices, vendor payments, budgets, reserve study, AR aging | **Read** |
| Reports, year-end package, 1099-NEC / 1120-H data, audit/review exports (CSV, PDF) | **Read + export** |
| Close a period / reopen | No (board), but the CPA can mark a period **"reviewed by CPA"** with a note |
| Journal entries | **Propose** adjusting entries. They land in /approvals and post only when the board approves |
| Owner names on AR aging and unit ledgers | Yes (needed for receivables). No email, phone or mailing address |
| Inbox, communications, violations, ARC, meetings, residents list | No |

### Attorney (`attorney`, association counsel)

Access is **matter-scoped**: the board assigns the attorney to specific matters (a collections case, a violation or hearing, a records request), plus an optional "general counsel" switch that adds governing documents and compliance.

| Area | Access |
|---|---|
| Assigned collections cases: ledger for that unit, letters, events, payment plan | **Read**, plus **case notes** and **document upload** |
| Assigned violations and fine hearings: history, photos, notices, hearing record | **Read**, plus notes and uploads |
| Collections and violation letters | **Draft**. The draft goes to /approvals, and the board approves before anything is sent or recorded |
| "Attorney advised" overrides (state-law checks, GA registration and complaint-stay gates) | Records the advice as a note. The board performs the override, citing the attorney's note |
| Governing documents, rules, compliance page, state-law answers (general counsel only) | **Read** |
| Records requests assigned to them | Read plus a response draft |
| Unit owner name and the mailing/designated address on assigned matters only | Yes (letters need it) |
| Inbox, resident messages, accounting beyond assigned units, residents list | No |

### Treasurer (`board` + officer title `treasurer`)

The Treasurer is **a board member with an officer title**, not a separate permission tier. Board members keep today's rights. The title adds:

- **Money approvals route to the Treasurer first:** vendor payments, refunds, late-fee policy changes, bank reconciliation sign-off, budget drafts. A second board member is still required above a board-set amount (dual control).
- Bank reconciliation and the monthly financial packet are **signed off by the Treasurer**.
- The CPA's "reviewed" notes and proposed entries notify the Treasurer.
- Officer titles also feed the GA registration kit's officer list (BL-149/BL-159). Other titles are President, Secretary, Vice-President and Director.

## Data model (migration batch M6, with BL-156 and BL-166)

- `memberships.role` check gains `'cpa'` and `'attorney'`.
- `memberships.officer_title text null`, with a check on (`president`, `vice_president`, `secretary`, `treasurer`, `director`), allowed only when role = 'board'.
- `memberships.access_expires_at timestamptz null`, required for cpa/attorney. RLS treats an expired grant as no access.
- `matter_assignments (id, org_id, membership_id, matter_type in ('collections_case','violation','records_request'), matter_id, created_by, created_at, revoked_at)`.
- RLS: new read policies per table for `cpa` (accounting tables) and `attorney` (rows joined through `matter_assignments`). No new write policies except notes, attachments and proposed drafts, which are inserted as `pending` into the existing approvals tables.
- SECURITY DEFINER helpers must refuse a null `auth.uid()` in the body (CI replay re-grants routines to anon; next.md §4 traps).

## App

- Invite flow: "Invite a professional" (CPA or attorney, expiry, scope), and a title picker for board members.
- Navigation per role: the CPA lands on Accounting/Reports; the attorney lands on "My matters".
- Gates: `requireRole` helpers, plus board-write-gates ratchet entries for each new action.
- Audit rows and digest lines for grants, expiries, views of a matter, and drafts.
- Everything behind `M6_APPLIED` until Asaf applies the SQL.

## Tests

RLS integration tests in CI for each role × table: allowed, denied, and expired. Unit tests for gates and navigation. No local DB.

## Out of scope

Billing seats for professionals (pricing decision later; they are free for now). SSO for law or accounting firms.

## Decisions after review (2026-10-26)

- **Existing accounts get a consent-based accept link** (signed, expiring; the org_members row is created only when the invited email accepts while signed in). Silently not attaching them broke the main use case: a CPA or attorney who already serves another HOA.
- **The security review of 0070 found H1/H2/M1–M3/L1–L5;** all are fixed in SQL before Asaf applies it. Highlights:
  - sign-offs are cleared when the payload or amount changes;
  - only an admin can change the dual-control amount, and the change is audited;
  - only current board/admin signers count, and the proposer can't sign;
  - violation → exactly one unit;
  - professionals read only the association's name and state;
  - grants are capped at one year;
  - removing a member revokes their matter assignments.
- **The money-approval list** covers every approval type that moves money, not just bills and journal entries.
