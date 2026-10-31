---
title: Vendor, message and RFP pages say when something failed to load
---

## Fixes

- **Vendors.**
  - If a vendor's insurance status can't load, the page now says "Couldn't load insurance status" and turns off Approve, so it never looks like an all-clear. Before, a failed check could hide a "COI expired" alert.
  - A failed documents read shows "Couldn't load documents" instead of an empty list.
  - A vendor that can't load shows Try again instead of "not found".
- **Messages.**
  - A sent message that can't load shows Try again. Before, it showed "not found", which looked as if the message had been deleted.
  - If your saved templates can't load, the new-message page says so. The built-in templates still show.
- **RFP invitations.**
  - If the vendor or invitation list can't load, the panel shows Try again instead of "No invitations yet".
  - When nobody can be invited, it now says why. Either there are no vendors yet (with a link to add one), all vendors are already invited, or some vendors have no email on file. Those vendors are named, each with an edit link.
- **Bid form for vendors.** Each line on the public bid form is now labelled for screen readers, for example "Line 2 description". The remove button names its line.
