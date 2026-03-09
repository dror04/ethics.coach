# Make.com Blueprint Import Instructions

## How to Import Blueprints

For each blueprint JSON file:

1. Log in to [Make.com](https://www.make.com)
2. Click **Scenarios** in the left sidebar
3. Click **+ Create a new scenario**
4. In the scenario editor, click the **three dots (⋯)** menu at the bottom
5. Select **Import Blueprint**
6. Upload the `.json` file or paste its contents
7. Click **Save**
8. Configure the connections (see below)
9. Toggle the scenario **ON** when ready

---

## Connection Requirements by Blueprint

### 01 — Reclaim Booking → MEET
| Connection | Setup |
|---|---|
| **Gmail** | Authorize your Gmail account when prompted |
| **Airtable** | Add your Airtable personal access token |

### 02 — Gmail Reply → CONNECT
| Connection | Setup |
|---|---|
| **Gmail** | Same Gmail connection as #01 |
| **Airtable** | Same Airtable connection |

**Environment variable needed:** Set `MY_EMAIL` in Make.com scenario variables to your Gmail address (used to filter out your own emails).

### 03 — Outreach Email → NEW to OUTREACH
| Connection | Setup |
|---|---|
| **Gmail** | Same Gmail connection |
| **Airtable** | Same Airtable connection |

### 04 — Calendar Keywords → INVITE / CREATE
| Connection | Setup |
|---|---|
| **Google Calendar** | Authorize your Google Calendar account |
| **Airtable** | Same Airtable connection |

### 05 — Stripe Payment → SERVE + Engagement
| Connection | Setup |
|---|---|
| **Webhooks** | Make.com generates a webhook URL — copy it |
| **Airtable** | Same Airtable connection |
| **QuickBooks** | Authorize your QuickBooks Online account |

**Webhook setup:**
1. After importing, click the webhook module and copy the **webhook URL**
2. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
3. Click **Add endpoint**
4. Paste the Make.com webhook URL
5. Select events: `payment_intent.succeeded`, `checkout.session.completed`
6. Click **Add endpoint**

### 06 — New Contact → AI Outreach Draft
| Connection | Setup |
|---|---|
| **Airtable** | Same Airtable connection |
| **HTTP** | No connection needed (uses API key in headers) |

**Environment variable needed:** Set `ANTHROPIC_API_KEY` in Make.com scenario variables.

### 07 — Zoom Summary → Contacts
| Connection | Setup |
|---|---|
| **Webhooks** | Make.com generates a webhook URL — copy it |
| **HTTP** | No connection needed (uses bearer token in headers) |
| **Airtable** | Same Airtable connection |
| **Gmail** | Same Gmail connection |

**Webhook setup:**
1. After importing, click the webhook module and copy the **webhook URL**
2. Go to [Zoom App Marketplace → Develop → Build App](https://marketplace.zoom.us/develop/create)
3. Create a Webhook Only app (or use existing)
4. Under **Feature → Event Subscriptions**, add subscription
5. Set the **Event notification endpoint URL** to the Make.com webhook URL
6. Add event type: `meeting.ended`
7. Click **Save**

**Environment variable needed:** Set `ZOOM_ACCESS_TOKEN` in Make.com scenario variables.

### 08 — Post-Breakthrough → Propose Reminder
| Connection | Setup |
|---|---|
| **Google Calendar** | Same Google Calendar connection |
| **Airtable** | Same Airtable connection |
| **Gmail** | Same Gmail connection |

**Environment variables needed:**
- `MY_EMAIL` — your email address
- `AIRTABLE_BASE_ID` — your base ID
- `CONTACTS_TABLE_ID` — your Contacts table ID

### 09 — Expiration Alert
| Connection | Setup |
|---|---|
| **Airtable** | Same Airtable connection |
| **Gmail** | Same Gmail connection |

**Environment variable needed:** Set `MY_EMAIL` in Make.com scenario variables.

### 10 — PandaDoc Signed → SERVE + Engagement
| Connection | Setup |
|---|---|
| **Webhooks** | Make.com generates a webhook URL — copy it |
| **Airtable** | Same Airtable connection |

**Webhook setup:**
1. After importing, click the webhook module and copy the **webhook URL**
2. Go to [PandaDoc → Settings → Integrations → Webhooks](https://app.pandadoc.com/a/#/settings/integrations/webhooks)
3. Click **Add webhook**
4. Paste the Make.com webhook URL
5. Select event: `document_state_changed`
6. Click **Save**

---

## Webhook URL Summary

After importing blueprints 05, 07, and 10, you'll have three webhook URLs to configure:

| Blueprint | Webhook Destination |
|---|---|
| `05_stripe_payment_to_serve` | Stripe Dashboard → Webhooks |
| `07_zoom_summary_to_contacts` | Zoom App Marketplace → Event Subscriptions |
| `10_pandadoc_signed_to_serve` | PandaDoc Settings → Webhooks |

---

## Make.com Environment Variables

Set these in each scenario's **Variables** panel (scenario settings):

| Variable | Value |
|---|---|
| `AIRTABLE_BASE_ID` | Your Airtable base ID (starts with `app`) |
| `CONTACTS_TABLE_ID` | Your Contacts table ID (starts with `tbl`) |
| `MY_EMAIL` | Your Gmail address |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `ZOOM_ACCESS_TOKEN` | Your Zoom OAuth access token |

---

## Recommended Activation Order

Activate scenarios in this order to avoid triggering cascading updates on existing data:

1. **09** — Expiration Alert (safe, daily schedule)
2. **06** — AI Outreach Draft (watches new records only)
3. **01** — Reclaim Booking → MEET
4. **02** — Gmail Reply → CONNECT
5. **03** — Outreach Email → OUTREACH
6. **04** — Calendar Keywords → INVITE / CREATE
7. **05** — Stripe Payment → SERVE
8. **07** — Zoom Summary → Contacts
9. **08** — Post-Breakthrough Reminder
10. **10** — PandaDoc Signed → SERVE

**Tip:** After activating each scenario, test it with a known record before activating the next one.
