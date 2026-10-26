---
id: dues-collections-letter
title: Draft and print a collections letter
summary: Build a past-due, lien or Georgia fee or foreclosure notice from a home's ledger and your state's rules, get it approved, then print it to mail.
topic: dues
roles: [admin, board]
routes: ["/properties/[id]/collections-letter", "/properties/[id]", "/approvals"]
primary_route: /properties/[id]
keywords: [collections letter, Secretary of State complaint, automatic stay, collection letter, past due letter, delinquency letter, delinquency notice, notice of late assessment, late assessment, 30 day letter, 30-day notice, intent to lien, notice of intent to record a claim of lien, 45 day letter, 45-day notice, lien letter, lien notice, pre-lien notice, claim of lien, demand letter, draft letter, print letter, certified mail, "720.3085", "5660", "209.0064", "209.0062", "SB 406", "44-3-232", "44-3-109", Georgia, condominium, condo, georgia condominium act, notice before attorney fees, attorney's fee notice, 30 days from receipt, pre-foreclosure notice, notice before foreclosure, foreclosure, statutory overnight delivery, return receipt, attorney fees, payment plan, state law check, override, waiting period, too early, can't draft, approval]
related: [dues-collections-case, accounting-payment-plans, dues-record-payment, approvals-queue]
reviewed: 2026-10-26
---

When a home's dues are past due, the board can draft a collections letter from the home's collections case. HomeownerHub builds the letter from the ledger and your state's rules, not with AI. A board member approves it in Approvals, then you print it or save it as a PDF and mail it yourself.

## Before you start
- Board admins and board members can draft, approve and print letters. Residents can't open the page.
- The home needs an open collections case. Open one in the **Collections file** first.
- Record every payment first. The letter lists what the ledger shows as past due today.

## Steps
1. Open **Properties** and open the home. In the **Money** section, find **Collections file** and select [[Draft collections letter]].
2. Under **Which letter**, choose the letter. Florida offers the notice of late assessment and the notice of intent to record a claim of lien. California offers the pre-lien notice. Texas offers the delinquency notice. Georgia offers the notice before attorney's fees and the notice before foreclosure. A Georgia condominium association gets the Condominium Act's notice before foreclosure instead. Every state also offers a plain past-due letter.
3. Read **How this letter is built**. It shows where the amounts come from, the dates the letter sets, and how it must be mailed.
4. Under **Fill in the blanks**, fill in each item the app doesn't hold, such as the owner's mailing address, interest, costs and who signs. Enter 0 for an amount you don't charge. Anything still missing shows on the letter as a highlighted **BLANK**.
5. Read the **State law check** under the letter. A **Blocks this step** item stops the letter unless you pick the **Board’s reason to go ahead anyway** for it. Then tick [[I’ve verified these figures]] and select [[Save to approvals]].
6. A board member opens **Approvals**, reads the letter and selects [[Approve letter]], or rejects it with a reason.
7. Come back to the home and select [[Draft collections letter]]. Tick [[I’ve verified these figures]] again, then select [[Print / Save as PDF]].

## What happens next
- Printing records the letter on the collections case, dated the day it prints, with the total. The case moves to the matching stage. For example, a notice of late assessment moves it to "30-day lien warning".
- Each print is logged with ids and amounts only. Nothing is emailed or texted to the owner.
- In Florida, the notice of late assessment (§ 720.3085(3)(d)) gives the owner 30 days and goes by first-class mail. The notice of intent to lien (§ 720.3085(4)) gives 45 days and goes by certified mail, return receipt requested, and first-class mail.
- In California, the pre-lien notice (§ 5660) goes by certified mail at least 30 days before a lien is recorded. It lists only assessments that are delinquent: 15 days after they were due, or the longer period your declaration sets. Enter that period under **Delinquency period**.
- In Texas, the delinquency notice (§ 209.0064) goes by certified mail and gives the owner 45 days to cure.
- In Georgia, the notice before attorney's fees (SB 406 § 7) lists every outstanding fine and fee and gives the owner 30 days from receipt to pay. It goes by certified mail or statutory overnight delivery. Printing it records "Demand letter sent" on the case and moves the case no further than "Collection letter sent".
- In Georgia, the notice before foreclosure (§ 44-3-232(c)) goes by certified mail or statutory overnight delivery, return receipt requested, to the lot's address and to every other address the owner gave the association in writing. The lien can be foreclosed no sooner than 30 days after it is sent. Printing it moves the case to "Lien letter sent".
- In Georgia, a condominium's notice before foreclosure (§ 44-3-109(c)) works the same way: certified mail or statutory overnight delivery, return receipt requested, to the unit's address and every other address the owner gave in writing, at least 30 days before foreclosure, and only for a lien of at least $2,000. Interest is capped at 10% a year (§ 44-3-109(b)(2)). SB 406 doesn't change the Condominium Act, so this notice stays the same after January 1, 2027.
- From January 1, 2027, Georgia's SB 406 changes the notice before foreclosure, and the letter follows the letter date. The lien can be foreclosed no sooner than 60 days after the notice is sent. The notice tells the owner that paying the amount before the sixtieth day after receiving it ends the right to foreclose. It lists the assessments, authorized late charges and interest, and leaves fines and other fees off. Enter **12 months of regular assessments (dues) for this lot** under **Fill in the blanks**. It isn't printed; it sets the foreclosure threshold. This applies to the Property Owners' Association Act notice, not to a condominium's.
- HomeownerHub has no field for certified-mail tracking numbers. Add the tracking number and the delivery date as a note on the collections case.

## If something goes wrong
- "This letter can’t be drafted yet": a waiting period isn't over, or nothing is past due. The message says why and, when it's only a matter of time, the first day you can draft it.
- In Florida, the intent-to-lien letter needs a notice of late assessment recorded on the case at least 30 days earlier.
- "This notice is under the Georgia Property Owners’ Association Act, which does not apply to condominium associations": your association is set up as a condo. Choose the condominium notice.
- In Georgia, "Georgia permits no foreclosure of the lien unless it is at least $2,000": the total on the notice, interest included, is under $2,000. This is the rule for a notice dated before January 1, 2027, and always for a condominium's notice (§ 44-3-109(c)).
- In Georgia from January 1, 2027, "Georgia permits no foreclosure of the lien unless it is at least …": the regular and special assessments in arrears are under the threshold. The threshold is the lesser of $4,000 or 12 months of regular assessments, but never under $2,000. Late charges, interest, fines, fees and payment-plan installments don't count.
- In Georgia, "The interest rate can’t be above 10% a year": § 44-3-232(b)(2) caps interest at 10% a year.
- [[Save to approvals]] is greyed out: a BLANK is empty, an amount isn't a number, or [[I’ve verified these figures]] isn't ticked. The message beside the button says which.
- "The account has changed since this letter was approved": a payment or charge was recorded after approval. Select [[Draft a new letter instead]] and send the new one for approval.
- "The state law check found a problem that blocks this step": pick a reason for each blocking item, or change the letter. The board's reason is saved in the activity log as a code, and Approvals shows it on the letter.
- "The state law check now finds a problem the board didn’t decide when this letter was approved": something changed since approval, or the letter was approved before the check existed. Select [[Draft a new letter instead]].
- "A letter for this home is already waiting in Approvals": approve or reject that one first.
- "The letter is recorded on the collections case, but the app couldn’t move the case to its next stage": nothing was printed. Select [[Print / Save as PDF]] again. The letter isn't recorded twice.
- The printout says "DRAFT — NOT VALID — print from the Print button": you printed from the browser (for example with Cmd+P or File > Print). Only [[Print / Save as PDF]] on an approved letter prints it.
- A California letter approved before the delinquency period was added can't be printed. Select [[Draft a new letter instead]].

## Good to know
- Florida and California notices leave fines off. The letter says so on screen.
- If you mail the letter on a later day than you print it, add a note on the collections case with the mailing date.
- The letters quote the statute's required wording. They aren't legal advice: check your governing documents and ask your association's attorney before a lien.
- Each state law check item names the statute section and quotes it. A **Confirm** item is something to check yourself.
- **State law check, Texas.** A letter that lists attorney or collection-processing fees, with no delinquency notice printed at least 45 days earlier, is blocked (§ 209.0064(b)). A delinquency notice that offers no payment plan ("Not applicable") is blocked, because an association of more than 14 lots must have payment-plan guidelines (§ 209.0062(a)).
- **State law check, Georgia.** From July 1, 2026, a letter that lists attorney's fees is blocked unless a notice before attorney's fees was printed on the case at least 30 days earlier. Before collecting them, the association must send a written notice by certified mail or statutory overnight delivery, give the owner 30 days from receipt, and provide an itemized list of the fees (SB 406 § 7). Once the notice is 30 days old, the block becomes a **Confirm** item: the 30 days run from the day the owner received it, which the app doesn't record. The notice itself is never blocked. This check isn't run for a condominium association: SB 406 § 7 is part of the Property Owners' Association Act, which doesn't govern condominiums. The registration check still applies.
- **Georgia notices.** Georgia sets no form wording, so each notice states what the law requires and quotes the statute word for word. The notice before foreclosure flags a late charge above the greater of $10 or 10% of an assessment (§ 44-3-232(b)(1)). It also names any charge whose lien has lapsed, or lapses within 180 days: four years after it first came due, or six years for a notice dated from January 1, 2027. A charge whose four years ran out before 2027 is named separately: ask your attorney whether the lien still secures it. A condominium's notice cites § 44-3-109(b)(1) and (c) instead and always uses four years.
- **State law check, Florida.** A letter that lists attorney's fees, with no notice of late assessment recorded at least 30 days earlier, is blocked (§ 720.3085(3)(d)).
- **State law check, California.** A letter that lists a fine and late charges asks you to confirm no late charge is on the fine (§ 5850(e)).
- **State law check, Georgia, Secretary of State complaint.** If a complaint is recorded on the home's collections file and its stay runs on the letter date, a letter that lists fines or fees is blocked from January 1, 2027, and warned before then. A dues-only letter isn't affected. The only override is "attorney advised", and it is recorded (§ 43-17A-5(c)). See [the collections file](guide:dues-collections-case).
- **State law check, Georgia, from January 1, 2027.** Every Georgia letter carries a **Confirm** item: payments must be applied to regular assessments first, then special assessments, then specific assessments, then other fees and fines, and a payment of any amount for an assessment can't be refused (§ 43-17A-8). Check that this account's payments were applied in that order.
- **Not checked by the state law check:** how past payments were actually applied, in Georgia (§ 43-17A-8) or Texas (§ 209.0063).
