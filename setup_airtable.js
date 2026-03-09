#!/usr/bin/env node
/**
 * setup_airtable.js
 * Creates the Ethics.Coach CRM base, tables, fields, and views in Airtable.
 * Run once: node setup_airtable.js
 * After completion, copy the printed BASE_ID into your .env file.
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_WORKSPACE_ID = process.env.AIRTABLE_WORKSPACE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_WORKSPACE_ID) {
  console.error('ERROR: AIRTABLE_API_KEY and AIRTABLE_WORKSPACE_ID must be set in .env');
  process.exit(1);
}

const airtable = axios.create({
  baseURL: 'https://api.airtable.com/v0',
  headers: {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// TASK 1A — Create Base
// ---------------------------------------------------------------------------
async function createBase() {
  console.log('Creating Airtable base "Ethics.Coach CRM"…');
  const res = await airtable.post('/meta/bases', {
    name: 'Ethics.Coach CRM',
    workspaceId: AIRTABLE_WORKSPACE_ID,
    tables: [
      {
        name: 'Contacts',
        description: 'Primary contacts table — holds every person across all pipeline stages',
        fields: [
          { name: 'Name', type: 'singleLineText', description: 'Full name (primary field)' },
        ],
      },
    ],
  });
  const baseId = res.data.id;
  console.log(`✅ Base created: ${baseId}`);
  return baseId;
}

// ---------------------------------------------------------------------------
// TASK 1B — Build Contacts table fields
// ---------------------------------------------------------------------------
async function createContactsFields(baseId, tableId) {
  console.log('Adding fields to Contacts table…');

  const fields = [
    { name: 'First Name', type: 'singleLineText' },
    { name: 'Email', type: 'email' },
    { name: 'Phone', type: 'phoneNumber' },
    { name: 'LinkedIn', type: 'checkbox', options: { icon: 'check', color: 'blueBright' } },
    { name: 'Newsletter', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Location', type: 'singleLineText' },
    { name: 'Company', type: 'singleLineText' },
    { name: 'Role', type: 'singleLineText' },
    {
      name: 'Website',
      type: 'url',
    },
    {
      name: 'Stage',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'NEW',         color: 'greenBright' },
          { name: 'OUTREACH',    color: 'tealBright' },
          { name: 'CONNECT',     color: 'blueBright' },
          { name: 'MEET',        color: 'yellowBright' },
          { name: 'INVITE',      color: 'orangeBright' },
          { name: 'CREATE',      color: 'purpleBright' },
          { name: 'PROPOSE',     color: 'pinkBright' },
          { name: 'SERVE',       color: 'greenDark1' },
          { name: 'NURTURE',     color: 'yellowLight1' },
          { name: 'BACK BURNER', color: 'gray' },
          { name: 'ARCHIVE',     color: 'grayLight1' },
          { name: 'PARTNER',     color: 'tealLight1' },
        ],
      },
    },
    { name: 'Last Interaction', type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Meeting Date',     type: 'date', options: { dateFormat: { name: 'us' } } },
    {
      name: 'Meeting Type',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Zoom' },
          { name: 'In-Person' },
          { name: 'Phone' },
          { name: 'Reclaim' },
        ],
      },
    },
    { name: 'Meeting Summary', type: 'multilineText' },
    {
      name: 'Source',
      type: 'multipleSelects',
      options: {
        choices: [
          { name: 'AMA' },
          { name: 'JEI' },
          { name: 'SVI' },
          { name: 'IMMA' },
          { name: 'Zebras' },
          { name: 'Berlin' },
          { name: 'BASE' },
          { name: 'Climate-Week' },
          { name: 'POD 2025' },
          { name: 'C-Suite SusPGH' },
          { name: 'RISC' },
          { name: 'PGH Tomorrow' },
          { name: 'Amy Wilson' },
          { name: 'Newsletter' },
          { name: 'Scheduling Link' },
          { name: 'Referral' },
          { name: 'LinkedIn' },
          { name: 'Other' },
        ],
      },
    },
    {
      name: 'Propose Amount',
      type: 'currency',
      options: { precision: 2, symbol: '$' },
    },
    {
      name: 'Proposal Response',
      type: 'singleSelect',
      options: { choices: [{ name: 'Yes' }, { name: 'No' }, { name: 'Pending' }] },
    },
    { name: 'Demo Offered', type: 'checkbox', options: { icon: 'check', color: 'blueBright' } },
    { name: 'Demo Date',    type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Contract Date',    type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Fee',              type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Sessions',         type: 'number',   options: { precision: 0 } },
    { name: 'Sessions Completed', type: 'number', options: { precision: 0 } },
    {
      name: 'Sessions Remaining',
      type: 'formula',
      options: { formula: '{Sessions} - {Sessions Completed}' },
    },
    { name: 'Hours Worked', type: 'number', options: { precision: 2 } },
    {
      name: 'Payment Type',
      type: 'singleSelect',
      options: { choices: [{ name: 'One-Time' }, { name: 'Monthly Recurring' }] },
    },
    { name: 'Expiration Date',  type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Contract',         type: 'multipleAttachments' },
    { name: 'QB Invoice Number', type: 'singleLineText' },
    { name: 'Stripe Link',      type: 'url' },
    { name: 'Package',          type: 'singleLineText' },
    { name: 'Draft Outreach Email', type: 'multilineText' },
    { name: 'Comments',         type: 'multilineText' },
    { name: 'Business Card Photo', type: 'multipleAttachments' },
  ];

  for (const field of fields) {
    try {
      await airtable.post(`/meta/bases/${baseId}/tables/${tableId}/fields`, field);
      console.log(`  + Field: ${field.name}`);
      await sleep(200);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn(`  ! Could not create field "${field.name}": ${msg}`);
    }
  }
  console.log('✅ Contacts fields created.');
}

// ---------------------------------------------------------------------------
// TASK 1C — Create Engagements table
// ---------------------------------------------------------------------------
async function createEngagementsTable(baseId) {
  console.log('Creating Engagements table…');
  const res = await airtable.post(`/meta/bases/${baseId}/tables`, {
    name: 'Engagements',
    description: 'One record per coaching engagement. Linked to Contacts.',
    fields: [
      { name: 'Engagement Name', type: 'singleLineText', description: 'Auto-name: {Contact} — {Start Date}' },
    ],
  });
  const tableId = res.data.id;
  console.log(`✅ Engagements table created: ${tableId}`);
  return tableId;
}

async function createEngagementsFields(baseId, engTableId, contactsTableId) {
  console.log('Adding fields to Engagements table…');

  const fields = [
    {
      name: 'Contact',
      type: 'multipleRecordLinks',
      options: {
        linkedTableId: contactsTableId,
        prefersSingleRecordLink: true,
      },
    },
    {
      name: 'Contact Name',
      type: 'multipleLookupValues',
      options: {
        fieldIdInLinkedTable: null, // set after we know the field id
        recordLinkFieldId: null,
      },
    },
    {
      name: 'Contact Email',
      type: 'multipleLookupValues',
      options: {
        fieldIdInLinkedTable: null,
        recordLinkFieldId: null,
      },
    },
    { name: 'Start Date',  type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'End Date',    type: 'date', options: { dateFormat: { name: 'us' } } },
    {
      name: 'Status',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Active',    color: 'greenBright' },
          { name: 'Completed', color: 'blueBright' },
          { name: 'Paused',    color: 'yellowBright' },
          { name: 'Cancelled', color: 'redBright' },
        ],
      },
    },
    { name: 'Package',            type: 'singleLineText' },
    { name: 'Fee',                type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Sessions Contracted', type: 'number',  options: { precision: 0 } },
    { name: 'Sessions Completed', type: 'number',   options: { precision: 0 } },
    {
      name: 'Sessions Remaining',
      type: 'formula',
      options: { formula: '{Sessions Contracted} - {Sessions Completed}' },
    },
    { name: 'Hours Worked', type: 'number', options: { precision: 2 } },
    {
      name: 'Payment Type',
      type: 'singleSelect',
      options: { choices: [{ name: 'One-Time' }, { name: 'Monthly Recurring' }] },
    },
    { name: 'Contract Date',    type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Expiration Date',  type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Contract',         type: 'multipleAttachments' },
    { name: 'QB Invoice Number', type: 'singleLineText' },
    { name: 'Stripe Payment ID', type: 'singleLineText' },
    { name: 'Stripe Link',      type: 'url' },
    { name: 'Notes',            type: 'multilineText' },
  ];

  // Skip lookup fields — they require field IDs which we don't have at creation time.
  // Create all non-lookup fields first.
  const nonLookup = fields.filter(f => f.type !== 'multipleLookupValues');

  for (const field of nonLookup) {
    try {
      await airtable.post(`/meta/bases/${baseId}/tables/${engTableId}/fields`, field);
      console.log(`  + Field: ${field.name}`);
      await sleep(200);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn(`  ! Could not create field "${field.name}": ${msg}`);
    }
  }

  // Now set up lookup fields using actual field IDs
  await createLookupFields(baseId, engTableId, contactsTableId);

  console.log('✅ Engagements fields created.');
}

async function createLookupFields(baseId, engTableId, contactsTableId) {
  // Fetch field IDs from Contacts table
  let nameFieldId, emailFieldId, contactLinkFieldId;
  try {
    const tablesRes = await airtable.get(`/meta/bases/${baseId}/tables`);
    const contactsTable = tablesRes.data.tables.find(t => t.id === contactsTableId);
    const engTable = tablesRes.data.tables.find(t => t.id === engTableId);

    if (contactsTable) {
      const nameField  = contactsTable.fields.find(f => f.name === 'Name');
      const emailField = contactsTable.fields.find(f => f.name === 'Email');
      nameFieldId  = nameField?.id;
      emailFieldId = emailField?.id;
    }
    if (engTable) {
      const linkField = engTable.fields.find(f => f.name === 'Contact');
      contactLinkFieldId = linkField?.id;
    }
  } catch (err) {
    console.warn('  ! Could not fetch field IDs for lookup setup:', err.message);
    return;
  }

  if (!nameFieldId || !emailFieldId || !contactLinkFieldId) {
    console.warn('  ! Missing field IDs — skipping lookup field creation. Add them manually in Airtable.');
    return;
  }

  const lookupFields = [
    {
      name: 'Contact Name',
      type: 'multipleLookupValues',
      options: {
        fieldIdInLinkedTable: nameFieldId,
        recordLinkFieldId: contactLinkFieldId,
      },
    },
    {
      name: 'Contact Email',
      type: 'multipleLookupValues',
      options: {
        fieldIdInLinkedTable: emailFieldId,
        recordLinkFieldId: contactLinkFieldId,
      },
    },
  ];

  for (const field of lookupFields) {
    try {
      await airtable.post(`/meta/bases/${baseId}/tables/${engTableId}/fields`, field);
      console.log(`  + Lookup Field: ${field.name}`);
      await sleep(200);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn(`  ! Could not create lookup field "${field.name}": ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// TASK 1D — Create Views
// ---------------------------------------------------------------------------
async function createContactsViews(baseId, tableId) {
  console.log('Creating Contacts views…');

  const views = [
    {
      name: 'All Contacts',
      type: 'grid',
    },
    {
      name: 'Active Pipeline',
      type: 'grid',
    },
    {
      name: 'Clients — SERVE',
      type: 'grid',
    },
    {
      name: 'Nurture List',
      type: 'grid',
    },
    {
      name: 'Partners',
      type: 'grid',
    },
    {
      name: 'SVI / SVN',
      type: 'grid',
    },
    {
      name: 'New This Week',
      type: 'grid',
    },
    {
      name: 'Funnel',
      type: 'kanban',
    },
  ];

  for (const view of views) {
    try {
      await airtable.post(`/meta/bases/${baseId}/tables/${tableId}/views`, view);
      console.log(`  + View: ${view.name}`);
      await sleep(200);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn(`  ! Could not create view "${view.name}": ${msg}`);
    }
  }
  console.log('✅ Contacts views created.');
  console.log('  NOTE: View filters (Active Pipeline, Clients, etc.) must be configured');
  console.log('  manually in Airtable UI or via the Airtable web app.');
}

async function createEngagementsViews(baseId, tableId) {
  console.log('Creating Engagements views…');

  const views = [
    { name: 'Active Engagements', type: 'grid' },
    { name: 'All Engagements',    type: 'grid' },
    { name: 'Expiring Soon',      type: 'grid' },
  ];

  for (const view of views) {
    try {
      await airtable.post(`/meta/bases/${baseId}/tables/${tableId}/views`, view);
      console.log(`  + View: ${view.name}`);
      await sleep(200);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn(`  ! Could not create view "${view.name}": ${msg}`);
    }
  }
  console.log('✅ Engagements views created.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Ethics.Coach CRM — Airtable Setup ===\n');

  try {
    // 1A — Create base
    const baseId = await createBase();
    await sleep(1000);

    // Fetch initial table list to get the auto-created "Contacts" table id
    const tablesRes = await airtable.get(`/meta/bases/${baseId}/tables`);
    const contactsTable = tablesRes.data.tables.find(t => t.name === 'Contacts');
    if (!contactsTable) {
      throw new Error('Could not find auto-created Contacts table');
    }
    const contactsTableId = contactsTable.id;
    console.log(`Contacts table ID: ${contactsTableId}`);

    // 1B — Add Contacts fields
    await createContactsFields(baseId, contactsTableId);
    await sleep(500);

    // 1C — Create Engagements table
    const engTableId = await createEngagementsTable(baseId);
    await sleep(500);
    await createEngagementsFields(baseId, engTableId, contactsTableId);
    await sleep(500);

    // 1D — Create views
    await createContactsViews(baseId, contactsTableId);
    await sleep(500);
    await createEngagementsViews(baseId, engTableId);

    // Update .env with new base ID
    console.log('\n=== Setup Complete ===\n');
    console.log(`BASE ID: ${baseId}`);
    console.log(`CONTACTS TABLE ID: ${contactsTableId}`);
    console.log(`ENGAGEMENTS TABLE ID: ${engTableId}`);
    console.log('\n⚠️  ACTION REQUIRED: Add the following to your .env file:');
    console.log(`AIRTABLE_BASE_ID=${baseId}`);
    console.log(`AIRTABLE_CONTACTS_TABLE_ID=${contactsTableId}`);
    console.log(`AIRTABLE_ENGAGEMENTS_TABLE_ID=${engTableId}`);

    // Write IDs to a local file for convenience
    const config = {
      baseId,
      contactsTableId,
      engTableId,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync('.airtable_ids.json', JSON.stringify(config, null, 2));
    console.log('\n✅ IDs saved to .airtable_ids.json');

  } catch (err) {
    if (err.response) {
      console.error('Airtable API Error:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

main();
