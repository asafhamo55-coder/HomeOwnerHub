---
id: accounting-payment-plans
title: Set up a payment plan for an owner who is behind
summary: Spread an owner's open charges into monthly installments. The plan closes those charges and bills the same balance, so nothing is owed twice.
topic: accounting
roles: [admin, board]
routes: ["/accounting/payment-plans", "/accounting/payment-plans/new"]
primary_route: /accounting/payment-plans/new
keywords: [payment plan, payment plans, plan completed, behind on plan, plan progress, missed installment, installment, installments, monthly payments, pay over time, payment arrangement, payment agreement, behind on dues, past due, delinquent, delinquency, owner can't pay, hardship, catch up, special assessment, spread balance, split balance, arrears, collections, late fee, owes, pay off, pay it off over months, six months, monthly installments, charges replaced, counted twice, double counted, created before 2026-10-19, cancel plan, defaulted plan]
related: [dues-collections-case, dues-record-payment, dues-generate-monthly]
reviewed: 2026-10-21
---

Use this when the board agrees to let an owner pay a past-due balance or a special assessment over several months.

## Before you start
- Board admins and board members can create payment plans.
- Agree with the owner on which charges the plan covers, the number of months and the first due date.
- The home must be on file, and the books must have an open fiscal period.
- The charges the plan covers must already be on the owner's account. Bill a special assessment first, then put it on a plan.

## Steps
1. Open **Accounting**, then the **Payment plans** tab, and select [[New plan]].
2. Choose the **Property**.
3. Check the list under **Charges this plan replaces**. It shows every open charge on the property. The past-due ones are already ticked. Tick or untick charges until the list matches what you agreed with the owner.
4. Enter the number of **Installments**, from 2 to 60.
5. Pick the **First due** date. The rest are due on the same day of each month after it. When a month is shorter, the installment is due on its last day. For example, a plan starting Jan 31 is due Feb 28, then Mar 31.
6. Check the line below the fields. It shows the **Balance to spread** (what is still open on the ticked charges), the monthly amount, and the first and last due dates.
7. Select [[Create plan]].

## What happens next
- The charges you ticked are closed. On the property and the owner's ledger they show as **Waived**, because the plan has replaced them.
- One charge is created for each installment, due monthly. Together they add up to the balance you spread. They show on the **Dues** page as special assessments.
- The owner's balance doesn't change when you create a plan. The ledger moves the amount from the old charges to the installments, so the association's receivables and income are counted once.
- The plan shows on **Payment plans** as **Active**, with its schedule, start date, total and **Progress**.
- The property's page shows the plan under **Payment plan** in its Money section.
- You record each installment the owner pays like any other charge. See [Record a payment by check or cash](guide:dues-record-payment).

### Follow a plan's progress
- **Progress** on **Payment plans** shows how many installments are paid and when the next one is due.
- **Behind on plan** means an installment's due date has passed and it isn't paid in full. A banner at the top counts the plans that are behind. The property's page shows the same words on its **Payment plan** tile.
- When every installment is paid in full, the plan moves to **Completed** by itself. This happens when you record the last payment, or overnight at the latest. Progress then shows the day it completed.
- A waived or written-off installment counts as settled, because nothing is owed on it.

### Plans created before 2026-10-19
- Before Oct 19, 2026, a plan added its installments without closing the charges it was meant to spread. The owner's balance on those homes can show the same amount twice.
- Those plans show "Created before 2026-10-19: check the original charges" in the **Total** column, and a banner at the top of **Payment plans** counts them.
- Nothing is changed for you automatically. Ask support to review the plan and close the original charges. The warning goes away once they are closed.

## If something goes wrong
- "Pick at least one open charge for the plan to replace.": tick at least one charge. If the list says nothing is open, there is no balance to spread.
- "Between 2 and 60 installments.": change the number of installments.
- "Too many installments for this balance.": use fewer installments.
- "The open balance on these charges changed since the page loaded.": a payment was recorded in the meantime. Reload the page and check the total.
- "A selected charge was paid or changed while the plan was being made.": nothing was saved. Reload and try again.
- "No open fiscal period.": the books have no current period, so the charges can't post. An admin opens one on **Accounting**, then **Periods**.
- "Couldn’t create the plan": nothing was saved. Try again in a minute.
- **Progress** says "Couldn’t load": the plans themselves loaded, but their payments didn't. Reload the page.
- **Not tracked**: some of the plan's installment charges are missing, so the app can't tell when it is paid off and won't complete it on its own.

## Good to know
- If the balance doesn't split evenly, the last installment absorbs the leftover cents.
- A partly paid charge is closed for what was left on it. The payments already made stay on that charge.
- You can't edit, cancel or delete a plan in the app.
- If a plan is ever cancelled or the owner stops paying, the installments not paid yet are still owed, like any other charge. The charges the plan replaced stay closed and are not re-opened, so the balance isn't counted twice.
- Each installment stands alone: paying extra on one doesn't pay the next.
- Automatic dues reminders skip a home while its plan is **Active**, even when it is **Behind on plan**. There is no separate plan reminder, so follow up with the owner yourself. You can see how many reminders were skipped in **Settings**, then **Dues reminders**.
- Once a plan is **Completed**, the home gets automatic dues reminders again like any other home.
- Late fees are not paused by a plan. The app adds a late fee only if your board has turned one on in [late-fee settings](guide:settings-late-fees), at the amount and after the grace period the board chose. Then a late installment gets one late fee like any other charge. With no late-fee policy saved, no late fee is charged. Charges the plan replaced are closed, so they get no late fees.
- HomeownerHub doesn't send collection letters. To keep a record of letters, liens and attorney work, use the [collections file](guide:dues-collections-case) on the property's page.
