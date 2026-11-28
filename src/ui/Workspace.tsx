/**
 * The editing screen. Owns the actions (fill a blank, Auto-fill, place, download)
 * and provides them to the page and panel components through context.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ownerOf, planAutofill, planFormFill } from '../engine/autofill';
import { EMPTY_PROFILE, profileKeyFor, valueFor } from '../engine/profile';
import type { Field, ImageItem, Item } from '../engine/types';
import { useEditor } from '../state/editor';
import { clearSaved, type Saved, type SavedInk } from '../state/storage';
import { Ctx, type OpenDocument, type WorkspaceContext } from './context';
import { inkForField, itemForTool, textForField } from './fill';
import { Icon } from './Icons';
import { PageView } from './PageView';
import { Sidebar } from './Sidebar';
import { SignatureDialog } from './SignatureDialog';
import { baselineRatio, overflows, rasterizeText } from './textMetrics';

interface Props {
  doc: OpenDocument;
  saved: Saved;
  updateSaved: (patch: Partial<Saved>) => void;
  onClose: () => void;
}

const TOOL_HINT = {
  text: 'Click where the text should go',
  date: 'Click where the date should go',
  check: 'Click where the check mark should go',
  signature: 'Click where you want to sign',
  initials: 'Click where your initials should go',
};

export function Workspace({ doc, saved, updateSaved, onClose }: Props) {
  const [state, dispatch] = useEditor();
  const [factor, setFactor] = useState(1);
  const [fit, setFit] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ role: ImageItem['role']; then?: (ink: SavedInk) => void } | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const live = useRef({ state, saved });
  live.current = { state, saved };

  const widest = useMemo(() => Math.max(...doc.pages.map((p) => p.width)), [doc.pages]);
  useEffect(() => {
    const el = scroller.current!;
    const measure = () => setFit(Math.min(1.25, Math.max(0.3, (el.clientWidth - 48) / widest)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [widest]);
  const zoom = fit * factor;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const addItems = useCallback(
    (items: Item[], select?: string | null, editing?: string | null) =>
      dispatch({ type: 'edit', select, editing, update: (c) => ({ ...c, items: [...c.items, ...items] }) }),
    [dispatch],
  );

  const requestInk = useCallback((role: ImageItem['role'], then?: (ink: SavedInk) => void) => setDialog({ role, then }), []);

  /** Unfilled blanks that repeat `field` on other pages (a running header, for example). */
  const repeatsOf = useCallback(
    (field: Field) => {
      const taken = new Set(live.current.state.present.items.map((it) => it.fieldId));
      return field.repeatKey ? doc.fields.filter((f) => f.repeatKey === field.repeatKey && f.id !== field.id && !taken.has(f.id)) : [];
    },
    [doc.fields],
  );

  const fillField = useCallback(
    (field: Field) => {
      const { state: s, saved: sv } = live.current;
      const existing = s.present.items.find((it) => it.fieldId === field.id);
      if (existing) return dispatch({ type: 'select', id: existing.id });
      if (ownerOf(field, doc.blocks, sv.profile) === 'other') setToast('That looks like the other party’s line. Undo if you did not mean to fill it.');
      if (field.kind === 'signature' || field.kind === 'initials') {
        const role = field.kind;
        const place = (ink: SavedInk) => {
          const item = inkForField(field, ink, role);
          addItems([item, ...repeatsOf(field).map((f) => inkForField(f, ink, role))], item.id);
        };
        return sv[role] ? place(sv[role]!) : requestInk(role, place);
      }
      const text = valueFor(field.kind, sv.profile, new Date());
      const item = textForField(field, text);
      const copies = text ? repeatsOf(field).map((f) => textForField(f, text)) : [];
      addItems([item, ...copies], item.id, text ? null : item.id);
      if (copies.length) setToast(`Filled ${copies.length + 1} matching blanks.`);
    },
    [addItems, dispatch, doc.blocks, repeatsOf, requestInk],
  );

  const commitText = useCallback(
    (id: string) => {
      const { state: s, saved: sv } = live.current;
      const item = s.present.items.find((it) => it.id === id);
      if (!item || item.type !== 'text') return;
      if (!item.text.trim()) {
        dispatch({ type: 'edit', select: null, editing: null, update: (c) => ({ ...c, items: c.items.filter((it) => it.id !== id) }) });
        return;
      }
      dispatch({ type: 'select', id });
      const field = doc.fields.find((f) => f.id === item.fieldId);
      if (!field) return;
      const text = item.text.trim();
      const key = profileKeyFor(field.kind);
      const learn = key && !sv.profile[key];
      if (learn) updateSaved({ profile: { ...sv.profile, [key]: text } });
      const taken = new Set(s.present.items.map((it) => it.fieldId));
      const matches = doc.fields.filter(
        (f) =>
          f.id !== field.id &&
          !taken.has(f.id) &&
          ((field.repeatKey && f.repeatKey === field.repeatKey) ||
            (learn && f.kind === field.kind && f.confidence === 'auto' && ownerOf(f, doc.blocks, sv.profile) === 'me')),
      );
      if (!matches.length) return;
      addItems(matches.map((f) => textForField(f, text)));
      setToast(`Filled ${matches.length} matching ${matches.length === 1 ? 'blank' : 'blanks'}${learn ? ' and saved it to your details' : ''}.`);
    },
    [addItems, dispatch, doc.blocks, doc.fields, updateSaved],
  );

  const placeAt = useCallback(
    (page: number, x: number, y: number) => {
      const { state: s, saved: sv } = live.current;
      if (!s.tool) return;
      const item = itemForTool(s.tool, page, x, y, sv.profile, sv);
      if (!item) return;
      addItems([item], item.id, s.tool === 'text' ? item.id : null);
      dispatch({ type: 'tool', tool: null });
      dispatch({ type: 'select', id: item.id, editing: s.tool === 'text' });
    },
    [addItems, dispatch],
  );

  const autofill = useCallback(() => {
    const { state: s, saved: sv } = live.current;
    const today = new Date();
    const wantsSignature = doc.fields.some((f) => f.kind === 'signature' && f.confidence === 'auto' && ownerOf(f, doc.blocks, sv.profile) === 'me');
    if (wantsSignature && !sv.signature) return requestInk('signature', () => setTimeout(autofill, 0));
    const planned = planAutofill({
      fields: doc.fields,
      blocks: doc.blocks,
      profile: sv.profile,
      today,
      filled: new Set(s.present.items.flatMap((it) => (it.fieldId ? [it.fieldId] : []))),
      hasSignature: !!sv.signature,
      hasInitials: !!sv.initials,
    });
    // A value that would spill over the neighbouring words is left for the person to place by hand.
    const plan = planned.filter((a) => a.type !== 'text' || !overflows(a.text, a.field.rect.w));
    const tight = planned.length - plan.length;
    const items = plan.map((a) => (a.type === 'text' ? textForField(a.field, a.text) : inkForField(a.field, sv[a.role]!, a.role)));
    const formFill = planFormFill(doc.widgets, s.present.formValues, sv.profile, today);
    const count = items.length + Object.keys(formFill).length;
    if (count === 0) {
      const empty = Object.entries(sv.profile).every(([k, v]) => k === 'dateFormat' || !v);
      setToast(
        empty
          ? 'Add your details in the panel, then Auto-fill can complete the blanks.'
          : tight
            ? `${tight} ${tight === 1 ? 'blank is' : 'blanks are'} too short for your details. Click one to place the text yourself.`
            : 'Nothing more to fill automatically. Click any highlighted blank to fill it.',
      );
      if (empty) setPanelOpen(true);
      return;
    }
    dispatch({ type: 'edit', select: null, update: (c) => ({ items: [...c.items, ...items], formValues: { ...c.formValues, ...formFill } }) });
    setToast(
      `Filled ${count} ${count === 1 ? 'blank' : 'blanks'}. ${tight ? `${tight} too short to fill were left for you. ` : ''}Check each one before you download.`,
    );
  }, [dispatch, doc.blocks, doc.fields, doc.widgets, requestInk]);

  const nextBlank = useCallback(() => {
    const { state: s, saved: sv } = live.current;
    const taken = new Set(s.present.items.map((it) => it.fieldId));
    const open = doc.fields.filter((f) => !taken.has(f.id) && ownerOf(f, doc.blocks, sv.profile) !== 'other');
    if (!open.length) return;
    const at = open.findIndex((f) => f.id === pulseId);
    const target = open[(at + 1) % open.length];
    setPulseId(target.id);
    setPanelOpen(false);
    const page = scroller.current!.querySelector<HTMLElement>(`[data-page="${target.page}"]`);
    if (page) scroller.current!.scrollTo({ top: page.offsetTop + target.rect.y * zoom - scroller.current!.clientHeight / 3, behavior: 'smooth' });
  }, [doc.blocks, doc.fields, pulseId, zoom]);

  const download = useCallback(async () => {
    const { state: s } = live.current;
    setSaving(true);
    try {
      const { exportPdf } = await import('../engine/exportPdf');
      const bytes = await exportPdf({
        bytes: doc.bytes,
        pages: doc.pages,
        items: s.present.items,
        formValues: s.present.formValues,
        baselineRatio: baselineRatio(),
        rasterizeText: (item) => rasterizeText(item.text, item.fontSize),
      });
      const signed = s.present.items.some((it) => it.type === 'image');
      const name = `${doc.name.replace(/\.pdf$/i, '')}-${signed ? 'signed' : 'filled'}.pdf`;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setToast(`Saved ${name}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The download could not be prepared.');
    } finally {
      setSaving(false);
    }
  }, [doc.bytes, doc.name, doc.pages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || dialog) return;
      const { state: s } = live.current;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (e.key === 'Escape') {
        dispatch(s.tool ? { type: 'tool', tool: null } : { type: 'select', id: null });
      } else if (s.selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        dispatch({ type: 'edit', select: null, update: (c) => ({ ...c, items: c.items.filter((it) => it.id !== s.selectedId) }) });
      } else if (s.selectedId && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        dispatch({
          type: 'edit',
          coalesce: `nudge:${s.selectedId}`,
          update: (c) => ({ ...c, items: c.items.map((it) => (it.id === s.selectedId ? { ...it, x: it.x + dx, y: it.y + dy } : it)) }),
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, dispatch]);

  const context: WorkspaceContext = { doc, state, dispatch, saved, updateSaved, zoom, pulseId, fillField, commitText, placeAt, requestInk };

  return (
    <Ctx.Provider value={context}>
      <div className="workspace">
        <header className="bar">
          <button className="brand" onClick={onClose} title="Close this document">
            <span className="brand-mark" />
            <span className="brand-name">Suit Up</span>
          </button>
          <div className="bar-file" title={doc.name}>
            <strong>{doc.name}</strong>
            <span>
              {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
            </span>
          </div>
          <div className="bar-actions">
            <button className="icon-button" aria-label="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}>
              <Icon name="undo" />
            </button>
            <button className="icon-button" aria-label="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}>
              <Icon name="redo" />
            </button>
            <div className="zoom">
              <button className="icon-button" aria-label="Zoom out" disabled={factor <= 0.5} onClick={() => setFactor((f) => Math.max(0.5, f - 0.25))}>
                <Icon name="minus" />
              </button>
              <button className="zoom-value" onClick={() => setFactor(1)} title="Fit to width">
                {Math.round(zoom * 100)}%
              </button>
              <button className="icon-button" aria-label="Zoom in" disabled={factor >= 3} onClick={() => setFactor((f) => Math.min(3, f + 0.25))}>
                <Icon name="plus" />
              </button>
            </div>
            <button className="icon-button panel-toggle" aria-label="Details and tools" onClick={() => setPanelOpen((o) => !o)}>
              <Icon name="panel" />
            </button>
            <button className="button button-primary" disabled={saving} onClick={download}>
              <Icon name="download" size={18} />
              <span>{saving ? 'Preparing…' : 'Download'}</span>
            </button>
          </div>
        </header>

        <div className="stage">
          <div ref={scroller} className="pages">
            {doc.pages.map((p) => (
              <PageView key={p.index} page={p} />
            ))}
          </div>
          <Sidebar
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            onAutofill={autofill}
            onNext={nextBlank}
            onForget={() => {
              clearSaved();
              updateSaved({ profile: EMPTY_PROFILE, signature: null, initials: null });
              setToast('Your saved details and signature were removed from this browser.');
            }}
          />
        </div>

        {state.tool && (
          <div className="hint" role="status">
            {TOOL_HINT[state.tool]}
            <button className="link" onClick={() => dispatch({ type: 'tool', tool: null })}>
              Cancel
            </button>
          </div>
        )}
        {toast && !state.tool && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        {dialog && (
          <SignatureDialog
            role={dialog.role}
            fullName={saved.profile.fullName}
            onClose={() => setDialog(null)}
            onSave={(ink) => {
              updateSaved({ [dialog.role]: ink });
              live.current = { ...live.current, saved: { ...live.current.saved, [dialog.role]: ink } };
              const then = dialog.then;
              setDialog(null);
              then?.(ink);
            }}
          />
        )}
      </div>
    </Ctx.Provider>
  );
}
