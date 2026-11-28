/**
 * Top of the app: holds the saved details and the open document, and switches
 * between the landing screen and the workspace.
 */
import { useCallback, useEffect, useState } from 'react';
import { detectFields } from './engine/detect';
import { loadSaved, storeSaved, type Saved } from './state/storage';
import type { OpenDocument } from './ui/context';
import { Landing } from './ui/Landing';
import { Workspace } from './ui/Workspace';

/** Files beyond this are almost never forms, and would stall a phone. */
const MAX_BYTES = 80 * 1024 * 1024;

export function App() {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSaved = useCallback((patch: Partial<Saved>) => {
    setSaved((current) => {
      const next = { ...current, ...patch };
      storeSaved(next);
      return next;
    });
  }, []);

  const open = useCallback(async (name: string, bytes: Uint8Array) => {
    setBusy(true);
    setError(null);
    try {
      const { openPdf } = await import('./pdf/pdfjs');
      const pdf = await openPdf(bytes);
      const { fields, blocks } = detectFields(pdf.texts);
      setDoc({ name, bytes, proxy: pdf.proxy, pages: pdf.pages, fields, blocks, widgets: pdf.widgets, sealed: pdf.hasDigitalSignature });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be opened.');
    } finally {
      setBusy(false);
    }
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) return setError('That file is larger than 80 MB, which is more than this page can open.');
      open(file.name, new Uint8Array(await file.arrayBuffer()));
    },
    [open],
  );

  const openSample = useCallback(async () => {
    const { buildSampleContract } = await import('./sample/sampleContract');
    open('Sample agreement.pdf', await buildSampleContract());
  }, [open]);

  // A PDF dropped anywhere on the window opens, including over an already open document.
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
    doc?.proxy.loadingTask.destroy();
    setDoc(null);
  }, [doc]);

  if (doc) return <Workspace key={doc.name + doc.bytes.length} doc={doc} saved={saved} updateSaved={updateSaved} onClose={close} />;
  return (
    <>
      <header className="bar bar-landing">
        <span className="brand">
          <span className="brand-mark" />
          <span className="brand-name">Suit Up</span>
        </span>
      </header>
      <Landing busy={busy} error={error} onFile={openFile} onSample={openSample} />
    </>
  );
}
