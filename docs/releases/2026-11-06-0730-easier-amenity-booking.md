---
title: Booking the clubhouse or pool is now step by step
---

## Summary

Residents now book a shared space in four short steps with large buttons: pick the space, pick a day on a month calendar, pick a time and how long, then check and book. Times that are taken say "Booked", and only lengths that will really work are offered.

## What's new

### Resident portal: Amenities
- Each space shows its rules in plain words, such as "Open 8 am to 10 pm. Up to 3 hours. Book up to 30 days ahead.", and says whether the board confirms the booking.
- A month calendar with large days. Days that can't be booked are crossed out and say why when read aloud.
- Free times show as large buttons. Booked, passed and too-soon times are marked in words, not just colour.
- After choosing a start time, only the lengths that fit are offered.
- A plain summary before booking, for example "Clubhouse, Saturday, November 8, 2:00 pm to 4:00 pm".
- If a home has reached its booking limit for a space, the resident is told before starting.
- Cancelling a booking now asks "Yes, cancel it" or "No, keep it" first.
- If there are no free times at all, the page says so and points to the next day that has some.

## Under the hood

- The calendar loads two months at a time and fetches more as you page forward, so it opens quickly.
- Every time and length the calendar offers is checked by a test against the same rules the server uses.
