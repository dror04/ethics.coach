# Ethics.Coach — Airtable CRM

A complete Airtable CRM system for a solo executive coaching practice, with Make.com automation blueprints and CLI tools for data import, business card parsing, and setup validation.

This system replaces Monday.com with Airtable as the primary CRM, connected to Gmail, Google Calendar, Stripe, Zoom, QuickBooks, and PandaDoc via Make.com automations.

---

## Table of Contents

- [Overview](#overview)
- [Environment Variables](#environment-variables)
- [Quick Start](#quick-start)
- [Script Reference](#script-reference)
- [Monday.com Import Guide](#mondaycom-import-guide)
- [Adding a Contact from a Business Card](#adding-a-contact-from-a-business-card)
- [Make.com Blueprints](#makecom-blueprints)
- [Pipeline Stages](#pipeline-stages)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What's in this repo

```
/
├── README.md
├── .env.example
├── package.json
├── setup_airtable.js          # Creates the Airtable base, tables, fields, and views
├── import_monday.js           # Imports Monday.com CSV exports → Airtable Contacts
├── parse_business_card.js     # Parses a business card photo → new Airtable contact
├── validate_setup.js          # Confirms everything is wired correctly
└── make_blueprints/
    ├── IMPORT_INSTRUCTIONS.md
    ├── 01_reclaim_booking_to_meet.json
    ├── 02_gmail_reply_to_connect.json
    ├── 03_outreach_email_to_new_lead.json
    ├── 04_calendar_keyword_to_invite_or_create.json
    ├── 05_stripe_payment_to_serve.json
    ├── 06_new_contact_ai_outreach_draft.json
    ├── 07_zoom_summary_to_contacts.json
    ├── 08_post_demo_propose_prompt.json
    ├── 09_expiration_alert.json
    └── 10_pandadoc_signed_to_serve.json
```

### Airtable Tables

| Table | Purpose |
|---|---|
| **Contacts** | Every person across all pipeline stages |
| **Engagements** | One record per coaching engagement (linked to Contacts) |

### Make.com Automations

| # | Trigger | Action |
|---|---|---|
| 01 | Reclaim booking email | Create/update contact → MEET |
| 02 | Email reply in inbox | Advance contact OUTREACH → CONNECT |
| 03 | Sent email to NEW lead | Advance contact NEW → OUTREACH |
| 04 | Calendar event keyword | Advance contact → INVITE or CREATE |
| 05 | Stripe payment | Advance contact → SERVE + create Engagement |
| 06 | New contact at NEW stage | Generate AI outreach email draft |
| 07 | Zoom meeting ends | Append AI summary to contact Notes |
| 08 | Breakthrough session ends | Email reminder to log proposal |
| 09 | Daily at 9 AM | Alert on packages expiring in 14 days |
| 10 | PandaDoc contract signed | Advance contact → SERVE + create Engagement |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable | Description | Where to find it |
|---|---|---|
| `AIRTABLE_API_KEY` | Airtable personal access token | [airtable.com/create/tokens](https://airtable.com/create/tokens) |
| `AIRTABLE_BASE_ID` | Your CRM base ID (set after `setup_airtable.js`) | Printed by setup script |
| `AIRTABLE_WORKSPACE_ID` | Your Airtable workspace ID | Airtable account settings URL |
| `MAKE_API_KEY` | Make.com API key | Make.com → Account → API |
| `MAKE_TEAM_ID` | Make.com team/organization ID | Make.com URL (team ID in path) |
| `ANTHROPIC_API_KEY` | Claude API key (for business card parser) | [console.anthropic.com](https://console.anthropic.com) |

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Create the Airtable base

```bash
node setup_airtable.js
```

Copy the printed `AIRTABLE_BASE_ID` into your `.env` file.

### 4. Validate the setup

```bash
node validate_setup.js
```

All checks should pass (✅) before proceeding.

### 5. Import Make.com blueprints

See [Make.com Blueprints](#makecom-blueprints) below.

---

## Script Reference

### `setup_airtable.js`

Creates the Ethics.Coach CRM base in your Airtable workspace with:
- **Contacts** table with all 35+ fields
- **Engagements** table linked to Contacts
- Views in both tables

```bash
node setup_airtable.js
```

Output includes the Base ID, table IDs, and saves them to `.airtable_ids.json`.

**Run this only once.** Running it again will create a duplicate base.

---

### `import_monday.js`

Imports a Monday.com CSV export into the Contacts table.

```bash
# Single file
node import_monday.js monday_export.csv

# Multiple files (multiple board groups)
node import_monday.js outreach.csv connect.csv meet.csv serve.csv
```

**Features:**
- Maps Monday.com column names to Airtable field names automatically
- Infers Stage from filename when not present in CSV (e.g., `outreach.csv` → OUTREACH)
- Deduplicates by email (keeps the record with the more advanced Stage)
- Uploads in batches of 10 with 200ms delays (respects Airtable rate limits)
- Prints a summary: rows processed, records created, duplicates skipped, errors

---

### `parse_business_card.js`

Extracts contact information from a business card photo using Claude Vision and creates a new Airtable contact at Stage = NEW.

```bash
node parse_business_card.js card.jpg
node parse_business_card.js /path/to/card.png
```

**Supported formats:** JPEG, PNG, WebP, GIF

**What it does:**
1. Sends the image to Claude (`claude-sonnet-4-20250514`)
2. Extracts: name, first name, email, phone, company, role, website, LinkedIn, location
3. Creates a contact record in Airtable (Stage = NEW)
4. Prints the record ID and extracted data

**Note on photo attachment:** Airtable's API requires a publicly accessible URL for attachments. For local use, the photo won't auto-attach — manually attach the business card photo in Airtable after the record is created.

---

### `validate_setup.js`

Confirms the CRM is correctly configured before going live.

```bash
node validate_setup.js
```

**Checks:**
1. All environment variables are set
2. Airtable API is reachable
3. Both tables exist (Contacts, Engagements)
4. All required fields exist in both tables
5. Can create, read, and delete a test record
6. Anthropic API is reachable and returns valid responses

---

## Monday.com Import Guide

### Step 1: Export from Monday.com

1. Open your Monday.com board
2. Click the three-dot menu (board options) → **Export board**
3. Select **Excel** or **CSV** format
4. If you have multiple board groups (stages), Monday may export them as separate sheets in one Excel file or offer one CSV per group

### Step 2: Prepare CSV files

If Monday exported as Excel (.xlsx):
- Open in Excel or Google Sheets
- Export each sheet as a separate `.csv` file
- Name files to match the stage: `outreach.csv`, `connect.csv`, etc.

If Monday exported as a single CSV with all rows:
- Ensure the CSV has a "Status" column with stage names, OR
- The script will handle both cases

### Step 3: Run the import

```bash
# If all data is in one CSV
node import_monday.js monday_full_export.csv

# If you have one CSV per stage
node import_monday.js new.csv outreach.csv connect.csv meet.csv invite.csv create.csv propose.csv serve.csv nurture.csv
```

### Step 4: Review in Airtable

1. Open your Airtable base → Contacts table
2. Switch to **All Contacts** view
3. Sort by `Created` descending to see newly imported records
4. Spot-check a few records for correct field mapping

### Column Mapping Reference

| Monday Column | Airtable Field |
|---|---|
| Contact | Name |
| First Name | First Name |
| Email | Email |
| LinkedIn | LinkedIn (checkbox) |
| Newsletter | Newsletter (checkbox) |
| Status | Stage |
| Last Interaction | Last Interaction |
| Location / Address | Location |
| Company | Company |
| Role | Role |
| Link | Website |
| Source / Label | Source |
| Propose | Propose Amount |
| Yes/No | Proposal Response |
| Fee | Fee |
| Sessions | Sessions |
| Contract Date | Contract Date |
| Expiration Date | Expiration Date |
| Package | Package |
| Comments | Comments |

---

## Adding a Contact from a Business Card

Use this workflow when you collect a business card at an event:

1. **Take a clear photo** of the business card (well-lit, no blur, all text visible)

2. **Run the parser:**
   ```bash
   node parse_business_card.js card.jpg
   ```

3. **Review the output** — the script prints the extracted data:
   ```
   Extracted contact data:
   {
     "name": "Jane Smith",
     "email": "jane@company.com",
     "company": "Acme Corp",
     "role": "VP Sustainability",
     ...
   }
   ✅ Contact created in Airtable!
      Record ID: recXXXXXXXXXXXXXX
   ```

4. **Open Airtable** and find the new record (Stage = NEW)

5. **Add context manually:**
   - Set the **Source** to where you met (e.g., "Berlin", "Climate-Week")
   - Attach the business card photo to the **Business Card Photo** field
   - Add any notes to **Comments**

6. The Make.com automation (Blueprint 06) will **auto-generate a draft outreach email** within 15 minutes, saved to the **Draft Outreach Email** field. Review and edit before sending.

---

## Make.com Blueprints

Full setup instructions are in [`make_blueprints/IMPORT_INSTRUCTIONS.md`](make_blueprints/IMPORT_INSTRUCTIONS.md).

### Quick import steps

1. Log in to [Make.com](https://www.make.com)
2. Go to **Scenarios** → **Create a new scenario**
3. Three-dot menu → **Import Blueprint**
4. Upload a `.json` file from the `make_blueprints/` folder
5. Connect your accounts (Gmail, Airtable, Google Calendar, etc.)
6. Set Make.com environment variables: `AIRTABLE_BASE_ID`, `MY_EMAIL`, `ANTHROPIC_API_KEY`
7. Activate the scenario

### Webhook URLs to configure

After importing, copy webhook URLs from Make.com for:

| Service | Blueprint | Where to paste |
|---|---|---|
| Stripe | 05 | Stripe Dashboard → Developers → Webhooks |
| PandaDoc | 10 | PandaDoc Settings → Integrations → Webhooks |
| Zoom | 07 | Zoom Marketplace → App → Event Subscriptions |

---

## Pipeline Stages

| Stage | Description | Color |
|---|---|---|
| NEW | Just collected (business card, event, etc.) | Green |
| OUTREACH | First email sent | Teal |
| CONNECT | Replied to outreach | Blue |
| MEET | Meeting scheduled or completed | Yellow |
| INVITE | Invited to two-hour intensive | Orange |
| CREATE | Breakthrough session scheduled | Purple |
| PROPOSE | Proposal sent | Pink |
| SERVE | Active client (contract signed) | Dark Green |
| NURTURE | Not ready, keep warm | Light Yellow |
| BACK BURNER | Low priority, check later | Gray |
| ARCHIVE | No longer active | Light Gray |
| PARTNER | Referral partner or collaborator | Teal Light |

---

## Troubleshooting

### 1. `setup_airtable.js` fails with "Invalid API key"

- Verify `AIRTABLE_API_KEY` in `.env` is your **personal access token** (starts with `pat`)
- Not your API key (legacy). Generate one at [airtable.com/create/tokens](https://airtable.com/create/tokens)
- Ensure the token has `data.records:read`, `data.records:write`, `schema.bases:write` scopes

### 2. `import_monday.js` — records created but fields are empty

- Check your Monday CSV column headers exactly match the `COLUMN_MAP` keys (case-sensitive)
- Open the CSV in a text editor and verify the first row contains column names
- Use `console.log(rows[0])` temporarily in the script to inspect what Monday exported

### 3. `parse_business_card.js` — "Claude returned invalid JSON"

- The image may be too low-resolution or blurry — retake the photo
- For cards with unusual layouts, Claude may return partial JSON — the script will report the error; manually enter the data in Airtable
- Verify `ANTHROPIC_API_KEY` is valid and has available credits

### 4. Make.com — "Airtable module returns 0 records" but contact exists

- Check the `filterByFormula` uses `LOWER()` for case-insensitive email matching
- Verify `AIRTABLE_BASE_ID` is set in Make.com environment variables
- In the Airtable module, re-select the base and table (connection may have expired)

### 5. Make.com — Webhook scenario doesn't fire

- Confirm the scenario is **active** (green toggle, top left in scenario editor)
- Use "Run Once" mode in Make.com while sending a test webhook to verify receipt
- Stripe/Zoom/PandaDoc require the webhook URL to return HTTP 200 within 30 seconds — Make.com does this automatically when the scenario is active
- Check Make.com's **Incomplete Executions** tab for error details

---

## Development Notes

- **Node.js 18+** required (uses `structuredClone`, modern crypto)
- **Rate limiting:** All Airtable batch operations include a 200ms delay between requests
- **Airtable batch limit:** Maximum 10 records per API create/update request (enforced by `import_monday.js`)
- **Formula fields** (`Sessions Remaining`) are read-only and computed by Airtable automatically
- **Lookup fields** (`Contact Name`, `Contact Email` in Engagements) require the linked record field to exist first — `setup_airtable.js` handles this sequentially
