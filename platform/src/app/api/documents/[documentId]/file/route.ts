import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { ensureDocumentTables, isAdmin, readDocumentBytes } from '@/lib/documents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/documents/[documentId]/file — the PDF bytes, for the in-app viewer.
// Admins can open any document; students and tutors only ones assigned to
// them. There is no public or signed link to the file: it is only reachable
// through this authenticated route.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) return auth
  const user = auth
  const { documentId } = await params

  try {
    await ensureDocumentTables()
    if (!isAdmin(user)) {
      const assigned = await prisma.documentAssignment.findUnique({
        where: { documentId_userId: { documentId, userId: user.id } },
        select: { id: true },
      })
      if (!assigned) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { storage: true, storagePath: true, data: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const bytes = await readDocumentBytes(doc)
    if (!bytes) return NextResponse.json({ error: 'File is unavailable' }, { status: 502 })

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        // Not application/pdf, so a browser never opens it in its own
        // (printable, downloadable) PDF viewer.
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('GET /api/documents/[documentId]/file:', error)
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 })
  }
}
