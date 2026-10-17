# Properties module — how competitors model lots, owners and residents (October 2026)

This extends `2026-10-competitors.md`, which covers pricing, segments and the overall
feature matrix. That report has one row on properties: *"Property 360 detail page, list
view, CSV export; platform-admin CSV import"*. This one covers what competitors put
**inside** the property/homeowner record, how changes of ownership work, and what reviewers
say about those records.

## How the research was done, and what it cannot see

- **Primary sources that could be read in full:** Buildium's public OpenAPI spec (field-level
  data model), HOA Start and HOA Hub help centers, HOA Express's 3.0 account docs, Condo
  Control's and PayHOA's marketing pages, Vantaca's ownership-transfer page, California
  Civil Code §4041.
- **Read only through search-engine excerpts:** Vantaca and Condo Control help centers
  (Zendesk returns 403 to the fetcher), Buildium's help center (it needs JavaScript), and
  every Capterra, G2, GetApp and Software Advice review page (403). Statements sourced this
  way are marked *(excerpt)*. The URL is still the page the excerpt came from.
- **Not readable:** CINC's quick-reference PDF and the FRONTSTEPS payments toolkit PDF (no
  PDF text extraction was available). Enumerate/TOPS publishes almost nothing about its
  owner record publicly.
- No product was used hands-on, and no demo was watched. Statements about screen layouts
  come from vendors' own help articles.

---

## 1. The data model: the most important finding

Every serious product separates **the lot** from **the people**, and puts a dated
**ownership period** between them. Products that skip that middle layer are the ones whose
reviewers complain about owner changes.

### Buildium: the reference model (from the public API spec)

Source: [developer.buildium.com](https://developer.buildium.com/) OpenAPI schemas
`AssociationUnitMessage`, `AssociationOwnershipAccountMessage`, `AssociationOwnerMessage`,
`AssociationTenantMessage`.

| Layer | Key fields |
|---|---|
| **Unit** (the lot) | unit number, address, bedrooms, bathrooms, size |
| **Ownership account** (one ownership period on one unit) | `Status` = **Active / Past / Future**; `DateOfPurchase`, `DateOfSale`; `DelinquencyStatus` = NoDelinquency / InCollections / InForeclosure / Foreclosed; list of owners; association fee and frequency; `ReplaceExistingOwnershipAccount` |
| **Owner** (a person) | primary and **alternate address**; `MailingPreference` = PrimaryAddress / AlternateAddress; email and alternate email; phone numbers; **emergency contact**; **vehicles[]**; `OccupiesUnit` / `IsOwnerOccupied`; **board member terms[]**; tax id; comment; **ownership accounts[]** (so one person can own many units) |
| **Tenant** | attached to an ownership account; `MoveInDate`, `MoveOutDate`; emergency contact; alternate address |

What this gives Buildium:
- **Many owners per lot.** One account lists several owners.
- **Many lots per owner.** One owner holds several ownership accounts.
- **Resale history.** The seller's account becomes `Past` with a sale date. Its balance and
  history stay with it, and a new `Active` account starts for the buyer.
- **Pre-closing setup.** A buyer can be entered as a `Future` account before closing.
- **Overwrite protection.** `ReplaceExistingOwnershipAccount` defaults to *fail* rather than
  silently overwriting an existing account.

### Vantaca: the same idea, with account numbers

- An ownership transfer keeps **the previous owner's account number for historical
  records** and issues **a new account number** for the new owners.
  ([Vantaca help](https://support.vantaca.com/hc/en-us/articles/360043932791-Why-won-t-the-Ownership-transfer-actually-transfer-to-the-new-owner-for-me) *(excerpt)*)
- The homeowner list has a **"Previous Owners Only"** filter.
  ([Vantaca help](https://support.vantaca.com/hc/en-us/articles/360017509832) *(excerpt)*)

### HOA Start: "households"

- A **Household** groups the people who share an access type on a property: Owner,
  Household Member (lives with the owner) or Tenant Member.
- Households exist so the product can enforce **one vote per property** and **one invoice
  per property**, and so it can reject duplicate payments.
- Multiple properties per owner are **a workaround**: you suffix household titles
  (`Doe-01`, `Doe-02`).
- Sources: [HOA Start help](https://help.hoastart.com/how-do-i-know-if-i-need-to-use-households), [import help](https://help.hoastart.com/how-do-i-import-members-and-households)

### HOA Express 3.0

- One account can hold several people (primary, joint, others) and several addresses.
- The member chooses **which address is the preferred mailing address**.
- On import, rows that share an account type and address are **grouped into one household
  automatically**.
- Source: [HOA Express blog](https://blog.hoa-express.com/creating-accounts-on-3-0/)

### HOA Hub (a 2025–26 newcomer for self-managed boards)

- Properties and contacts are separate records.
- **Contacts link to properties from the contact's page** as owner or renter.
- The property page has a **"show former residents" toggle**.
- Source: [HOA Hub help](https://support.hoahub.app/people/managing-properties/)

### PayHOA

- "Add more than one owner to each unit. Every owner has their own account and can make
  payments toward the unit's balance."
- **"A new homeowner can not see the history from the old homeowner."**
- Owners of several properties get one login.
- Source: [payhoa.com/features/management](https://www.payhoa.com/features/management/)

**Implication.** Our property page has residents with a "tenure" selector
(`properties/[id]/TenureSelector.tsx`) and a `leases` table (migration 0017). What
competitors treat as first-class, and what we should check our schema for:
1. A dated ownership period with Active/Past/Future status.
2. The ledger scoped to that ownership period.
3. One person holding several lots.

---

## 2. What is on the property / homeowner detail page

| Product | Sections / tabs |
|---|---|
| **Vantaca** (current homeowner account) | **Action Items**; **Ledger** (sub-tabs); **Communication** (Contact Info, Logins); **Activity Notes**; **Additional Info** (association-defined fields); **Tenants/Leases**; **Payment Method**; **Tags**. The header shows the **primary contact** (primary mailing address, phone, email). An **alert icon on the Communication tab means the homeowner has no portal login**. ([Vantaca help](https://support.vantaca.com/hc/en-us/articles/47189651411355-Homeowner-Profile-and-Account-Navigation) *(excerpt)*) |
| **Vantaca** (older mobile Homeowner Info tab) | addresses, properties, contact details, tenants, **pet information**, association-configured fields. ([Vantaca help](https://support.vantaca.com/hc/en-us/articles/4404331009307-OLD-Homeowner-Info-Tab) *(excerpt)*) |
| **Condo Control** "Unit File" | residents, **emergency contacts, vehicles, pets, lockers**, common elements, **authorizations** (who may enter or act for the unit). Residents can fill in their own vehicles and pets at registration. Staff and security can look up a unit file on mobile. ([condocontrol.com](https://condocontrol.com/record-keeping/unit-file), [help](https://support.condocontrol.com/hc/en-us/articles/51751677574299-Mobile-App-How-to-Look-Up-a-Unit-File) *(excerpt)*) |
| **Buildium** | Same data as §1, plus board terms, delinquency status and vehicles per owner. |
| **HOA Hub** | **Details** (linked contacts, former-residents toggle, variances, violations); **Billing** (balance, charges, invoices, credit memos, transactions). The marketing page promises a **timeline**: "every ticket, event RSVP, payment, and document interaction attaches to the right contact automatically". It also promises **private board notes** that survive board turnover, and a **full audit trail of every change**. ([HOA Hub CRM](https://www.hoahub.app/features/resident-crm)) |
| **PayHOA** | Units page with **tags, titles and custom fields**, and per-unit transaction history. The owner portal shows balance, payment history, violations, requests and documents. ([PayHOA units video](https://intercom.help/payhoa/en/articles/3159383-units-page-video) *(excerpt)*, [features](https://www.payhoa.com/features/management/)) |
| **CINC** | Homeowner owner-portal view: pay, violations with photos, ARC, **switch between properties**, ledger (already in the main report). The admin list sorts by last name, account #, address and status. ([CINC quick reference](https://www.barkanco.com/wp-content/uploads/2026/08/CINC-Quick-Reference-Guide.pdf) *(excerpt)*) |
| **AppFolio** | Designates **board members and their roles** on the homeowner record. Has **Rented vs Homeowner-Occupied** per unit. Homeowner directory and dues-roll reports. One portal for owners of several units. ([AppFolio webinar slides](https://www.slideshare.net/slideshow/managing-associations-in-appfolio-webinar-slides/65995496), [AppFolio](https://appfolio.com/hoa/community-association-homeowners)) |
| **Smartwebs** | A property database tied to a **GPS map** with every property pre-loaded. Inspectors pick an address on the map and log a violation on the spot. ([Smartwebs](https://smartwebs.com/violations/), Capterra *(excerpt)*) |
| **HOALife** | Property **routes** and **heat maps** of violations over the community. ([GetApp](https://www.getapp.com/real-estate-property-software/a/hoalife/) *(excerpt)*) |

**The common core across products:**
- **Identity:** a header with the primary contact, occupancy (owner-occupied or rented) and
  balance.
- **Six standard areas:** ledger, people (owners plus tenants with dates), communications,
  notes, tags and custom fields, and a portal-login status.
- **Optional extras:** vehicles, pets, emergency contacts and authorizations, mostly in
  condo-oriented products.

## 3. The property / homeowner list

- **Vantaca:**
  - Every column header has a menu to sort, and to **add columns** such as Collection
    Status, Contact Information, Tenant Information and **Communication Preference**.
  - Each column can also be filtered.
  - The tenants grid has an **"Include Moved-Out"** toggle; the homeowner list has
    **"Previous Owners Only"**.
  - Source: [Vantaca help](https://support.vantaca.com/hc/en-us/articles/360017509832) *(excerpt)*
- **CINC:** the list sorts by last name, account number, address and **status**.
- **HOA Hub:** the Directory has a **Units** tab, with list and grid views. Each card shows a
  **photo of the current residents**.
- **Maps** appear only in inspection-first products (Smartwebs, HOALife). No accounting-first
  product publicly documents a map view of the property list.
  - A map is a **differentiator, not table stakes**.
  - Smartwebs reviewers complain that **new homes are not placed on the map correctly** and
    have to be dragged one by one (Capterra *(excerpt)*,
    [Smartwebs reviews](https://www.capterra.com/p/172920/HOA-Compliance-Software/reviews/)).
- **Saved views and bulk actions:** none of the readable sources documents saved views.
  Bulk actions show up as communications targeting by tag or group (PayHOA, HOA Hub
  "groups, tags, and custom categories").

## 4. Workflows

### 4.1 Change of ownership (resale): the workflow competitors invest in most

- **Vantaca, transfer as an action:**
  - Homeowners → Homeowner List → select the account → **New Action Item → type "Ownership
    Transfer"**. The transfer is an audited, dated action, not an edit.
  - An **"Include Tenant(s)"** checkbox decides what happens to tenants:
    - Checked: tenants move to the new owner.
    - Unchecked: their leases close, with the move-out date set to the **settlement date**.
  - **Transfer charge-type rules** decide which open charges follow the lot and which stay
    with the seller ([help](https://support.vantaca.com/hc/en-us/articles/360036260991-How-to-Setup-Owner-Transfer-Charge-Type-Rules)).
  - Known failure: navigating away halfway through leaves a stuck "Previous Owner" date that
    blocks the transfer ([help](https://support.vantaca.com/hc/en-us/articles/360043932791-Why-won-t-the-Ownership-transfer-actually-transfer-to-the-new-owner-for-me) *(excerpt)*).
    **The lesson: make the transfer a single atomic step.**
- **Vantaca + HOAi, AI transfer:**
  - Reads the **closing documents**, extracts seller and buyer, creates the new account and
    **carries open action items forward**.
  - Adjusts account **tags** and sends the new owner a **welcome message**.
  - Source: [vantaca.com](https://www.vantaca.com/seamless-ownership-transfers-new-homeowner-setup-powered-by-ai)
- **FRONTSTEPS Caliber:**
  - "Always process ownership transfers using the **Change of Ownership Wizard** — not
    manual portal edits or name changes."
  - **Editing the name on an account disables that homeowner's autopay.**
  - The rule is one unique email per person, with **no shared emails**.
  - Source: FRONTSTEPS toolkit *(excerpt)*, [PDF](https://frontsteps.com/wp-content/uploads/2025/09/FRONTSTEPS-Payments-Toolkit-1.pdf)
- **Condo Control:** Unit File → Actions → **Process Moveout**. Departing users are marked
  "will be deactivated", and nothing is final until **Finish**. A **Resident History**
  search covers current *and* past residents. ([help](https://support.condocontrol.com/hc/en-us/articles/4411821303707-Unit-File-Processing-Moveouts-Video-Guide) *(excerpt)*)
- **PayHOA:**
  - "When a home sells, the new owner's contact information is automatically updated."
  - Generates **resale packets and estoppel certificates** from account data: ledger,
    violations, ARC history, governing documents.
  - The new owner cannot see the previous owner's history.
  - Sources: [features](https://www.payhoa.com/features/management/), [resale article](https://www.payhoa.com/?p=9041)
- **Estoppel through third parties:**
  - Vantaca pushes account and association data to **HomeWiseDocs** by API, and attaches
    the returned documents to the homeowner account
    ([help](https://support.vantaca.com/hc/en-us/articles/360028428171-HomeWiseDocs-Interface) *(excerpt)*).
  - For a self-managed board, the **in-product estoppel** (PayHOA's approach) is the
    relevant pattern. The FL estoppel deadlines and fee caps are already in the main report
    (§2.4).

### 4.2 Tenants / move-in / move-out

- **Vantaca:**
  - **Move-In Date is required**, Move-Out cannot precede it, and the grid shows primary and
    secondary tenants.
  - A tenant counts as "current" when a lease exists, or when move-in has passed and
    move-out is blank or in the future.
  - **Tenants get no portal login.**
  - Source: [Vantaca Tenants](https://support.vantaca.com/hc/en-us/articles/4410583301019-Tenants) *(excerpt)*
- **Buildium:** tenants hang off the ownership account, with move-in and move-out dates.
- **HOA Start:**
  - Tenants are a separate access type, with voting restrictions available for non-owners.
  - **An owner and a renter cannot share a household.**
- **Condo Control:** tenants can log in, with an explicit **information-access split between
  owners and renters**.
  ([help](https://support.condocontrol.com/hc/en-us/articles/32651446617499-Information-Access-for-Unit-Owners-vs-Unit-Renters-or-Residents) *(excerpt)*)
- **AppFolio:** a unit-level **Rented vs Homeowner-Occupied** flag. Buildium does the same
  with an owner-level `OccupiesUnit`.

### 4.3 Bulk import

| Product | Approach |
|---|---|
| **HOA Hub** | A three-step wizard: **template or your own file → column mapping (same-name columns auto-map) → preview with warnings**. Duplicates are detected (by name, email or tax id for vendors), with **Skip / Overwrite / Import as new**. Rows duplicated *within* the file are flagged. **Import properties first; the contact import then matches contacts to properties and builds households from shared addresses.** Also imports vendors and an opening trial balance. ([help](https://support.hoahub.app/getting-started/importing-your-data/)) |
| **HOA Start** | A rigid template: headers must match exactly. **Valid rows import, bad rows are skipped and reported**, so the user fixes and re-uploads only those. Household grouping needs exactly matching Address Line 1. ([help](https://help.hoastart.com/how-do-i-import-members-and-households)) |
| **HOA Express** | One row per person. Grouping into households happens automatically. ([blog](https://blog.hoa-express.com/creating-accounts-on-3-0/)) |
| **PayHOA** | Imports a custom CSV of names, emails, **unit address and mailing address**. There are separate importers for payments and the chart of accounts. ([help](https://intercom.help/payhoa/en/articles/3159366-importer-video)) |
| **Enumerate** | "Onboard Assist" AI (main report). |

The best-in-class pattern is HOA Hub's:
- mapping with auto-match;
- a preview with row-level warnings;
- duplicate resolution;
- people matched to properties by address;
- partial success, so good rows land and only bad rows come back.

Our import is platform-admin only (`admin/import-units`) and does not cover people.

### 4.4 Contact preferences, consent, and mailing vs property address

- **Two addresses per person is universal.** Examples: Buildium's primary/alternate plus
  `MailingPreference`, PayHOA's unit address vs mailing address, HOA Express's "preferred
  mailing address".
  - It matters because **absentee owners and landlords** do not get mail at the lot.
  - PayHOA reviewers say it is **"confusing where to put their mailing address and where to
    add tenant info"** when a unit is rented (GetApp *(excerpt)*,
    [GetApp PayHOA](https://www.getapp.com/real-estate-property-software/a/payhoa/reviews/)).
- **The law makes consent a data field:**
  - **FL §720.303(4):** the official records must include a roster of owners with **mailing
    addresses, unit identification, voting certifications** and phones. The association
    keeps emails **only for owners who consented to electronic notice**, and those addresses
    are excluded from owner inspection.
    ([flsenate 2021 SB 56](https://flsenate.gov/Session/Bill/2021/56/BillText/er/HTML), [720.303](https://www.flsenate.gov/Laws/statutes/2003/720.303))
  - **CA Civil Code §4041:** each owner must give the association, **every year**:
    - a preferred notice delivery method (mail or email);
    - a **secondary** delivery method;
    - a **legal representative or power of attorney** contact;
    - occupancy status (**owner-occupied / rented / developed but vacant / undeveloped
      land**).

    The association must **solicit this annually**. If the owner doesn't answer, notices go
    to the last address given in writing, or else the property address.
    ([california.public.law](https://california.public.law/codes/civil_code_section_4041))
  - **Consequence:** the property record needs, at minimum:
    - mailing vs property address;
    - e-notice consent with date and source;
    - occupancy status;
    - a voting-designee field;
    - for CA, an annual-update campaign.
- **Vantaca** has a **Communication Preference** column on the list and a
  **no-portal-login alert** on the account (above).

### 4.5 Duplicates and merge

- No readable source documents a person-merge tool.
- Duplicates are attacked **at import**: HOA Hub's Skip/Overwrite/New, HOA Start's exact
  address matching, FRONTSTEPS's one-email-per-person rule.
- Buyer guides name **"duplicate owner records, missing payment history"** as the classic
  bad-migration outcome ([PayHOA](https://www.payhoa.com/features/management/), [Software Advice guide](https://www.softwareadvice.com/property/community-hoa-software-comparison/)).
- **A merge tool would be a differentiator.**

### 4.6 Owner portal linkage

- **Owners of several lots, one login:** PayHOA, AppFolio, CINC (switch between
  properties), HOA Express (many addresses on one account).
- **Visible login state:** Vantaca flags a missing portal login on the account.
- **Onboarding:** Buildium has `SendWelcomeEmail` on owner creation. FRONTSTEPS offers
  invitation or self-registration plus approval. CINC has self-registration plus manager
  confirmation.
- **History stays put:** the new owner never sees the seller's history (PayHOA), which is
  enforced by scoping to the ownership period.

---

## 5. What reviewers praise and complain about

Review pages were readable only through search excerpts. Each line names the platform and
the page.

**Praise**
- PayHOA: the member database "tracks current and past residents' contact information and
  is helpful for managing ownership changes". Reviewers also like keeping owners *and*
  renters ([GetApp](https://www.getapp.com/real-estate-property-software/a/payhoa/reviews/) *(excerpt)*).
- Vantaca: "excellent visibility into homeowner accounts — easy to track payments and
  identify delinquencies" ([G2](https://g2.com/products/vantaca/reviews?page=3) *(excerpt)*).

**Complaints**
1. **Information is scattered across tabs.**
   - Buildium: "multiple clicks through different tabs to get different information instead
     of going to a unit and seeing everything"; "items are not linked to accounts"
     ([Capterra Buildium](https://capterra.com/p/47428/Buildium-Property-Management-Software/reviews/?page=2) *(excerpt)*).
   - CINC: "click many times to see attachments, no obvious option to review all contextual
     information in a single screen" ([Capterra CINC](https://capterra.com/p/143799/CINC-Systems/reviews/?page=2) *(excerpt)*).
   - Condo Control: "requires a number of screens to access information"; "too many clicks
     to get to simple information" ([Capterra Condo Control](https://capterra.com/p/143800/Condo-Control/reviews/) *(excerpt)*).
2. **Simple edits to owner data are hard.**
   - Buildium: fixing a misspelled owner name "took 30 minutes to figure out" (Capterra
     *(excerpt)*).
   - FRONTSTEPS: a name edit kills autopay.
   - Vantaca: an abandoned transfer blocks the next transfer.
3. **Rented units confuse the address and tenant model.** PayHOA: it is unclear where the
   landlord's mailing address goes and where tenant info goes (GetApp *(excerpt)*).
4. **Sync and data drift between back office and portal.**
   - Condo Control: "unit information gets updated with missing digits during nightly
     automatic updates" (Capterra *(excerpt)*).
   - FRONTSTEPS: changes must go through Caliber and wait for the **overnight** sync.
   - Smartwebs: "address accuracy, mapping, and slow syncing"; new homes misplaced on the
     map (Capterra *(excerpt)*).
5. **Rental vocabulary on an HOA product.** Buildium: owner-only associations are confused
   by "tenants" and rental language (Capterra *(excerpt)*). AppFolio literally renames
   "Tenants → Homeowners" for associations.
6. **Overwhelming screens.** Vantaca is "overwhelming due to its many features" (G2/Capterra
   *(excerpt)*).
7. **Portal login friction.** Homeowners can't sign in or forget their usernames, and staff
   reset them by hand (FRONTSTEPS reviews *(excerpt)*).

---

## 6. Ranked capabilities for a self-managed HOA board

Ranked by how much each matters to a volunteer board of 20–300 homes. TS = table stakes,
D = differentiator.

| # | Capability | TS / D | Who does it best |
|---|---|---|---|
| 1 | **A one-screen property record**: header (address, owners, occupancy, balance, open items), then ledger, people, violations/ARC, comms, docs, notes, all reachable without hunting | TS (but most products fail it, so doing it well is felt as D) | HOA Hub (Details + Billing), Vantaca tabs |
| 2 | **Separate person and lot records**: many owners per lot, many lots per owner, one login across lots | TS | Buildium, PayHOA, AppFolio, CINC |
| 3 | **Ownership periods with history**: Past/Active/Future, purchase and sale dates, the seller's balance and history kept and hidden from the buyer | TS | Buildium, Vantaca, PayHOA |
| 4 | **A guided change-of-ownership flow**: one atomic step with settlement date, tenant carry-over choice, charge rules, welcome invite | TS for managers; D for self-managed tools | Vantaca, FRONTSTEPS wizard, Condo Control moveout |
| 5 | **Mailing vs property address**, with a mailing preference per owner | TS | Buildium, PayHOA, HOA Express |
| 6 | **Bulk import with mapping, preview, duplicate handling and partial success**, doable by the board (not founder SQL) | TS | HOA Hub, HOA Start |
| 7 | **Tenants with move-in/out dates** and an owner-occupied/rented flag; tenants never confused with owners | TS | Vantaca, Buildium, AppFolio |
| 8 | **Notice-consent and statutory roster fields**: e-notice consent (FL 720.303), CA §4041 annual preferences and occupancy, voting designee; exports as the official roster | D (no competitor markets it; FL/CA law requires it) | none advertised |
| 9 | **Searchable, filterable list** with addable columns (balance, collection status, occupancy, comm preference, portal status) and filters for previous owners and moved-out tenants | TS | Vantaca |
| 10 | **Portal-login status on the record**, with invite/resend from the property page | D (cheap, high impact) | Vantaca alert icon |
| 11 | **An activity timeline per property**: payments, violations, ARC, messages, documents, edits, plus an audit trail | D | HOA Hub |
| 12 | **Tags and custom fields** used for targeting communications | TS | PayHOA, Vantaca |
| 13 | **Private board notes** that survive board turnover | D | HOA Hub |
| 14 | **An in-product estoppel/resale packet** generated from the record | D for self-managed (FL deadlines make it valuable) | PayHOA |
| 15 | **Map view and AI resale intake**: a map of lots for walk-arounds and violations; AI extraction from closing documents | D | Smartwebs/HOALife; Vantaca HOAi |

Vehicles, pets, emergency contacts and gate authorizations are table stakes **only for
condos and gated communities** (Condo Control, Buildium). They belong as optional sections,
not core.

## 7. The five complaints to avoid

1. **"I have to click through tabs to see one home."** Show the essentials in one view.
2. **Owner edits that break things.** An edit must not break autopay, portal linkage or
   history (FRONTSTEPS, Buildium, Vantaca). Ownership changes should be a guided action, and
   simple typo fixes should be trivial.
3. **Confusing rented units.** It must be obvious where the landlord's mailing address goes
   versus the tenant's contact details (PayHOA).
4. **Data drift and slow sync.** One source of truth, with changes visible instantly (Condo
   Control, FRONTSTEPS, Smartwebs).
5. **Duplicates and lost history after import or migration.** A preview, duplicate
   detection and keeping prior owners are what prevent this.
