# State HOA statute seeds

These `<state>.jsonl` files are **starter fixtures**, not comprehensive ingestion of
each state's HOA statutes. They exist so the Module 8 / W30 pipeline can be
exercised end-to-end. Before relying on the State Law Brain in production:

1. **Replace each file with full statute text** from the authoritative legislative
   source for that state (see `source_url` on each record below for the right
   starting point).
2. **Have the result reviewed by counsel licensed in that state**, especially
   the `title` and `category` fields — those drive the topic browser and Q&A
   retrieval and should match accepted topical taxonomies.
3. Re-run `pnpm exec tsx scripts/ingest-state-statutes.ts <STATE>` after
   replacing the file. The ingest is idempotent and overwrites chunks.

## Authoritative starting points

- **GA** — O.C.G.A. Title 44, Chapter 3 — Property Owners' Association Act (Article 6) and Condominium Act (Article 3).  
  https://law.justia.com/codes/georgia/title-44/chapter-3/
- **FL** — Florida Statutes Chapter 720 (HOA Act); Chapter 718 (Condominium Act).  
  http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0720/0720.html
- **CA** — Davis-Stirling Common Interest Development Act, Cal. Civ. Code §§ 4000–6150.  
  https://leginfo.legislature.ca.gov/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&division=4.&title=&part=5.&chapter=&article=
- **TX** — Texas Property Code, Chapter 209 — Residential Property Owners Protection Act; also Chapters 81, 82 (condominium).  
  https://statutes.capitol.texas.gov/Docs/PR/htm/PR.209.htm

## File format

One JSON object per line. Lines beginning with `//` are ignored as comments.

```json
{
  "code_citation": "O.C.G.A. § 44-3-232",
  "title": "Meetings of association",
  "category": "meetings",
  "body": "<full statute text>",
  "source_url": "https://law.justia.com/...",
  "effective_date": "2024-07-01"
}
```

### Categories (recommended)

Use a consistent taxonomy across states so the topic browser groups correctly:

- `meetings` — annual / special / open meetings, notice, quorum
- `assessments` — regular / special / emergency assessments, payment
- `fines` — fines, suspensions, hearings
- `foreclosure` — liens, foreclosure, redemption
- `records` — owner inspection, retention, board minutes
- `architectural` — ARC, design review, approvals
- `fair_housing` — accommodations, discrimination
- `amendments` — declaration / bylaw amendments, governance changes

Use `null` (or omit the field) when the statute doesn't fit one of these.
