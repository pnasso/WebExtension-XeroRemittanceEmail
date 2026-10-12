# Xero Remittance Email Picker

Chrome extension (Manifest V3) for Xero's **Send Remittance Advice** dialog.

Xero pre-fills each supplier's email field with every address on the contact
(`sales@supplier.example.com, accounts@supplier.example.com`). This extension lists every supplier
in one picker so you can choose which address(es) to use in a single step.

## What it does

- Watches `go.xero.com` for the Send Remittance Advice dialog (`form.bulk`).
- Reads each contact row: name, the `ContactEmail_<guid>` text input, and the send checkbox.
- Adds a **Choose emails…** button above the contact list, and auto-opens the
  picker when at least one contact has more than one address.
- Contacts with multiple addresses are highlighted; tick the one(s) you want.
  Single-address contacts are shown read-only.
- **Apply** writes the selection back into Xero's inputs (comma-separated).
  **Apply & Send** does the same and then clicks Xero's Send button.
- Remembers your choice per contact (`chrome.storage.local`, keyed by contact
  GUID) and pre-selects it next time. Falls back to the first address.

No data leaves the browser.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open a batch payment in Xero → **Send Remittance**.

## Files

| File          | Purpose                                   |
| ------------- | ----------------------------------------- |
| manifest.json | MV3 manifest, content script on go.xero.com |
| content.js    | Dialog detection, picker UI, write-back  |
| content.css   | Picker styling                            |
| icons/        | Extension icons                           |

## DOM reference (as of Oct 2026)

```
form.bulk
  div.contact-list.scroller > table.standard > tbody > tr#<contactGuid>
    td            → contact name (+ hidden inputs)
    td.col-email  → input[type=hidden]#OriginalContactEmail_<guid>
                    input[type=text]#ContactEmail_<guid>   ← edited
    td.col-send   → input[type=checkbox]
a#popupSend       → Send button
```

If Xero changes this markup, update `getDialog()` / `getRows()` in `content.js`.

## Sharing / releasing

```bash
./release.sh          # zip current version into dist/
./release.sh 0.2.0    # bump manifest version, then zip
```

- **Colleagues (no store):** send the zip; they unzip it somewhere permanent and
  use `chrome://extensions` → Developer mode → Load unpacked. No auto-updates.
- **Chrome Web Store (unlisted):** upload the zip at the developer dashboard,
  visibility *Unlisted*. Only people with the link can install; updates are
  automatic. Needs a 1280×800 screenshot and the privacy form (stores choices
  locally only, no data collected).
