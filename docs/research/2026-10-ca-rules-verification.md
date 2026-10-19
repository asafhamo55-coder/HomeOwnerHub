# California (Davis-Stirling) rules: checked against the official text (BL-054)

Date: 2026-10-19. Scope: every California rule the app encodes, with its citation.

## Where the official text came from

- **The leginfo web pages are still blocked.** `leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=…` returns HTTP 403 to scripts, with a Cloudflare "Just a moment… Enable JavaScript and cookies" challenge. WebFetch and curl both got it. The `codes_displayText` and `billTextClient` pages return it too.
- **The same publisher's bulk download is not blocked.** The Legislative Counsel publishes the full database at `https://downloads.leginfo.legislature.ca.gov/`.
  - The file used was `pubinfo_2025.zip`: 1.2 GB, Last-Modified 2026-10-18.
  - It holds `LAW_SECTION_TBL.dat` (one row per code section, with the official history line) and one `LAW_SECTION_TBL_*.lob` HTML body per section.
  - The rows were dated 2026-09-26. They include 2026 statutes, for example Civ. Code § 4276 (Stats. 2026, ch. 124).
  - The server supports HTTP range requests, so only the zip's central directory, `LAW_SECTION_TBL.dat` and the needed `.lob` bodies were downloaded, not the whole 1.2 GB.
- **The text is in the repo.** It is recorded in `scripts/fixtures/state-law/ca-civ-davis-stirling-2026.txt`, one subdivision per line, with the official history line for each section.
  - Sections included: §§ 4000, 4040, 4041, 4045, 4050, 4525, 4530 (added for BL-087), 5100–5145, 5200, 5210, 5220, 5850, 5855, 5865, 5900–5940, 5965 and 6150.
  - `state-rules.test.ts` checks the encoded rules against this file.
- **Fetch path for BL-069:** a CA ingestion adapter can use the same bulk zip with range reads. Download `LAW_SECTION_TBL.dat`, filter `law_code = CIV` and sections 4000–6150, then read each row's `.lob`. The daily `pubinfo_daily_*.zip` files carry only bill tables, not the law tables.

Each section is the same text served at
`https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=<n>.`
That URL is the citation the app shows. The "Source" column below gives the section number to put in it.

## Verdicts

Status key:
- **Verified**: the encoded value matches the official text.
- **Corrected**: it was wrong or incomplete, and it is now fixed and tested.
- **Unverified**: not checked.

### W3 violation letters (`packages/workflows/src/W3-violation-inspector/state-rules.ts`)

The text is the AB 130 version of both sections: Stats. 2025, ch. 22, §§ 3–4, effective June 30, 2025.

| Rule as encoded | Official text | Status | Source |
|---|---|---|---|
| Hearing notice at least 10 days before the meeting | § 5855(a): "at least 10 days prior to the meeting" | Verified (10 days is right) | 5855 |
| How the notice is delivered | § 5855(a): "by either personal delivery or individual delivery pursuant to Section 4040" | **Corrected.** The delivery method was missing. It is now in the summary, the notice paragraph, the refusal text and a board reminder in the hearing-notice template. | 5855 |
| What the hearing notice says ("[DATE], [LOCATION]. You may attend and be heard.") | § 5855(b): date, time and place; the nature of the alleged violation; a statement that the member "has a right to attend and may address the board"; an executive session if the member asks | **Corrected.** The template now has [TIME], [PLACE] and [NATURE OF THE VIOLATION], says the owner may address the board, and offers an executive session. | 5855 |
| No fine if the owner cures before the hearing (cited as "AB 130") | § 5855(c)(1): no discipline if "the member cures the violation prior to the meeting" | Verified. **Citation corrected** to § 5855(c)(1). | 5855 |
| (not encoded) | § 5855(c)(2): no discipline if the cure takes longer than the notice period and "the member provides financial commitment to cure the violation" | **Corrected.** Added a new `financialCommitmentToCure` input. A fine or suspension is refused when it is set. The rule is also in the summary and the notice. | 5855 |
| Fine or suspension refused without notice and a hearing | § 5855(g): discipline "shall not be effective against a member unless the board fulfills the requirements of this section" | Verified. Citation is now § 5855(a), (g). | 5855 |
| (not encoded) | § 5855(f): written decision "within 14 days following the action", by personal or individual delivery | **Corrected.** Added to the summary and the notice. Fine and suspension letters now carry a board reminder about the 14-day decision delivery, and the board gets a warning. | 5855 |
| (not encoded) | § 5855(d): if the board and owner disagree, the owner may request IDR under § 5910 | **Corrected.** Added to the summary, the notice and fine or suspension letters. | 5855, 5910 |
| Fine capped at $100 per violation | § 5850(c): the lesser of the schedule in effect at the time of the violation and "One hundred dollars ($100) per violation" | Verified ($100 is right). **Corrected:** the "lesser of the schedule" half is now in the summary and the notice, and any CA fine warns the board to confirm the amount is on the published schedule. | 5850 |
| Above $100 allowed with a health or safety finding made at an open meeting | § 5850(d): allowed if the violation "may result in an adverse health or safety impact on the common area or another association member's property". Beforehand, the board must make "a written finding specifying the adverse health or safety impact in a board meeting open to the members". The penalty must be one stated in the schedule. | Verified. **Wording corrected:** the old text said "may adversely affect health or safety"; it now uses the statute's "common area or another member's property" scope. | 5850 |
| No late fees or interest on a fine (cited as "AB 130") | § 5850(e): "A late charge or interest shall not be charged to a member for a monetary penalty." | Verified. **Citation corrected** to § 5850(e). | 5850 |
| Penalty schedule | § 5850(a): the schedule goes in the annual policy statement (§ 5310) | Verified. Recorded in `CA_RULE_BASIS`. | 5850 |
| `textVerified: false` and "verify against the statute" in every CA letter | — | **Changed:** `textVerified: true`, `verifyNote: null`. The "verify" wording is gone from CA letters and refusals. CA letters still quote nothing, because no CA statute text is ingested to re-check a quote against at draft time (BL-069). A warning says so. | — |
| § 5865 | § 5865: §§ 5850 and 5855 do not create, expand or reduce the board's power to fine | Verified. Nothing to encode. | 5865 |

Every rule's verbatim basis is in `CA_RULE_BASIS`. A test asserts that each fragment is a substring of the official section, so a rule cannot drift from the statute without a failing test.

### Notice delivery (`apps/hoa/src/lib/email-consent.ts`, consent UI)

| Rule as encoded | Official text | Status | Source |
|---|---|---|---|
| Official notices go by email only to members who agreed; otherwise first-class mail (cited as "§4040(b)") | § 4040(a) (operative Jan. 1, 2023) delivers "in accordance with the preferred delivery method specified by the member pursuant to Section 4041". Without one, it is "first-class mail, registered or certified mail, express mail, or overnight delivery". § 4041(b)(2) says the member need not give an email address, and that there must be a simple way to change the preferred method. | Behaviour verified. **Pinpoint corrected** in code comments: § 4040(b) is about secondary addresses, not consent. The UI text ("Civ. Code §4040") is still accurate, so the UI and guide are unchanged. | 4040, 4041 |
| General notice | § 4045 | Verified. Not encoded beyond the cite. | 4045 |
| When delivery is complete | § 4050: mail is complete "on deposit into the United States mail"; electronic delivery is complete "at the time of transmission" | Verified. Not encoded. | 4050 |

### Roster and voter-list notes (`apps/hoa/src/lib/properties/statutory-roster/law.ts`)

| Rule as encoded | Official text | Status | Source |
|---|---|---|---|
| The membership list is a record a member may request, and § 5220 opt-out | § 5200(a)(9): membership lists, "but not including information for members who have opted out pursuant to Section 5220". § 5220: a member may opt out of sharing their name, property address, email address and mailing address. | Verified. `verified: true`. The "could not check" line is replaced with what the opt-out covers. | 5200, 5220 |
| No vote suspension for unpaid assessments | § 5105(h)(1): the rules must "Prohibit the denial of a ballot to a member for any reason other than not being a member at the time when ballots are distributed." | Verified, and stronger than encoded: § 5105(h)(1) is now cited. `verified: true`. | 5105 |
| Davis-Stirling = Civ. Code §§ 4000–6150 (`status/knowledge.ts`, `data/statutes/README.md`) | § 4000 names the Act. § 6150 is the last section of the part. | Verified | 4000, 6150 |

### IDR and ADR (reference only; not encoded as rules)

- **IDR.** § 5910 sets the minimum requirements for IDR. It must be invoked in writing, the association must take part if a member invokes it, and the member pays no fee. § 5915 is the fallback meet-and-confer procedure.
- **ADR.** § 5930 requires ADR before an enforcement action. § 5935 says the Request for Resolution must be answered within 30 days. § 5940 says ADR must be completed within 90 days. § 5965 sets the annual summary wording.
- All of these were checked and are recorded in the fixture. The app encodes none of them as values. The W3 letters now cite § 5910 only as the route after a disputed hearing.

## Unverified

None of the rules the app encodes for California is left unverified.

The migration seed text in `migrations/0010_state_statutes.sql` only names the Act. It was not edited, because this task allows no migrations.
