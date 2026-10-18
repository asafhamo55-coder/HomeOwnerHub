---
id: setup-import-roster
title: Import your homes and owners from a spreadsheet
summary: Upload a CSV or Excel roster, such as a CINC Systems export, check what happens to each row, then import every home and owner at once.
topic: setup
roles: [admin, board]
routes: ["/properties/import"]
primary_route: /properties/import
keywords: [import, spreadsheet, csv, xlsx, excel, roster, cinc, upload, bulk, homeowner list, template, duplicate, migrate]
related: [setup-properties-residents, start-board-admin]
reviewed: 2026-10-17
---

Have every home in a spreadsheet already? Import it in one go instead of adding homes one at a time. Nothing is saved until you have checked every row.

## Before you start
- Board admins and board members can import.
- You need a CSV or Excel (.xlsx) file with one row per home, up to 5 MB and 5,000 rows. Only the property address is required. The unit or lot number, city, state, ZIP, owner name, email and phone, mailing address and tenure are used when the file has them.
- Moving from CINC Systems? Export the homeowner list as Excel or CSV and upload it as it is. No file yet? Select [[Download the template]] on the import page and fill it in.

## Steps
1. Open **Properties** from the sidebar and select [[Import]].
2. If your HOA has more than one community, choose the **Community** first. Then drop your file on the page or choose it.
3. Check each field under **Match your columns**. Most are matched for you. Change any that are wrong, then select [[Check rows]].
4. Read the counts and the list. Each row says **New home**, **Update**, **Skipped** or **Error**, with the reason.
5. Under **Homes already on file**, choose [[Skip them]] to leave those homes as they are, or [[Update them]] to fill in their details from the file.
6. Select **Import**. Keep the page open until it says **Import finished**.
7. If some rows have errors, select [[Download error rows (CSV)]], fix what each row says, and import that file.

## What happens next
Each new home is ready to bill straight away, the same as one added by hand. Its owners are recorded as its current owners and appear on its Residents tab. Homes appear on the Properties list as the import goes.

## If something goes wrong
- "Several homes share this address. Add the unit number to tell them apart.": the file has no unit number for a building with several homes. Add one and import the row again.
- "The owner email isn't a valid email address.": fix the email, or leave the cell blank.
- "That file has more than 5,000 rows.": split the file and import each part.
- "Old .xls files can't be read.": save the file again as .xlsx or .csv.
- A row says it couldn't be saved: download the error rows and import them again. Rows that went in are recognised, so nothing is added twice.

## Good to know
- Homes are matched by address and unit number, so "12 Oak Street" and "12 oak st." are the same home.
- A second row for the same home with a different owner adds that owner. A row that repeats a home and owner is skipped.
- **Update them** never changes a tenure the board already set, and it doesn't replace an owner. To record a sale, open the home instead.
- Balances in the file are shown for reference only. They are never posted. Enter opening balances in Accounting.
- Formulas in the spreadsheet are never run. The import reads the values your spreadsheet saved.
