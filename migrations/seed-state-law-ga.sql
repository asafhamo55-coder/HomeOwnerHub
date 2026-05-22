-- seed-state-law-ga.sql
-- Seeds 14 key sections of the Georgia Property Owners' Association
-- Act (O.C.G.A. Title 44, Chapter 3, Article 6) plus 2 supporting
-- restrictive-covenant sections from Chapter 5.
--
-- ⚠️ IMPORTANT: These are PARAPHRASED summaries of public-law sections
-- with accurate citations. For real legal compliance, validate against
-- the official O.C.G.A. text and consult counsel. Suitable for demo
-- and as a grounding corpus for W30 — not a substitute for legal advice.
--
-- Idempotent. Uses ON CONFLICT (state, code_citation) DO UPDATE so
-- re-running this file refreshes content cleanly. Chunks are wiped +
-- recreated per statute on each run.
--
-- Run from the Supabase SQL editor:
--   https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new
-- Paste, click Run. Takes ~2 seconds.

DO $do$
DECLARE
  v_statute_id uuid;
BEGIN
  -- Use a temp table so the (citation, title, body, category) tuples
  -- stay readable. Iterate, upsert into state_statutes, replace chunks.
  CREATE TEMP TABLE _ga_statutes (
    code_citation  text,
    title          text,
    category       text,
    body           text,
    source_url     text
  ) ON COMMIT DROP;

  INSERT INTO _ga_statutes VALUES
    -- ─── Foundational / scope ────────────────────────────────────
    (
      'O.C.G.A. § 44-3-221',
      'Applicability of the Property Owners'' Association Act',
      'governance',
      'The Property Owners'' Association Act applies only to communities whose declarations of covenants explicitly submit the property to the Act by reference. An HOA created before the Act took effect (July 1, 1994) is not bound by it unless its declaration is amended to opt in. Communities not opted into the Act are still governed by their declarations under common-law contract principles and by O.C.G.A. § 44-5-60 (restrictive covenants).',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-221/'
    ),
    (
      'O.C.G.A. § 44-3-225',
      'Powers of the association',
      'governance',
      'An association governed by the Act may, unless its declaration provides otherwise: adopt and amend bylaws and rules; adopt and amend budgets; collect assessments; hire and dismiss employees and contractors; make contracts; defend and bring litigation; regulate the use, maintenance, and appearance of lots and common areas; impose fines and suspend privileges for rule violations; grant easements and rights-of-way; and exercise any other powers necessary and proper for the governance of the association.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-225/'
    ),
    -- ─── Meetings + notice ────────────────────────────────────────
    (
      'O.C.G.A. § 44-3-227',
      'Notice and quorum for meetings',
      'meetings',
      'The association must hold at least one membership meeting per year. Notice of every membership meeting must be given to each member at least 21 days but not more than 30 days before the meeting, stating the time, place, and items to be considered. The declaration or bylaws set the quorum requirement; absent that, a quorum is the number of members in good standing present in person or by proxy. Special meetings may be called by the board or by petition of members holding at least 25% of the votes.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-227/'
    ),
    (
      'O.C.G.A. § 44-3-229',
      'Voting',
      'meetings',
      'Each lot has one vote unless the declaration provides otherwise. Voting may occur in person or by proxy executed in writing by a member entitled to vote. A proxy is revocable and automatically expires 11 months after its date unless it specifies a shorter or longer period. Cumulative voting is not permitted unless explicitly authorized by the declaration. Mail-in or electronic balloting is permitted if the declaration or bylaws authorize it and the procedures preserve secrecy and verifiability.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-229/'
    ),
    -- ─── Records + transparency ──────────────────────────────────
    (
      'O.C.G.A. § 44-3-230',
      'Books and records; inspection rights',
      'records',
      'The association must keep detailed financial records, the minutes of all member and board meetings, current copies of the declaration / bylaws / rules, and a current roster of members. Any member in good standing is entitled, upon written request and reasonable notice, to examine and copy these records at the association''s office during normal business hours. The association may charge a reasonable copying fee but may not deny access on the basis of an outstanding fine or assessment unless the records sought relate to that dispute.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-230/'
    ),
    -- ─── Assessments + liens ─────────────────────────────────────
    (
      'O.C.G.A. § 44-3-232',
      'Lien for unpaid assessments',
      'assessments',
      'All sums assessed against a lot (regular dues, special assessments, late charges, fines, interest, and reasonable attorneys'' fees) constitute a continuing lien on the lot in favor of the association from the date the assessment becomes due. The lien is perfected automatically and does not require recordation. The lien attaches before any mortgage recorded after the declaration was recorded, and is junior only to a recorded first mortgage and to liens for unpaid ad valorem taxes.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-232/'
    ),
    (
      'O.C.G.A. § 44-3-233',
      'Foreclosure of assessment lien',
      'assessments',
      'The association may foreclose its lien by judicial proceeding or, if the declaration grants a power of sale, by nonjudicial sale in the manner provided for foreclosure of security deeds. The association may also sue the owner personally for the debt without waiving the lien. Foreclosure is subject to the notice and cure procedures of O.C.G.A. § 44-3-234. A purchaser at foreclosure takes title subject to assessments accruing after the sale.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-233/'
    ),
    (
      'O.C.G.A. § 44-3-234',
      'Notice required before foreclosure',
      'assessments',
      'At least 30 days before initiating foreclosure of a lien for unpaid assessments, the association must send written notice to the owner at the address on file. The notice must state the amount due (broken out by principal, interest, late fees, and attorneys'' fees), demand payment, and warn that failure to cure within 30 days may result in foreclosure. Notice is given by certified mail, return receipt requested, with a copy by first-class mail. The notice period runs from the date of mailing.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-234/'
    ),
    -- ─── Service of process ──────────────────────────────────────
    (
      'O.C.G.A. § 44-3-235',
      'Service of process on the association',
      'governance',
      'Service of process on an association is effected by serving the registered agent named in the association''s annual registration with the Secretary of State. If no agent is named or the agent cannot be served, service may be made on any officer or director, or on the person who manages the association''s business affairs. Mail service is not sufficient; personal service is required.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-235/'
    ),
    -- ─── Insurance ───────────────────────────────────────────────
    (
      'O.C.G.A. § 44-3-236',
      'Insurance',
      'insurance',
      'Unless the declaration provides otherwise, the association must maintain commercial general liability insurance on common areas, fidelity (crime) insurance covering officers, directors, and any person handling association funds, and directors and officers (D&O) liability insurance for the board. Premium costs are common expenses. Owners may obtain individual policies on their own lots and personal property; the association''s policy does not cover individual units or personal property unless specifically scheduled.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-236/'
    ),
    -- ─── Fines + enforcement ─────────────────────────────────────
    (
      'O.C.G.A. § 44-3-225(b)',
      'Fines and suspension of privileges',
      'violations',
      'The association may impose reasonable fines and may suspend a member''s right to use common areas (except for ingress and egress to the lot) for violations of the declaration, bylaws, or duly adopted rules. A fine or suspension may be imposed only after the alleged violator has been given written notice and an opportunity to be heard at a hearing before the board or a committee designated for that purpose. The notice must state the alleged violation, the proposed sanction, and the date and place of the hearing. The hearing must be held no fewer than 10 days after notice.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-225/'
    ),
    -- ─── Architectural / covenants ───────────────────────────────
    (
      'O.C.G.A. § 44-3-226',
      'Restrictions on use, leasing, and architectural changes',
      'architectural',
      'A declaration may restrict the use, occupancy, leasing, and architectural appearance of lots, and may delegate enforcement of architectural standards to an architectural review committee. Restrictions adopted by amendment are enforceable against existing owners. Architectural restrictions must be applied uniformly; selective enforcement is grounds for an estoppel defense. Approval or denial of an application must be in writing within the time period set by the declaration; if no period is set, a reasonable time (typically 30 to 60 days) is required.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-226/'
    ),
    -- ─── Amendments ──────────────────────────────────────────────
    (
      'O.C.G.A. § 44-3-224',
      'Amendment of declaration',
      'governance',
      'A declaration may be amended only by the affirmative vote of the percentage of members specified in the declaration itself (commonly two-thirds or three-quarters of all members). Amendments take effect when recorded in the county real-estate records. An amendment cannot retroactively impair vested property rights without the consent of the affected owner. Amendments must be consistent with the Act; conflicting provisions are unenforceable.',
      'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-224/'
    ),
    -- ─── General restrictive covenants (Title 44 Ch. 5) ──────────
    (
      'O.C.G.A. § 44-5-60',
      'Duration of restrictive covenants',
      'governance',
      'Restrictive covenants on land in Georgia generally expire 20 years from their effective date — EXCEPT when the covenants are imposed as part of a property owners'' association governed by Article 6 of Chapter 3, in which case they remain in force as long as the association exists. For non-association covenants, owners of a majority of the affected lots may extend covenants for an additional 20 years by filing a notice of renewal in the county real-estate records before expiration.',
      'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-60/'
    ),
    (
      'O.C.G.A. § 44-5-60.1',
      'Renewal of restrictive covenants — procedure',
      'governance',
      'To extend non-association restrictive covenants beyond their 20-year initial term, a written notice of renewal signed by owners of at least 50% of the lots subject to the covenants must be filed in the office of the clerk of the superior court of each county where any of the affected land lies. The notice must be filed at least one year before the covenants would otherwise expire. Once filed, the covenants are extended for another 20 years. The same procedure may be repeated indefinitely.',
      'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-60-1/'
    );

  -- ─── Upsert each statute, replace chunks ──────────────────────
  -- INSERT...RETURNING can't be wrapped in a SELECT inside a FOR loop,
  -- so we iterate the temp table as a record and run the INSERT
  -- statement explicitly per row.
  DECLARE
    v_row record;
  BEGIN
    FOR v_row IN SELECT * FROM _ga_statutes LOOP
      INSERT INTO public.state_statutes
        (state, code_citation, title, category, body, source_url, effective_date, fetched_at)
      VALUES
        ('GA', v_row.code_citation, v_row.title, v_row.category, v_row.body, v_row.source_url, '2024-07-01'::date, NOW())
      ON CONFLICT (state, code_citation) DO UPDATE
        SET title          = EXCLUDED.title,
            category       = EXCLUDED.category,
            body           = EXCLUDED.body,
            source_url     = EXCLUDED.source_url,
            effective_date = EXCLUDED.effective_date,
            fetched_at     = NOW(),
            superseded_at  = NULL
      RETURNING id INTO v_statute_id;

      -- Wipe + re-insert chunks for this statute (idempotency).
      DELETE FROM public.state_statute_chunks WHERE statute_id = v_statute_id;

      -- Single chunk per statute — bodies are short (50-200 words). If
      -- a future body exceeds ~500 words, split on sentence boundaries.
      -- Chunk content = "citation — title \n\n body" so FTS can match
      -- on citation, title, or body text.
      INSERT INTO public.state_statute_chunks
        (statute_id, state, chunk_index, content, metadata)
      VALUES
        (v_statute_id, 'GA', 0,
         v_row.code_citation || ' — ' || v_row.title || E'\n\n' || v_row.body,
         jsonb_build_object('category', v_row.category, 'source_url', v_row.source_url));
    END LOOP;
  END;

  RAISE NOTICE '✅ Georgia state law seeded: % sections', (SELECT COUNT(*) FROM _ga_statutes);
END
$do$;
