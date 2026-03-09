#!/usr/bin/env node
/**
 * validate_setup.js
 * Validates the Airtable CRM setup: checks tables, fields, creates/deletes a test record,
 * and verifies the Anthropic API connection.
 */
require("dotenv").config();
const axios = require("axios");

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const META_URL = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const RECORDS_URL = `https://api.airtable.com/v0/${BASE_ID}/Contacts`;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const headers = { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];

function log(ok, label) {
  const icon = ok ? "✅" : "❌";
  results.push({ ok, label });
  console.log(`  ${icon} ${label}`);
}

// ─── Required Fields ─────────────────────────────────────────────────────────

const REQUIRED_CONTACT_FIELDS = [
  "Name", "First Name", "Email", "Phone", "LinkedIn", "Newsletter",
  "Location", "Company", "Role", "Website", "Stage", "Last Interaction",
  "Meeting Date", "Meeting Type", "Meeting Summary", "Source",
  "Propose Amount", "Proposal Response", "Demo Offered", "Demo Date",
  "Contract Date", "Fee", "Sessions", "Sessions Completed", "Sessions Remaining",
  "Hours Worked", "Payment Type", "Expiration Date", "Contract",
  "QB Invoice Number", "Stripe Link", "Package", "Draft Outreach Email",
  "Comments", "Business Card Photo", "Created", "Modified",
];

const REQUIRED_ENGAGEMENT_FIELDS = [
  "Engagement Name", "Contact", "Contact Name", "Contact Email",
  "Start Date", "End Date", "Status", "Package", "Fee",
  "Sessions Contracted", "Sessions Completed", "Sessions Remaining",
  "Hours Worked", "Payment Type", "Contract Date", "Expiration Date",
  "Contract", "QB Invoice Number", "Stripe Payment ID", "Stripe Link",
  "Notes", "Created",
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Ethics.Coach CRM — Setup Validation");
  console.log("═══════════════════════════════════════════════\n");

  // Check env vars
  log(!!AIRTABLE_API_KEY, "AIRTABLE_API_KEY is set");
  log(!!BASE_ID, "AIRTABLE_BASE_ID is set");
  log(!!ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY is set");

  if (!AIRTABLE_API_KEY || !BASE_ID) {
    console.log("\nCannot proceed without Airtable credentials.");
    printSummary();
    return;
  }

  console.log("");

  // Fetch tables
  let tables;
  try {
    const res = await axios.get(META_URL, { headers });
    tables = res.data.tables;
    log(true, "Connected to Airtable base");
  } catch (err) {
    log(false, `Connect to Airtable base: ${err.message}`);
    printSummary();
    return;
  }

  // Check Contacts table
  const contactsTable = tables.find((t) => t.name === "Contacts");
  log(!!contactsTable, "Contacts table exists");

  if (contactsTable) {
    const fieldNames = new Set(contactsTable.fields.map((f) => f.name));
    let missingFields = [];
    for (const f of REQUIRED_CONTACT_FIELDS) {
      if (!fieldNames.has(f)) missingFields.push(f);
    }
    if (missingFields.length === 0) {
      log(true, `Contacts table has all ${REQUIRED_CONTACT_FIELDS.length} required fields`);
    } else {
      log(false, `Contacts table missing fields: ${missingFields.join(", ")}`);
    }
  }

  // Check Engagements table
  const engTable = tables.find((t) => t.name === "Engagements");
  log(!!engTable, "Engagements table exists");

  if (engTable) {
    const fieldNames = new Set(engTable.fields.map((f) => f.name));
    let missingFields = [];
    for (const f of REQUIRED_ENGAGEMENT_FIELDS) {
      if (!fieldNames.has(f)) missingFields.push(f);
    }
    if (missingFields.length === 0) {
      log(true, `Engagements table has all ${REQUIRED_ENGAGEMENT_FIELDS.length} required fields`);
    } else {
      log(false, `Engagements table missing fields: ${missingFields.join(", ")}`);
    }
  }

  console.log("");

  // Create test record
  let testRecordId = null;
  try {
    const res = await axios.post(
      RECORDS_URL,
      { records: [{ fields: { Name: "Test Contact", Email: "test@test.com", Stage: "NEW" } }] },
      { headers }
    );
    testRecordId = res.data.records[0].id;
    log(true, `Test contact created (${testRecordId})`);
  } catch (err) {
    const msg = err.response ? JSON.stringify(err.response.data) : err.message;
    log(false, `Create test contact: ${msg}`);
  }

  await sleep(500);

  // Delete test record
  if (testRecordId) {
    try {
      await axios.delete(`${RECORDS_URL}/${testRecordId}`, { headers });
      log(true, "Test contact deleted");
    } catch (err) {
      log(false, `Delete test contact: ${err.message}`);
    }
  }

  console.log("");

  // Test Anthropic API
  if (ANTHROPIC_API_KEY) {
    try {
      const res = await axios.post(
        ANTHROPIC_URL,
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 50,
          messages: [{ role: "user", content: "Reply with exactly: OK" }],
        },
        {
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
        }
      );
      log(true, "Anthropic API connection works");
    } catch (err) {
      const msg = err.response ? JSON.stringify(err.response.data) : err.message;
      log(false, `Anthropic API: ${msg}`);
    }
  }

  // Check Make.com blueprints exist
  const fs = require("fs");
  const blueprintDir = require("path").join(__dirname, "make_blueprints");
  const expectedBlueprints = [
    "01_reclaim_booking_to_meet.json",
    "02_gmail_reply_to_connect.json",
    "03_outreach_email_to_new_lead.json",
    "04_calendar_keyword_to_invite_or_create.json",
    "05_stripe_payment_to_serve.json",
    "06_new_contact_ai_outreach_draft.json",
    "07_zoom_summary_to_contacts.json",
    "08_post_demo_propose_prompt.json",
    "09_expiration_alert.json",
    "10_pandadoc_signed_to_serve.json",
  ];

  console.log("");
  let allBlueprintsExist = true;
  for (const bp of expectedBlueprints) {
    const exists = fs.existsSync(require("path").join(blueprintDir, bp));
    if (!exists) allBlueprintsExist = false;
  }
  log(allBlueprintsExist, `All ${expectedBlueprints.length} Make.com blueprints present`);

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Validation error:", err.message);
  process.exit(1);
});
