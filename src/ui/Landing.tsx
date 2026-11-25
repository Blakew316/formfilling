/** The first screen: what the site does and the one action that starts it, choosing a PDF. */
import { useRef, useState } from 'react';
import { Icon } from './Icons';

interface Props {
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onSample: () => void;
}

const POINTS = [
  { icon: 'sparkle', title: 'Fills itself in', text: 'Finds the blanks in a contract or form and completes them from your saved details.' },
  { icon: 'signature', title: 'Sign once', text: 'Draw or type your signature. It lands on your signature line, not the other party’s.' },
  { icon: 'lock', title: 'Stays on your device', text: 'Your PDF is opened and saved in this browser. Nothing is uploaded.' },
] as const;

export function Landing({ busy, error, onFile, onSample }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <main className="landing">
      <p className="eyebrow">PDF fill &amp; sign</p>
      <h1>
        Fill it. Sign it.
        <br />
        <span>Done.</span>
      </h1>
      <p className="lede">Import a PDF, let it fill in your details, add your signature and download the finished copy.</p>

      <div
        className={`drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      >
        <div className="drop-icon">
          <Icon name="doc" size={28} />
        </div>
        <button className="button button-primary button-large" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" size={18} />
          {busy ? 'Opening…' : 'Choose a PDF'}
        </button>
        <p className="drop-hint">or drop a file anywhere on this page</p>
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
      </div>

      <button className="link link-quiet" disabled={busy} onClick={onSample}>
        No PDF handy? Try a sample agreement <Icon name="arrow" size={14} />
      </button>

      <ul className="points">
        {POINTS.map((p) => (
          <li key={p.title}>
            <span className="point-icon">
              <Icon name={p.icon} />
            </span>
            <h2>{p.title}</h2>
            <p>{p.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
