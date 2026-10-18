---
id: vendors-insurance-compliance
title: Add a vendor and check their insurance, W-9 and license
summary: Add or invite a vendor, enter their COI, W-9 and license, run the compliance check, then approve them for work.
topic: vendors
roles: [admin, board]
routes: ["/vendors", "/vendors/new", "/vendors/[id]", "/vendors/[id]/edit", "/vendors/[id]/compliance", "/vendors/invitations", "/vendors/approval-queue"]
primary_route: /vendors
keywords: [vendor, contractor, add vendor, new vendor, invite vendor, onboarding, onboard, coi, certificate of insurance, insurance, expired insurance, insurance expiring, w-9, w9, ein, tax id, "1099", license, contractor license, compliance, compliant, non-compliant, general liability, workers comp, additional insured, approve vendor, approval queue, prospect, landscaper, plumber, send a link, own info, fill in their own details]
related: [vendors-rfps-collect-bids, approvals-queue, accounting-enter-pay-bills]
reviewed: 2026-10-18
---

Use this before you hire a new contractor. You set up the vendor, record their insurance (COI), W-9 and license, and the app grades them so the board knows they're safe to use.

## Before you start
- Only board admins and board members can add, check and approve vendors.
- Have the vendor's legal name, EIN and trade ready, plus an email or phone. If you'd rather the vendor fill this in, invite them instead (step 1).

## Steps
1. Open **Vendors** from the sidebar. Select [[Add vendor]] to enter the details yourself, or [[Invite]] to send the vendor a form. To invite, enter the **Vendor email**, then select [[Send invitation]].
2. If you're adding the vendor yourself, fill in **Legal name**, **EIN** and **Trades** (comma-separated), plus a **Primary email** or **Primary phone**. Then select [[Create and continue]].
3. On the **Compliance check** page, under **Documents**, select [[Choose file]] for the COI, W-9 and license to keep a copy on file.
4. Type what's on each document into the form: the COI carrier, policy number, dates and coverage amounts, the W-9 legal name, and the license number. Leave a section's first field blank to skip that document.
5. Select [[Run compliance check]]. The result shows **Compliant**, **Action soon**, **Non-compliant** or **Docs missing**, with a list of any problems.
6. Open the vendor's page. If they're **Compliant** and still a **Prospect**, select [[Approve vendor]], then confirm.

## What happens next
An approved vendor's status changes to **Active**. The **Vendors** list shows each vendor's compliance and when their COI expires. A COI that expires within 30 days shows how many days are left, and an expired one shows **Expired**. COIs expiring within 30 days also appear under **At risk this week** on your dashboard.

The **Approval queue** tab lists every vendor that needs the board: compliant prospects ready to approve, vendors with gaps, and vendors whose documents aren't entered yet. Select [[Review]] to open one.

## If something goes wrong
- "Fix the highlighted fields and try again.": a required field is missing or in the wrong format. Each problem shows under its field.
- "Couldn’t create the invitation" or "Invitation created, but the email was not sent": if only the email failed, select [[Copy link]] and send the link to the vendor yourself.
- "Vendor is not green for this association. Approval is blocked.": only a **Compliant** vendor can be approved. Fix the problems listed and run the check again.
- "File must be PDF or image (JPG/PNG/WebP/HEIC).": upload a PDF or a photo. Files must be under 25 MB.
- "The compliance check didn’t run": nothing was graded. Try again in a minute.
- **Finish setting up this vendor**: the vendor has no EIN or no trade yet. Select [[Edit details]] and add them. Until then they can't be used for 1099 reporting, RFP invitations or compliance checks.

## Good to know
- The app doesn't read the PDFs for you yet. You upload them for your records and type the values into the form.
- When a vendor fills in the invitation form, their details and files arrive as a **Prospect**. The check doesn't run by itself. Enter the values and select [[Run compliance check]].
- An invitation link works once and expires after 7 days. You can revoke one that hasn't been used from the **Invitations** tab.
- A board admin or board member can set the grade by hand under **Manual override**, for example after confirming a policy by phone with the carrier. Add a reason so the board can see why.
- The app doesn't email vendors when their COI is about to expire. Watch the **COI expires** column and the dashboard.
- To remove a vendor, open the **More vendor actions** menu on their page and choose **Delete vendor**. Their past invoices and bids keep their history.
- Vendor details and ratings are private to your association.
