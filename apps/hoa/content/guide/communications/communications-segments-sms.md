---
id: communications-segments-sms
title: Choose who gets a message, and send it by text
summary: Pick an audience like late on dues or one property, add text messages, and check who each message reached.
topic: communications
roles: [admin, board]
routes: ["/communications/new", "/communications/[id]"]
primary_route: /communications/new
keywords: [a street, street, homes on, owners on, all homes, all owners, renters, homes behind on dues, someone outside the HOA, more options, urgent, follow up, email again, text them, haven't opened, opted out, opt in, texting not set up, audience, segment, group, recipients, who gets it, owners only, tenants only, late on dues, delinquent, open violations, specific property, one home, board only, custom contacts, vendor, attorney, sms, text message, texting, character limit, "279 characters", long text, delivery, delivered, opened, bounced, failed, resend, not opened, notice, who opened, outside people, non-residents]
related: [communications-send-announcement, inbox-reply-to-resident]
reviewed: 2026-10-20
---

Use this when a message is only for some people, or should also go out as a text. The basic send is in [send an announcement](guide:communications-send-announcement).

## Steps
1. Open **Communications** and select [[New message]].
2. Under **Audience**, pick who gets it: **All homes**, **All owners**, **Renters**, **Homes behind on dues**, **Homes with an open violation**, **A street** or **One home**. Under **More options** are **Board** and **Someone outside the HOA** (like a vendor or your attorney). Each one shows how many people it reaches right now.
3. For **A street**, choose the street, like "Elm St (12 homes)". Tick **Owners only** to leave out renters.
4. For **One home**, choose the home, then tick the people living there. [[Owners]], [[Tenants]], [[All]] and [[None]] tick them for you. For **Board**, tick the board members. For **Someone outside the HOA**, type a name, email or US phone and select [[Add]].
5. Select [[Continue]], write the message, then select [[Continue]] again.
6. Tick **This is urgent** to also send a text, or tick **Text** yourself.
7. Check the phone preview and the **Review** box, then select [[Send now]] or [[Schedule]].

## What happens next
The message's own page starts with **Did people get it?**: how many homes were reached by email or text, and how many opened the email. Opens are approximate, because some mail apps open every email on their own.

To follow up with the homes that haven't opened, select **Email again to the … who haven't opened**, or **Text them**. A new message opens, already filled in with "Reminder:" and those homes. Check it and select Send. Nothing goes out until you do.

**Delivered**, **Opened**, **Replied** and **Failed** sit below. Filter the recipient list by [[Failed]], [[Opened]] or [[Email not opened]] to see each person's status. If some emails failed, select **Resend to … failed** to try those people again.

## If something goes wrong
- "Nobody matches right now": that group has nobody with contact details on file, so you can't pick it.
- "Pick at least one resident at that property.": tick at least one person before you continue.
- "No active residents recorded for this property. Add residents on the property page first.": add people to that home, then come back.
- "… doesn't look like a US phone number.": custom contacts only take US numbers.
- "Texting isn't set up yet.": your HOA can't send texts yet, so **Text** can't be ticked. Send by email and the portal.
- A text shows **Failed** with "SMS not configured": texting wasn't set up when it was sent, so no text went out.

## Good to know
- **All homes**, **Homes behind on dues**, **Homes with an open violation** and **A street** reach one person per home: the owner, or the renter if no owner is on file.
- Streets come from your homes' addresses. "12 Elm Street" and "14 Elm St" count as the same street. A home with no house number in its address isn't on any street.
- A follow-up only works for audiences of homes. It isn't offered for renters only, one home, the board or people outside the HOA. A text never opens, so a home that only got a text never counts as "not opened".
- **Homes behind on dues** means a charge was due before today and isn't fully paid.
- A text holds up to 279 characters, subject included. Longer ones are cut short and end with a link to the full message in the portal. Each person gets one text, never a chain of texts.
- Texts only go to residents who said yes to texts. Everyone else gets the email and portal copy instead. The **Review** step shows how many will be skipped (opted out).
- Residents who turned off email don't get the email.
- People with no phone number on file get no text. Board members are never texted.
- **Resend** only retries failed emails, not texts.
- Picking a template sets the channels from how urgent it is. If you already ticked channels yourself, a template doesn't change them.
- Portal on or off is under **More options** on the last step.
