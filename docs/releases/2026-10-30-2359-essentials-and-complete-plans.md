---
title: Two plans, Essentials and Complete, priced by community size
whats_new:
  - title: Choose Essentials or Complete
    body: Settings, then Billing, now offers two plans. The price depends on how many homes you manage, from $49 a month for Essentials and $99 for Complete at up to 50 homes. Paying for the year gets two months free.
    roles: [admin, board]
    article: settings-billing
    label: new
  - title: Plans include a monthly text allowance
    body: Each plan comes with a monthly allowance of text messages. Billing shows how much you have used, warns you as you near it, and holds texts back at the limit. Email and the portal keep going.
    roles: [admin, board]
    article: settings-billing
    label: new
---

## Summary

HomeownerHub now sells two plans, Essentials and Complete, with a flat monthly price for your size band instead of a price per door. The website and the in-app billing page show the same numbers. New communities start with a free trial and no card.

## What's new

### Billing
- Settings, then Billing, lets an admin pick Essentials or Complete, monthly or yearly. The price follows the number of homes on file: up to 50, 51 to 100, 101 to 200, 201 to 400, and per home beyond that.
- A community already on the old $4.99 per door price keeps it until its term ends. The page shows that price and the one it moves to, and hides the checkout button.
- Each plan has a monthly text allowance, shown on the billing page with a warning from 80 percent used.

### Website
- The pricing page and the home page teaser show the two plans, the size bands and the 30-day trial.

### AI
- Essentials and Complete communities get daily and monthly AI limits sized to the plan. Communities on the old price keep today's limits.

## Under the hood

- A nightly job moves a plan to the right band when the home count changes, with no mid-cycle proration.
- A renewal job emails the board 30 days before an old-price community moves to Complete.

## Needs your action

- Right after this deploys, call the pricing setup route once so Stripe has the four band prices. Until then the Subscribe button shows the generic "checkout isn't set up" message and nothing breaks.
- In the Stripe dashboard, turn off quantity editing in the customer portal (live mode).
