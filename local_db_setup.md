# Local Database Migration & Setup Guide

This project has been updated to use a local PostgreSQL database (`lattice`) running on port `4321` using SQLAlchemy and Alembic. The schemas have been directly reverse-engineered from your existing Supabase structure (`profiles` and `interview_sessions`) to ensure compatibility.

## 1. Quick Start Commands

The initial database schema has already been created. Going forward, run these commands inside your Conda environment (`conda run -n pupil310`) from the project root:

- **Create a New Migration:** (Whenever you update `convFlow/models.py`)
  ```powershell
  conda run -n pupil310 alembic revision --autogenerate -m "describe_changes"
  ```
- **Apply Migrations to Local DB:**
  ```powershell
  conda run -n pupil310 alembic upgrade head
  ```
- **Downgrade Migration (Undo):**
  ```powershell
  conda run -n pupil310 alembic downgrade -1
  ```
- **Check Current DB Revision:**
  ```powershell
  conda run -n pupil310 alembic current
  ```

## 2. Inspecting the Local Database

To quickly log in and verify your tables using PowerShell, run:
```powershell
psql -U postgres -h localhost -p 4321 -d lattice
```
Once inside `psql`, use this query to view all your tables:
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;
```

## 3. Migrating Data From Supabase

If you have existing user profiles or interview session records in Supabase that you want to test with locally, you can dump your Supabase schema/data and restore it directly to the local Postgres.

### Step A: Export from Supabase
Use your Supabase Database connection string (found in the Supabase Dashboard -> Settings -> Database).
```powershell
pg_dump -U postgres -h aws-0-us-west-1.pooler.supabase.com -p 5432 -d postgres --clean --if-exists > supabase_backup.sql
```
*(If you only want data, add `--data-only`. If you want schema and data, omit it. Since we already created the tables using Alembic, `--data-only` is recommended if you're pulling into the Alembic-managed tables).*

### Step B: Restore to Local PostgreSQL
Restore the downloaded dump to your local port `4321`:
```powershell
psql -U postgres -h localhost -p 4321 -d lattice -f supabase_backup.sql
```
*Note: We use plain SQL dump and `psql` since it's the most flexible. If you used custom format (`-Fc`) when dumping, use `pg_restore`:*
```powershell
pg_restore -U postgres -h localhost -p 4321 -d lattice --clean --if-exists supabase_backup.dump
```

## 4. Backend Implementation Details

- **Environment Config:** `alembic/env.py` has been configured to load the `DATABASE_URL` straight from your root `.env`. We added logic to properly escape URL symbols like `%40` so Alembic connects flawlessly.
- **Models:** `convFlow/models.py` contains `Profile` and `InterviewSession` tables replicating Supabase's schemas (UUIDs, JSONB column defaults, timestamptz fields).
- **Session DB:** `convFlow/database.py` exports `get_db` and `SessionLocal` for SQLAlchemy DB transaction handling inside your endpoints.

As long as you preserve constraints, UUID behaviors, and use JSONB for complex objects, migrating this schema back to Supabase in production will be seamless.
