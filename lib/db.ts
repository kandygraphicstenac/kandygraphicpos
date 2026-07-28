import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Options for every multi-step interactive `$transaction`.
 *
 * Prisma's default interactive-transaction timeout is 5s. A sale runs many
 * queries (row locks, stock checks, invoice, invoice items, StockTxn rows), and
 * in production each one pays a cross-region round trip (Vercel function ↔
 * Supabase). That overruns 5s, Prisma closes the transaction, and the next
 * query inside it fails with P2028 "Transaction not found".
 *
 * - `timeout`  — max time the transaction may run.
 * - `maxWait`  — max time to wait for a connection from the pool.
 *
 * This is a safety net, not a licence for slow transactions: an open
 * transaction pins a pooled connection, so on a busy till a long one starves
 * the pool. Do not raise these — fix the query count or the region instead.
 *
 * Only valid for the interactive form. Prisma's array/batch form accepts
 * `isolationLevel` only.
 */
export const TXN_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
