# Database Setup — Use Neon (Not Replit Postgres)

This project uses **Neon PostgreSQL**. Replit's bundled Postgres was removed so it won't override `DATABASE_URL`.

## 1. Set DATABASE_URL

### Local development
Create a `.env` file in the project root (or ensure it exists):
```
DATABASE_URL=postgresql://YOUR_NEON_CONNECTION_STRING
```

### Replit
1. Go to **Tools → Secrets**
2. Add secret: `DATABASE_URL` = your full Neon connection string
3. **Important**: Remove the `postgresql-16` module from `.replit` so Replit doesn't provision its own DB. It has been removed.

## 2. Apply schema and seed

Run these from the project root:

```bash
# Apply schema to Neon
npm run db:push

# Seed taxonomy (outcomes, LEAPs, practices)
npm run db:seed

# Restore default instructions (global + step prompts)
npm run db:restore-defaults
```

## 3. Restore default instructions (alternative)

Or go to **Admin Settings** in the app and click **Restore All Defaults** to populate:
- Taxonomy (if not already seeded)
- Global AI instructions
- Step-specific AI instructions

## 4. Re-import models

- Go to **Import Models** (`/admin/import`)
- Sync from Airtable or upload your Excel file

## Your Neon connection

Your Neon database URL format:
```
postgresql://neondb_owner:PASSWORD@ep-blue-frost-aifwb3l3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require
```

Store this in `.env` (local) or Replit Secrets (when running on Replit). Never commit it to git.
