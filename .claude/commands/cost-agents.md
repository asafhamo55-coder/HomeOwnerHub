---
description: Token and cost breakdown for this session — the main agent plus every subagent
---

Run the session cost accounting tool and show me its output verbatim:

```bash
node .claude/tools/cost-agents.mjs $ARGUMENTS
```

Then add two or three sentences of interpretation — but only what the numbers
actually support. Specifically:

- If one bucket dominates (cache read, cache write, output), say which and what
  drives it. Cache read dominating is normal and cheap per token; cache *write*
  dominating usually means the prompt prefix is being invalidated repeatedly.
- If an expensive model is doing work a cheaper one could do, name the agent and
  what it would have cost on the cheaper tier. Do not recommend downgrading the
  main loop.
- If nothing stands out, say the spend looks proportionate and stop. Do not
  manufacture an optimization.

Do not re-run the tool, re-derive the totals by hand, or edit any file. This is
a read-only report.

Flags: `--ttl=5m` (default `1h`), `--json`, `--session=<id>`.
