#!/usr/bin/env node
/**
 * setup_airtable.js
 * Creates the Ethics.Coach CRM base, tables, fields, and views in Airtable.
 */
require("dotenv").config();
const axios = require("axios");

const API_KEY = process.env.AIRTABLE_API_KEY;
const WORKSPACE_ID = process.env.AIRTABLE_WORKSPACE_ID;
let BASE_ID = process.env.AIRTABLE_BASE_ID;

const META_URL = "https://api.airtable.com/v0/meta";
const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Field Definitions ───────────────────────────────────────────────────────

const STAGE_OPTIONS = [
  { name: "NEW", color: "greenBright" },
  { name: "OUTREACH", color: "tealBright" },
  { name: "CONNECT", color: "blueBright" },
  { name: "MEET", color: "yellowBright" },
  { name: "INVITE", color: "orangeBright" },
  { name: "CREATE", color: "purpleBright" },
  { name: "PROPOSE", color: "pinkBright" },
  { name: "SERVE", color: "greenDark1" },
  { name: "NURTURE", color: "yellowLight1" },
  { name: "BACK BURNER", color: "grayLight1" },
  { name: "ARCHIVE", color: "grayBright" },
  { name: "PARTNER", color: "tealDark1" },
];

const SELECT_COLORS = [
  "blueBright", "cyanBright", "tealBright", "greenBright", "yellowBright",
  "orangeBright", "redBright", "pinkBright", "purpleBright", "grayBright",
  "blueDark1", "cyanDark1", "tealDark1", "greenDark1", "yellowDark1",
  "orangeDark1", "redDark1", "pinkDark1",
];

const SOURCE_OPTIONS = [
  "AMA", "JEI", "SVI", "IMMA", "Zebras", "Berlin", "BASE",
  "Climate-Week", "POD 2025", "C-Suite SusPGH", "RISC",
  "PGH Tomorrow", "Amy Wilson", "Newsletter",
  "Scheduling Link", "Referral", "LinkedIn", "Other",
].map((name, i) => ({ name, color: SELECT_COLORS[i % SELECT_COLORS.length] }));

const CONTACTS_FIELDS = [
  // Primary field "Name" is created with the table
  { name: "First Name", type: "singleLineText" },
  { name: "Email", type: "email" },
  { name: "Phone", type: "phoneNumber" },
  { name: "LinkedIn", type: "checkbox", options: { icon: "check", color: "greenBright" } },
  { name: "Newsletter", type: "checkbox", options: { icon: "check", color: "greenBright" } },
  { name: "Location", type: "singleLineText" },
  { name: "Company", type: "singleLineText" },
  { name: "Role", type: "singleLineText" },
  { name: "Website", type: "url" },
  { name: "Stage", type: "singleSelect", options: { choices: STAGE_OPTIONS } },
  { name: "Last Interaction", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "Meeting Date", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "Meeting Type", type: "singleSelect", options: { choices: [{ name: "Zoom", color: "blueBright" }, { name: "In-Person", color: "greenBright" }, { name: "Phone", color: "yellowBright" }, { name: "Reclaim", color: "purpleBright" }] } },
  { name: "Meeting Summary", type: "multilineText" },
  { name: "Source", type: "multipleSelects", options: { choices: SOURCE_OPTIONS } },
  { name: "Propose Amount", type: "currency", options: { precision: 2, symbol: "$" } },
  { name: "Proposal Response", type: "singleSelect", options: { choices: [{ name: "Yes", color: "greenBright" }, { name: "No", color: "redBright" }, { name: "Pending", color: "yellowBright" }] } },
  { name: "Demo Offered", type: "checkbox", options: { icon: "check", color: "greenBright" } },
  { name: "Demo Date", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "Contract Date", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "Fee", type: "currency", options: { precision: 2, symbol: "$" } },
  { name: "Sessions", type: "number", options: { precision: 0 } },
  { name: "Sessions Completed", type: "number", options: { precision: 0 } },
  // Formula fields can't be created via API — create as number, convert manually
  { name: "Sessions Remaining", type: "number", options: { precision: 0 } },
  { name: "Hours Worked", type: "number", options: { precision: 2 } },
  { name: "Payment Type", type: "singleSelect", options: { choices: [{ name: "One-Time", color: "blueBright" }, { name: "Monthly Recurring", color: "purpleBright" }] } },
  { name: "Expiration Date", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "Contract", type: "multipleAttachments" },
  { name: "QB Invoice Number", type: "singleLineText" },
  { name: "Stripe Link", type: "url" },
  { name: "Package", type: "singleLineText" },
  { name: "Draft Outreach Email", type: "multilineText" },
  { name: "Comments", type: "multilineText" },
  { name: "Business Card Photo", type: "multipleAttachments" },
];

const ENGAGEMENTS_FIELDS_INITIAL = [
  // Primary field "Engagement Name" is created with the table
  // Link, lookups, and remaining fields added after table creation
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiCall(method, url, data) {
  await sleep(250); // rate limiting
  try {
    const res = await axios({ method, url, headers, data });
    return res.data;
  } catch (err) {
    const msg = err.response ? JSON.stringify(err.response.data, null, 2) : err.message;
    console.error(`API Error [${method.toUpperCase()} ${url}]: ${msg}`);
    throw err;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Ethics.Coach CRM — Airtable Setup");
  console.log("═══════════════════════════════════════════════\n");

  if (!API_KEY) { console.error("Missing AIRTABLE_API_KEY"); process.exit(1); }

  // ── Step 1: Create Base (if no BASE_ID provided) ──────────────────────────
  if (!BASE_ID) {
    if (!WORKSPACE_ID) { console.error("Missing AIRTABLE_WORKSPACE_ID"); process.exit(1); }
    console.log("Creating base 'Ethics.Coach CRM'...");
    const base = await apiCall("post", `${META_URL}/bases`, {
      name: "Ethics.Coach CRM",
      workspaceId: WORKSPACE_ID,
      tables: [
        {
          name: "Contacts",
          fields: [{ name: "Name", type: "singleLineText" }],
        },
      ],
    });
    BASE_ID = base.id;
    console.log(`✅ Base created: ${BASE_ID}`);
    console.log(`   ➜ Add AIRTABLE_BASE_ID=${BASE_ID} to your .env file\n`);
  } else {
    console.log(`Using existing base: ${BASE_ID}\n`);
  }

  const tablesUrl = `${META_URL}/bases/${BASE_ID}/tables`;

  // ── Step 2: Get existing tables ───────────────────────────────────────────
  const existingTables = await apiCall("get", tablesUrl);
  const contactsTable = existingTables.tables.find((t) => t.name === "Contacts");
  let engagementsTable = existingTables.tables.find((t) => t.name === "Engagements");

  if (!contactsTable) {
    console.error("Contacts table not found — base may have been created incorrectly.");
    process.exit(1);
  }

  const contactsTableId = contactsTable.id;
  const existingFieldNames = new Set(contactsTable.fields.map((f) => f.name));

  // ── Step 3: Add fields to Contacts ────────────────────────────────────────
  console.log("Adding fields to Contacts table...");
  for (const field of CONTACTS_FIELDS) {
    if (existingFieldNames.has(field.name)) {
      console.log(`  ⏭  ${field.name} (already exists)`);
      continue;
    }
    const payload = { name: field.name, type: field.type };
    if (field.options) payload.options = field.options;
    await apiCall("post", `${tablesUrl}/${contactsTableId}/fields`, payload);
    console.log(`  ✅ ${field.name}`);
  }

  // createdTime and lastModifiedTime fields can't be created via API — add manually
  console.log("  ⏭️  Skipping 'Created' (createdTime) — add manually in Airtable UI");
  console.log("  ⏭️  Skipping 'Modified' (lastModifiedTime) — add manually in Airtable UI");

  console.log("");

  // ── Step 4: Create Engagements table ──────────────────────────────────────
  if (!engagementsTable) {
    console.log("Creating Engagements table...");
    const engResult = await apiCall("post", tablesUrl, {
      name: "Engagements",
      fields: [{ name: "Engagement Name", type: "singleLineText" }],
    });
    engagementsTable = engResult;
    console.log(`✅ Engagements table created: ${engagementsTable.id}\n`);
  } else {
    console.log(`Engagements table already exists: ${engagementsTable.id}\n`);
  }

  const engTableId = engagementsTable.id;
  const engExistingFields = new Set(engagementsTable.fields.map((f) => f.name));

  // ── Step 5: Add fields to Engagements ─────────────────────────────────────
  console.log("Adding fields to Engagements table...");
  const engFields = [
    { name: "Contact", type: "multipleRecordLinks", options: { linkedTableId: contactsTableId } },
    { name: "Start Date", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "End Date", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "Status", type: "singleSelect", options: { choices: [{ name: "Active", color: "greenBright" }, { name: "Completed", color: "blueBright" }, { name: "Paused", color: "yellowBright" }, { name: "Cancelled", color: "redBright" }] } },
    { name: "Package", type: "singleLineText" },
    { name: "Fee", type: "currency", options: { precision: 2, symbol: "$" } },
    { name: "Sessions Contracted", type: "number", options: { precision: 0 } },
    { name: "Sessions Completed", type: "number", options: { precision: 0 } },
    // Formula fields can't be created via API — create as number, convert manually
    { name: "Sessions Remaining", type: "number", options: { precision: 0 } },
    { name: "Hours Worked", type: "number", options: { precision: 2 } },
    { name: "Payment Type", type: "singleSelect", options: { choices: [{ name: "One-Time", color: "blueBright" }, { name: "Monthly Recurring", color: "purpleBright" }] } },
    { name: "Contract Date", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "Expiration Date", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "Contract", type: "multipleAttachments" },
    { name: "QB Invoice Number", type: "singleLineText" },
    { name: "Stripe Payment ID", type: "singleLineText" },
    { name: "Stripe Link", type: "url" },
    { name: "Notes", type: "multilineText" },
    // createdTime can't be created via API — add manually
  ];

  // Create the Contact link field first so we can reference it for lookups
  let contactLinkFieldId = null;
  for (const field of engFields) {
    if (engExistingFields.has(field.name)) {
      if (field.name === "Contact") {
        const existing = engagementsTable.fields.find((f) => f.name === "Contact");
        if (existing) contactLinkFieldId = existing.id;
      }
      console.log(`  ⏭  ${field.name} (already exists)`);
      continue;
    }
    const payload = { name: field.name, type: field.type };
    if (field.options) payload.options = field.options;
    const created = await apiCall("post", `${tablesUrl}/${engTableId}/fields`, payload);
    console.log(`  ✅ ${field.name}`);
    if (field.name === "Contact") contactLinkFieldId = created.id;
  }

  // Lookup fields can't be created via API — add manually
  console.log("  ⏭️  Skipping 'Contact Name' (lookup) — add manually in Airtable UI");
  console.log("  ⏭️  Skipping 'Contact Email' (lookup) — add manually in Airtable UI");

  console.log("");

  // ── Step 6: Views ───────────────────────────────────────────────────────
  // Airtable Meta API does not support view creation — views must be added manually

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Setup Complete!");
  console.log("═══════════════════════════════════════════════");
  console.log(`\nBase ID: ${BASE_ID}`);
  console.log(`Contacts Table ID: ${contactsTableId}`);
  console.log(`Engagements Table ID: ${engTableId}`);
  console.log("\nManual steps needed:");
  console.log("  Fields:");
  console.log("    1. Contacts → Add 'Created' field (type: Created time)");
  console.log("    2. Contacts → Add 'Modified' field (type: Last modified time)");
  console.log("    3. Contacts → 'Sessions Remaining': convert to Formula → {Sessions} - {Sessions Completed}");
  console.log("    4. Engagements → Add 'Created' field (type: Created time)");
  console.log("    5. Engagements → Add 'Contact Name' field (type: Lookup → Contact → Name)");
  console.log("    6. Engagements → Add 'Contact Email' field (type: Lookup → Contact → Email)");
  console.log("    7. Engagements → 'Sessions Remaining': convert to Formula → {Sessions Contracted} - {Sessions Completed}");
  console.log("  Views (Contacts):");
  console.log("    8.  Funnel (Kanban, grouped by Stage)");
  console.log("    9.  All Contacts (Grid)");
  console.log("    10. Active Pipeline (Grid, filter: Stage not SERVE/NURTURE/BACK BURNER/ARCHIVE)");
  console.log("    11. Clients — SERVE (Grid, filter: Stage = SERVE)");
  console.log("    12. Nurture List (Grid, filter: Stage = NURTURE)");
  console.log("    13. Partners (Grid, filter: Stage = PARTNER)");
  console.log("    14. SVI / SVN (Grid, filter: Source contains SVI)");
  console.log("    15. New This Week (Grid, filter: Created is within past week)");
  console.log("  Views (Engagements):");
  console.log("    16. Active Engagements (Grid, filter: Status = Active)");
  console.log("    17. All Engagements (Grid)");
  console.log("    18. Expiring Soon (Grid, filter: Expiration Date is within next 30 days)");
  console.log("See README.md for full view filter specifications.\n");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
