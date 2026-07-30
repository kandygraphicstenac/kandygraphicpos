import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canManageSettings } from '@/lib/permissions';
import { getLabelFormat, setLabelFormat } from '@/lib/services/settingsService';

const BodySchema = z.object({ format: z.enum(['a4', 'thermal']) });

/**
 * GET /api/settings/label-format
 *
 * Readable by every authenticated role. The format describes the shop's
 * printer, and CASHIER / CUTTER / SALES / ACCOUNT all need it to print
 * correctly — none of them can reach Settings, which is precisely why this must
 * not require Settings access to read.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  return NextResponse.json({ format: await getLabelFormat() });
}

/**
 * PUT /api/settings/label-format
 *
 * OWNER only, enforced here and not merely by hiding the control — this
 * changes how every user in the shop prints.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canManageSettings(user.role)) return forbiddenResponse();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid format', issues: parsed.error.issues }, { status: 400 });
  }

  await setLabelFormat(parsed.data.format);
  return NextResponse.json({ format: parsed.data.format });
}
