---
id: communications-segments-sms
title: Choose who gets a message, and send it by text
summary: Pick an audience like late on dues or one property, add text messages, and check who each message reached.
topic: communications
roles: [admin, board]
routes: ["/communications/new", "/communications/[id]"]
primary_route: /communications/new
keywords: [audience, segment, group, recipients, who gets it, owners only, tenants only, late on dues, delinquent, open violations, specific property, one home, board only, custom contacts, vendor, attorney, sms, text message, texting, character limit, "279 characters", long text, delivery, delivered, opened, bounced, failed, resend, not opened, notice, who opened, outside people, non-residents]
related: [communications-send-announcement, inbox-reply-to-resident]
reviewed: 2026-10-18
---

Use this when a message is only for some people, or should also go out as a text. The basic send is in [send an announcement](guide:communications-send-announcement).

## Steps
1. Open **Communications** and select [[New message]].
2. Under **Audience**, pick who gets it: **Everyone**, **Owners only**, **Tenants only**, **Late on dues**, **Units with open violations**, **Specific property**, **Board** or **Custom contacts** (people who aren't residents, like a vendor or your attorney). Each one shows how many people it reaches right now.
3. For **Specific property** (one address), choose the home, then tick the people living there. [[Owners]], [[Tenants]], [[All]] and [[None]] tick them for you.
4. For **Board**, tick the board members. For **Custom contacts**, type a name, email or US phone and select [[Add]].
5. Select [[Continue]], write the message, then select [[Continue]] again.
6. Under **Channels**, tick **SMS** to also send a text.
7. Check the **Review** box, then select [[Send now]] or [[Schedule]].

## What happens next
The message's own page shows **Delivered**, **Opened**, **Replied** and **Failed**. Filter the recipient list by [[Failed]], [[Opened]] or [[Not opened]] to see each person's status, like who never opened a notice. If some emails failed, select **Resend to … failed** to try those people again.

## If something goes wrong
- "Nobody matches right now": that group has nobody with contact details on file, so you can't pick it.
- "Pick at least one resident at that property.": tick at least one person before you continue.
- "No active residents recorded for this property. Add residents on the property page first.": add people to that home, then come back.
- "… doesn't look like a US phone number.": custom contacts only take US numbers.

## Good to know
- **Everyone**, **Late on dues** and **Units with open violations** reach one person per home: the owner, or the tenant if no owner is on file.
- **Late on dues** means a charge was due before today and isn't fully paid.
- A text holds up to 279 characters, subject included. Longer ones are cut short and end with a link to the full message in the portal. Each person gets one text, never a chain of texts.
- People with no phone number on file get no text. Board members are never texted.
- **Resend** only retries failed emails, not texts.
- Picking a template sets **Channels** to that template's own choices. Check **Channels** before you send.
