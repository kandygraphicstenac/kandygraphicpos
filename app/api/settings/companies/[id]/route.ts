import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  regNo: z.string().trim().max(60).nullable().optional(),
  footerMessage: z.string().trim().max(200).nullable().optional(),
  warrantyLine: z.string().trim().max(200).nullable().optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
});

/**
 * PATCH /api/settings/companies/[id]
 * Updates editable company fields. OWNER only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (!Number.isFinite(companyId)) {
    return NextResponse.json({ error: 'Invalid company id' }, { status: 400 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid fields', issues: parsed.error.issues }, { status: 400 });
  }

  const company = await prisma.company.update({
    where: { id: companyId },
    data: parsed.data,
    select: {
      id: true, code: true, name: true, address: true, phone: true,
      regNo: true, footerMessage: true, warrantyLine: true, active: true, logoUrl: true,
    },
  });

  return NextResponse.json(company);
}
