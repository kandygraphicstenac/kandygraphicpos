/**
 * npm run seed:auth
 *
 * Creates Supabase Auth accounts for every user in public.User that does not
 * already have one, then reports (or deletes) orphan auth accounts that have
 * no matching public.User row.
 *
 * Flags:
 *   --delete-orphans   Delete auth accounts that have no public.User row.
 *
 * Prerequisites:
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, type Role } from '@prisma/client';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error(
    '\nError: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.\n' +
      '       Uncomment SUPABASE_SERVICE_ROLE_KEY in .env and paste the service_role key\n' +
      '       from Supabase Dashboard → Project Settings → API.\n',
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const prisma = new PrismaClient();

// Default passwords for newly created accounts.
// The script resets passwords for existing auth accounts too, so running it
// again after a credential change will restore these known values.
const DEFAULT_PASSWORDS: Record<string, string> = {
  OWNER: 'Owner@2025',
  CASHIER: 'Cashier@2025',
  CUTTER: 'Cutter@2025',
};

function passwordFor(role: Role): string {
  return DEFAULT_PASSWORDS[role] ?? `Staff@2025`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const deleteOrphans = process.argv.includes('--delete-orphans');

  console.log('\n🔧  Seeding Supabase Auth accounts from public.User…\n');

  // Fetch current auth users once (avoid per-user listUsers calls)
  const { data: authData, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);

  const authByEmail = new Map(
    (authData?.users ?? []).map((u) => [u.email?.toLowerCase() ?? '', u]),
  );

  // Fetch all DB users
  const dbUsers = await prisma.user.findMany({
    orderBy: { id: 'asc' },
  });

  const credentials: Array<{ email: string; password: string }> = [];

  for (const dbUser of dbUsers) {
    const password = passwordFor(dbUser.role);
    const emailLower = dbUser.email.toLowerCase();
    const existing = authByEmail.get(emailLower);

    if (existing) {
      // Auth account exists — reset password so we always know it.
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (error) {
        console.error(`  ✗ ${dbUser.email}: could not reset password — ${error.message}`);
      } else {
        console.log(`  ↻ ${dbUser.email.padEnd(28)} (existed — password reset)`);
        credentials.push({ email: dbUser.email, password });
      }
    } else {
      // Create a new auth account.
      const { error } = await admin.auth.admin.createUser({
        email: dbUser.email,
        password,
        email_confirm: true,
      });
      if (error) {
        console.error(`  ✗ ${dbUser.email}: ${error.message}`);
      } else {
        console.log(`  ✓ ${dbUser.email.padEnd(28)} (created)`);
        credentials.push({ email: dbUser.email, password });
      }
    }
  }

  // ─── Orphan auth accounts ──────────────────────────────────────────────────
  const dbEmailSet = new Set(dbUsers.map((u) => u.email.toLowerCase()));
  const orphans = (authData?.users ?? []).filter(
    (u) => u.email && !dbEmailSet.has(u.email.toLowerCase()),
  );

  if (orphans.length > 0) {
    console.log(
      `\n⚠   ${orphans.length} auth account(s) with no matching public.User row:`,
    );
    for (const orphan of orphans) {
      process.stdout.write(`    ${orphan.email}  (id: ${orphan.id})`);
      if (deleteOrphans) {
        const { error } = await admin.auth.admin.deleteUser(orphan.id);
        if (error) {
          console.log(`  ✗ could not delete: ${error.message}`);
        } else {
          console.log('  → deleted');
        }
      } else {
        console.log();
      }
    }
    if (!deleteOrphans) {
      console.log(
        '\n    Options:\n' +
          '      • Run again with --delete-orphans to remove them from Supabase Auth.\n' +
          '      • Or add a public.User row so they can log in.\n',
      );
    }
  } else {
    console.log('\n✓   No orphan auth accounts found.');
  }

  // ─── Credential summary ────────────────────────────────────────────────────
  if (credentials.length > 0) {
    console.log('\n🔑  Credentials (change these after first login!):');
    for (const { email, password } of credentials) {
      console.log(`    ${email.padEnd(28)}  →  ${password}`);
    }
  }

  console.log();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
