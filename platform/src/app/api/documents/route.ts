import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, requireUser } from '@/lib/auth'
import {
  DOCUMENTS_BUCKET,
  MAX_DB_PDF_BYTES,
  MAX_STORAGE_PDF_BYTES,
  ensureDocumentTables,
  isAdmin,
  isPdf,
  readDocumentBytes,
  removeDocumentObject,
} from '@/lib/documents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Never select the file bytes in listings.
const DOC_FIELDS = {
  id: true,
  title: true,
  description: true,
  fileName: true,
  sizeBytes: true,
  createdAt: true,
} as const

// GET /api/documents
//   admin  → every document, with who it is assigned to
//   others → only the documents assigned to the caller
export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) return auth
  const user = auth

  try {
    await ensureDocumentTables()

    if (isAdmin(user)) {
      const docs = await prisma.document.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          ...DOC_FIELDS,
          uploadedBy: { select: { name: true, email: true } },
          assignments: {
            select: { userId: true, user: { select: { name: true, email: true, role: true, deletedAt: true } } },
          },
        },
      })
      return NextResponse.json({
        documents: docs.map((d) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          fileName: d.fileName,
          sizeBytes: d.sizeBytes,
          createdAt: d.createdAt,
          uploadedBy: d.uploadedBy?.name || d.uploadedBy?.email || null,
          assignees: d.assignments
            .filter((a) => !a.user.deletedAt)
            .map((a) => ({
              id: a.userId,
              name: a.user.name || a.user.email,
              email: a.user.email,
              role: a.user.role,
            })),
        })),
      })
    }

    const rows = await prisma.documentAssignment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, document: { select: { id: true, title: true, description: true, sizeBytes: true } } },
    })
    return NextResponse.json({
      documents: rows.map((r) => ({ ...r.document, assignedAt: r.createdAt })),
    })
  } catch (error) {
    console.error('GET /api/documents:', error)
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
  }
}

// POST /api/documents — admin only. Two ways in:
//  • JSON { title, description?, fileName, storagePath } after the browser has
//    uploaded the PDF to Supabase Storage with a signed URL (see upload-url).
//  • multipart form (file, title, description?) when storage isn't configured;
//    the PDF is then kept in the database row (max 9 MB).
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['ADMIN', 'SUPER_ADMIN'])
  if (auth instanceof NextResponse) return auth
  const user = auth

  try {
    await ensureDocumentTables()
    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file') as File | null
      const title = String(form.get('title') ?? '').trim()
      const description = String(form.get('description') ?? '').trim() || null
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      if (file.size > MAX_DB_PDF_BYTES) {
        return NextResponse.json({ error: 'PDF is larger than 9 MB' }, { status: 400 })
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!isPdf(bytes)) return NextResponse.json({ error: 'Only PDF files can be uploaded' }, { status: 400 })

      const doc = await prisma.document.create({
        data: {
          title: title || file.name.replace(/\.pdf$/i, ''),
          description,
          fileName: file.name,
          sizeBytes: bytes.length,
          storage: 'db',
          data: bytes,
          uploadedById: user.id,
        },
        select: DOC_FIELDS,
      })
      return NextResponse.json({ document: doc })
    }

    const body = await request.json().catch(() => null)
    const storagePath = typeof body?.storagePath === 'string' ? body.storagePath : ''
    const fileName = typeof body?.fileName === 'string' ? body.fileName : 'document.pdf'
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() || null : null
    if (!storagePath.startsWith('pdf/')) {
      return NextResponse.json({ error: 'storagePath is required' }, { status: 400 })
    }

    // Confirm the upload really landed and is a PDF before recording it.
    const bytes = await readDocumentBytes({ storage: 'supabase', storagePath, data: null })
    if (!bytes) return NextResponse.json({ error: 'Uploaded file not found in storage' }, { status: 400 })
    if (!isPdf(bytes) || bytes.length > MAX_STORAGE_PDF_BYTES) {
      await removeDocumentObject(storagePath)
      return NextResponse.json({ error: 'Only PDF files up to 50 MB can be uploaded' }, { status: 400 })
    }

    const doc = await prisma.document.create({
      data: {
        title: title || fileName.replace(/\.pdf$/i, ''),
        description,
        fileName,
        sizeBytes: bytes.length,
        storage: 'supabase',
        storagePath,
        uploadedById: user.id,
      },
      select: DOC_FIELDS,
    })
    return NextResponse.json({ document: doc, bucket: DOCUMENTS_BUCKET })
  } catch (error) {
    console.error('POST /api/documents:', error)
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }
}
