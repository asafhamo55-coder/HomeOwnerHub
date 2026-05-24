/**
 * scripts/state-law-sources.ts
 *
 * URL catalog per state for the Justia-based scraper.
 *
 * Each entry maps a paraphrased citation (the one we use in
 * state_statutes.code_citation) to a Justia URL. Justia exposes
 * codified statutes at predictable paths — e.g.
 * https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-220/
 *
 * Categories follow the same vocabulary used by the curated seed
 * (governance, meetings, records, dues, enforcement, etc.) and feed
 * the state_statutes.category column. W30 uses category as one of its
 * retrieval filters, so keep them consistent with the seed.
 *
 * NOTE on Justia ToS: their crawler-allow file permits indexing but
 * not bulk republishing. We treat scraped text as a *source* — we then
 * paraphrase to a summary in the curated seed. The scraper's role is
 * mostly diff-detection: surface when Justia's text changed so we know
 * which curated entries to refresh.
 */

export interface StateLawSource {
  /** The citation as it should appear in state_statutes.code_citation. */
  code_citation: string
  /** Short human title. */
  title: string
  /** Category bucket — see comment above. */
  category: string
  /** Justia URL to scrape. */
  url: string
}

export const SOURCES: Record<string, StateLawSource[]> = {
  GA: [
    // ─── Property Owners' Association Act (Title 44, Ch 3, Art 6) ──
    { code_citation: 'O.C.G.A. Section 44-3-220', title: 'Definitions',                         category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-220/' },
    { code_citation: 'O.C.G.A. Section 44-3-221', title: 'Applicability',                       category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-221/' },
    { code_citation: 'O.C.G.A. Section 44-3-222', title: 'Construction and supremacy',          category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-222/' },
    { code_citation: 'O.C.G.A. Section 44-3-223', title: 'Submission of property to the Act',   category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-223/' },
    { code_citation: 'O.C.G.A. Section 44-3-224', title: 'Amendment of declaration',            category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-224/' },
    { code_citation: 'O.C.G.A. Section 44-3-225', title: 'Powers of association',               category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-225/' },
    { code_citation: 'O.C.G.A. Section 44-3-226', title: 'Use restrictions; architectural',     category: 'enforcement', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-226/' },
    { code_citation: 'O.C.G.A. Section 44-3-227', title: 'Notice of meetings',                  category: 'meetings',   url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-227/' },
    { code_citation: 'O.C.G.A. Section 44-3-228', title: 'Conduct of meetings; minutes',        category: 'meetings',   url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-228/' },
    { code_citation: 'O.C.G.A. Section 44-3-229', title: 'Voting',                              category: 'meetings',   url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-229/' },
    { code_citation: 'O.C.G.A. Section 44-3-230', title: 'Books and records',                   category: 'records',    url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-230/' },
    { code_citation: 'O.C.G.A. Section 44-3-231', title: 'Annual statement of affairs',        category: 'records',    url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-231/' },
    { code_citation: 'O.C.G.A. Section 44-3-232', title: 'Lien for assessments',               category: 'dues',       url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-232/' },
    { code_citation: 'O.C.G.A. Section 44-3-233', title: 'Foreclosure of lien',                 category: 'dues',       url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-233/' },
    { code_citation: 'O.C.G.A. Section 44-3-234', title: 'Notice before foreclosure',           category: 'dues',       url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-234/' },
    { code_citation: 'O.C.G.A. Section 44-3-235', title: 'Service of process',                  category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-235/' },
    { code_citation: 'O.C.G.A. Section 44-3-236', title: 'Insurance',                           category: 'records',    url: 'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-236/' },

    // ─── Restrictive covenants (Title 44, Ch 5, Art 5) ─────────────
    { code_citation: 'O.C.G.A. Section 44-5-60',   title: 'Restrictive covenants — duration',   category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-60/' },
    { code_citation: 'O.C.G.A. Section 44-5-60.1', title: 'Renewal of restrictive covenants',   category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-60-1/' },
    { code_citation: 'O.C.G.A. Section 44-5-61',   title: 'No waiver by non-enforcement',       category: 'enforcement', url: 'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-61/' },
    { code_citation: 'O.C.G.A. Section 44-5-62',   title: 'Recording of covenants',             category: 'governance', url: 'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-62/' },

    // ─── Nonprofit Corporation Code (Title 14, Ch 3) ───────────────
    { code_citation: 'O.C.G.A. Section 14-3-701',  title: 'Annual meetings of members',        category: 'meetings',   url: 'https://law.justia.com/codes/georgia/title-14/chapter-3/article-7/section-14-3-701/' },
    { code_citation: 'O.C.G.A. Section 14-3-720',  title: 'Quorum requirements',                category: 'meetings',   url: 'https://law.justia.com/codes/georgia/title-14/chapter-3/article-7/section-14-3-720/' },
    { code_citation: 'O.C.G.A. Section 14-3-805',  title: 'Election of directors',              category: 'governance', url: 'https://law.justia.com/codes/georgia/title-14/chapter-3/article-8/section-14-3-805/' },
    { code_citation: 'O.C.G.A. Section 14-3-830',  title: 'Standards of conduct for directors', category: 'governance', url: 'https://law.justia.com/codes/georgia/title-14/chapter-3/article-8/section-14-3-830/' },
    { code_citation: 'O.C.G.A. Section 14-3-851',  title: 'Indemnification of directors',       category: 'governance', url: 'https://law.justia.com/codes/georgia/title-14/chapter-3/article-8/section-14-3-851/' },
  ],

  // Future: FL, CA, TX. Same shape — empty until we have catalog work.
  FL: [],
  CA: [],
  TX: [],
}

export function sourcesFor(state: string): StateLawSource[] {
  return SOURCES[state.toUpperCase()] ?? []
}
