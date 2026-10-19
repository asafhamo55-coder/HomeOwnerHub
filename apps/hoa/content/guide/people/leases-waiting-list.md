---
id: leases-waiting-list
title: Set the rental cap and manage the lease waiting list
summary: Set how many homes may be rented, see how many are leased now, and approve owners from the waiting list in order.
topic: people
roles: [admin, board]
routes: ["/leases", "/properties/[id]"]
primary_route: /leases
keywords: [lease, leases, leasing, rental, rentals, rent out, renting, tenant, tenants, landlord, rental cap, lease cap, allowed to lease, allowed to rent, rental restriction, rental limit, percent leased, headroom, waiting list, wait list, queue, approve lease, deny lease, tenure, owner-occupied, owner occupied, leased, declaration, ccr]
related: [setup-properties-residents, documents-governing-and-ask, properties-record-a-sale]
reviewed: 2026-10-18
---

Use this when your declaration limits how many homes can be rented at once. The **Leases** page shows how close you are to the cap and keeps owners who want to rent in a first-come, first-served line.

## Before you start
- Only board admins and board members can change the cap or the waiting list.
- The numbers come from each home's tenure: **Owner-occupied**, **Leased** or **Unknown**. You set it on the property's page with [[Change tenure]].

## Steps
1. Open **Leases** from the sidebar. The top shows **Leased**, **Rental cap** and **Headroom**, which is how many more homes can still be leased.
2. Under **Cap policy**, select [[Set cap]] (or [[Edit cap]]). Enter the percent of units that may be leased, then select [[Save cap]]. Not sure? Select [[Suggest from declaration]] to have AI read your governing documents, then [[Use this]] if it found a cap.
3. When an owner asks to rent and you're at the cap, select [[Add to waiting list]]. Search for their property, add a note if you like, then select [[Add to waiting list]] again.
4. When a leased home goes back to owner-occupied, find the first owner in line and select [[Approve]], then confirm.
5. If an owner changes their mind, open the row's menu and choose [[Withdraw from list]]. To turn a request down, choose [[Deny request]].

## What happens next
Approving marks that home **Leased** and records the approval in the property's history, so it counts against the cap. Approved, denied and withdrawn requests move to **Recent decisions**. Select [[Export CSV]] for the full history.

## If something goes wrong
- "Cap must be a number between 0 and 100.": enter a percent from 0 to 100, or leave the box blank to remove the cap.
- "This property is already on the waiting list.": each home can only be in line once at a time.
- "AI couldn't find a cap clause in your declaration — set one manually if you have one.": upload your declaration under **Documents**, or type the cap yourself.
- **Add to waiting list** is greyed out: every home is already leased or already on the list.
- A line saying some units "have unknown tenure": the figures may be low. Select [[Review those homes]] and set each one's tenure.

## Good to know
- The app doesn't block approvals over the cap. When **Headroom** is 0, approve the next owner only after a leased home returns to owner-occupied.
- The app doesn't tell owners about the board's decision. Let them know yourself.
- The **Leases** page only counts which homes are leased. It doesn't show tenants or lease dates. When a tenant and lease are on file, they show on that home's own page.
- A cap of 0 or a blank cap means no cap, not "no leasing".
- The line's position is first come, first served by request date.
- On a property's page, an owner-occupied home also has an **Add to waiting list** button once a cap is set.
