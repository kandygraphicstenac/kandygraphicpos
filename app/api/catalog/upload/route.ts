import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canEditCatalog } from '@/lib/permissions';
import { createClient } from '@supabase/supabase-js';

/**
 * The ONE storage bucket for catalog photos, and this route is the ONE way in.
 *
 * There used to be a second, direct browser-to-Supabase upload path pointing at
 * a different bucket name, which is how the two drifted apart. Everything now
 * goes through here so the size/type limits and the resize below cannot be
 * bypassed by a client.
 *
 * Create in the Supabase dashboard as a PUBLIC bucket — the POS renders these
 * with a plain <img src>.
 */
const BUCKET = 'product-images';

/**
 * sharp is a native binary and cannot run on the Edge runtime. Route handlers
 * default to Node, but this makes it explicit so the route can never be flipped
 * to Edge by a config change without the failure being obvious here.
 */
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, on the ORIGINAL upload
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Longest side after resize. The POS grid shows cards a few hundred px wide, so
 * 1000px covers retina and the larger set-detail view with room to spare while
 * keeping a phone photo from reaching the till at full size.
 */
const MAX_DIMENSION = 1000;
const WEBP_QUALITY = 80;

/**
 * POST /api/catalog/upload
 * multipart/form-data with a single "file" field.
 * Returns { url } — the public Supabase Storage URL.
 * OWNER + CUTTER (catalog editors).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

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

  // Limits enforced here, server-side — the browser check is convenience only.
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 415 });
  }

  // Resize + recompress before anything is stored.
  //   .rotate()             — applies EXIF orientation; phone photos are often
  //                           recorded sideways and would otherwise display rotated.
  //   fit: 'inside'         — preserves aspect ratio, never crops or distorts.
  //   withoutEnlargement    — a small image is left alone rather than upscaled.
  // sharp throwing here also serves as a real content check: a file with a
  // spoofed image MIME type fails to decode and is rejected rather than stored.
  let resized: Buffer;
  try {
    resized = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { error: 'That file could not be read as an image' },
      { status: 415 },
    );
  }

  // Defence in depth: never write an empty object even if sharp returns without
  // throwing. A failed resize must produce no file at all.
  if (!resized || resized.byteLength === 0) {
    return NextResponse.json({ error: 'Image processing produced no output' }, { status: 500 });
  }

  // Always .webp — the output format is fixed by the pipeline above.
  const path = `catalog/${Date.now()}-${randomUUID()}.webp`;

  // Upload as a Blob, NOT a raw Node Buffer.
  //
  // Passing a Buffer here corrupted every image uploaded on Vercel while working
  // fine on Windows: that runtime's fetch did not treat the Buffer as binary
  // BodyInit and put it through a UTF-8 text path, so every byte that was not
  // valid UTF-8 became U+FFFD (ef bf bd). The stored files kept their ASCII
  // RIFF/WEBP headers, roughly doubled in size, and would not open. A Blob is
  // unambiguously binary in every runtime.
  const body = new Blob([new Uint8Array(resized)], { type: 'image/webp' });

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/webp', upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
