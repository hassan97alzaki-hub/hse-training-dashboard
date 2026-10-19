-- Registering the migrations that were applied by hand
--
-- Run once, and only on a project where 0001, 0002 and 0003 have already been
-- applied through the SQL editor — which is how every one of them reached the
-- hosted project before the CLI was adopted.
--
-- It writes the three versions into the table the CLI reads, so the next
-- `supabase db push` knows they are done and starts from the one after. This
-- is what `supabase migration repair --status applied <version>` does; it is
-- written out here because `repair` needs `supabase link`, which needs an
-- interactive login, and this does not.
--
-- Running it against a project that has NOT had them applied would tell the
-- CLI a lie it cannot detect: it would skip them and the schema would stay
-- half built. Check first:
--
--   select count(*) from pg_tables
--   where schemaname = 'public' and tablename in ('workspaces', 'workspace_members');
--
-- Two rows means 0003 is applied and this file is safe to run.

CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version TEXT PRIMARY KEY,
  statements TEXT[],
  name TEXT
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20261012103348', 'init'),
  ('20261013140610', 'requirements'),
  ('20261019100039', 'workspaces')
ON CONFLICT (version) DO NOTHING;

SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
