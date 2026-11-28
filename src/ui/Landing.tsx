/** Start screen: open a PDF, or pick up a saved document. */
import { useRef, useState } from 'react';
import type { SavedDocMeta } from '../state/library';
import { Brand } from './Brand';
import { Icon } from './Icons';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  busy: boolean;
  error: string | null;
  docs: SavedDocMeta[];
  onFile: (file: File) => void;
  onOpen: (id: string) => void;
  onDownload: (id: string) => void;
  onPrint: (id: string) => void;
  onDelete: (id: string) => void;
}

function when(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function Landing({ busy, error, docs, onFile, onOpen, onDownload, onPrint, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <main className="landing">
      <div className="landing-head">
        <Brand size={44} />
        <ThemeToggle />
      </div>

      <button className="drop" disabled={busy} onClick={() => input.current?.click()}>
        <Icon name="upload" size={22} />
        <strong>{busy ? 'Opening…' : 'Open PDF'}</strong>
        <span>or drop it here</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      {error && (
        <p className="drop-error" role="alert">
          {error}
        </p>
      )}

      {docs.length > 0 && (
        <section className="library">
          <h2>Documents</h2>
          <ul>
            {docs.map((d) => (
              <li key={d.id}>
                <button className="library-open" onClick={() => onOpen(d.id)} disabled={busy}>
                  <strong>{d.name}</strong>
                  <span>
                    <em className={`state state-${d.signed ? 'signed' : d.filled ? 'filled' : 'new'}`}>{d.signed ? 'Signed' : d.filled ? 'In progress' : 'Not started'}</em>
                    {d.pages} {d.pages === 1 ? 'page' : 'pages'} · {when(d.updatedAt)}
                  </span>
                </button>
                {confirm === d.id ? (
                  <div className="library-actions">
                    <button className="button button-danger" onClick={() => (onDelete(d.id), setConfirm(null))}>
                      Delete
                    </button>
                    <button className="button button-plain" onClick={() => setConfirm(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="library-actions">
                    <button className="icon-button" aria-label="Download" title="Download" disabled={busy} onClick={() => onDownload(d.id)}>
                      <Icon name="download" />
                    </button>
                    <button className="icon-button" aria-label="Print" title="Print" disabled={busy} onClick={() => onPrint(d.id)}>
                      <Icon name="print" />
                    </button>
                    <button className="icon-button" aria-label="Delete" title="Delete" onClick={() => setConfirm(d.id)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
