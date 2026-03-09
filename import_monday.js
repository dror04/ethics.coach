#!/usr/bin/env node
/**
 * import_monday.js
 * Imports a Monday.com CSV export into the Airtable Contacts table.
 *
 * Usage:
 *   node import_monday.js monday_export.csv
 *
 * The script handles:
 *   - Single-sheet and multi-sheet Monday exports (multiple CSV files or a single CSV)
 *   - Column name mapping from Monday → Airtable
 *   - Deduplication by Email (keeps the record with the more advanced Stage)
 *   - Batch uploads of 10 records at a time
 *   - 200ms delay between batches to respect rate limits
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('ERROR: AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set in .env');
  process.exit(1);
}

const airtable = axios.create({
  baseURL: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`,
  headers: {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Stage ordering for deduplication (higher index = more advanced)
// ---------------------------------------------------------------------------
const STAGE_ORDER = [
  'ARCHIVE', 'BACK BURNER', 'NURTURE', 'NEW', 'OUTREACH', 'CONNECT',
  'MEET', 'INVITE', 'CREATE', 'PROPOSE', 'SERVE', 'PARTNER',
];

function stageRank(stage) {
  if (!stage) return -1;
  const idx = STAGE_ORDER.indexOf(stage.toUpperCase().trim());
  return idx === -1 ? -1 : idx;
}

// ---------------------------------------------------------------------------
// Monday → Airtable column mapping
// ---------------------------------------------------------------------------
const COLUMN_MAP = {
  'Contact':          'Name',
  'First Name':       'First Name',
  'Email':            'Email',
  'LinkedIn':         'LinkedIn',
  'Newsletter':       'Newsletter',
  'Status':           'Stage',
  'Last Interaction': 'Last Interaction',
  'Location':         'Location',
  'Address':          'Location',
  'Company':          'Company',
  'Role':             'Role',
  'Link':             'Website',
  'Source':           'Source',
  'Label':            'Source',
  'Propose':          'Propose Amount',
  'Yes/No':           'Proposal Response',
  'Fee':              'Fee',
  'Sessions':         'Sessions',
  'Contract Date':    'Contract Date',
  'Expiration Date':  'Expiration Date',
  'Package':          'Package',
  'Comments':         'Comments',
};

// Monday stage names → Airtable Stage values
const STAGE_MAP = {
  'new':         'NEW',
  'outreach':    'OUTREACH',
  'connect':     'CONNECT',
  'meet':        'MEET',
  'invite':      'INVITE',
  'create':      'CREATE',
  'propose':     'PROPOSE',
  'serve':       'SERVE',
  'nurture':     'NURTURE',
  'back burner': 'BACK BURNER',
  'archive':     'ARCHIVE',
  'partner':     'PARTNER',
};

function normalizeStage(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return STAGE_MAP[lower] || raw.toUpperCase().trim();
}

// ---------------------------------------------------------------------------
// Row transformation
// ---------------------------------------------------------------------------
function transformRow(row, inferredStage) {
  const record = {};

  for (const [mondayCol, airtableField] of Object.entries(COLUMN_MAP)) {
    let value = row[mondayCol];
    if (value === undefined || value === null || value === '') continue;
    value = String(value).trim();

    switch (airtableField) {
      case 'LinkedIn':
      case 'Newsletter':
        record[airtableField] = value === '✓' || value.toLowerCase() === 'true' || value === '1';
        break;

      case 'Stage':
        if (!record['Stage']) {
          record['Stage'] = normalizeStage(value);
        }
        break;

      case 'Source': {
        // Split comma-separated values into an array
        const parts = value.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
        record['Source'] = parts;
        break;
      }

      case 'Propose Amount':
      case 'Fee': {
        const num = parseFloat(value.replace(/[$,\s]/g, ''));
        if (!isNaN(num)) record[airtableField] = num;
        break;
      }

      case 'Sessions': {
        const n = parseInt(value, 10);
        if (!isNaN(n)) record[airtableField] = n;
        break;
      }

      case 'Last Interaction':
      case 'Contract Date':
      case 'Expiration Date': {
        // Attempt ISO date parse; skip if invalid
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          record[airtableField] = d.toISOString().slice(0, 10);
        }
        break;
      }

      default:
        // Avoid overwriting a previously mapped field (e.g., Address vs Location)
        if (!record[airtableField]) {
          record[airtableField] = value;
        }
    }
  }

  // If no stage found in row, use inferred stage from sheet name
  if (!record['Stage'] && inferredStage) {
    record['Stage'] = normalizeStage(inferredStage);
  }

  return record;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------
function parseCsvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  return rows;
}

/**
 * Infer the stage from the filename when the CSV represents a single board group.
 * e.g., "outreach_contacts.csv" → "OUTREACH"
 */
function inferStageFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  for (const stageName of Object.keys(STAGE_MAP)) {
    if (base.includes(stageName.replace(' ', '_')) || base.includes(stageName.replace(' ', '-'))) {
      return stageName;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
function deduplicateByEmail(records) {
  const map = new Map(); // email → record

  for (const rec of records) {
    const email = (rec['Email'] || '').toLowerCase().trim();
    if (!email) {
      // No email — keep as-is (can't deduplicate)
      map.set(`__no_email_${Math.random()}`, rec);
      continue;
    }
    if (!map.has(email)) {
      map.set(email, rec);
    } else {
      const existing = map.get(email);
      const existingRank = stageRank(existing['Stage']);
      const newRank = stageRank(rec['Stage']);
      if (newRank > existingRank) {
        map.set(email, rec);
      }
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Airtable upload
// ---------------------------------------------------------------------------
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function uploadToAirtable(records) {
  const chunks = chunkArray(records, 10);
  let created = 0;
  let errors = 0;

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];
    const payload = {
      records: batch.map(fields => ({ fields })),
    };

    try {
      const res = await airtable.post('/Contacts', payload);
      created += res.data.records.length;
      process.stdout.write(`  Batch ${i + 1}/${chunks.length} — uploaded ${res.data.records.length} records\r`);
    } catch (err) {
      errors += batch.length;
      const msg = err.response?.data?.error?.message || err.message;
      console.error(`\n  ERROR in batch ${i + 1}: ${msg}`);
      if (err.response?.data) {
        console.error('  Details:', JSON.stringify(err.response.data, null, 2));
      }
    }

    await sleep(200);
  }
  process.stdout.write('\n');

  return { created, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node import_monday.js <monday_export.csv> [additional_sheets.csv ...]');
    process.exit(1);
  }

  console.log('=== Ethics.Coach — Monday.com → Airtable Import ===\n');

  let allRawRecords = [];
  let totalRows = 0;

  for (const filePath of args) {
    if (!fs.existsSync(filePath)) {
      console.error(`ERROR: File not found: ${filePath}`);
      process.exit(1);
    }

    const inferredStage = inferStageFromFilename(filePath);
    console.log(`Reading: ${filePath}${inferredStage ? ` (inferred stage: ${inferredStage})` : ''}`);

    const rows = parseCsvFile(filePath);
    console.log(`  Rows: ${rows.length}`);
    totalRows += rows.length;

    for (const row of rows) {
      const record = transformRow(row, inferredStage);
      // Only include records that have at least a Name or Email
      if (record['Name'] || record['Email']) {
        allRawRecords.push(record);
      }
    }
  }

  console.log(`\nTotal rows processed: ${totalRows}`);
  console.log(`Records with name/email: ${allRawRecords.length}`);

  const deduped = deduplicateByEmail(allRawRecords);
  const duplicatesSkipped = allRawRecords.length - deduped.length;
  console.log(`After deduplication: ${deduped.length} records (${duplicatesSkipped} duplicates skipped)`);

  if (deduped.length === 0) {
    console.log('\nNo records to upload.');
    return;
  }

  console.log(`\nUploading ${deduped.length} records to Airtable in batches of 10…`);
  const { created, errors } = await uploadToAirtable(deduped);

  console.log('\n=== Import Summary ===');
  console.log(`Total rows processed:  ${totalRows}`);
  console.log(`Records created:       ${created}`);
  console.log(`Duplicates skipped:    ${duplicatesSkipped}`);
  console.log(`Errors:                ${errors}`);

  if (errors > 0) {
    console.log('\n⚠️  Some records failed to upload. Check error messages above.');
    process.exit(1);
  } else {
    console.log('\n✅ Import complete!');
  }
}

main();
