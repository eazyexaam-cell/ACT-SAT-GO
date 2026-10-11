import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { ensureDocumentTables } from '@/lib/documents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// PUT /api/documents/[documentId]/assignments — admin only.
// Body: { userIds: string[] } — the full list of students and tutors who may
// view this document. Replaces the previous list.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const auth = await requireRole(request, ['ADMIN', 'SUPER_ADMIN'])
  if (auth instanceof NextResponse) return auth
  const { documentId } = await params

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.userIds) || !body.userIds.every((u: unknown) => typeof u === 'string')) {
    return NextResponse.json({ error: 'userIds must be a list of user ids' }, { status: 400 })
  }
  const requested = [...new Set(body.userIds as string[])]

  try {
    await ensureDocumentTables()
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Only active students and tutors can be assigned (admins already see everything).
    const valid = await prisma.user.findMany({
      where: { id: { in: requested }, role: { in: ['STUDENT', 'TUTOR'] }, deletedAt: null },
      select: { id: true },
    })
    const userIds = valid.map((u) => u.id)

    await prisma.$transaction([
      prisma.documentAssignment.deleteMany({
        where: { documentId, userId: { notIn: userIds } },
      }),
      prisma.documentAssignment.createMany({
        data: userIds.map((userId) => ({ documentId, userId, assignedById: auth.id })),
        skipDuplicates: true,
      }),
    ])
    return NextResponse.json({ success: true, assigned: userIds.length })
  } catch (error) {
    console.error('PUT /api/documents/[documentId]/assignments:', error)
    return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
  }
}
