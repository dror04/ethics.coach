#!/usr/bin/env node
/**
 * import_monday.js
 * Imports contacts from a Monday.com CSV export into the Airtable Contacts table.
 *
 * Usage: node import_monday.js monday_export.csv
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const axios = require("axios");

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!API_KEY || !BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env");
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node import_monday.js <path-to-csv>");
  process.exit(1);
}

const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/Contacts`;
const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Column Mapping ──────────────────────────────────────────────────────────

const COLUMN_MAP = {
  "Contact": "Name",
  "First Name": "First Name",
  "Email": "Email",
  "LinkedIn": "LinkedIn",
  "Newsletter": "Newsletter",
  "Status": "Stage",
  "Last Interaction": "Last Interaction",
  "Location": "Location",
  "Address": "Location",
  "Company": "Company",
  "Role": "Role",
  "Link": "Website",
  "Source": "Source",
  "Label": "Source",
  "Propose": "Propose Amount",
  "Yes/No": "Proposal Response",
  "Fee": "Fee",
  "Sessions": "Sessions",
  "Contract Date": "Contract Date",
  "Expiration Date": "Expiration Date",
  "Package": "Package",
  "Comments": "Comments",
};

const STAGE_ORDER = [
  "NEW", "OUTREACH", "CONNECT", "MEET", "INVITE",
  "CREATE", "PROPOSE", "SERVE", "NURTURE", "BACK BURNER",
  "ARCHIVE", "PARTNER",
];

const VALID_STAGES = new Set(STAGE_ORDER);

const VALID_SOURCES = new Set([
  "AMA", "JEI", "SVI", "IMMA", "Zebras", "Berlin", "BASE",
  "Climate-Week", "POD 2025", "C-Suite SusPGH", "RISC",
  "PGH Tomorrow", "Amy Wilson", "Newsletter",
  "Scheduling Link", "Referral", "LinkedIn", "Other",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stageIndex(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? -1 : idx;
}

function normalizeStage(raw) {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (VALID_STAGES.has(upper)) return upper;
  // Try partial match
  for (const s of STAGE_ORDER) {
    if (s.includes(upper) || upper.includes(s)) return s;
  }
  return null;
}

function parseCheckbox(val) {
  if (!val) return false;
  const v = val.toString().trim().toLowerCase();
  return v === "✓" || v === "true" || v === "yes" || v === "1" || v === "v";
}

function parseCurrency(val) {
  if (!val) return null;
  const cleaned = val.toString().replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

function parseSource(val) {
  if (!val) return [];
  const parts = val.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return parts.filter((s) => {
    // Try to match against valid sources (case-insensitive)
    for (const vs of VALID_SOURCES) {
      if (vs.toLowerCase() === s.toLowerCase()) return true;
    }
    return false;
  }).map((s) => {
    for (const vs of VALID_SOURCES) {
      if (vs.toLowerCase() === s.toLowerCase()) return vs;
    }
    return s;
  });
}

function parseNumber(val) {
  if (!val) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function mapRow(row, sheetStage) {
  const record = {};

  for (const [mondayCol, airtableField] of Object.entries(COLUMN_MAP)) {
    const val = row[mondayCol];
    if (val === undefined || val === null || val.toString().trim() === "") continue;

    switch (airtableField) {
      case "LinkedIn":
      case "Newsletter":
        record[airtableField] = parseCheckbox(val);
        break;
      case "Stage":
        record[airtableField] = normalizeStage(val);
        break;
      case "Last Interaction":
      case "Contract Date":
      case "Expiration Date":
        record[airtableField] = parseDate(val);
        break;
      case "Source": {
        const sources = parseSource(val);
        if (sources.length > 0) record[airtableField] = sources;
        break;
      }
      case "Propose Amount":
      case "Fee":
        record[airtableField] = parseCurrency(val);
        break;
      case "Sessions":
        record[airtableField] = parseNumber(val);
        break;
      default:
        // Don't overwrite an already-set field (e.g., Location from "Location" vs "Address")
        if (!record[airtableField]) {
          record[airtableField] = val.toString().trim();
        }
    }
  }

  // Infer stage from sheet name if missing
  if (!record.Stage && sheetStage) {
    record.Stage = normalizeStage(sheetStage);
  }

  return record;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function detectSheetBoundaries(content) {
  // Monday.com multi-sheet exports have blank lines followed by a header-like row.
  // We try to detect sheets by looking for patterns like: "GroupName" header row, then data.
  // If no multi-sheet pattern, treat as single sheet.
  const lines = content.split("\n");
  const sheets = [];
  let currentSheet = { name: null, lines: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect a "group header" — a line with a single non-CSV value followed by CSV headers
    if (line === "" && currentSheet.lines.length > 0) {
      // Check if the next non-empty line looks like a new header
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length) {
        const nextLine = lines[j].trim();
        // If we see a line that looks like a group name (no commas or just a simple label)
        // followed by a header-like line, start a new sheet
        if (!nextLine.includes(",") && j + 1 < lines.length && lines[j + 1].includes(",")) {
          if (currentSheet.lines.length > 0) {
            sheets.push(currentSheet);
          }
          currentSheet = { name: nextLine, lines: [] };
          i = j; // skip to the group name line; the header will be next
          continue;
        }
      }
      continue;
    }

    if (line) currentSheet.lines.push(lines[i]);
  }

  if (currentSheet.lines.length > 0) {
    sheets.push(currentSheet);
  }

  return sheets.length > 0 ? sheets : [{ name: null, lines: content.split("\n") }];
}

function parseCSVContent(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const allRecords = [];

  // First, try parsing as a single CSV
  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    if (records.length > 0) {
      // Check if there's a "Group" or "Section" column that indicates the stage
      for (const rec of records) {
        const sheetStage = rec["Group"] || rec["Section"] || null;
        allRecords.push({ row: rec, sheetStage });
      }
      return allRecords;
    }
  } catch {
    // Fall through to multi-sheet parsing
  }

  // Try multi-sheet parsing
  const sheets = detectSheetBoundaries(content);
  for (const sheet of sheets) {
    try {
      const sheetContent = sheet.lines.join("\n");
      const records = parse(sheetContent, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      });
      for (const rec of records) {
        allRecords.push({ row: rec, sheetStage: sheet.name });
      }
    } catch {
      // Skip unparseable sheets
    }
  }

  return allRecords;
}

// ─── Airtable Upload ────────────────────────────────────────────────────────

async function uploadBatch(records) {
  const res = await axios.post(AIRTABLE_URL, { records }, { headers });
  return res.data.records;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Monday.com → Airtable Import");
  console.log("═══════════════════════════════════════════════\n");

  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Reading: ${resolvedPath}\n`);

  // Parse CSV
  const rawRecords = parseCSVContent(resolvedPath);
  console.log(`Rows found in CSV: ${rawRecords.length}`);

  // Map and deduplicate
  const mapped = rawRecords.map(({ row, sheetStage }) => mapRow(row, sheetStage)).filter((r) => r.Name);

  // Deduplicate by email — keep the more advanced stage
  const byEmail = new Map();
  let dupeCount = 0;
  for (const rec of mapped) {
    const email = (rec.Email || "").toLowerCase().trim();
    if (!email) {
      // No email — keep it (can't dedupe)
      byEmail.set(`__no_email_${byEmail.size}`, rec);
      continue;
    }
    if (byEmail.has(email)) {
      dupeCount++;
      const existing = byEmail.get(email);
      const existingIdx = stageIndex(existing.Stage);
      const newIdx = stageIndex(rec.Stage);
      if (newIdx > existingIdx) {
        byEmail.set(email, rec);
      }
    } else {
      byEmail.set(email, rec);
    }
  }

  const uniqueRecords = Array.from(byEmail.values());
  console.log(`Unique records to import: ${uniqueRecords.length}`);
  console.log(`Duplicates skipped: ${dupeCount}\n`);

  // Format for Airtable
  const airtableRecords = uniqueRecords.map((fields) => {
    // Clean up null/undefined values
    const clean = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== null && v !== undefined && v !== "") {
        clean[k] = v;
      }
    }
    return { fields: clean };
  });

  // Upload in batches of 10
  let created = 0;
  let errors = 0;
  const batches = [];
  for (let i = 0; i < airtableRecords.length; i += 10) {
    batches.push(airtableRecords.slice(i, i + 10));
  }

  console.log(`Uploading ${batches.length} batches...\n`);

  for (let i = 0; i < batches.length; i++) {
    try {
      const result = await uploadBatch(batches[i]);
      created += result.length;
      console.log(`  Batch ${i + 1}/${batches.length}: ${result.length} records created`);
    } catch (err) {
      const msg = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error(`  Batch ${i + 1}/${batches.length}: ERROR — ${msg}`);
      errors += batches[i].length;
    }
    await sleep(200);
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Import Summary");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Total rows processed:  ${rawRecords.length}`);
  console.log(`  Records created:       ${created}`);
  console.log(`  Duplicates skipped:    ${dupeCount}`);
  console.log(`  Errors:                ${errors}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
