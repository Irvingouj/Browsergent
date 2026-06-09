---
name: fill-and-submit
description: Fills a form on the current page and submits it using page.fill and page.click via run_js.
arguments: email password
---

# Fill and Submit

Golden-path form workflow for Browsergent.

## Instructions

1. Call `get_doc({ namespace: "page" })` if unsure of API shapes.
2. `page.snapshot()` to find form field refIds and submit button.
3. Fill fields using object form only: `page.fill({ refId, value })`.
4. Click submit with `page.click({ refId })`.
5. Verify with a new snapshot or URL/title check.

## Credentials

Email: $email
Password: $password

Additional notes: $ARGUMENTS
