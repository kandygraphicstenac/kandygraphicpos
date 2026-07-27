'use client';

// Reusable image upload component for catalog part/set forms.
// Uploads directly from the browser to Supabase Storage bucket "product-images".
//
// SETUP REQUIRED (one-time in Supabase dashboard):
//   1. Create bucket: Storage → New bucket → Name: "product-images" → Public: ON
//   2. Add RLS policy for INSERT: allow authenticated users (or anon if you prefer)
//      e.g. CREATE POLICY "allow_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');

import { useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
};

export function ImageUpload({ value, onChange, label = 'Product image' }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      // Sanitise filename and prefix with timestamp for uniqueness
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-text-2">{label}</p>

      {/* Preview */}
      {value && (
        <div className="relative aspect-4/3 w-full max-w-xs rounded-xl overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Product" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove image"
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-danger-bg text-danger-fg
                       flex items-center justify-center hover:opacity-80 transition-opacity"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 w-full max-w-xs h-28
                   border-2 border-dashed border-border rounded-xl cursor-pointer
                   hover:border-border-hover hover:bg-border/30 transition-colors duration-100
                   text-text-3 text-[13px] select-none"
      >
        {uploading ? (
          <>
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Uploading…</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span>{value ? 'Replace image' : 'Drop image or click to upload'}</span>
            <span className="text-[11px] opacity-60">JPEG, PNG, WebP · max 5 MB</span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleInputChange}
      />

      {error && <p className="text-[12px] text-danger-fg">{error}</p>}
    </div>
  );
}
