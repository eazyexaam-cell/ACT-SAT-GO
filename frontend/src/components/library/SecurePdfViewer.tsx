import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Minus, Plus, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api } from '../../lib/api';

/**
 * In-app PDF viewer for the ASG Library.
 *
 * Pages are drawn onto <canvas> elements with pdf.js, so there is no browser
 * PDF viewer (with its print / download buttons) and no link to the file.
 * When `allowPrint` is false (students and tutors) it also blocks Ctrl/Cmd+P
 * and Ctrl/Cmd+S, blanks the page if printing is started from the browser
 * menu, disables right-click and dragging, and stamps a faint watermark with
 * the viewer's name on every page. A determined user can still take
 * screenshots — a web page can't prevent that.
 */
export function SecurePdfViewer({
  documentId,
  title,
  watermark,
  allowPrint,
  onClose,
}: {
  documentId: string;
  title: string;
  watermark: string;
  allowPrint: boolean;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [aspect, setAspect] = useState(1.294); // letter portrait until page 1 is measured
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const bytes = await api.getLibraryDocumentFile(documentId);
        if (allowPrint) bytesRef.current = bytes.slice(0);
        // The "legacy" build runs on older browsers (e.g. Safari / Chrome
        // versions from the last couple of years) that the modern build doesn't.
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
        loaded = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) { loaded.destroy(); return; }
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setAspect(vp.height / vp.width);
        setPdf(loaded);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'Could not open the document');
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [documentId, allowPrint]);

  // Fit pages to the available width.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(el.clientWidth - 32, 900));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Esc closes; for students/tutors block print and save shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (allowPrint) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's')) {
        e.preventDefault();
        e.stopPropagation();
        toast.error('Printing and saving are turned off for library documents.');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [allowPrint, onClose]);

  // Print from the browser menu: print a blank page; and disable window.print.
  useEffect(() => {
    if (allowPrint) return;
    const style = document.createElement('style');
    style.setAttribute('data-asg-library', 'no-print');
    style.textContent = '@media print { html, body { display: none !important; } }';
    document.head.appendChild(style);
    const originalPrint = window.print;
    window.print = () => { toast.error('Printing is turned off for library documents.'); };
    return () => {
      style.remove();
      window.print = originalPrint;
    };
  }, [allowPrint]);

  const download = () => {
    if (!bytesRef.current) return;
    const url = URL.createObjectURL(new Blob([bytesRef.current], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w .-]/g, '_') || 'document'}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const pageWidth = Math.max(240, Math.round(width * zoom));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 select-none"
      onContextMenu={allowPrint ? undefined : (e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-[#0B1E36] text-white border-b border-white/10">
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{title}</p>
          {!allowPrint && (
            <p className="text-xs text-slate-300 flex items-center gap-1">
              <ShieldCheck size={12} /> View only — printing and downloading are turned off
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="p-2 rounded-lg hover:bg-white/10"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            className="p-2 rounded-lg hover:bg-white/10"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
        </div>
        {allowPrint && (
          <button
            onClick={download}
            disabled={!pdf}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 disabled:opacity-50"
          >
            <Download size={14} /> Download
          </button>
        )}
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto py-4">
        {error ? (
          <p className="text-center text-red-300 mt-20">{error}</p>
        ) : !pdf || !width ? (
          <div className="flex items-center justify-center mt-20 text-slate-300">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <PdfPage
                key={i + 1}
                pdf={pdf}
                pageNumber={i + 1}
                width={pageWidth}
                placeholderHeight={Math.round(pageWidth * aspect)}
                watermark={allowPrint ? '' : watermark}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  width,
  placeholderHeight,
  watermark,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  placeholderHeight: number;
  watermark: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [height, setHeight] = useState(placeholderHeight);

  // Only render pages near the viewport.
  useEffect(() => {
    const el = holderRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      setHeight(Math.floor(viewport.height / dpr));
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch {
        return; // cancelled by a newer render
      }
      if (cancelled || !watermark) return;
      const ctx = canvas.getContext('2d');
      if (ctx) drawWatermark(ctx, canvas.width, canvas.height, watermark, dpr);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width, visible, watermark]);

  return (
    <div ref={holderRef} className="bg-white shadow-lg" style={{ width, minHeight: height }}>
      <canvas ref={canvasRef} draggable={false} className="block" />
    </div>
  );
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, dpr: number) {
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#0B1E36';
  ctx.font = `600 ${Math.round(16 * dpr)}px sans-serif`;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const stepX = ctx.measureText(text).width + 80 * dpr;
  const stepY = 110 * dpr;
  const reach = Math.hypot(w, h);
  for (let y = -reach; y < reach; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -reach; x < reach; x += stepX) ctx.fillText(text, x + offset, y);
  }
  ctx.restore();
}
