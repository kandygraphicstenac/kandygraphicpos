import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

/**
 * POST /api/settings/companies/[id]/logo
 * Uploads a company logo to Supabase Storage, saves the public URL to the
 * Company record, and returns { logoUrl }. OWNER only.
 */
export async function POST(
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 2 MB)' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type — use PNG, JPG, SVG, or WebP' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const storagePath = `companies/${companyId}/logo.${ext}`;

  const supabase = getSupabaseAdmin();
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(storagePath);

  await prisma.company.update({
    where: { id: companyId },
    data: { logoUrl: publicUrl },
  });

  return NextResponse.json({ logoUrl: publicUrl });
}
