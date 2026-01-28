import type { InsertModel } from "@shared/schema";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;

interface AirtableRecord {
  id: string;
  fields: {
    "Model name"?: string;
    "grades"?: string;
    "Description"?: string;
    "Model Link"?: string;
    "Outcome Types"?: string | string[];
    "Key Practices"?: string | string[];
    "Implementation supports"?: string | string[];
  };
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

function normalizeToString(value: string | string[] | undefined): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

export async function fetchModelsFromAirtable(): Promise<InsertModel[]> {
  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    throw new Error("Airtable configuration missing. Please set AIRTABLE_API_TOKEN, AIRTABLE_BASE_ID, and AIRTABLE_TABLE_ID");
  }

  const models: InsertModel[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`);
    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const data: AirtableResponse = await response.json();

    for (const record of data.records) {
      const fields = record.fields;
      
      if (!fields["Model name"]) continue;

      models.push({
        name: fields["Model name"] || "",
        grades: fields["grades"] || "",
        description: fields["Description"] || "",
        link: fields["Model Link"] || "",
        outcomeTypes: normalizeToString(fields["Outcome Types"]),
        keyPractices: normalizeToString(fields["Key Practices"]),
        implementationSupports: normalizeToString(fields["Implementation supports"]),
      });
    }

    offset = data.offset;
  } while (offset);

  return models;
}
