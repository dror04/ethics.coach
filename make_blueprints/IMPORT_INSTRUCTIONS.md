# Make.com Blueprint Import Instructions

This guide explains how to import and configure each automation scenario into Make.com.

---

## Prerequisites

Before importing any blueprints, complete these steps:

1. **Airtable base is set up** — run `node setup_airtable.js` and save your `AIRTABLE_BASE_ID`.
2. **Make.com account** — free tier works for testing; paid plan required for multiple active scenarios.
3. **Make.com environment variables** — set these in your organization's Settings → Variables:
   - `AIRTABLE_BASE_ID` — from step 1
   - `MY_EMAIL` — your Gmail address (used for self-notifications)
   - `ANTHROPIC_API_KEY` — for Blueprint 06
   - `ZOOM_ACCESS_TOKEN` — for Blueprint 07

---

## How to Import a Blueprint

1. Log in to [Make.com](https://www.make.com)
2. Navigate to **Scenarios** (left sidebar)
3. Click **Create a new scenario**
4. In the scenario editor, click the **three-dot menu** (top right) → **Import Blueprint**
5. Upload the `.json` file from the `make_blueprints/` folder
6. The scenario will load — review modules and connect accounts (see per-scenario instructions below)
7. Click **Save** then configure the schedule or webhook trigger
8. Click **Activate** (toggle at top left)

---

## Scenario-by-Scenario Setup

---

### 01 — `01_reclaim_booking_to_meet.json`
**Purpose:** Converts Reclaim.ai booking confirmations into MEET-stage contacts.

**Connections required:**
- Gmail (Google connection — authorize with your coaching Gmail account)
- Airtable (authorize with your Airtable API key)

**Configuration:**
1. In the Gmail trigger, verify the filter criteria: `from:reclaim.ai OR (subject:confirmed subject:booking)`
2. In the Airtable Search module, confirm `base` = your `AIRTABLE_BASE_ID`
3. In the Gmail "Add Label" module, create the label `CRM: Processed` in Gmail first (Settings → Labels → Create)
4. Set polling interval: every 5 minutes

**No webhooks required.**

---

### 02 — `02_gmail_reply_to_connect.json`
**Purpose:** Advances contacts from OUTREACH → CONNECT when they reply to your emails.

**Connections required:**
- Gmail
- Airtable

**Configuration:**
1. In the Router filter, set `MY_EMAIL` variable or hardcode your email address in the "not from self" condition
2. The `In-Reply-To` header filter handles reply detection automatically
3. Set polling interval: every 5 minutes

**Environment variable needed:** `MY_EMAIL`

---

### 03 — `03_outreach_email_to_new_lead.json`
**Purpose:** Advances contacts from NEW → OUTREACH when you send them an email.

**Connections required:**
- Gmail
- Airtable

**Configuration:**
1. Gmail trigger watches the **Sent** folder — verify "Folder" = `SENT`
2. The filter matches sent emails to contacts in `NEW` stage
3. Set polling interval: every 5 minutes

---

### 04 — `04_calendar_keyword_to_invite_or_create.json`
**Purpose:** Advances contacts to INVITE or CREATE based on calendar event title keywords.

**Connections required:**
- Google Calendar
- Airtable

**Configuration:**
1. In the Google Calendar trigger, select your primary calendar
2. Keywords are case-insensitive: `two-hour-intensive` → INVITE, `breakthrough` → CREATE
3. The scenario iterates over all event attendees and looks them up by email
4. Set polling interval: every 15 minutes

---

### 05 — `05_stripe_payment_to_serve.json`
**Purpose:** On successful Stripe payment, sets contact to SERVE and creates an Engagement record.

**Connections required:**
- Make.com Webhooks (built-in)
- Airtable
- QuickBooks (optional — remove module if not using QB)

**Webhook setup:**
1. In Make.com, open the scenario and click the Webhook trigger module
2. Click **Copy address** to get your webhook URL
3. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers → Webhooks → Add endpoint**
4. Paste the webhook URL
5. Select events: `payment_intent.succeeded` and `checkout.session.completed`
6. Click **Add endpoint**
7. Copy the **Signing secret** (optional — for webhook verification)

**QuickBooks setup (if used):**
1. Connect QuickBooks in Make.com Connections
2. Update the `ItemRef.name` in the QB module to match your QuickBooks item name

---

### 06 — `06_new_contact_ai_outreach_draft.json`
**Purpose:** Auto-generates a draft outreach email for every new contact at Stage = NEW.

**Connections required:**
- Airtable (trigger + update)
- HTTP module (no separate connection — uses Anthropic API key directly)

**Configuration:**
1. In the HTTP module, verify the `x-api-key` header uses `env.ANTHROPIC_API_KEY`
2. Set `ANTHROPIC_API_KEY` in Make.com → Settings → Variables
3. The Airtable trigger watches for new records; the Filter checks Stage = NEW and empty Draft field
4. Review generated drafts in Airtable before sending — **do not auto-send**
5. Set polling interval: every 15 minutes

---

### 07 — `07_zoom_summary_to_contacts.json`
**Purpose:** After a Zoom meeting ends, appends the AI Companion summary to the contact's record.

**Connections required:**
- Make.com Webhooks (built-in)
- Airtable
- Gmail (for self-notification)

**Webhook setup:**
1. Copy the webhook URL from the Make.com webhook trigger module
2. Go to [Zoom Marketplace](https://marketplace.zoom.us) → **Develop → Build App → Event Subscriptions**
3. (Or: Zoom Account → Settings → Integrations → Webhooks)
4. Add a new subscription with:
   - Event: `meeting.ended`
   - Endpoint URL: your Make.com webhook URL
5. Set `ZOOM_ACCESS_TOKEN` in Make.com environment variables
   - Generate via Zoom OAuth app or Server-to-Server OAuth

**Note:** Zoom AI Companion must be enabled on your Zoom account for meeting summaries to appear.

---

### 08 — `08_post_demo_propose_prompt.json`
**Purpose:** After a breakthrough session ends, emails you a reminder to log the proposal.

**Connections required:**
- Google Calendar
- Airtable
- Gmail

**Configuration:**
1. Calendar trigger watches for updated events
2. Filter checks: title contains "breakthrough" AND event ended in the last 2 hours
3. Set `MY_EMAIL` in Make.com environment variables
4. Email includes a direct link to the contact's Airtable record
5. Set polling interval: every 15 minutes

---

### 09 — `09_expiration_alert.json`
**Purpose:** Sends daily email alerts for client packages expiring in the next 14 days.

**Connections required:**
- Airtable
- Gmail

**Configuration:**
1. The scheduler trigger runs daily at 9:00 AM — adjust time zone in scenario settings
2. Set `MY_EMAIL` in Make.com environment variables
3. The Airtable filter formula: `AND({Status} = 'Active', IS_BEFORE({Expiration Date}, DATEADD(TODAY(), 14, 'days')), IS_AFTER({Expiration Date}, TODAY()))`
4. One email is sent per expiring engagement

---

### 10 — `10_pandadoc_signed_to_serve.json`
**Purpose:** When a PandaDoc contract is signed, sets contact to SERVE and creates an Engagement record.

**Connections required:**
- Make.com Webhooks (built-in)
- Airtable

**Webhook setup:**
1. Copy the webhook URL from the Make.com webhook trigger module
2. Go to [PandaDoc](https://app.pandadoc.com) → **Settings → Integrations → Webhooks**
3. Click **Add webhook**
4. Paste the webhook URL
5. Subscribe to event: `document_state_changed`
6. Click **Save**

**Note:** The `recipients[1].email` index assumes the first recipient is the client. PandaDoc numbers recipients starting at index 0 (sender) and index 1+ (recipients). Adjust if your template ordering differs.

---

## Activation Order

Activate scenarios in this order to avoid dependency issues:

1. `06` — AI Outreach Draft (runs on new records, good to have active early)
2. `03` — Outreach Email → NEW Lead (advance from NEW on first send)
3. `02` — Gmail Reply → CONNECT
4. `01` — Reclaim Booking → MEET
5. `04` — Calendar Keywords → INVITE/CREATE
6. `08` — Post-Demo Proposal Prompt
7. `05` — Stripe Payment → SERVE (requires webhook in Stripe)
8. `10` — PandaDoc Signed → SERVE (requires webhook in PandaDoc)
9. `07` — Zoom Summary → Contacts (requires webhook in Zoom)
10. `09` — Daily Expiration Alert (runs on a schedule)

---

## Environment Variables Summary

Set these in Make.com → Organization Settings → Variables:

| Variable | Description |
|---|---|
| `AIRTABLE_BASE_ID` | Your Airtable base ID (from `setup_airtable.js` output) |
| `MY_EMAIL` | Your Gmail address for self-notification emails |
| `ANTHROPIC_API_KEY` | Anthropic API key for Blueprint 06 AI drafts |
| `ZOOM_ACCESS_TOKEN` | Zoom OAuth access token for Blueprint 07 |

---

## Troubleshooting

**Webhook not receiving events:**
- Verify the webhook URL is correct and the scenario is **active** (toggle on)
- Test using Make.com's "Run Once" mode and Stripe/Zoom/PandaDoc test payloads

**Airtable field not found errors:**
- Run `node validate_setup.js` to confirm all fields exist
- Check that field names in blueprints exactly match your Airtable field names (case-sensitive)

**Gmail connection issues:**
- Re-authorize the Google connection in Make.com → Connections
- Ensure the connection has Gmail read + write permissions

**AI draft not generating:**
- Verify `ANTHROPIC_API_KEY` is set correctly in Make.com variables
- Check the HTTP module response in Make.com's execution log for API errors

**Duplicate records appearing:**
- Blueprint 02 only fires if the contact is in OUTREACH stage — check stage is set correctly
- Blueprint 03 only fires if the contact is in NEW stage
