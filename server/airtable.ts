import type { InsertModel } from "@shared/schema";
import { storage } from "./storage";

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
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

export async function fetchModelsFromAirtable(options?: { baseId?: string; tableId?: string }): Promise<InsertModel[]> {
  let baseId = options?.baseId;
  let tableId = options?.tableId;
  let token: string | undefined;

  const dbConfig = await storage.getAirtableConfig();
  token = dbConfig?.apiToken ?? process.env.AIRTABLE_API_TOKEN;
  baseId = baseId ?? dbConfig?.baseId ?? process.env.AIRTABLE_BASE_ID ?? "";
  tableId = tableId ?? dbConfig?.tableId ?? process.env.AIRTABLE_TABLE_ID ?? "";

  if (!token || !baseId || !tableId) {
    throw new Error(
      "Airtable configuration missing. Configure Base ID, Table ID, and API Token in Admin → Import (Airtable Connection)."
    );
  }

  // Load model field defs so we can dynamically map Airtable columns to attributes
  const fieldDefs = await storage.getModelFieldDefs();
  // Only include defs that have an airtableColumn defined and are not the grade_band
  // (grade_band is mapped via the standard "Grades" field, not attributes)
  const attributeFieldDefs = fieldDefs.filter(
    (d) => d.airtableColumn && d.key !== "grade_band"
  );

  const models: InsertModel[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
    url.searchParams.set("filterByFormula", `FIND("CCL", {Topic / Project}) > 0`);
    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
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

      if (!fields["Solution Name"]) continue;

      // Build attributes map from configured field defs
      const attributes: Record<string, string> = {};
      for (const def of attributeFieldDefs) {
        const colName = def.airtableColumn!;
        const rawValue = fields[colName];
        if (rawValue !== undefined && rawValue !== null) {
          let strValue: string;
          if (typeof rawValue === "boolean") {
            strValue = rawValue ? "Yes" : "No";
          } else if (Array.isArray(rawValue)) {
            strValue = rawValue.join(", ");
          } else {
            strValue = String(rawValue);
          }
          attributes[def.key] = strValue.trim();
        }
      }

      // outcomeTypes = CCL Outcomes high-level categories only (e.g. "Content & Career Knowledge & Skills")
      const cclOutcomes = normalizeToString(fields["CCL Outcomes"]);
      const outcomeTypes = cclOutcomes;

      // Leaps stored separately — exact names for individual matching
      const leaps = normalizeToString(fields["Leaps"]);
      if (leaps) attributes["leaps"] = leaps;

      // Keep split display lists for admin reference
      if (cclOutcomes) attributes["outcomes_list"] = cclOutcomes;
      if (leaps) attributes["leaps_list"] = leaps;

      // keyPractices = CCL Kit Activities high-level categories (e.g. "Academic Integration")
      const keyPractices = normalizeToString(fields["CCL Kit Activities"]);
      if (keyPractices) attributes["practices_list"] = keyPractices;

      // Reach, Impact, Build Items — display-only context fields
      const reach = normalizeToString(fields["Reach"]);
      if (reach) attributes["reach"] = reach;
      const impact = normalizeToString(fields["Impact"]);
      if (impact) attributes["impact"] = impact;
      const buildItems = normalizeToString(fields["Build Items Provided"]);
      if (buildItems) attributes["build_items"] = buildItems;
      // Grad Aims and Activities columns intentionally not imported (conflicting data)

      models.push({
        name: fields["Solution Name"] || "",
        grades: normalizeToString(fields["Grades"]),
        description: fields["Description"] || "",
        link: fields["Website"] || "",
        imageUrl: fields["Image URL"] || null,
        outcomeTypes,
        keyPractices,
        implementationSupports: "",
        attributes,
      });
    }

    offset = data.offset;
  } while (offset);

  return models;
}
