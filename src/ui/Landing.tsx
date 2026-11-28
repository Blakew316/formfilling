/**
 * Start screen: one centred composition, the reactor mark lit on the page, the wordmark
 * and Open PDF, with saved documents below (a preview gallery on wide screens, a list on phones).
 * Dropping a PDF anywhere on the page also opens it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedDocMeta } from '../state/library';
import { Logo, Wordmark } from './Brand';
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

function edited(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Edited ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return `Edited ${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })}`;
}

/** True on phone-width screens, where the hero mark is drawn smaller. */
function useNarrow(): boolean {
  const query = '(max-width: 900px)';
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Readable title from a file name: no extension, separators as spaces. The file itself keeps its name. */
export function displayName(file: string): string {
  return file.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/(?<=\S)-(?=\d{4}\b)/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

const STATUS = {
  signed: 'Signed',
  filled: 'In progress',
  new: 'Not started',
} as const;

export function Landing({ busy, error, docs, onFile, onOpen, onDownload, onPrint, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => e.dataTransfer?.types.includes('Files') && (depth++, setDragging(true));
    const leave = () => --depth <= 0 && ((depth = 0), setDragging(false));
    const drop = () => ((depth = 0), setDragging(false));
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? docs.filter((d) => d.name.toLowerCase().includes(q)) : docs;
  }, [docs, query]);

  const choose = () => input.current?.click();
  const compact = useNarrow();

  return (
    <div className={`home${dragging ? ' is-dragging' : ''}${docs.length ? '' : ' is-empty'}`}>
      <div className="home-theme">
        <ThemeToggle />
      </div>

      <header className="hero">
        <div className="hero-mark">
          <Logo size={compact ? 220 : 280} />
        </div>
        <h1>
          <Wordmark />
        </h1>
        <p className="hero-line">Agreements, filled and signed.</p>
        <button className="button button-ink button-hero" disabled={busy} onClick={choose}>
          <Icon name="upload" size={20} />
          {busy ? 'Opening…' : 'Open PDF'}
        </button>
        {error && (
          <p className="hero-error" role="alert">
            {error}
          </p>
        )}
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
      </header>

      {docs.length > 0 && (
        <main className="shelf">
          <div className="shelf-head">
            <h2>Documents</h2>
            <span className="shelf-count">{docs.length}</span>
            {docs.length > 4 && (
              <label className="search">
                <input type="search" placeholder="Search" aria-label="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            )}
          </div>
          {shown.length === 0 && <p className="shelf-none">No documents match “{query}”.</p>}
          <ul className="grid">
            {shown.map((d) => {
              const status = d.signed ? 'signed' : d.filled ? 'filled' : 'new';
              return (
                <li key={d.id} className="tile">
                  <button className="tile-open" disabled={busy} onClick={() => onOpen(d.id)} aria-label={`Open ${displayName(d.name)}`}>
                    <span className="tile-sheet">{d.thumb ? <img src={d.thumb} alt="" /> : <span className="tile-blank" />}</span>
                    <span className="tile-body">
                      <strong title={d.name}>{displayName(d.name)}</strong>
                      <span className={`status status-${status}`}>{STATUS[status]}</span>
                      <span className="tile-meta">
                        {edited(d.updatedAt)}, {d.pages} {d.pages === 1 ? 'page' : 'pages'}
                      </span>
                    </span>
                  </button>
                  {confirm === d.id ? (
                    <div className="tile-actions is-confirm">
                      <button className="button button-danger" onClick={() => (onDelete(d.id), setConfirm(null))}>
                        Delete
                      </button>
                      <button className="button button-quiet" onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="tile-actions">
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
              );
            })}
          </ul>
        </main>
      )}

      <div className="drop-veil" aria-hidden="true">
        <span>Drop to open</span>
      </div>
    </div>
  );
}
