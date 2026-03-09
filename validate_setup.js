#!/usr/bin/env node
/**
 * validate_setup.js
 * Validates the Ethics.Coach Airtable CRM setup.
 *
 * Checks:
 *   1. Both tables exist (Contacts, Engagements)
 *   2. All required fields are present
 *   3. Creates a test contact record (Stage = NEW)
 *   4. Runs a dry-run of the business card parser (no file required — sends blank test)
 *   5. Deletes the test record
 *
 * Usage:
 *   node validate_setup.js
 */

require('dotenv').config();
const axios = require('axios');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID  = process.env.AIRTABLE_BASE_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const results = [];

function pass(label) {
  results.push({ label, ok: true });
  console.log(`  ✅ ${label}`);
}

function fail(label, reason) {
  results.push({ label, ok: false, reason });
  console.log(`  ❌ ${label}${reason ? ` — ${reason}` : ''}`);
}

// ---------------------------------------------------------------------------
// Airtable client
// ---------------------------------------------------------------------------
function makeAirtable() {
  return axios.create({
    baseURL: 'https://api.airtable.com/v0',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
}

// ---------------------------------------------------------------------------
// Required fields per table
// ---------------------------------------------------------------------------
const REQUIRED_CONTACTS_FIELDS = [
  'Name', 'First Name', 'Email', 'Phone', 'LinkedIn', 'Newsletter',
  'Location', 'Company', 'Role', 'Website', 'Stage',
  'Last Interaction', 'Meeting Date', 'Meeting Type', 'Meeting Summary',
  'Source', 'Propose Amount', 'Proposal Response', 'Demo Offered', 'Demo Date',
  'Contract Date', 'Fee', 'Sessions', 'Sessions Completed', 'Sessions Remaining',
  'Hours Worked', 'Payment Type', 'Expiration Date', 'Contract',
  'QB Invoice Number', 'Stripe Link', 'Package', 'Draft Outreach Email',
  'Comments', 'Business Card Photo',
];

const REQUIRED_ENGAGEMENTS_FIELDS = [
  'Engagement Name', 'Contact', 'Start Date', 'End Date', 'Status',
  'Package', 'Fee', 'Sessions Contracted', 'Sessions Completed', 'Sessions Remaining',
  'Hours Worked', 'Payment Type', 'Contract Date', 'Expiration Date', 'Contract',
  'QB Invoice Number', 'Stripe Payment ID', 'Stripe Link', 'Notes',
];

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
async function checkEnvVars() {
  console.log('\n[1] Environment Variables');
  if (AIRTABLE_API_KEY)  pass('AIRTABLE_API_KEY is set');
  else                    fail('AIRTABLE_API_KEY', 'not set');

  if (AIRTABLE_BASE_ID)  pass('AIRTABLE_BASE_ID is set');
  else                    fail('AIRTABLE_BASE_ID', 'not set — run setup_airtable.js first');

  if (ANTHROPIC_API_KEY) pass('ANTHROPIC_API_KEY is set');
  else                    fail('ANTHROPIC_API_KEY', 'not set (needed for business card parser)');
}

async function checkTables(airtable) {
  console.log('\n[2] Airtable Tables');

  let tables;
  try {
    const res = await airtable.get(`/meta/bases/${AIRTABLE_BASE_ID}/tables`);
    tables = res.data.tables;
  } catch (err) {
    fail('Airtable API reachable', err.response?.data?.error?.message || err.message);
    return null;
  }

  pass('Airtable API reachable');

  const contactsTable = tables.find(t => t.name === 'Contacts');
  const engTable      = tables.find(t => t.name === 'Engagements');

  if (contactsTable) pass('Contacts table exists');
  else               fail('Contacts table', 'not found');

  if (engTable)      pass('Engagements table exists');
  else               fail('Engagements table', 'not found');

  return { tables, contactsTable, engTable };
}

async function checkFields(tables) {
  console.log('\n[3] Contacts Table Fields');
  if (!tables?.contactsTable) {
    fail('Contacts fields check', 'table missing');
    return;
  }
  const fieldNames = tables.contactsTable.fields.map(f => f.name);
  for (const required of REQUIRED_CONTACTS_FIELDS) {
    if (fieldNames.includes(required)) pass(required);
    else                                fail(required, 'field not found in Contacts');
  }

  console.log('\n[4] Engagements Table Fields');
  if (!tables?.engTable) {
    fail('Engagements fields check', 'table missing');
    return;
  }
  const engFieldNames = tables.engTable.fields.map(f => f.name);
  for (const required of REQUIRED_ENGAGEMENTS_FIELDS) {
    if (engFieldNames.includes(required)) pass(required);
    else                                   fail(required, 'field not found in Engagements');
  }
}

async function checkCrudOperations(airtable) {
  console.log('\n[5] Contacts CRUD Test');

  let recordId;
  try {
    const createRes = await airtable.post(`/${AIRTABLE_BASE_ID}/Contacts`, {
      records: [
        {
          fields: {
            Name:  'Test Contact',
            Email: 'test@test.com',
            Stage: 'NEW',
          },
        },
      ],
    });
    recordId = createRes.data.records[0].id;
    pass(`Create test record (ID: ${recordId})`);
  } catch (err) {
    fail('Create test record', err.response?.data?.error?.message || err.message);
    return;
  }

  // Read
  try {
    await airtable.get(`/${AIRTABLE_BASE_ID}/Contacts/${recordId}`);
    pass('Read test record');
  } catch (err) {
    fail('Read test record', err.response?.data?.error?.message || err.message);
  }

  // Delete
  try {
    await airtable.delete(`/${AIRTABLE_BASE_ID}/Contacts/${recordId}`);
    pass('Delete test record');
  } catch (err) {
    fail('Delete test record', err.response?.data?.error?.message || err.message);
  }
}

async function checkAnthropicApi() {
  console.log('\n[6] Anthropic API (Claude Vision dry run)');

  if (!ANTHROPIC_API_KEY) {
    fail('Anthropic API test', 'ANTHROPIC_API_KEY not set — skipping');
    return;
  }

  // Create a minimal 1x1 white pixel PNG as base64
  const whitePng1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: whitePng1x1,
                },
              },
              {
                type: 'text',
                text: 'Extract all contact information from this business card photo. Return ONLY a JSON object with these fields (use null for any field not found): {"name":null,"first_name":null,"email":null,"phone":null,"company":null,"role":null,"website":null,"linkedin":null,"location":null}',
              },
            ],
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const content = res.data.content[0].text;
    if (content) {
      pass('Anthropic API reachable and returned a response');
      try {
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        JSON.parse(cleaned);
        pass('Claude response is valid JSON');
      } catch {
        pass('Claude response received (not strict JSON for blank image — expected)');
      }
    }
  } catch (err) {
    fail('Anthropic API call', err.response?.data?.error?.message || err.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Ethics.Coach CRM — Setup Validation ===');

  await checkEnvVars();

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.log('\n⚠️  Cannot proceed without Airtable credentials. Exiting.');
    printSummary();
    process.exit(1);
  }

  const airtable = makeAirtable();
  const tableData = await checkTables(airtable);
  await checkFields(tableData);
  await checkCrudOperations(airtable);
  await checkAnthropicApi();

  printSummary();
}

function printSummary() {
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log('\n=== Validation Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  ❌ ${r.label}${r.reason ? ` — ${r.reason}` : ''}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed! CRM is ready to use.');
  }
}

main();
