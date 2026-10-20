# Vendor insurance reminders: board-only until the owner opts in

- **Date:** 2026-10-20
- **Status:** In effect. Owner decision pending (OA-19).

## What changed
The `vendor-coi-reminders` job used to email vendors automatically at 30, 7 and 0 days before their certificate of insurance expired, whenever the board's reminder toggle was on. As of this change it only notifies the board: in-app notices, the dashboard Daily Digest and a vendor badge. The board can send a vendor a drafted "Request updated certificate" email with one explicit click.

## Why
The coordinating session asked to restore the automatic vendor emails, which were the original BL-083 design. Claude Code's permission system declined that as an automatic real-world send. Rather than work around that, the conservative behaviour stays: nothing goes to anyone outside the board without a person clicking Send.

## To restore automatic vendor emails
The owner decides (OA-19). If yes, a session restores the job's vendor send step behind the board toggle, with a guard that skips any address that also belongs to a resident.
