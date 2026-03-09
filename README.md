# Ethics.Coach CRM

Airtable-based CRM system for a solo executive coaching practice, with Make.com automations for Gmail, Google Calendar, Stripe, Zoom, PandaDoc, and AI-powered outreach drafting.

Replaces a Monday.com CRM with a purpose-built Airtable base and 10 automation scenarios.

## Architecture

```
Contacts Table (Airtable)     ←→  Make.com Automations  ←→  Gmail / Calendar / Stripe / Zoom
    ↕                                                          ↕
Engagements Table (Airtable)                              Claude AI (outreach drafts)
```

**Pipeline stages:** NEW → OUTREACH → CONNECT → MEET → INVITE → CREATE → PROPOSE → SERVE → NURTURE / BACK BURNER / ARCHIVE / PARTNER

## Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

| Variable | Description | Where to Find |
|---|---|---|
| `AIRTABLE_API_KEY` | Airtable personal access token | [Airtable Tokens](https://airtable.com/create/tokens) |
| `AIRTABLE_BASE_ID` | Base ID (set after running setup) | Printed by `setup_airtable.js` |
| `AIRTABLE_WORKSPACE_ID` | Workspace ID | Airtable account settings URL |
| `MAKE_API_KEY` | Make.com API key | Make.com → Account → API |
| `MAKE_TEAM_ID` | Make.com team/org ID | Make.com → Team settings |
| `ANTHROPIC_API_KEY` | Anthropic API key | [Anthropic Console](https://console.anthropic.com/) |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Airtable base and tables

```bash
node setup_airtable.js
```

This will:
- Create the "Ethics.Coach CRM" base (or use existing `AIRTABLE_BASE_ID`)
- Create the **Contacts** table with all 35+ fields
- Create the **Engagements** table with linked records and lookups
- Create views for both tables

After running, copy the printed `AIRTABLE_BASE_ID` into your `.env` file.

### 3. Import Monday.com data

```bash
node import_monday.js path/to/monday_export.csv
```

**Step-by-step:**
1. In Monday.com, go to your CRM board
2. Click the three-dot menu → **Export board to Excel/CSV**
3. Save the CSV file locally
4. Run the import script with the path to the CSV
5. Review the summary output for any errors

The script handles:
- Column name mapping from Monday.com to Airtable
- Stage inference from sheet/group names
- Deduplication by email (keeps the more advanced stage)
- Batch uploads of 10 records at a time

### 4. Import Make.com blueprints

See [`make_blueprints/IMPORT_INSTRUCTIONS.md`](make_blueprints/IMPORT_INSTRUCTIONS.md) for detailed steps.

Quick version:
1. Go to Make.com → Scenarios → Create new scenario
2. Click ⋯ → Import Blueprint → upload the JSON file
3. Configure connections (Gmail, Airtable, etc.)
4. Activate in the recommended order

### 5. Validate setup

```bash
node validate_setup.js
```

Checks that both tables exist with all fields, tests record creation/deletion, verifies the Anthropic API, and confirms all blueprint files are present.

## Adding a Contact from a Business Card

```bash
node parse_business_card.js photo_of_card.jpg
```

This sends the photo to Claude's vision API, extracts contact info, and creates a new Airtable record at Stage = NEW. Supported formats: JPG, PNG, GIF, WebP.

## Make.com Automations

| # | Scenario | Trigger | Action |
|---|---|---|---|
| 01 | Reclaim Booking → MEET | Gmail (Reclaim.ai email) | Create/update contact at MEET |
| 02 | Gmail Reply → CONNECT | Gmail (reply received) | Advance OUTREACH → CONNECT |
| 03 | Sent Email → OUTREACH | Gmail (sent email) | Advance NEW → OUTREACH |
| 04 | Calendar → INVITE/CREATE | Google Calendar (keywords) | Update stage based on event title |
| 05 | Stripe → SERVE | Stripe webhook | Update to SERVE + create Engagement |
| 06 | AI Outreach Draft | Airtable (new record) | Generate draft email via Claude |
| 07 | Zoom Summary | Zoom webhook | Log meeting summary to Comments |
| 08 | Post-Demo Reminder | Google Calendar | Email reminder to log proposal |
| 09 | Expiration Alert | Daily schedule (9 AM) | Alert for engagements expiring in 14 days |
| 10 | PandaDoc → SERVE | PandaDoc webhook | Update to SERVE + create Engagement |

## View Filter Specifications

After running `setup_airtable.js`, configure these view filters manually in Airtable:

**Contacts views:**
- **Funnel:** Kanban grouped by Stage
- **All Contacts:** Grid, sorted by Last Interaction (descending)
- **Active Pipeline:** Stage is NEW, OUTREACH, CONNECT, MEET, INVITE, CREATE, or PROPOSE
- **Clients — SERVE:** Stage = SERVE
- **Nurture List:** Stage = NURTURE or BACK BURNER
- **Partners:** Stage = PARTNER
- **SVI / SVN:** Source contains "SVI"
- **New This Week:** Created is within last 7 days

**Engagements views:**
- **Active Engagements:** Status = Active, sorted by Start Date
- **All Engagements:** All records
- **Expiring Soon:** Expiration Date is within next 30 days

## Troubleshooting

### 1. "AUTHENTICATION_REQUIRED" from Airtable API

Your `AIRTABLE_API_KEY` is missing or invalid. Generate a new personal access token at [airtable.com/create/tokens](https://airtable.com/create/tokens) with these scopes:
- `data.records:read`
- `data.records:write`
- `schema.bases:read`
- `schema.bases:write`

### 2. Monday.com import shows 0 records

The CSV may use different column names than expected. Open the CSV and check the header row. Update the `COLUMN_MAP` in `import_monday.js` if your Monday.com board uses custom column names.

### 3. Business card parser returns empty fields

Ensure the photo is well-lit and the text is legible. Try a higher-resolution image. The script supports JPG, PNG, GIF, and WebP formats. Check that `ANTHROPIC_API_KEY` is set correctly.

### 4. Make.com scenario fails with "Connection expired"

Re-authorize the connection in Make.com. Go to Connections in the left sidebar, find the expired connection, and click Reauthorize. Gmail and Google Calendar tokens expire periodically.

### 5. Airtable "INVALID_VALUE_FOR_COLUMN" errors during import

Some field values from Monday.com may not match Airtable's expected format. Common issues:
- **Stage values** must match exactly (case-sensitive): NEW, OUTREACH, CONNECT, etc.
- **Source values** must be from the predefined list — unknown values are silently dropped
- **Currency fields** must be numbers — the script strips `$` and commas automatically
- **Date fields** must be valid dates — invalid dates are skipped

## File Structure

```
/
├── README.md
├── .env.example
├── .gitignore
├── package.json
├── setup_airtable.js          # Creates the base, tables, fields, and views
├── import_monday.js           # Monday.com CSV → Airtable importer
├── parse_business_card.js     # Business card photo → new Airtable contact
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
