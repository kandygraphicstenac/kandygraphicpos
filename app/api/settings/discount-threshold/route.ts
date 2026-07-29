import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getDiscountApprovalThresholdPct, setDiscountApprovalThresholdPct } from '@/lib/services/settingsService';
import { canUsePos, canManageSettings } from '@/lib/permissions';

/**
 * GET /api/settings/discount-threshold
 * Any authenticated non-CUTTER user can read it — POS needs it client-side to
 * decide whether to show the manager auth modal. saleService re-reads it
 * server-side regardless, so a stale client value is never trusted.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  // Read by the POS to decide when a discount needs manager approval.
  if (!canUsePos(user.role)) return forbiddenResponse();

  const thresholdPct = await getDiscountApprovalThresholdPct();
  return NextResponse.json({ thresholdPct });
}

const PutBodySchema = z.object({ thresholdPct: z.number().min(0).max(100) });

/**
 * PUT /api/settings/discount-threshold
 * OWNER only — raises/lowers the discount % above which manager approval is required.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canManageSettings(user.role)) return forbiddenResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'thresholdPct must be a number between 0 and 100' }, { status: 400 });
  }

  await setDiscountApprovalThresholdPct(parsed.data.thresholdPct);
  return NextResponse.json({ thresholdPct: parsed.data.thresholdPct });
}
