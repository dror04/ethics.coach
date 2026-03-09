#!/usr/bin/env node
/**
 * parse_business_card.js
 * Extracts contact info from a business card photo using Claude Vision,
 * then creates a new Airtable contact record at Stage = NEW.
 *
 * Usage: node parse_business_card.js card.jpg
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!AIRTABLE_API_KEY || !BASE_ID || !ANTHROPIC_API_KEY) {
  console.error("Missing required env vars: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, ANTHROPIC_API_KEY");
  process.exit(1);
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node parse_business_card.js <path-to-image>");
  process.exit(1);
}

const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/Contacts`;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return types[ext] || "image/jpeg";
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Business Card → Airtable Contact");
  console.log("═══════════════════════════════════════════════\n");

  const resolvedPath = path.resolve(imagePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Read image as base64
  const imageBuffer = fs.readFileSync(resolvedPath);
  const base64Image = imageBuffer.toString("base64");
  const mediaType = getMediaType(resolvedPath);

  console.log(`Image: ${resolvedPath} (${mediaType})`);
  console.log("Sending to Claude for extraction...\n");

  // Call Anthropic Claude API with vision
  const claudeResponse = await axios.post(
    ANTHROPIC_URL,
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `Extract all contact information from this business card photo. Return ONLY a JSON object with these fields (use null for any field not found):
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
Do not include any explanation or text outside the JSON object.`,
            },
          ],
        },
      ],
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );

  // Parse the response
  const responseText = claudeResponse.data.content[0].text;
  let extracted;
  try {
    extracted = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      extracted = JSON.parse(jsonMatch[0]);
    } else {
      console.error("Failed to parse Claude response:", responseText);
      process.exit(1);
    }
  }

  console.log("Extracted data:");
  console.log(JSON.stringify(extracted, null, 2));
  console.log("");

  // Build Airtable record
  const fields = {
    Stage: "NEW",
  };

  if (extracted.name) fields["Name"] = extracted.name;
  if (extracted.first_name) fields["First Name"] = extracted.first_name;
  if (extracted.email) fields["Email"] = extracted.email;
  if (extracted.phone) fields["Phone"] = extracted.phone;
  if (extracted.company) fields["Company"] = extracted.company;
  if (extracted.role) fields["Role"] = extracted.role;
  if (extracted.website) fields["Website"] = extracted.website;
  if (extracted.linkedin) fields["LinkedIn"] = true;
  if (extracted.location) fields["Location"] = extracted.location;

  // Upload the business card photo
  // Airtable attachments require a publicly accessible URL.
  // For local files, we'll note this limitation.
  // If the image is accessible via URL, we could attach it directly.
  // For now, create the record without the attachment and note it.

  console.log("Creating Airtable contact record...\n");

  const airtableRes = await axios.post(
    AIRTABLE_URL,
    { records: [{ fields }] },
    {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const createdRecord = airtableRes.data.records[0];
  console.log("═══════════════════════════════════════════════");
  console.log("  Contact Created Successfully!");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Record ID: ${createdRecord.id}`);
  console.log(`  Name:      ${fields.Name || "N/A"}`);
  console.log(`  Email:     ${fields.Email || "N/A"}`);
  console.log(`  Company:   ${fields.Company || "N/A"}`);
  console.log(`  Role:      ${fields.Role || "N/A"}`);
  console.log(`  Stage:     NEW`);
  console.log("");
  console.log("Note: Upload the business card photo manually to the");
  console.log("'Business Card Photo' field in Airtable (attachments");
  console.log("require a publicly accessible URL for API upload).");
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  if (err.response) {
    console.error("API Error:", JSON.stringify(err.response.data, null, 2));
  } else {
    console.error("Error:", err.message);
  }
  process.exit(1);
});
