/**
 * Top of the app: saved details, the saved-documents list, and switching between
 * the start screen and the editor. Every opened PDF is stored (src/state/library.ts)
 * so it can be reopened, downloaded or printed later.
 */
import { useCallback, useEffect, useState } from 'react';
import { detectFields } from './engine/detect';
import type { Content } from './state/editor';
import { createDoc, deleteDoc, listDocs, loadDoc, requestPersistence, setThumb, type SavedDocMeta } from './state/library';
import { loadSaved, storeSaved, type Saved } from './state/storage';
import type { OpenDocument } from './ui/context';
import { Landing } from './ui/Landing';
import { downloadPdf, finishedPdf, outputName, printPdf } from './ui/output';
import { Workspace } from './ui/Workspace';

const MAX_BYTES = 80 * 1024 * 1024;

export function App() {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [doc, setDoc] = useState<{ open: OpenDocument; content?: Content } | null>(null);
  const [docs, setDocs] = useState<SavedDocMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listDocs();
    setDocs(list);
    // Documents saved before previews existed get one in the background.
    const missing = list.filter((d) => !d.thumb);
    if (!missing.length) return;
    const { openPdf, renderThumb } = await import('./pdf/pdfjs');
    for (const d of missing) {
      try {
        const record = await loadDoc(d.id);
        if (!record) continue;
        const pdf = await openPdf(record.bytes);
        const thumb = await renderThumb(pdf.proxy);
        pdf.proxy.loadingTask.destroy();
        await setThumb(d.id, thumb);
        setDocs((cur) => cur.map((x) => (x.id === d.id ? { ...x, thumb } : x)));
      } catch {
        // A document that cannot be previewed still opens; it just shows no picture.
      }
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateSaved = useCallback((patch: Partial<Saved>) => {
    setSaved((current) => {
      const next = { ...current, ...patch };
      storeSaved(next);
      return next;
    });
  }, []);

  /** Runs a step that needs the PDF engine, showing its error message on the start screen. */
  const guarded = useCallback(async (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, []);

  const openBytes = useCallback(
    async (id: string, name: string, bytes: Uint8Array, content?: Content) => {
      const { openPdf } = await import('./pdf/pdfjs');
      const pdf = await openPdf(bytes);
      const { fields, blocks } = detectFields(pdf.texts);
      setDoc({
        open: { id, name, bytes, proxy: pdf.proxy, pages: pdf.pages, fields, blocks, widgets: pdf.widgets, sealed: pdf.hasDigitalSignature },
        content,
      });
    },
    [],
  );

  const openFile = useCallback(
    (file: File) =>
      guarded(async () => {
        if (file.size > MAX_BYTES) throw new Error('File is over 80 MB.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { openPdf, renderThumb } = await import('./pdf/pdfjs');
        const pdf = await openPdf(bytes);
        const thumb = await renderThumb(pdf.proxy).catch(() => undefined);
        pdf.proxy.loadingTask.destroy();
        requestPersistence();
        const id = await createDoc(file.name, bytes, pdf.pages.length, thumb);
        await openBytes(id, file.name, bytes);
      }),
    [guarded, openBytes],
  );

  const openSaved = useCallback(
    (id: string) =>
      guarded(async () => {
        const record = await loadDoc(id);
        if (!record) throw new Error('That document is no longer saved.');
        await openBytes(id, record.name, record.bytes, record.content);
      }),
    [guarded, openBytes],
  );

  const output = useCallback(
    (id: string, mode: 'download' | 'print') =>
      guarded(async () => {
        const record = await loadDoc(id);
        if (!record) throw new Error('That document is no longer saved.');
        const { openPdf } = await import('./pdf/pdfjs');
        const pdf = await openPdf(record.bytes);
        const bytes = await finishedPdf(record.bytes, pdf.pages, record.content);
        pdf.proxy.loadingTask.destroy();
        if (mode === 'print') printPdf(bytes);
        else downloadPdf(bytes, outputName(record.name, record.content));
      }),
    [guarded],
  );

  useEffect(() => {
    const allow = (e: DragEvent) => e.dataTransfer?.types.includes('Files') && e.preventDefault();
    const drop = (e: DragEvent) => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      openFile(file);
    };
    window.addEventListener('dragover', allow);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', allow);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);

  const close = useCallback(() => {
    doc?.open.proxy.loadingTask.destroy();
    setDoc(null);
    refresh();
  }, [doc, refresh]);

  if (doc) return <Workspace key={doc.open.id} doc={doc.open} initial={doc.content} saved={saved} updateSaved={updateSaved} onClose={close} />;
  return (
    <Landing
      busy={busy}
      error={error}
      docs={docs}
      onFile={openFile}
      onOpen={openSaved}
      onDownload={(id) => output(id, 'download')}
      onPrint={(id) => output(id, 'print')}
      onDelete={(id) => deleteDoc(id).then(refresh)}
    />
  );
}
