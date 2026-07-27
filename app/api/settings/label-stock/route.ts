import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getLabelStockSettings, setLabelStockSettings } from '@/lib/services/settingsService';

const LabelStockSchema = z.object({
  widthMm: z.number().positive().max(300),
  heightMm: z.number().positive().max(300),
  columns: z.number().int().min(1).max(10),
  columnGapMm: z.number().min(0).max(50),
  paddingMm: z.number().min(0).max(20),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  return NextResponse.json(await getLabelStockSettings());
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();
  const body = await req.json() as unknown;
  const parsed = LabelStockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid settings', details: parsed.error.issues }, { status: 400 });
  }
  await setLabelStockSettings(parsed.data);
  return NextResponse.json(parsed.data);
}
