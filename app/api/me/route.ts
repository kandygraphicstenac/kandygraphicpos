import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/auth';

/**
 * GET /api/me
 * Returns { id, name, email, role } for the current user.
 * Used by client components to gate role-based UI.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}
