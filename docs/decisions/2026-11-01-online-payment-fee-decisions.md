# Online payment fee decisions

**Date:** 2026-11-01. Decisions 1 to 5 were made by Asaf. Decisions 6 and 7 use the design's recommended defaults and are open to change.

This resolves the open owner decisions in `docs/decisions/2026-10-31-online-dues-payments-design.md` §8. All of it remains subject to the counsel review in OA-42. Stripe's rates and rules still need checking before launch.

1. **Default fee payer.** The association pays for bank transfers. The homeowner pays for cards, with the card fee off until a board member acknowledges their state's rules.
2. **Bank transfer fee.** `max($2.45, stripe_estimate + $0.45)`, so at most $5.45. Never flat, because a flat $2.45 loses money above about $306.
3. **Card fee.** 3.0% + $0.50, clamped so the total never exceeds the configured network cap. Today that cap is treated as 3% in total.
   - This is a correction to the design's recommendation. The $0.50 alone takes 3.0% over a 3% cap (on $250, $8.00 is 3.2%), so the percentage clamp must apply to the whole fee.
   - At a 3% cap there is no platform margin on cards. An application fee can't be negative, so on $250 the association covers about $0.27.
4. **Our fee on refunds.** Returned on full refunds, kept on partial refunds.
5. **Returned payment fee.** Off by default. A board may set one, capped at $30 pending counsel.
6. **States for the card fee in v1.** Georgia only. Other states are association-pays until counsel clears them.
7. **Pay ahead (credit).** Available as an advanced option, hidden by default.
