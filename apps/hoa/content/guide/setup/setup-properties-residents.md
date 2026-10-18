---
id: setup-properties-residents
title: Add your properties and residents
summary: Add each home's address so it can be billed, then the owners, tenants and family members who live there.
topic: setup
roles: [admin, board]
routes: ["/properties", "/properties/new", "/properties/[id]"]
primary_route: /properties
keywords: [property, home, house, address, unit, lot, owner, resident, tenant, import, spreadsheet, csv, archive]
shots:
  - name: guide-properties-list
    alt: The Properties page with the Add property button highlighted
  - name: guide-properties-new
    alt: The Add a property form with the Add property button highlighted
related: [setup-import-roster, start-board-admin, dues-generate-monthly, members-invite-board]
reviewed: 2026-10-17
---

Every home in the community is a property. Dues, owners, residents, violations and mail all hang off a property, so add them first.

## Before you start
- You need the list of addresses. The owner's name, email and phone are optional. Already have them in a spreadsheet? [Import them](guide:setup-import-roster) instead.
- Board admins and board members can add properties.

## Steps
1. Open **Properties** from the sidebar and select [[Add property]].
2. Fill in the **Address**. Add the **Unit / Lot #** and the owner's details if you have them.
3. If your HOA has more than one community, pick the **Community** the home belongs to.
4. Select [[Add property]] to save. The new property's page opens and says "Property added."
5. Open the **Residents** tab and select [[Add resident]].
6. Enter the **Full name** and pick a **Role** (Owner, Tenant, Family member or Other). Tick [[Primary contact]] for the person notices go to, then select [[Add resident]].

![[guide-properties-list]]

![[guide-properties-new]]

## What happens next
The home is ready to bill straight away: it gets its dues record, and the owner you entered is recorded as its current owner. It appears on the Properties list, and the property page shows its balance, residents, violations and mail in one place.

## If something goes wrong
- "Address is required.": the address is the only field you must fill in.
- "Owner email must be a valid email.": check the email, or leave it blank.
- "Choose a community from the list.": your HOA has several communities, so pick one.
- "Enter the resident’s name.": a resident needs a full name.

## Good to know
- The Properties list starts on **All** homes. Switch to **Needs attention** to see homes with something to deal with, and use [[Filters]] to narrow by records or tenure. Search looks through every home.
- From a property's **Violations** tab, [[New violation here]] starts a violation report for that home.
- To change an owner's details, open the property and select [[Edit]].
- A home you no longer need can be archived: open it, select the **More actions** button (⋯), then [[Archive]]. Its residents, violations and dues stay on file.
- Have many homes? Select [[Import]] on the Properties page to bring them all in from a spreadsheet, such as a CINC Systems export. See [Import your homes and owners from a spreadsheet](guide:setup-import-roster).
