---
id: accounting-payment-plans
title: Set up a payment plan for an owner who is behind
summary: Spread a balance an owner can't pay at once into monthly installments. Each installment becomes its own charge on the owner's account.
topic: accounting
roles: [admin, board]
routes: ["/accounting/payment-plans", "/accounting/payment-plans/new"]
primary_route: /accounting/payment-plans/new
keywords: [payment plan, payment plans, plan completed, behind on plan, plan progress, missed installment, installment, installments, monthly payments, pay over time, payment arrangement, payment agreement, behind on dues, past due, delinquent, delinquency, owner can't pay, hardship, catch up, special assessment, spread balance, split balance, arrears, collections, late fee, owes, pay off, pay it off over months, six months, monthly installments]
related: [dues-collections-case, dues-record-payment, dues-generate-monthly]
reviewed: 2026-10-18
---

Use this when the board agrees to let an owner pay a past-due balance or a special assessment over several months.

## Before you start
- Board admins and board members can create payment plans.
- Agree on the total, the number of months and the first due date with the owner first.
- The home must be on file, and the books must have an open fiscal period.

## Steps
1. Open **Accounting**, then the **Payment plans** tab, and select [[New plan]].
2. Choose the **Property**.
3. Enter the **Balance to spread**.
4. Enter the number of **Installments**, from 2 to 60.
5. Pick the **First due** date. The rest are due on the same day of each month after it.
6. Check **Each installment** below the fields. It shows the monthly amount.
7. Select [[Create plan]].

## What happens next
- The plan shows on **Payment plans** as **Active**, with its schedule, start date, total and **Progress**.
- One charge is created for each installment, due monthly. They show on the **Dues** page as special assessments, and each posts to the ledger right away.
- The property's page shows the plan under **Payment plan** in its Money section.
- You record each installment the owner pays like any other charge. See [Record a payment by check or cash](guide:dues-record-payment).

### Follow a plan's progress
- **Progress** on **Payment plans** shows how many installments are paid and when the next one is due.
- **Behind on plan** means an installment's due date has passed and it isn't paid in full. A banner at the top counts the plans that are behind. The property's page shows the same words on its **Payment plan** tile.
- When every installment is paid in full, the plan moves to **Completed** by itself. This happens when you record the last payment, or overnight at the latest. Progress then shows the day it completed.
- A waived or written-off installment counts as settled, because nothing is owed on it.

## If something goes wrong
- "Between 2 and 60 installments.": change the number of installments.
- "Enter the balance to spread, greater than $0.": type an amount, like 1200.
- "No open fiscal period.": the books have no current period, so the charges can't post. An admin opens one on **Accounting**, then **Periods**.
- "Couldn’t create the plan": nothing was saved. Try again in a minute.
- **Progress** says "Couldn’t load": the plans themselves loaded, but their payments didn't. Reload the page.
- **Not tracked**: some of the plan's installment charges are missing, so the app can't tell when it is paid off and won't complete it on its own.

## Good to know
- A plan adds new charges for the full amount. It does not close or replace charges already on the owner's account. Those stay open unless the board deals with them.
- If the total doesn't split evenly, the last installment absorbs the leftover cents.
- You can't edit, cancel or delete a plan in the app.
- Each installment stands alone: paying extra on one doesn't pay the next.
- Automatic dues reminders skip a home while its plan is **Active**, even when it is **Behind on plan**. There is no separate plan reminder, so follow up with the owner yourself. You can see how many reminders were skipped in **Settings**, then **Dues reminders**.
- Once a plan is **Completed**, the home gets automatic dues reminders again like any other home.
- Late fees are not paused by a plan. Every night the app adds a one-time 5% late fee to each charge still unpaid after its due date, including late installments.
- HomeownerHub doesn't send collection letters. To keep a record of letters, liens and attorney work, use the [collections file](guide:dues-collections-case) on the property's page.
