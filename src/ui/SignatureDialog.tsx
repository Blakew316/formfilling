/**
 * Dialog for creating a signature or initials by drawing or by typing a name
 * in a handwriting face. Hands back trimmed ink; saving it is the caller's job.
 */
import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { initialsOf } from '../engine/profile';
import type { ImageItem } from '../engine/types';
import type { SavedInk } from '../state/storage';
import { Icon } from './Icons';
import { INK_COLORS, INK_STYLES, loadInkFonts, trimToInk, typedInk } from './ink';

interface Props {
  role: ImageItem['role'];
  fullName: string;
  onSave: (ink: SavedInk) => void;
  onClose: () => void;
}

export function SignatureDialog({ role, fullName, onSave, onClose }: Props) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [color, setColor] = useState(INK_COLORS[0].value);
  const [typed, setTyped] = useState(role === 'initials' ? initialsOf(fullName) : fullName);
  const [styleId, setStyleId] = useState(INK_STYLES[0].id);
  const [fontsReady, setFontsReady] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const noun = role === 'signature' ? 'signature' : 'initials';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (mode !== 'draw' || !canvas.current) return;
    const el = canvas.current;
    // Backing store at 3x the layout size so the saved ink stays crisp in print.
    const ratio = 3;
    el.width = el.offsetWidth * ratio;
    el.height = el.offsetHeight * ratio;
    el.getContext('2d')!.scale(ratio, ratio);
    const instance = new SignaturePad(el, { penColor: color, minWidth: 0.8, maxWidth: 2.6, throttle: 8 });
    instance.addEventListener('endStroke', () => setHasInk(!instance.isEmpty()));
    pad.current = instance;
    setHasInk(false);
    return () => {
      instance.off();
      pad.current = null;
    };
    // The pad is rebuilt only when the tab changes; colour changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (pad.current) pad.current.penColor = color;
  }, [color]);

  useEffect(() => {
    if (mode === 'type' && !fontsReady) loadInkFonts().then(() => setFontsReady(true), () => setFontsReady(true));
  }, [mode, fontsReady]);

  const save = () => {
    const ink =
      mode === 'draw'
        ? canvas.current && trimToInk(canvas.current)
        : typedInk(typed, INK_STYLES.find((s) => s.id === styleId)!, color);
    if (ink) onSave(ink);
  };
  const canSave = mode === 'draw' ? hasInk : fontsReady && typed.trim() !== '';

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={noun === 'signature' ? 'Signature' : 'Initials'}>
        <header className="dialog-head">
          <h2>{noun === 'signature' ? 'Signature' : 'Initials'}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <div className="segmented" role="tablist">
          {(['draw', 'type'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => setMode(m)}>
              {m === 'draw' ? 'Draw' : 'Type'}
            </button>
          ))}
        </div>

        {mode === 'draw' ? (
          <div className="pad">
            <canvas ref={canvas} aria-label={`Draw your ${noun} here`} />
            <span className="pad-line" />
            {!hasInk && <span className="pad-hint">Sign here</span>}
            {hasInk && (
              <button
                className="pad-clear"
                onClick={() => {
                  pad.current?.clear();
                  setHasInk(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        ) : (
          <div className="typed">
            <input
              className="input"
              value={typed}
              autoFocus
              placeholder={role === 'signature' ? 'Full name' : 'Initials'}
              aria-label={role === 'signature' ? 'Full name' : 'Initials'}
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="typed-styles" role="radiogroup" aria-label="Handwriting style">
              {INK_STYLES.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={styleId === s.id}
                  className={styleId === s.id ? 'is-on' : ''}
                  style={{ fontFamily: `"${s.family}", cursive`, fontSize: 30 * s.scale, color, opacity: fontsReady ? 1 : 0 }}
                  onClick={() => setStyleId(s.id)}
                >
                  {typed || (role === 'signature' ? 'Name' : 'AB')}
                </button>
              ))}
            </div>
          </div>
        )}

        <footer className="dialog-foot">
          <div className="swatches" role="radiogroup" aria-label="Ink colour">
            {INK_COLORS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={color === c.value}
                aria-label={c.label}
                className={color === c.value ? 'is-on' : ''}
                style={{ background: c.value }}
                onClick={() => setColor(c.value)}
              />
            ))}
          </div>
          <button className="button button-ink" disabled={!canSave} onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
