---
id: dues-generate-monthly
title: Bill this month's dues
summary: Create this month's dues charge for every home in one step, or add a one-off charge for one property.
topic: dues
roles: [admin, board]
routes: ["/dues", "/dues/new"]
primary_route: /dues
keywords: [dues, assessment, bill, charge, monthly, generate, special assessment, fee, invoice owners, association]
shots:
  - name: guide-dues-charges
    alt: The Dues page with charges grouped by month and the Generate dues button highlighted
  - name: guide-dues-no-association
    alt: The Set up your association form shown on the Dues page when no association exists
related: [dues-record-payment, setup-properties-residents]
reviewed: 2026-10-17
---

A dues charge is money a home owes the association. Each charge posts to the ledger as money owed, so balances and reports stay right.

## Before you start
- Your HOA needs an association. If it has none, the Dues page shows [[Set up your association]] instead. An admin fills in the **Association name**, **State** and **Type**, then selects [[Create association]].
- Dues are billed to the homes in Properties. Every home you add there can be billed. See [Add your properties and residents](guide:setup-properties-residents).

## Steps
### Every home, this month
1. Open **Dues** from the sidebar.
2. Select the **Generate** button at the top. It names the month, for example "Generate Oct 2026 dues".
3. Enter the **Amount per property**.
4. Select [[Generate dues]].

![[guide-dues-charges]]

### A one-off or repeating charge
1. On the Dues page, select [[Add a due]].
2. Under **Who to bill**, choose every property or one property.
3. Under **How often**, choose Once, Monthly (12 charges) or Annually.
4. Enter the **Amount per charge**, the **Due date** and the **Kind** (Regular dues or Special assessment).
5. Select **Add due** to create the charges.

## What happens next
The charges appear on the Dues page, grouped by month, with each home's status. The **Who owes** panel lists owners with a balance and lets you send reminders. To remind owners automatically, open [[Dues reminders]] in the Account section of the sidebar.

## If something goes wrong
- No charges yet: the page says **No dues billed yet**. If you have not added homes, select [[Add properties first]].
- An older home is missing from the bill: if your HOA has one community, generating dues first makes every home in Properties billable. With several communities, ask support to link the home to its community.
- "Add properties before generating dues.": your HOA has no homes yet. Add them in Properties first.
- "Assessments for this period are already on file.": this month's dues were already generated. Homes that already have regular dues this period are skipped.

![[guide-dues-no-association]]

## Good to know
- Generating dues always bills every home the same amount. The due date is set for you; there is no date field. Use [[Add a due]] for a different amount or date.
- A charge can't be edited. Delete an unpaid charge and add it again. A paid charge can't be deleted.
