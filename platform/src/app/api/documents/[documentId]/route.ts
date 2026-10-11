import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { ensureDocumentTables, removeDocumentObject } from '@/lib/documents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// PATCH /api/documents/[documentId] — admin only. Body: { title?, description? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const auth = await requireRole(request, ['ADMIN', 'SUPER_ADMIN'])
  if (auth instanceof NextResponse) return auth
  const { documentId } = await params

  const body = await request.json().catch(() => null)
  const data: { title?: string; description?: string | null } = {}
  if (typeof body?.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (typeof body?.description === 'string') data.description = body.description.trim() || null

  try {
    await ensureDocumentTables()
    const doc = await prisma.document.update({
      where: { id: documentId },
      data,
      select: { id: true, title: true, description: true },
    })
    return NextResponse.json({ document: doc })
  } catch (error) {
    console.error('PATCH /api/documents/[documentId]:', error)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

// DELETE /api/documents/[documentId] — admin only. Removes the document, its
// assignments, and the stored file.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const auth = await requireRole(request, ['ADMIN', 'SUPER_ADMIN'])
  if (auth instanceof NextResponse) return auth
  const { documentId } = await params

  try {
    await ensureDocumentTables()
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { storage: true, storagePath: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    await prisma.document.delete({ where: { id: documentId } })
    if (doc.storage === 'supabase') await removeDocumentObject(doc.storagePath)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/documents/[documentId]:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
