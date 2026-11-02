# Online voting and elections (BL-156, Track B)

Migration 0075, flag `M10_APPLIED` (`packages/db/src/m10.ts`, false). Built on the paper election planner (`lib/elections`, BL-141). Nothing here changes the paper kit.

## Scope of v1

- A board opens an online ballot for a director election (pick up to N of the candidates) or a yes/no question.
- Owners vote once per home, from a signed-in session. Co-owners share the one ballot for their home (O.C.G.A. § 44-3-224(a); Fla. Stat. § 720.306(8)(b) disqualifies a second ballot per parcel).
- After the deadline the board sees counts. Paper ballots are counted by hand as today; the board adds the two when it enters results in the planner. Nothing is merged automatically.
- Every ballot is secret. Written consent that must identify the member (Georgia nonprofit code) stays on paper in v1.
- Nothing is emailed or texted. The board shares the link through the announcements it already sends.

## Integrity model

Two tables with no link between them:

- `ballot_voters`: which home voted, and which user cast it, with the date only. Never the choice.
- `ballot_box`: the choices. A random id, the ballot id and the option ids. No user, no home, no timestamp.

Rules enforced in the database, not the app:

1. Writes happen only through `cast_ballot()` (SECURITY DEFINER, refuses a null `auth.uid()`), one transaction writing both rows. Unique `(ballot_id, property_id)` makes a duplicate impossible.
2. `ballot_voters` and `ballot_box` reject UPDATE and DELETE for every role, including the service role. A cascade from deleting an organization is the only exception.
3. Options, deadline, kind, seat count and the acknowledgement freeze when the ballot opens.
4. No role can SELECT `ballot_box`. The board gets counts from `ballot_results()`, which refuses before the deadline, so nobody sees a running tally. It also returns box rows and voter rows so the board can see they match.
5. The selections are stored sorted, so click order leaks nothing.
6. Voters: owners only (ownership row or a confirmed-email owner resident), same organization. Tenants cannot vote.

Honest limits: someone with direct database access could correlate the two rows by Postgres system columns (same transaction). The app never exposes this and the access list is the owner's. A lawyer should decide whether that is acceptable for the association's rules.

## Board acknowledgement

`open_ballot()` requires the board to confirm: the governing documents or state law allow electronic voting for this vote, one vote per home applies, and notice was or will be given as the documents require. It stores who, when, basis and the wording version. A trigger refuses status `open` without them, so a bug in the app cannot skip it. Wording: `lib/online-voting/law.ts`.

State facts used (quoted only from existing fixtures, `lib/elections/law.ts`):

- Georgia: Article 6 covers the meeting, not the election. It names ballot and written consent as ways to vote (§ 44-3-224). It does not say electronic voting is allowed. The bylaws decide.
- Florida: absentee secret ballots only "if the governing documents permit" (§ 720.306(8)(b)).
- California: secret ballot and inspector rules (§§ 5100, 5110, 5115). An inspector of elections must hold the ballots. Not supported online in v1; the board is told.
- Texas: written and signed ballots (§ 209.0058). Not supported online in v1.
- Other states: governing documents.

## Needs a lawyer before go-live

1. Whether Georgia nonprofit code and each association's bylaws allow electronic ballots, and the Georgia electronic-consent rule (§ 14-3-708, not in our fixtures).
2. Florida online-voting rules for associations (720.317 style requirements are not loaded) and whether our flow meets the secret-ballot envelope rule.
3. California inspector custody and Texas signed-ballot rules; why those states stay off.
4. Notice content and timing for an online ballot.
5. Voting-right suspensions for delinquent owners (not modelled).
6. Weighted votes, multiple-lot owners and entity owners (v1 is one vote per home).
7. Correlation risk above, retention period for the voter list, and what to do with a defective ballot (v1 has no cancel; run a new one or use paper).

## Not built in v1

Board and voter screens, notice generation, early close, cancel, weighted votes, merging with the planner's hand count. Server actions and the pure model are in `lib/online-voting/`, dark behind `M10_APPLIED`.
