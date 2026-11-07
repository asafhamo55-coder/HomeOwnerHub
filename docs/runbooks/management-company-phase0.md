# Runbook: onboarding Homeside by hand (Phase 0)

**Who this is for:** the platform admin (Asaf). **Design:** `docs/decisions/2026-11-07-management-company-tenancy-design.md`.

**What Phase 0 is.** There is no management-company feature yet. Each HOA that Homeside manages is its own normal HOA in HomeownerHub. You create it by hand, its board is invited, and the board invites Homeside staff using the roles that exist today. Each HOA pays its own subscription.

**Read this first, plainly.**
- **Homeside staff get board powers in each HOA they are invited to.** Today there is no smaller role for a manager. A person invited as `board` or `admin` can do what a board member or admin can do in that HOA.
- **An HOA cannot yet split the work** (for example "Homeside handles dues, we keep violations"). That needs the manager role and the responsibility matrix, which arrive in Phase 2 of the design. Until then, board powers or no access.
- The HOA owns its data from day one. If the relationship ends, you remove the staff and nothing moves.

---

## 1. Create the HOA for Homeside

You need to be signed in as a platform admin.

1. Open **Admin**, then **Tenants**, then **New** (`/admin/tenants/new`; the form is `apps/hoa/src/app/admin/tenants/new/NewTenantForm.tsx`).
2. Fill in:
   - **HOA name** (2 to 200 characters) and the **association name** (usually the same).
   - **State** (any US state).
   - **Type**: HOA, condo or co-op.
   - **Doors / units** (declared size). It sets the price band later, so enter the real number.
   - **Admin email**: the email of the board member who will own the HOA (see step 2). Leave it blank if you will invite later.
   - Plan: leave on `free`. The HOA starts its own 30-day trial and subscribes itself.
3. Submit. The system (`createTenant` in `apps/hoa/src/lib/platform-admin.ts`) creates the organization (type `self_managed_hoa`) and its one association, and, if you gave an email, invites that person as the HOA's `admin`.
4. If the page says the invite was **held**, the email address was blocked by the outbound safety check (it only sends to allowed addresses outside production, or for sandboxed orgs). Fix the allow-list or invite from inside the HOA instead.

What it does **not** do: it does not link the HOA to Homeside in any way. Phase 0 has no link. The list in section 3 is the link.

## 2. The HOA's board takes ownership

1. The invited board member opens the email and sets a password, as any new board member does.
2. They should confirm the HOA name, the home count and the association details in **Settings**, and add the other board members: **Settings, Members**, **Invite**, role `board` (or `admin` for officers who should manage membership).
3. The first board `admin` must exist **before** Homeside staff are invited, so the HOA is never left with only managers in it. Do not skip this.

## 3. The board invites Homeside staff

Only an `admin` can invite someone who is not a resident (a `board` member can only invite residents; see `inviteMember` in `apps/hoa/src/lib/members.ts`).

1. The HOA `admin` opens **Settings, Members, Invite** and enters the Homeside employee's email.
2. Pick the role:
   - **`board`** for normal Homeside managers. This is the recommended role. It can run the day-to-day app but cannot invite or remove staff and cannot change roles.
   - **`admin`** only for the one or two Homeside leads who must manage membership. An admin can also invite and remove board members and sees billing, so use it sparingly.
3. The employee accepts and signs in. If they work with several HOAs they use the organization switcher (the 20-organization limit is lifted by Phase 0 task T1; until then, do not give one person more than 20).

**An HOA that wants a narrower split.** If a board is comfortable giving Homeside board powers only for some HOAs and not others, invite Homeside staff as `board` only where it is comfortable. If it wants less than that, for example "view only" or "financial only", **it waits for Phase 2**; do not onboard it as a managed HOA yet. Tell the board plainly: the feature that lets them choose what Homeside can do is coming, and nothing about their data changes when it does.

## 4. Keep a list of who holds board powers where

There is no screen for this yet, so keep one list. Create a private sheet (for example in Google Drive) named **Homeside access list** with one row per person per HOA:

| Column | Example |
|---|---|
| HOA name | Creek Valley HOA |
| Homeside person (name and email) | Jane Rivera, jane@example.com |
| Role in the HOA | `board` or `admin` |
| Date invited | 2026-11-12 |
| Invited by (HOA admin) | Pat Smith |
| Date removed | blank until removed |
| Notes | primary contact for this HOA |

Rules:
- Update the sheet the same day anyone is invited, changed or removed.
- Once a month, compare the sheet to **Settings, Members** in each HOA. Ask the HOA admin to remove anyone listed as removed, and ask the Homeside lead about anyone who appears in Members but not on the sheet.
- When Phase 2 ships, this sheet is the source for creating the real agreements and manager seats, then it can be retired.

## 5. Removing Homeside staff later

One person leaves Homeside, or one HOA ends its relationship:

1. The HOA **admin** opens **Settings, Members**, finds the person, and removes them (`removeMember`). A `board` member can remove only residents, so it must be an `admin`. The system will not remove the last admin.
2. If the person was invited as `admin`, make sure another admin remains first.
3. Check these things by hand, because Phase 0 has no automatic cleanup:
   - **Pending or scheduled sends** the person created in **Communications** (scheduled announcements, mailed letters): cancel any that should not go out.
   - **Connections they made**: if they connected the shared mailbox (Gmail) or a bank link (Plaid) under their own login, reconnect it as a board member and disconnect theirs (Settings, Mailbox and Settings, Payments or Accounting).
   - **Invites they created** for other people that were not accepted yet: revoke them in Members.
4. Mark the date removed on the access list.
5. If the HOA is leaving Homeside entirely: remove all Homeside staff, then let the board export what they want with **Settings, Data** (the data export). The HOA's data stays where it is.

Names of people who wrote entries will remain in the records they created, unless the account is deleted; if a deleted user's name disappears from old rows, that is expected today (the design adds name snapshots in Phase 2).

## 6. Money, mail and the bank: what stays with the board

Homeside staff invited as `board` or `admin` can reach the online payments and mailing features that are turned on. Because HomeownerHub is never in an HOA's money flow, bank and Stripe account setup belongs to the HOA's treasurer or admin (`docs/decisions/2026-10-31-online-dues-payments-design.md`, section 1.3). Ask Homeside not to set up the HOA's Stripe or bank link; the treasurer does it.

## 7. Before you add many HOAs

Check the job-runner budget in section 11.4 of the design. The free plan allows 50,000 runs a month and stops every job at the cap. Plan the upgrade before the 20th HOA, and send the real monthly count from the Inngest dashboard (owner action OA-53).
