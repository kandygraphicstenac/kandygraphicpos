import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/auth';
import type { CompanyRecord } from '@/lib/types/company';

/**
 * GET /api/companies
 * Returns all active companies ordered by id.
 * Used by the POS company selector and receipt rendering.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const companies = await prisma.company.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      invoicePrefix: true,
      address: true,
      phone: true,
      regNo: true,
      active: true,
      footerMessage: true,
      warrantyLine: true,
      logoUrl: true,
    },
  });

  return NextResponse.json(companies satisfies CompanyRecord[]);
}
