---
title: Background jobs slowed to fit the job-runner plan
---

## Summary

The background jobs that check mail every few minutes now run less often. Together they were using almost all of the job runner's free monthly allowance (Inngest Hobby, 50,000 runs). At the limit, every job stops, including dues reminders and late fees. Usage drops to about half.

## What's new

### Inbox

- New email now arrives within 5 minutes instead of 2. The Inbox and mailbox settings say so.
- Attachments arriving with new mail still download right away. Only the retries for ones that failed wait longer, up to 15 minutes.

## Under the hood

- Mailbox sync every 5 minutes (was 2), attachment backstop every 15 (was 5), Gmail label reconcile and stall watchdog every 30 (were 15), reply embeddings every 30 (was 10). Scheduled messages still go out within 5 minutes.
