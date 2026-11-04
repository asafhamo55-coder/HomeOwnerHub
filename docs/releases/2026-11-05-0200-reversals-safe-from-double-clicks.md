---
title: Reversing a journal entry can no longer happen twice
---

## Summary

A small accounting fix. If two people reverse the same journal entry at the same moment, or someone double-clicks Reverse, only one reversal is now recorded. The other person sees "This entry was already reversed" and nothing else changes.

## What's better

### Accounting
- A journal entry can be reversed only once, even when two clicks arrive together.
- If anything goes wrong while reversing, the half-made reversal is removed, so the books never show a reversal without its original being marked.
- The same protection now applies when a payment plan undoes an earlier entry.

## Under the hood

- A further database update with stricter checks on posted entries, closed months, buyer credits and failed refunds is written and tested. It goes live after the owner applies it.
