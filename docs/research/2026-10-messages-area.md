# One "Messages" area: Inbox + Communications (BL-102 A11, with BL-101)

Status: design note, 2026-10-20. No code yet. It builds on
`docs/research/2026-10-communications-plan.md` §4 A11 and §6, and on
`docs/research/2026-10-inbox-plan.md`.

## The problem

A board member thinks "I need to talk to residents". The sidebar gives two
unrelated items in the **Community** group (`components/layout/nav.ts`):

- **Inbox** (`/inbox`, Mail icon) holds resident email from the connected
  Gmail mailbox (BL-101). It deals with one resident at a time.
- **Communications** (`/communications`, Megaphone icon) holds broadcasts:
  announcements, follow-ups, scheduled sends and, since A9, drafts. It deals
  with many homes.

Three things follow from that split:

1. **Replies are in the wrong place.** A reply to a broadcast email lands in
   `communication_replies`. It shows only on that message's page. The guide
   has to say "Replies … do not go to the Inbox".
2. **Two "new message" entry points.** `/inbox/compose` (one resident, sent
   from the HOA mailbox) and `/communications/new` (many homes, sent through
   Resend, Vonage and the portal). The command palette lists only the second
   one ("New message to residents").
3. **Unfinished work is in two places.** Inbox reply drafts
   (`0035_inbox_drafts`) and broadcast drafts (A9, `communications.status =
   'draft'`) are separate, and nothing lists both.

## Proposal

### Navigation

- Replace **Inbox** and **Communications** in the Community group with one
  item, **Messages** (Mail icon), at the old Inbox position.
- Keep `inbox`, `email`, `mail`, `communications`, `announcements` and
  `broadcast` as keywords on the new item, so muscle memory and palette search
  still work.
- `isActive` must treat `/inbox/**` and `/communications/**` as Messages. Today
  it matches by href prefix, so the item needs a list of prefixes, or a
  `match` callback, instead of one `href`.

### Tabs (no new routes)

One shared tab bar at the top of both existing pages:

| Tab | URL | Shows |
| --- | --- | --- |
| **Inbox** | `/inbox` | Resident email threads, as today |
| **Sent to residents** | `/communications` | Broadcasts, sent and scheduled (drafts already excluded by A9) |
| **Drafts** | `/communications?status=draft` | Broadcast drafts (A9). Phase 2: inbox reply drafts too |

- The routes stay the same, so no links, emails or bookmarks break.
- No `app/(dashboard)/messages/` route group is needed in Phase A. A
  `MessagesTabs` component (server, links only), rendered by
  `communications/page.tsx` and by `inbox/InboxChrome.tsx`, is the whole
  change. A `/messages` route can redirect to `/inbox` later if we want a
  clean URL.
- The Inbox tab shows only for roles that can read the inbox today. A board
  member reads it, and an admin also manages the mailbox. Gating stays
  exactly as `inbox/page.tsx` has it (`canManageMailbox = role === 'admin'`).
  With no mailbox connected, the tab still shows and keeps today's "No
  mailbox connected" empty state, which is the prompt to connect one.

### One "New message" button

On every tab, a single **New message** button opens a two-choice menu:

- **To one resident**: `/inbox/compose`, sent from the HOA mailbox, so the
  reply comes back to the Inbox.
- **To many homes**: `/communications/new`, the one-box composer with
  audiences, channels, phone preview and autosaved drafts.

The palette gets both entries, "Email one resident" and "New message to
residents", with the same wording.

### Broadcast replies in the Inbox tab (read-only)

- Add a **Replies to announcements** filter to the Inbox tab's thread list.
  It reads `communication_replies` joined to its communication (subject) and
  recipient (unit), newest first.
- Opening one shows the reply and the same home panel the inbox shows (dues,
  violations, ARC), plus a link back to the announcement's results.
- Read-only in Phase A: no reply-from-here, no merging of storage. Moving
  broadcast replies into inbox threads is the BL-101 Phase B decision in the
  communications plan, §6. The guide line "do not go to the Inbox" changes
  to "show under Replies to announcements in Messages" only when this ships.

### Shared vocabulary (already agreed in the plan, §6)

"Draft it" (AI), "Review", "Send"; the same AI-draft pill; "Nothing sends
until you press Send"; "homes", not "units"; "Text", not "SMS".

## What A9 and A8 already give this

- **Drafts tab content exists.** `/communications?status=draft` lists
  autosaved broadcast drafts with Resume and Delete (A9). They are kept out of
  the main list and its delivery figures, which is exactly what a separate
  tab needs.
- **Results read per home** (A8 grouped table). The home panel for a
  broadcast reply can link to the same home's row.

## Sequencing and ownership

The inbox agent (BL-101) owns `inbox/**` and `InboxChrome.tsx`. So that two
agents never edit `nav.ts` and `InboxChrome.tsx` at once:

1. **Comms side (this team):** add `MessagesTabs` and render it on
   `/communications`. Nav still shows both items. Ships alone; harmless.
2. **Inbox side (BL-101 agent):** render `MessagesTabs` in `InboxChrome.tsx`.
3. **One owner, one commit:** swap the nav to the single **Messages** item,
   plus the palette entries and the guide `related:` links
   (`communications-*` ↔ `inbox-*`).
4. **Later (BL-101 Phase B):** Replies-to-announcements filter, then the
   merged Drafts tab with inbox reply drafts.

## Risks

- **Muscle memory.** Mitigated by keywords, an unchanged URL, and the Inbox
  tab sitting first.
- **Gating drift.** The tab bar must not show an Inbox tab to a role that
  can't read it. Reuse the inbox's role read; don't add a second rule.
- **Count badges.** An unread-count badge on Messages would add one more
  query to every page load through the layout. Leave it out of Phase A
  unless the Inbox already computes the count cheaply.

## Acceptance

- One sidebar item reaches both pages. The old URLs work unchanged.
- From any tab, New message offers both paths, and each lands on today's
  composer.
- A role that can't read the inbox sees no Inbox tab, and the Inbox's
  gating code is unchanged.
- The guide articles for inbox and communications link to each other and
  name **Messages**.

Effort: about 1.5 agent-days for steps 1–3, as in the plan. The replies
filter is a separate 1 day once BL-101 Phase B settles the storage question.
