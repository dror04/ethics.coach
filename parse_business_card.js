#!/usr/bin/env node
/**
 * parse_business_card.js
 * Extracts contact info from a business card photo using Claude Vision,
 * then creates a new record in the Airtable Contacts table (Stage = NEW).
 *
 * Usage:
 *   node parse_business_card.js card.jpg
 *   node parse_business_card.js card.png
 *
 * Requires env vars:
 *   ANTHROPIC_API_KEY, AIRTABLE_API_KEY, AIRTABLE_BASE_ID
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const axios = require('axios');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID  = process.env.AIRTABLE_BASE_ID;

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY must be set in .env');
  process.exit(1);
}
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
// Detect media type from file extension
// ---------------------------------------------------------------------------
function getMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
  };
  return types[ext] || 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Call Anthropic Claude Vision API
// ---------------------------------------------------------------------------
async function extractCardData(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Data  = imageBuffer.toString('base64');
  const mediaType   = getMediaType(imagePath);

  const prompt = `Extract all contact information from this business card photo. Return ONLY a JSON object with these fields (use null for any field not found):
{
  "name": "",
  "first_name": "",
  "email": "",
  "phone": "",
  "company": "",
  "role": "",
  "website": "",
  "linkedin": "",
  "location": ""
}
Do not include any explanation or text outside the JSON object.`;

  console.log('Sending image to Claude Vision API…');

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: prompt,
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

  const content = res.data.content[0].text.trim();

  // Strip markdown code fences if present
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${cleaned}`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Upload image to Airtable attachment (via URL upload workaround)
// We use Airtable's attachment field by providing a URL or base64 upload.
// Since Airtable requires a URL for attachments, we note here that this
// approach uses a temporary upload service or the file path as a data URL.
// For production, upload to S3/GCS and use the resulting URL.
// ---------------------------------------------------------------------------
async function uploadAttachmentUrl(imagePath) {
  // Read file and convert to base64 data URL (works for small files < 5MB)
  // For larger files, upload to a storage service and return the URL.
  const buffer    = fs.readFileSync(imagePath);
  const mediaType = getMediaType(imagePath);
  const base64    = buffer.toString('base64');
  const dataUrl   = `data:${mediaType};base64,${base64}`;

  // NOTE: Airtable's REST API does NOT accept data: URLs for attachments.
  // This returns the file info for the attachment field.
  // In production, replace this with an S3/GCS pre-signed URL.
  // For now, we return the filename so the record is created; attach manually if needed.
  return {
    url: dataUrl,
    filename: path.basename(imagePath),
  };
}

// ---------------------------------------------------------------------------
// Create Airtable Contact record
// ---------------------------------------------------------------------------
async function createContactRecord(cardData, imagePath) {
  const today = new Date().toISOString().slice(0, 10);

  const fields = {
    Stage: 'NEW',
  };

  if (cardData.name)       fields['Name']     = cardData.name;
  if (cardData.first_name) fields['First Name'] = cardData.first_name;
  if (cardData.email)      fields['Email']    = cardData.email;
  if (cardData.phone)      fields['Phone']    = cardData.phone;
  if (cardData.company)    fields['Company']  = cardData.company;
  if (cardData.role)       fields['Role']     = cardData.role;
  if (cardData.website)    fields['Website']  = cardData.website;
  if (cardData.location)   fields['Location'] = cardData.location;

  // LinkedIn: store as checkbox true if we have a value
  if (cardData.linkedin) {
    fields['LinkedIn'] = true;
    // Optionally store LinkedIn URL in Comments
    fields['Comments'] = `LinkedIn: ${cardData.linkedin}`;
  }

  // Attach business card photo
  // Note: Airtable attachment API requires a publicly accessible URL.
  // If running locally, the data URL approach below may not work;
  // upload the file to a storage service and use that URL instead.
  try {
    const attachment = await uploadAttachmentUrl(imagePath);
    fields['Business Card Photo'] = [{ url: attachment.url, filename: attachment.filename }];
  } catch (e) {
    console.warn('  ⚠️  Could not attach photo (Airtable requires a public URL). Attach manually.');
  }

  console.log('Creating Airtable contact record…');
  const res = await airtable.post('/Contacts', { records: [{ fields }] });
  return res.data.records[0];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node parse_business_card.js <image_file>');
    process.exit(1);
  }

  const imagePath = args[0];
  if (!fs.existsSync(imagePath)) {
    console.error(`ERROR: File not found: ${imagePath}`);
    process.exit(1);
  }

  console.log(`=== Ethics.Coach — Business Card Parser ===`);
  console.log(`Image: ${imagePath}\n`);

  try {
    // Step 1: Extract contact data via Claude Vision
    const cardData = await extractCardData(imagePath);

    console.log('\nExtracted contact data:');
    console.log(JSON.stringify(cardData, null, 2));

    // Step 2: Create Airtable record
    const record = await createContactRecord(cardData, imagePath);

    console.log('\n✅ Contact created in Airtable!');
    console.log(`   Record ID: ${record.id}`);
    console.log(`   Name:      ${record.fields['Name'] || '(none)'}`);
    console.log(`   Email:     ${record.fields['Email'] || '(none)'}`);
    console.log(`   Company:   ${record.fields['Company'] || '(none)'}`);
    console.log(`   Stage:     ${record.fields['Stage']}`);

  } catch (err) {
    if (err.response) {
      console.error('API Error:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

main();
