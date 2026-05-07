# Madison Park Demo Checklist

The first paying HOA. This document is the "do this in order" runbook for the day Linda's board does the live demo. Pre-flight should take ~30 minutes; the actual demo is 15 minutes.

## Pre-demo (you, the night before)

### Provisioning

- [ ] Supabase project healthy — `select 1` runs in the SQL editor.
- [ ] All three apps reachable in production (hoa / evict / pm).
- [ ] Stripe in **live** mode with a real card on file in case Linda wants to subscribe end-of-meeting.
- [ ] Anthropic key has spend limit > $5 (digest is cheap, but a runaway loop would be embarrassing).
- [ ] RunPod pod is up and warm (`curl $AI_BASE_URL/v1/models` returns 200), or be ready to demo with the "AI unavailable — write manually" fallback.

### Madison Park's data

- [ ] Create org in Supabase (or have Linda do it via the magic-link signup):
  - **Name:** Madison Park HOA
  - **hub_type:** hoa
  - **plan:** free (or `starter` if you want to pre-comp them for the demo)
  - **doors_count:** 49
- [ ] Add Linda as `org_members.role='owner'`.
- [ ] Add 49 properties via CSV import or the `/properties/new` form. (CSV import isn't built — for the demo, 5–10 properties is enough to show what the dashboard looks like populated.)
- [ ] Upload Madison Park's CC&Rs PDF at `/documents/upload` and paste the text into the "Plain text" field so Covenant Brain can match against it.

### Validate the demo path

Walk through the path you'll demo, with Linda's data, end-to-end. Don't wing this live.

- [ ] Sign in with magic link. Lands on dashboard. Daily Digest card has actual content (click Refresh if it's stale).
- [ ] Click **Violations** → **Report violation**. Pick any property. Upload a photo. Click **Suggest values** — see AI fill in cure period + fine + reasoning. Click **Analyze with Covenant Brain** — see the CC&R section match. BarBGate appears with a real letter draft. Approve.
- [ ] Back on dashboard, "Violations" stat card now shows 1 open.
- [ ] Compliance Heat Map shows a green/yellow dot on the cure deadline.
- [ ] Click **Meetings** → **New minutes**. Paste a transcript snippet. Click **Suggest values** to see attendees parsed. Generate minutes. Approve via BarBGate.
- [ ] Click **Dues** → **Generate this month's dues**. See the period table populate.
- [ ] Click **Settings** → **Billing**. See the three plan cards. Don't click checkout yet (we'll show this live).

## Demo day (15 minutes)

### Opening (1 min)

> "Today I'll show you HomeownerHub running on your data. Madison Park's CC&Rs are loaded, your properties are in the system. Everything we'll do today is something you can do tomorrow."

### Magic-link login (1 min)

- [ ] Open https://hoa.homeownerhub.com on the projector
- [ ] Show the login form — "no password, just email"
- [ ] Trigger the magic link, click it from your phone, dashboard appears

### The dashboard (3 min)

- [ ] Read the Daily Digest aloud — "this is generated at 7am every morning by Claude, summarizing what needs your attention"
- [ ] Walk through the three stat cards
- [ ] Point at the Compliance Heat Map — "every cure deadline, every dues date, color-coded for the next 90 days"
- [ ] Hover over a yellow day to show the popover

### The violation wizard (4 min)

This is the demo's emotional center. Every minute spent here is worth two on the rest.

- [ ] Click **Violations** → **Report violation**
- [ ] Pick a property — say it's a real one Linda's been worried about
- [ ] Upload a photo (have one ready that obviously matches a CC&R section)
- [ ] **Click "Suggest values"** — pause here and read the reasoning aloud. "It says 14 days because this is a general violation, $25/day because it's medium severity. We can override either."
- [ ] Click **Analyze with Covenant Brain** — count "1, 2, 3" while the spinner runs
- [ ] When the BarBGate appears, scroll through the letter slowly. Highlight: "This cited Section 4.2(b) of *your* CC&Rs because we matched against the document you uploaded."
- [ ] Edit one sentence to show that it's a real human-in-the-loop step
- [ ] Scroll to the bottom (the Approve button is intentionally locked until you do)
- [ ] **Click Approve & mark notice sent**
- [ ] Land on the violation detail page. Show the timeline.

### Meetings (2 min)

- [ ] Click **Meetings** → **New minutes**
- [ ] Paste 2–3 sentences from any board meeting (have one in the clipboard)
- [ ] Click **Suggest values** — point at the auto-extracted attendees
- [ ] Click **Generate minutes** — show the AI summary
- [ ] BarBGate again — emphasize: "the same review gate as the violation letter. Nothing AI generates leaves the system without the board signing off."
- [ ] Approve

### Cross-hub story (2 min)

- [ ] Click the hub switcher in the top-right — "If you also use the Eviction Hub or PM Hub, you switch between them here."
- [ ] **Don't switch.** This is just to plant the seed for upsell.

### Pricing & next steps (3 min)

- [ ] Click **Settings** → **Billing**
- [ ] Walk through the three plans:
  - "Starter at $39/mo covers up to 50 properties — perfect for Madison Park's 49."
  - "Standard adds the Meeting Co-Pilot."
  - "Pro is for management companies running multiple HOAs."
- [ ] If Linda's ready: click **Choose Starter** → Stripe Checkout → Stripe test card or Linda's real card
- [ ] After payment: dashboard now shows `starter` badge in Settings

### Closing

> "Today's demo: 15 minutes, 1 violation letter, 1 meeting minutes, 1 subscription. That's the whole month of secretary work for most boards, done in real time."

> "What questions do you have?"

## Hot-fix kit (in case something breaks live)

| If… | Do this on stage… |
|---|---|
| Magic link doesn't arrive in 30s | "Email's slow today, here's what it would look like" → take a screenshot pre-demo |
| Covenant Brain returns "AI unavailable" | "And here's what it looks like with the AI offline — you can still write the letter" → continue through BarBGate manually |
| Stripe Checkout 500s | "We'll set you up after the meeting via the test mode card" → don't push it |
| Browser freezes | Reload. The wizard will show "Resumed unfinished draft" — point at it and say: "every wizard saves as you go. Even browser crashes are recoverable." That's a feature win. |

## Post-demo follow-up

Within 24 hours:

- [ ] Email Linda a summary + the URL she can return to
- [ ] If she subscribed, confirm the Stripe charge cleared
- [ ] If she didn't, ask "what's the one thing that would tip the decision?"
- [ ] Add the violation + meeting minutes you created during the demo as actual records (if they're real)
