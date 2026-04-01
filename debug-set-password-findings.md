# Set-Password Investigation Notes

## Current findings

The live database connection string uses the `mysql` scheme, while the current runtime server schema and part of the auth layer had been refactored toward PostgreSQL assumptions.

The original migrated `drizzle/schema.ts` and migration metadata describe a legacy MySQL/TiDB `users` table with camelCase columns such as `openId`, `loginMethod`, `createdAt`, `updatedAt`, and `lastSignedIn`, plus an enum role that originally only allowed `user` and `admin`.

The failing auth service path had been querying PostgreSQL-style metadata using `information_schema.columns where table_schema = 'public'` and attempted PostgreSQL-specific DDL such as `alter column` and `role::text`, which is incompatible with the live MySQL/TiDB database.

The login page now renders the `Set password` tab correctly for `gautham@manipalgroup.info`, and the form fields for full name, email, and new password are visible in the current preview.

## Fix direction already applied in code

A legacy-schema-aware auth service has been introduced around the live MySQL users table, including compatibility-column checks and password activation logic intended to replace the broken PostgreSQL compatibility path.

A regression test file, `server/auth.legacy-setup.test.ts`, has been added to cover first-time password setup against the legacy users-table assumptions.
