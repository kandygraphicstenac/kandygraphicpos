-- 009_add_sales_account_roles.sql
--
-- Adds SALES and ACCOUNT to the Role enum. These roles are assignable but have
-- NO module access — capabilities are allow-listed in lib/permissions.ts, so a
-- role absent from a list is denied by default.
--
-- Postgres note: a value added by ALTER TYPE ... ADD VALUE cannot be USED in
-- the same transaction that adds it. Each statement below is standalone and
-- this file deliberately contains nothing that references the new values (no
-- inserts, no updates, no CHECK constraints). Run it on its own; if your client
-- wraps the script in a single transaction, run the two statements one at a time.
--
-- IF NOT EXISTS makes this safe to re-run.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES';

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNT';
