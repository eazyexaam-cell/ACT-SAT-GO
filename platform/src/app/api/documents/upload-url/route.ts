import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOCUMENTS_BUCKET, MAX_STORAGE_PDF_BYTES, ensureDocumentsBucket } from '@/lib/documents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/documents/upload-url — admin only. Body: { fileName, size }
// Returns a one-time signed upload URL into the private "documents" bucket so
// the browser can upload the PDF straight to storage (no size limit from our
// API). Responds 503 when storage isn't configured; the client then falls
// back to POST /api/documents with the file itself.
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['ADMIN', 'SUPER_ADMIN'])
  if (auth instanceof NextResponse) return auth

  const body = await request.json().catch(() => null)
  const fileName = typeof body?.fileName === 'string' ? body.fileName : 'document.pdf'
  const size = Number(body?.size ?? 0)
  if (!/\.pdf$/i.test(fileName)) {
    return NextResponse.json({ error: 'Only PDF files can be uploaded' }, { status: 400 })
  }
  if (size > MAX_STORAGE_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF is larger than 50 MB' }, { status: 400 })
  }

  const ok = await ensureDocumentsBucket()
  const client = createAdminClient()
  if (!ok || !client) {
    return NextResponse.json({ error: 'File storage is not configured' }, { status: 503 })
  }

  const clean = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `pdf/${crypto.randomUUID()}_${clean}`
  const { data, error } = await client.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[documents/upload-url] createSignedUploadUrl failed:', error)
    return NextResponse.json({ error: 'File storage is not available' }, { status: 503 })
  }
  return NextResponse.json({ bucket: DOCUMENTS_BUCKET, path: data.path, token: data.token })
}
