import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Eye, FileText, Loader2, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { SecurePdfViewer } from '../../components/library/SecurePdfViewer';
import { api, type DbUser, type LibraryDocument } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * ASG Library — PDF study material.
 * Admins upload PDFs, assign them to students and tutors, and see everything.
 * Students and tutors see only what is assigned to them, in a view-only viewer.
 */
export function LibraryPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [docs, setDocs] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<LibraryDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assigning, setAssigning] = useState<LibraryDocument | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { documents } = await api.getLibraryDocuments();
      setDocs(documents);
    } catch (err) {
      setError((err as Error).message || 'Could not load the library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => `${d.title} ${d.description ?? ''}`.toLowerCase().includes(q));
  }, [docs, query]);

  const remove = async (doc: LibraryDocument) => {
    if (!window.confirm(`Delete "${doc.title}"? Students and tutors it is assigned to will lose access.`)) return;
    try {
      await api.deleteLibraryDocument(doc.id);
      toast.success('Document deleted');
      setDocs((d) => d.filter((x) => x.id !== doc.id));
    } catch (err) {
      toast.error((err as Error).message || 'Could not delete');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen size={22} className="text-amber-500" /> ASG Library
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAdmin
              ? 'Upload PDFs and choose which students and tutors can read them.'
              : 'Study material shared with you. Documents open in a view-only reader.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents"
              className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          {isAdmin && (
            <button
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1E36] text-white text-sm font-medium hover:bg-[#13304f]"
            >
              <Upload size={15} /> Upload PDF
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : error ? (
        <Card>
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-blue-600 hover:underline">Try again</button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-slate-500">
            <FileText size={32} className="mx-auto mb-3 text-slate-300" />
            {docs.length === 0
              ? isAdmin ? 'No documents yet. Click "Upload PDF" to add the first one.' : 'No documents have been shared with you yet.'
              : 'No documents match your search.'}
          </div>
        </Card>
      ) : isAdmin ? (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Document</th>
                  <th className="text-left px-4 py-3">Assigned to</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Uploaded</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((doc) => {
                  const students = doc.assignees?.filter((a) => a.role === 'STUDENT').length ?? 0;
                  const tutors = doc.assignees?.filter((a) => a.role === 'TUTOR').length ?? 0;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <FileText size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{doc.title}</p>
                            {doc.description && <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>}
                            <p className="text-xs text-slate-400 mt-0.5">{formatSize(doc.sizeBytes)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {students + tutors === 0 ? (
                          <span className="text-slate-400">Nobody yet</span>
                        ) : (
                          <span>
                            {students} student{students === 1 ? '' : 's'} · {tutors} tutor{tutors === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(doc.createdAt)}
                        {doc.uploadedBy && <span className="block text-xs text-slate-400">by {doc.uploadedBy}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setViewing(doc)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200"
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            onClick={() => setAssigning(doc)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-500 hover:bg-amber-600"
                          >
                            <UserPlus size={13} /> Assign
                          </button>
                          <button
                            onClick={() => remove(doc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setViewing(doc)}
              className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-amber-300 hover:shadow-md transition"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{doc.title}</p>
                  {doc.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.description}</p>}
                  <p className="text-xs text-slate-400 mt-1.5">
                    {formatSize(doc.sizeBytes)}{doc.assignedAt ? ` · shared ${formatDate(doc.assignedAt)}` : ''}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-amber-600 flex items-center gap-1"><Eye size={13} /> Open</p>
            </button>
          ))}
        </div>
      )}

      {viewing && user && (
        <SecurePdfViewer
          documentId={viewing.id}
          title={viewing.title}
          watermark={`${user.name || ''} · ${user.email}`.replace(/^ · /, '')}
          allowPrint={isAdmin}
          onClose={() => setViewing(null)}
        />
      )}

      {isAdmin && (
        <UploadModal
          isOpen={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={(doc) => {
            setUploadOpen(false);
            load();
            setAssigning({ ...doc, assignees: [] });
          }}
        />
      )}

      {isAdmin && assigning && (
        <AssignModal
          doc={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => { setAssigning(null); load(); }}
        />
      )}
    </div>
  );
}

function UploadModal({
  isOpen,
  onClose,
  onUploaded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: (doc: LibraryDocument) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) { setFile(null); setTitle(''); setDescription(''); }
  }, [isOpen]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      toast.error('Please choose a PDF file');
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' '));
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const { document } = await api.uploadLibraryDocument(file, title.trim(), description.trim());
      toast.success('Uploaded. Now choose who can read it.');
      onUploaded(document);
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title="Upload a PDF"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={submit}
            disabled={!file || busy}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[#0B1E36] text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-8 cursor-pointer hover:border-amber-300"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null); }}
        >
          <FileText size={28} className="text-red-400" />
          <span className="text-sm text-slate-600">{file ? file.name : 'Click to choose a PDF, or drop it here'}</span>
          {file && <span className="text-xs text-slate-400">{formatSize(file.size)}</span>}
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
        <div>
          <label className="text-sm font-medium text-slate-700">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
      </div>
    </Modal>
  );
}

function AssignModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: LibraryDocument;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<'STUDENT' | 'TUTOR'>('STUDENT');
  const [students, setStudents] = useState<DbUser[]>([]);
  const [tutors, setTutors] = useState<DbUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(doc.assignees?.map((a) => a.id) ?? []));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getUsersByRole('STUDENT'), api.getUsersByRole('TUTOR')])
      .then(([s, t]) => {
        setStudents((s.users ?? []).filter((u) => !u.isDemo));
        setTutors(t.users ?? []);
      })
      .catch(() => toast.error('Could not load students and tutors'))
      .finally(() => setLoading(false));
  }, []);

  const list = tab === 'STUDENT' ? students : tutors;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...list].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    return q ? sorted.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : sorted;
  }, [list, query]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allVisibleSelected = visible.length > 0 && visible.every((u) => selected.has(u.id));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    for (const u of visible) {
      if (allVisibleSelected) next.delete(u.id); else next.add(u.id);
    }
    return next;
  });

  const countIn = (users: DbUser[]) => users.filter((u) => selected.has(u.id)).length;

  const save = async () => {
    setSaving(true);
    try {
      const { assigned } = await api.setLibraryAssignments(doc.id, [...selected]);
      toast.success(`Shared with ${assigned} ${assigned === 1 ? 'person' : 'people'}`);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Assign "${doc.title}"`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {countIn(students)} student{countIn(students) === 1 ? '' : 's'} · {countIn(tutors)} tutor{countIn(tutors) === 1 ? '' : 's'} selected
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {(['STUDENT', 'TUTOR'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md ${tab === t ? 'bg-white shadow-sm font-medium text-slate-900' : 'text-slate-500'}`}
            >
              {t === 'STUDENT' ? `Students (${countIn(students)})` : `Tutors (${countIn(tutors)})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${tab === 'STUDENT' ? 'students' : 'tutors'} by name or email`}
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <button onClick={toggleAll} disabled={!visible.length} className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap disabled:opacity-40">
            {allVisibleSelected ? 'Clear all' : 'Select all'}
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10 text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No {tab === 'STUDENT' ? 'students' : 'tutors'} found.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {visible.map((u) => (
              <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u.id)}
                  className="w-4 h-4 accent-amber-500"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{u.name || u.email}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
