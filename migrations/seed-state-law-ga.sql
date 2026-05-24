-- seed-state-law-ga.sql
-- Seeds 15 key sections of the Georgia Property Owners' Association
-- Act (O.C.G.A. Title 44, Chapter 3, Article 6) plus 2 supporting
-- restrictive-covenant sections from Chapter 5.
--
-- ⚠️ IMPORTANT: These are PARAPHRASED summaries of public-law sections
-- with accurate citations. For real legal compliance, validate against
-- the official O.C.G.A. text and consult counsel. Suitable for demo
-- and as a grounding corpus for W30 — not legal advice.
--
-- Idempotent. Re-running refreshes content and rebuilds chunks. Each
-- statement is independent so if anything errors, the failing row is
-- visible in the SQL editor.
--
-- Run from: https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new

-- ─── 1. Upsert the 15 statute rows ──────────────────────────────────

INSERT INTO public.state_statutes
  (state, code_citation, title, category, body, source_url, effective_date)
VALUES
  -- ─── POA Act foundations ─────────────────────────────────────────
  ('GA', 'O.C.G.A. Section 44-3-220',
   'Definitions',
   'governance',
   'Key terms under the Property Owners'' Association Act: "Association" means the nonprofit corporation, unincorporated association, or other entity governing the community. "Declaration" means the recorded instrument that submits the property to the Act. "Lot" means a portion of the property intended for separate ownership (typically a single-family unit). "Member" means an owner of a lot. "Common property" means real property in which the association holds an interest for the common benefit of members. "Reasonable" charges, fines, and procedural requirements throughout the Act are measured against industry custom and against any limits in the declaration.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-220/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-222',
   'Construction and supremacy of the Act',
   'governance',
   'The Property Owners'' Association Act controls over any conflicting provision in a declaration, bylaws, or rule. Where the Act is silent, the declaration controls; where the declaration is silent, the bylaws control; where the bylaws are silent, the rules adopted by the board control. Provisions in any governing document that are contrary to the Act are void and unenforceable. Courts construing ambiguous covenants apply the rule of contra proferentem against the drafter (typically the declarant or association).',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-222/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-223',
   'Submission of property to the Act',
   'governance',
   'Property is submitted to the Property Owners'' Association Act by recording a declaration that explicitly invokes the Act by name in the office of the clerk of the superior court of the county where the land lies. The declaration must describe the property, identify the association, set the percentage of vote required to amend, and may include any other lawful restrictions. Submission is binding on all current and future owners of any lot within the described property.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-223/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-221',
   'Applicability of the Property Owners'' Association Act',
   'governance',
   'The Property Owners'' Association Act applies only to communities whose declarations of covenants explicitly submit the property to the Act by reference. An HOA created before the Act took effect (July 1, 1994) is not bound by it unless its declaration is amended to opt in. Communities not opted into the Act are still governed by their declarations under common-law contract principles and by O.C.G.A. Section 44-5-60 (restrictive covenants).',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-221/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-224',
   'Amendment of declaration',
   'governance',
   'A declaration may be amended only by the affirmative vote of the percentage of members specified in the declaration itself (commonly two-thirds or three-quarters of all members). Amendments take effect when recorded in the county real-estate records. An amendment cannot retroactively impair vested property rights without the consent of the affected owner. Amendments must be consistent with the Act; conflicting provisions are unenforceable.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-224/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-225',
   'Powers of the association',
   'governance',
   'An association governed by the Act may, unless its declaration provides otherwise: adopt and amend bylaws and rules; adopt and amend budgets; collect assessments; hire and dismiss employees and contractors; make contracts; defend and bring litigation; regulate the use, maintenance, and appearance of lots and common areas; impose fines and suspend privileges for rule violations; grant easements and rights-of-way; and exercise any other powers necessary and proper for the governance of the association.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-225/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-225(b)',
   'Fines and suspension of privileges',
   'violations',
   'The association may impose reasonable fines and may suspend a member''s right to use common areas (except for ingress and egress to the lot) for violations of the declaration, bylaws, or duly adopted rules. A fine or suspension may be imposed only after the alleged violator has been given written notice and an opportunity to be heard at a hearing before the board or a committee designated for that purpose. The notice must state the alleged violation, the proposed sanction, and the date and place of the hearing. The hearing must be held no fewer than 10 days after notice.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-225/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-226',
   'Restrictions on use, leasing, and architectural changes',
   'architectural',
   'A declaration may restrict the use, occupancy, leasing, and architectural appearance of lots, and may delegate enforcement of architectural standards to an architectural review committee. Restrictions adopted by amendment are enforceable against existing owners. Architectural restrictions must be applied uniformly; selective enforcement is grounds for an estoppel defense. Approval or denial of an application must be in writing within the time period set by the declaration; if no period is set, a reasonable time (typically 30 to 60 days) is required.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-226/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-227',
   'Notice and quorum for meetings',
   'meetings',
   'The association must hold at least one membership meeting per year. Notice of every membership meeting must be given to each member at least 21 days but not more than 30 days before the meeting, stating the time, place, and items to be considered. The declaration or bylaws set the quorum requirement; absent that, a quorum is the number of members in good standing present in person or by proxy. Special meetings may be called by the board or by petition of members holding at least 25% of the votes.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-227/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-229',
   'Voting',
   'meetings',
   'Each lot has one vote unless the declaration provides otherwise. Voting may occur in person or by proxy executed in writing by a member entitled to vote. A proxy is revocable and automatically expires 11 months after its date unless it specifies a shorter or longer period. Cumulative voting is not permitted unless explicitly authorized by the declaration. Mail-in or electronic balloting is permitted if the declaration or bylaws authorize it and the procedures preserve secrecy and verifiability.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-229/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-230',
   'Books and records; inspection rights',
   'records',
   'The association must keep detailed financial records, the minutes of all member and board meetings, current copies of the declaration / bylaws / rules, and a current roster of members. Any member in good standing is entitled, upon written request and reasonable notice, to examine and copy these records at the association''s office during normal business hours. The association may charge a reasonable copying fee but may not deny access on the basis of an outstanding fine or assessment unless the records sought relate to that dispute.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-230/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-232',
   'Lien for unpaid assessments',
   'assessments',
   'All sums assessed against a lot (regular dues, special assessments, late charges, fines, interest, and reasonable attorneys'' fees) constitute a continuing lien on the lot in favor of the association from the date the assessment becomes due. The lien is perfected automatically and does not require recordation. The lien attaches before any mortgage recorded after the declaration was recorded, and is junior only to a recorded first mortgage and to liens for unpaid ad valorem taxes.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-232/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-233',
   'Foreclosure of assessment lien',
   'assessments',
   'The association may foreclose its lien by judicial proceeding or, if the declaration grants a power of sale, by nonjudicial sale in the manner provided for foreclosure of security deeds. The association may also sue the owner personally for the debt without waiving the lien. Foreclosure is subject to the notice and cure procedures of O.C.G.A. Section 44-3-234. A purchaser at foreclosure takes title subject to assessments accruing after the sale.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-233/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-234',
   'Notice required before foreclosure',
   'assessments',
   'At least 30 days before initiating foreclosure of a lien for unpaid assessments, the association must send written notice to the owner at the address on file. The notice must state the amount due (broken out by principal, interest, late fees, and attorneys'' fees), demand payment, and warn that failure to cure within 30 days may result in foreclosure. Notice is given by certified mail, return receipt requested, with a copy by first-class mail. The notice period runs from the date of mailing.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-234/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-235',
   'Service of process on the association',
   'governance',
   'Service of process on an association is effected by serving the registered agent named in the association''s annual registration with the Secretary of State. If no agent is named or the agent cannot be served, service may be made on any officer or director, or on the person who manages the association''s business affairs. Mail service is not sufficient; personal service is required.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-235/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-236',
   'Insurance',
   'insurance',
   'Unless the declaration provides otherwise, the association must maintain commercial general liability insurance on common areas, fidelity (crime) insurance covering officers, directors, and any person handling association funds, and directors and officers (D&O) liability insurance for the board. Premium costs are common expenses. Owners may obtain individual policies on their own lots and personal property; the association''s policy does not cover individual units or personal property unless specifically scheduled.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-236/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-5-60',
   'Duration of restrictive covenants',
   'governance',
   'Restrictive covenants on land in Georgia generally expire 20 years from their effective date — EXCEPT when the covenants are imposed as part of a property owners'' association governed by Article 6 of Chapter 3, in which case they remain in force as long as the association exists. For non-association covenants, owners of a majority of the affected lots may extend covenants for an additional 20 years by filing a notice of renewal in the county real-estate records before expiration.',
   'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-60/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-5-60.1',
   'Renewal of restrictive covenants — procedure',
   'governance',
   'To extend non-association restrictive covenants beyond their 20-year initial term, a written notice of renewal signed by owners of at least 50% of the lots subject to the covenants must be filed in the office of the clerk of the superior court of each county where any of the affected land lies. The notice must be filed at least one year before the covenants would otherwise expire. Once filed, the covenants are extended for another 20 years. The same procedure may be repeated indefinitely.',
   'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-60-1/',
   '2024-07-01'),

  -- ─── POA Act, meetings + financial-disclosure follow-on ──────────
  ('GA', 'O.C.G.A. Section 44-3-228',
   'Conduct of meetings; minutes',
   'meetings',
   'Member meetings must be conducted under generally accepted parliamentary procedure (typically Robert''s Rules of Order, Newly Revised) unless the bylaws specify a different procedure. The presiding officer is the association president or the bylaws-designated chair. Minutes of all member and board meetings must be kept in permanent form and made available for inspection per Section 44-3-230. Electronic / video meetings are permitted if the bylaws authorize them and members can hear each other and vote in real time.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-228/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-3-231',
   'Annual statement of affairs',
   'records',
   'Within 120 days after the close of each fiscal year, the association must prepare and distribute to every member a statement of its financial affairs covering the prior year. The statement must include receipts and disbursements by category, balances in operating and reserve funds, a list of properties owned by the association, and a summary of any litigation or material claims. For associations with annual revenue above $75,000, the statement must be reviewed by an independent CPA; above $300,000, a full audit is required.',
   'https://law.justia.com/codes/georgia/title-44/chapter-3/article-6/section-44-3-231/',
   '2024-07-01'),

  -- ─── Restrictive covenants — recording and waiver ────────────────
  ('GA', 'O.C.G.A. Section 44-5-61',
   'No waiver by non-enforcement',
   'governance',
   'A restrictive covenant is not waived or abandoned merely because the association or beneficiaries have not enforced it against prior violations. Selective non-enforcement does not bar later enforcement against subsequent violators, except where the pattern of non-enforcement is so widespread that the covenant has been effectively abandoned (a high bar requiring evidence of community-wide acquiescence). A single instance of non-enforcement, or non-enforcement against a different type of violation, does not establish waiver.',
   'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-61/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 44-5-62',
   'Recording of covenants — effective date',
   'governance',
   'Restrictive covenants take effect against a lot only when the covenant is recorded in the office of the clerk of the superior court of the county where the lot lies, and only against owners who took title after the recording (or who took title before the recording with actual notice of the covenant). Covenants are constructive notice to all subsequent purchasers from the date of recording. A title search of the lot will reveal the covenants and is required for a buyer to be deemed to have notice.',
   'https://law.justia.com/codes/georgia/title-44/chapter-5/article-5/section-44-5-62/',
   '2024-07-01'),

  -- ─── Georgia Nonprofit Corporation Code (Title 14, Ch 3) ─────────
  -- Most GA HOAs are incorporated as nonprofit corporations under the
  -- Georgia Nonprofit Corp Code. Where the POA Act is silent, the
  -- Nonprofit Corp Code applies — especially on board governance,
  -- meetings, voting, and director duties.

  ('GA', 'O.C.G.A. Section 14-3-701',
   'Annual meetings of members (Nonprofit Corp Code)',
   'meetings',
   'A nonprofit corporation must hold an annual meeting of its members at the time stated in or fixed in accordance with the bylaws. Failure to hold an annual meeting at the designated time does not affect the validity of any corporate action. If the meeting is not held within 15 months of the last annual meeting, any member entitled to vote may petition a superior court to order the meeting held. Notice must be given per Section 14-3-705.',
   'https://law.justia.com/codes/georgia/title-14/chapter-3/article-7/section-14-3-701/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 14-3-720',
   'Quorum requirements for member action (Nonprofit Corp Code)',
   'meetings',
   'Unless the articles of incorporation or bylaws provide otherwise, 10% of the votes entitled to be cast on a matter constitutes a quorum for action on that matter. Once a member is represented for any purpose at a meeting (in person or by proxy), the member is deemed present for quorum purposes for the remainder of the meeting and for any adjournment, unless a new record date is set for the adjourned meeting. An action is approved if votes cast in favor exceed votes cast against, unless the articles, bylaws, or this Code require a greater number.',
   'https://law.justia.com/codes/georgia/title-14/chapter-3/article-7/section-14-3-720/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 14-3-805',
   'Election of directors (Nonprofit Corp Code)',
   'governance',
   'Directors are elected at the annual member meeting unless the articles or bylaws provide for a different method (such as staggered terms, board-appointment for vacancies, or class voting). Directors hold office for the term stated in the articles or bylaws, or until their successors are elected and qualified. Cumulative voting is permitted only if expressly authorized by the articles of incorporation. A director may be removed by the members with or without cause at a meeting called for that purpose, by the same vote that would elect the director.',
   'https://law.justia.com/codes/georgia/title-14/chapter-3/article-8/section-14-3-805/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 14-3-830',
   'Standards of conduct for directors (Nonprofit Corp Code)',
   'governance',
   'A director must discharge his or her duties: (1) in good faith; (2) with the care an ordinarily prudent person in a like position would exercise under similar circumstances; and (3) in a manner the director reasonably believes to be in the best interests of the corporation. A director is entitled to rely on information, reports, and statements prepared by officers, employees, professional advisors, or board committees, unless the director has actual knowledge that reliance is unwarranted. Directors are not liable for actions taken or omitted in compliance with this section.',
   'https://law.justia.com/codes/georgia/title-14/chapter-3/article-8/section-14-3-830/',
   '2024-07-01'),

  ('GA', 'O.C.G.A. Section 14-3-851',
   'Indemnification of directors and officers (Nonprofit Corp Code)',
   'governance',
   'A nonprofit corporation may indemnify a director or officer against liability incurred in a proceeding to which the person was a party because of their position with the corporation, if the person (1) conducted themselves in good faith, (2) reasonably believed their conduct was in the corporation''s best interest (or, for criminal proceedings, had no reasonable cause to believe their conduct was unlawful), and (3) was not adjudged liable to the corporation. Indemnification of a director adjudged liable in a derivative suit is permitted only by court order. Articles or bylaws may make indemnification mandatory rather than permissive.',
   'https://law.justia.com/codes/georgia/title-14/chapter-3/article-8/section-14-3-851/',
   '2024-07-01')
ON CONFLICT (state, code_citation) DO UPDATE
  SET title          = EXCLUDED.title,
      category       = EXCLUDED.category,
      body           = EXCLUDED.body,
      source_url     = EXCLUDED.source_url,
      effective_date = EXCLUDED.effective_date,
      fetched_at     = NOW(),
      superseded_at  = NULL;

-- ─── 2. Wipe + rebuild chunks for GA (idempotency) ──────────────────

DELETE FROM public.state_statute_chunks WHERE state = 'GA';

-- ─── 3. Insert one chunk per active GA statute ──────────────────────
-- Chunk content = "citation — title \n\n body" so FTS can match on
-- citation, section title, or body text.

INSERT INTO public.state_statute_chunks
  (statute_id, state, chunk_index, content, metadata)
SELECT
  s.id,
  'GA',
  0,
  s.code_citation || ' — ' || s.title || E'\n\n' || s.body,
  jsonb_build_object('category', s.category, 'source_url', s.source_url)
FROM public.state_statutes s
WHERE s.state = 'GA'
  AND s.superseded_at IS NULL;

-- ─── 4. Confirm count ──────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM state_statutes WHERE state = 'GA' AND superseded_at IS NULL) AS statute_count,
  (SELECT COUNT(*) FROM state_statute_chunks WHERE state = 'GA')                     AS chunk_count;
