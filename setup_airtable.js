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

  // Add lookup fields for Contact Name and Contact Email
  if (contactLinkFieldId) {
    // Find the Name and Email field IDs in Contacts table
    const refreshedTables = await apiCall("get", tablesUrl);
    const refreshedContacts = refreshedTables.tables.find((t) => t.name === "Contacts");
    const nameFieldId = refreshedContacts.fields.find((f) => f.name === "Name")?.id;
    const emailFieldId = refreshedContacts.fields.find((f) => f.name === "Email")?.id;

    const lookups = [
      { name: "Contact Name", fieldIdInLinkedTable: nameFieldId },
      { name: "Contact Email", fieldIdInLinkedTable: emailFieldId },
    ];

    for (const lk of lookups) {
      if (engExistingFields.has(lk.name)) {
        console.log(`  ⏭  ${lk.name} (already exists)`);
        continue;
      }
      if (!lk.fieldIdInLinkedTable) {
        console.log(`  ⚠️  Skipping ${lk.name} — source field not found`);
        continue;
      }
      await apiCall("post", `${tablesUrl}/${engTableId}/fields`, {
        name: lk.name,
        type: "lookup",
        options: {
          fieldIdInLinkedTable: lk.fieldIdInLinkedTable,
          recordLinkFieldId: contactLinkFieldId,
        },
      });
      console.log(`  ✅ ${lk.name} (lookup)`);
    }
  }

  console.log("");

  // ── Step 6: Create Views ──────────────────────────────────────────────────
  console.log("Creating views...");

  // Helper: get Stage field ID and choice IDs
  const refreshedTables2 = await apiCall("get", tablesUrl);
  const contactsRefreshed = refreshedTables2.tables.find((t) => t.name === "Contacts");
  const stageField = contactsRefreshed.fields.find((f) => f.name === "Stage");
  const sourceField = contactsRefreshed.fields.find((f) => f.name === "Source");
  const createdField = contactsRefreshed.fields.find((f) => f.name === "Created");
  const lastInteractionField = contactsRefreshed.fields.find((f) => f.name === "Last Interaction");

  const engRefreshed = refreshedTables2.tables.find((t) => t.name === "Engagements");
  const statusField = engRefreshed.fields.find((f) => f.name === "Status");
  const expDateField = engRefreshed.fields.find((f) => f.name === "Expiration Date");
  const startDateField = engRefreshed.fields.find((f) => f.name === "Start Date");

  // Note: Airtable Meta API view creation is limited — we create grid views
  // and note that filters/grouping may need manual setup for complex views
  const viewsUrl = (tableId) => `https://api.airtable.com/v0/meta/bases/${BASE_ID}/views`;

  // Contacts views
  const contactViews = [
    { name: "Funnel", type: "kanban" },
    { name: "All Contacts", type: "grid" },
    { name: "Active Pipeline", type: "grid" },
    { name: "Clients — SERVE", type: "grid" },
    { name: "Nurture List", type: "grid" },
    { name: "Partners", type: "grid" },
    { name: "SVI / SVN", type: "grid" },
    { name: "New This Week", type: "grid" },
  ];

  // Airtable Meta API doesn't support direct view creation with filters via REST.
  // We create the views and print instructions for manual filter setup.
  // Use the table-level view creation endpoint.
  for (const view of contactViews) {
    try {
      await apiCall("post", `${tablesUrl}/${contactsTableId}/views`, {
        name: view.name,
        type: view.type === "kanban" ? "kanban" : "grid",
      });
      console.log(`  ✅ Contacts → ${view.name}`);
    } catch (e) {
      // View may already exist or API may not support this
      console.log(`  ⚠️  Contacts → ${view.name} (may need manual creation)`);
    }
  }

  // Engagements views
  const engViews = [
    { name: "Active Engagements", type: "grid" },
    { name: "All Engagements", type: "grid" },
    { name: "Expiring Soon", type: "grid" },
  ];

  for (const view of engViews) {
    try {
      await apiCall("post", `${tablesUrl}/${engTableId}/views`, {
        name: view.name,
        type: "grid",
      });
      console.log(`  ✅ Engagements → ${view.name}`);
    } catch (e) {
      console.log(`  ⚠️  Engagements → ${view.name} (may need manual creation)`);
    }
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Setup Complete!");
  console.log("═══════════════════════════════════════════════");
  console.log(`\nBase ID: ${BASE_ID}`);
  console.log(`Contacts Table ID: ${contactsTableId}`);
  console.log(`Engagements Table ID: ${engTableId}`);
  console.log("\nManual steps needed:");
  console.log("  1. Contacts → Add 'Created' field (type: Created time)");
  console.log("  2. Contacts → Add 'Modified' field (type: Last modified time)");
  console.log("  3. Contacts → 'Sessions Remaining': convert to Formula → {Sessions} - {Sessions Completed}");
  console.log("  4. Engagements → Add 'Created' field (type: Created time)");
  console.log("  5. Engagements → 'Sessions Remaining': convert to Formula → {Sessions Contracted} - {Sessions Completed}");
  console.log("  6. Some views may require manual filter/sort configuration in Airtable UI.");
  console.log("See README.md for view filter specifications.\n");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
