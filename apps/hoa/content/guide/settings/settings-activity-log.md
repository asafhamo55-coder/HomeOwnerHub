---
id: settings-activity-log
title: See who did what in the activity log
summary: A permanent record of board actions, like exports, imports and vendor decisions. Filter it by person, area and date, and export it as a spreadsheet.
topic: settings
roles: [admin, board]
routes: ["/settings/activity"]
primary_route: /settings/activity
keywords: [activity, activity log, audit, audit log, audit trail, history, who did, who changed, who exported, transparency, turnover, records, accountability, csv, export]
related: [settings-data-export, members-invite-board]
reviewed: 2026-10-20
---

Use this when you need to show who did what, and when. For example, an owner asks who exported the owner list, or a new board takes over and wants the history.

## Before you start
- Board admins and board members can open the activity log. Residents can't.
- Nobody can edit or delete an entry, including admins.

## Steps
1. In the sidebar, open [[Activity log]]. It's also a tab in **Settings**.
2. Each row shows what happened, who did it, the area, a link to the record when there is one, and when it happened in your association's time zone.
3. To narrow the list, pick a **Person**, an **Area**, or a **From** and **To** date, then select **Apply**. Select **Reset** to clear the filters.
4. To keep a copy, select [[Export CSV]]. The file has the same filters as the list.

## What happens next
The spreadsheet has one row per entry: when, who, the action, the area, a short detail, the record type and its link. The export is also recorded in the activity log.

## If something goes wrong
- "That's more than 20,000 entries. Pick a shorter date range and export again.": set a **From** and **To** date and export again.
- "Names couldn't be loaded": the entries are correct, but board members show as "Former member" for now. Refresh the page.
- If **Download failed** shows another message, nothing was saved. Try again.

## Good to know
- Board members are shown by name. Residents are shown as "A resident", and automatic steps as "System". Someone who has left the HOA shows as "Former member".
- AI usage records are left out of the default view, because there's one for every AI request. Pick **AI usage** under **Area** to see them.
- Notes people typed, phone numbers and other personal details stored with an entry are never shown or exported.
- An action the log doesn't have a name for yet is shown as stored, so nothing is hidden.
