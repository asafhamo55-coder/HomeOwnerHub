---
id: accounting-payment-plans
title: Set up a payment plan for an owner who is behind
summary: Spread a balance an owner can't pay at once into monthly installments. Each installment becomes its own charge on the owner's account.
topic: accounting
roles: [admin, board]
routes: ["/accounting/payment-plans", "/accounting/payment-plans/new"]
primary_route: /accounting/payment-plans/new
keywords: [payment plan, payment plans, installment, installments, monthly payments, pay over time, payment arrangement, payment agreement, behind on dues, past due, delinquent, delinquency, owner can't pay, hardship, catch up, special assessment, spread balance, split balance, arrears, collections, late fee, owes, pay off, pay it off over months, six months, monthly installments]
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
- The plan shows on **Payment plans** as **Active**, with its schedule, start date and total.
- One charge is created for each installment, due monthly. They show on the **Dues** page as special assessments, and each posts to the ledger right away.
- The property's page shows the plan under **Payment plan** in its Money section.
- You record each installment the owner pays like any other charge. See [Record a payment by check or cash](guide:dues-record-payment).

## If something goes wrong
- "Between 2 and 60 installments.": change the number of installments.
- "Enter the balance to spread, greater than $0.": type an amount, like 1200.
- "No open fiscal period.": the books have no current period, so the charges can't post. An admin opens one on **Accounting**, then **Periods**.
- "Couldn’t create the plan": nothing was saved. Try again; if it keeps failing, contact support.

## Good to know
- A plan adds new charges for the full amount. It does not close or replace charges already on the owner's account. Those stay open unless the board deals with them.
- If the total doesn't split evenly, the last installment absorbs the leftover cents.
- You can't edit, cancel or delete a plan in the app. The plan also doesn't change to **Completed** on its own when the owner finishes paying.
- Automatic dues reminders skip a home with an active payment plan. You can see how many were skipped in **Settings**, then **Dues reminders**.
- Late fees are not paused by a plan. Every night the app adds a one-time 5% late fee to each charge still unpaid after its due date, including late installments.
- HomeownerHub doesn't send collection letters. To keep a record of letters, liens and attorney work, use the [collections file](guide:dues-collections-case) on the property's page.
