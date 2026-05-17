-- 0014_bids_parsed_pdf_text.sql
-- v1.2 Module 7 follow-on — store extracted text from the vendor's
-- uploaded bid PDF so the board can read it inline during comparison.
--
-- The structured pricing + line items already come in via the public
-- form (which vendors fill in alongside the upload). The PDF text is
-- supplementary: it lets the board cross-check the bid against the
-- vendor's actual proposal language without opening the PDF in a new
-- tab. Per ADR-002, structured AI extraction from the PDF awaits the
-- vision-model cutover; this column just holds the raw text from
-- pdf-parse so we have something to look at in the meantime.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS parsed_pdf_text text;

ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS parsed_pdf_at timestamptz;
