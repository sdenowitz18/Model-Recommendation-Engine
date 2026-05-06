---
name: model-sync
description: Defines how models are imported from Airtable using a two-tier upsert that preserves DB IDs and enrichment data. Use when modifying the sync pipeline, changing how models are matched, or debugging sync behavior.
---

# Model Sync — Airtable Upsert Strategy

## Overview

Models are synced from the Transcend Exchange Airtable base via `POST /api/admin/refresh-from-airtable`. The sync uses a **two-tier upsert** (not delete-and-replace) to preserve model DB IDs and enrichment data across imports.

## Matching Logic

For each incoming Airtable record:

1. **Match by `airtableRecordId`** — stable Airtable record ID (`recABC123xyz`). Fast, unambiguous.
2. **Fallback: match by `name`** (case-insensitive, trimmed) — handles pre-existing models that don't yet have an Airtable ID (first sync after migration, Excel imports).
3. **No match** — insert as new model with `enrichedContent = null`, `enrichedAt = null`.

### On match (update)

Update Airtable-owned fields in place:
- `name`, `grades`, `description`, `link`, `outcomeTypes`, `keyPractices`, `implementationSupports`, `imageUrl`, `attributes`
- Backfill `airtableRecordId` if it was null

**Preserve:** `id`, `enrichedContent`, `enrichedAt`

### Stale enrichment detection

If a matched model's `name` or `link` changed, null out `enrichedAt` to flag it for re-enrichment. The enrichment content itself is preserved (not deleted) so it can still be used until re-enrichment runs.

### Models not in Airtable

Models in the DB that are not found in the Airtable response are **preserved** (not deleted). They may have been removed from Airtable or imported via Excel. Admins can manually remove models through the Admin UI.

### Recommendations cleared

After sync, the `recommendations` table is cleared since model data may have changed.

## Implementation

| File | What |
|------|------|
| `shared/schema.ts` | `models` table includes `airtableRecordId`, `enrichedContent`, `enrichedAt` |
| `server/airtable.ts` | `fetchModelsFromAirtable()` includes `record.id` as `airtableRecordId` |
| `server/storage.ts` | `syncModelsFromAirtable()` — two-tier upsert logic |
| `server/routes.ts` | `POST /api/admin/refresh-from-airtable` — triggers sync |

## Cross-References

- **Enrichment pipeline:** `.cursor/skills/model-enrichment/SKILL.md`
