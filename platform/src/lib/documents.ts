import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTimeout } from '@/lib/withTimeout'
import type { User } from '@prisma/client'

// Shared helpers for the Documents feature (admin uploads PDFs and assigns
// them to students / tutors, who can only view them in the in-app viewer).

export const DOCUMENTS_BUCKET = 'documents'
// Supabase Storage path (signed upload straight from the browser).
export const MAX_STORAGE_PDF_BYTES = 50 * 1024 * 1024
// Fallback when storage isn't configured: the PDF is stored in the database
// row. Kept under the proxy's 10 MB request-body buffer.
export const MAX_DB_PDF_BYTES = 9 * 1024 * 1024

export function isAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
}

// ── Tables ──────────────────────────────────────────────────────────────────
// Created by migration 7_add_documents. As with the AttemptEvent table, also
// create them (idempotently) on first use in case a deploy skipped
// `prisma migrate deploy`. Same SQL as the migration file.

const DDL = [
  `CREATE TABLE IF NOT EXISTS "Document" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "fileName" TEXT NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "storage" VARCHAR(16) NOT NULL DEFAULT 'supabase',
      "storagePath" TEXT,
      "data" BYTEA,
      "uploadedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
  
      CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "DocumentAssignment" (
      "id" TEXT NOT NULL,
      "documentId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "assignedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
      CONSTRAINT "DocumentAssignment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DocumentAssignment_documentId_userId_key" ON "DocumentAssignment"("documentId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "DocumentAssignment_userId_idx" ON "DocumentAssignment"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "DocumentAssignment" ADD CONSTRAINT "DocumentAssignment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "DocumentAssignment" ADD CONSTRAINT "DocumentAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
]

const ENSURE_TIMEOUT_MS = 5_000
let ready: Promise<void> | null = null

export function ensureDocumentTables(): Promise<void> {
  ready ??= (async () => {
    const exists = await prisma.$queryRawUnsafe<{ a: string | null; b: string | null }[]>(
      `SELECT to_regclass('public."Document"')::text AS a, to_regclass('public."DocumentAssignment"')::text AS b`,
    )
    if (exists[0]?.a && exists[0]?.b) return
    console.warn('[documents] Document tables missing (migration 7 not applied) — creating them')
    for (const sql of DDL) await prisma.$executeRawUnsafe(sql)
  })().catch((err) => {
    ready = null
    console.error('[documents] could not ensure Document tables:', err)
  })
  const current = ready
  return withTimeout(current, ENSURE_TIMEOUT_MS, 'ensureDocumentTables').catch((err) => {
    if (ready === current) ready = null
    console.error('[documents] table check is slow, continuing without it:', err.message)
  })
}

// ── Storage ─────────────────────────────────────────────────────────────────

let bucketReady: Promise<boolean> | null = null

// Makes sure the private "documents" bucket exists. Resolves false when the
// Supabase service-role key isn't configured (callers fall back to the DB).
export function ensureDocumentsBucket(): Promise<boolean> {
  const client = createAdminClient()
  if (!client) return Promise.resolve(false)
  bucketReady ??= (async () => {
    const { data: buckets, error } = await client.storage.listBuckets()
    if (error) throw error
    if (!buckets?.some((b) => b.name === DOCUMENTS_BUCKET)) {
      const { error: createErr } = await client.storage.createBucket(DOCUMENTS_BUCKET, {
        public: false,
        allowedMimeTypes: ['application/pdf'],
        fileSizeLimit: MAX_STORAGE_PDF_BYTES,
      })
      if (createErr && !/already exists/i.test(createErr.message)) throw createErr
    }
    return true
  })().catch((err) => {
    bucketReady = null
    console.error('[documents] storage bucket unavailable:', err)
    return false
  })
  return bucketReady
}

export async function readDocumentBytes(doc: {
  storage: string
  storagePath: string | null
  data: Uint8Array | null
}): Promise<Uint8Array | null> {
  if (doc.storage === 'db') return doc.data
  const client = createAdminClient()
  if (!client || !doc.storagePath) return null
  const { data, error } = await client.storage.from(DOCUMENTS_BUCKET).download(doc.storagePath)
  if (error || !data) {
    console.error('[documents] download failed:', error)
    return null
  }
  return new Uint8Array(await data.arrayBuffer())
}

export async function removeDocumentObject(storagePath: string | null) {
  if (!storagePath) return
  const client = createAdminClient()
  if (!client) return
  const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
  if (error) console.warn('[documents] could not remove storage object:', error.message)
}

export function isPdf(bytes: Uint8Array): boolean {
  // "%PDF-" magic header
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
}
