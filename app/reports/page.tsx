import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canViewReports, landingPathFor } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { ReportsClient } from './ReportsClient';
import type { CompanyRecord } from '@/lib/types/company';

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canViewReports(user.role)) redirect(landingPathFor(user.role));

  const companies = await prisma.company.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
    select: { id: true, code: true, name: true, invoicePrefix: true, address: true, phone: true, regNo: true, active: true, footerMessage: true, warrantyLine: true },
  });

  return <ReportsClient companies={companies as CompanyRecord[]} />;
}
