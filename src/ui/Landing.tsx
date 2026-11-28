/** The first screen: one job, choosing the PDF to fill and sign. */
import { useRef, useState } from 'react';
import { Icon } from './Icons';

interface Props {
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onSample: () => void;
}

export function Landing({ busy, error, onFile, onSample }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <main className="landing">
      <h1>Fill and sign a document</h1>
      <p className="lede">Open an agreement, complete the blanks from your saved details, sign, and download the finished PDF.</p>

      <div
        className={`drop${over ? ' is-over' : ''}`}
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
        <button className="button button-primary button-large" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" size={18} />
          {busy ? 'Opening…' : 'Choose PDF'}
        </button>
        <p className="drop-hint">or drag a file here</p>
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

      <p className="landing-note">
        <Icon name="lock" size={14} />
        Documents are opened and saved in this browser. Nothing is uploaded.
      </p>
      <button className="link landing-sample" disabled={busy} onClick={onSample}>
        Open a sample agreement
      </button>
    </main>
  );
}
