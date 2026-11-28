/**
 * The editing screen. Owns the actions (fill a blank, Auto-fill, place, download)
 * and provides them to the page and panel components through context.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ownerOf, planAutofill, planFormFill } from '../engine/autofill';
import { EMPTY_PROFILE, profileKeyFor, valueFor } from '../engine/profile';
import type { Field, ImageItem, Item } from '../engine/types';
import { useEditor, type Content } from '../state/editor';
import { saveContent } from '../state/library';
import { clearSaved, type Saved, type SavedInk } from '../state/storage';
import { Ctx, type OpenDocument, type WorkspaceContext } from './context';
import { inkForField, itemForTool, textForField } from './fill';
import { Icon } from './Icons';
import { PageView } from './PageView';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Brand';
import { displayName } from './Landing';
import { SignatureDialog } from './SignatureDialog';
import { overflows } from './textMetrics';
import { downloadPdf, finishedPdf, outputName, printPdf } from './output';

interface Props {
  doc: OpenDocument;
  /** Saved content when reopening a document from the library. */
  initial?: Content;
  saved: Saved;
  updateSaved: (patch: Partial<Saved>) => void;
  onClose: () => void;
}

const TOOL_HINT = {
  text: 'Click to place text',
  date: 'Click to place date',
  check: 'Click to place check',
  signature: 'Click to sign',
  initials: 'Click to initial',
};

export function Workspace({ doc, initial, saved, updateSaved, onClose }: Props) {
  const [state, dispatch] = useEditor(initial);
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

  // Every change is saved to the document library shortly after it happens, and immediately on close.
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const pending = useRef<Content | null>(null);
  const flush = useCallback(async () => {
    const content = pending.current;
    if (!content) return;
    pending.current = null;
    try {
      await saveContent(doc.id, content);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [doc.id]);
  useEffect(() => {
    if (state.present === initial || (!initial && !state.past.length && !state.future.length)) return;
    pending.current = state.present;
    setSaveState('saving');
    const timer = setTimeout(flush, 400);
    return () => clearTimeout(timer);
  }, [state.present, state.past.length, state.future.length, initial, flush]);
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);
  const close = useCallback(async () => {
    await flush();
    onClose();
  }, [flush, onClose]);

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
      if (ownerOf(field, doc.blocks, sv.profile) === 'other') setToast('Other party’s line');
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
      if (copies.length) setToast(`Filled ${copies.length + 1}`);
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
      setToast(`Filled ${matches.length} more`);
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
      setToast(empty ? 'Add your details first' : tight ? `${tight} too long to fit. Fill by hand.` : 'Nothing to fill');

      if (empty) setPanelOpen(true);
      return;
    }
    dispatch({ type: 'edit', select: null, update: (c) => ({ items: [...c.items, ...items], formValues: { ...c.formValues, ...formFill } }) });
    setToast(`Filled ${count}${tight ? ` · ${tight} too long, fill by hand` : ''}`);
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

  const output = useCallback(
    async (mode: 'download' | 'print') => {
      const { state: s } = live.current;
      setSaving(true);
      try {
        const bytes = await finishedPdf(doc.bytes, doc.pages, s.present);
        if (mode === 'print') printPdf(bytes);
        else downloadPdf(bytes, outputName(doc.name, s.present));
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Couldn’t prepare the PDF.');
      } finally {
        setSaving(false);
      }
    },
    [doc.bytes, doc.name, doc.pages],
  );

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

        <div className="stage">
          <div ref={scroller} className="pages">
            {doc.pages.map((p) => (
              <PageView key={p.index} page={p} />
            ))}
          </div>
          <Sidebar
            top={
              <div className="side-top">
                <div className="side-row">
                  <button className="side-home" aria-label="All documents" title="All documents" onClick={close}>
                    <Icon name="back" size={16} />
                    <Logo size={28} />
                  </button>
                  <div className="side-file" title={doc.name}>
                    <strong>{displayName(doc.name)}</strong>
                    <span>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Saved'}</span>
                  </div>
                  <ThemeToggle />
                </div>
                <div className="side-row">
                  <button className="icon-button" aria-label="Undo" title="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}>
                    <Icon name="undo" />
                  </button>
                  <button className="icon-button" aria-label="Redo" title="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}>
                    <Icon name="redo" />
                  </button>
                  <div className="zoom">
                    <button className="icon-button" aria-label="Zoom out" disabled={factor <= 0.5} onClick={() => setFactor((f) => Math.max(0.5, f - 0.25))}>
                      <Icon name="minus" />
                    </button>
                    <button className="zoom-value" onClick={() => setFactor(1)} title="Fit width">
                      {Math.round(zoom * 100)}%
                    </button>
                    <button className="icon-button" aria-label="Zoom in" disabled={factor >= 3} onClick={() => setFactor((f) => Math.min(3, f + 0.25))}>
                      <Icon name="plus" />
                    </button>
                  </div>
                </div>
                <div className="side-actions">
                  <button className="button button-ink" disabled={saving} onClick={() => output('download')}>
                    <Icon name="download" size={18} />
                    {saving ? 'Preparing…' : 'Download'}
                  </button>
                  <button className="button button-quiet" disabled={saving} onClick={() => output('print')}>
                    <Icon name="print" size={18} />
                    Print
                  </button>
                </div>
              </div>
            }
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            onAutofill={autofill}
            onNext={nextBlank}
            onForget={() => {
              clearSaved();
              updateSaved({ profile: EMPTY_PROFILE, signature: null, initials: null });
              setToast('Details cleared');
            }}
          />
        </div>

        <div className="fab">
          <button className="button button-quiet" aria-label="Details and tools" onClick={() => setPanelOpen((o) => !o)}>
            <Icon name="panel" size={18} />
          </button>
          <button className="button button-ink" aria-label="Download" disabled={saving} onClick={() => output('download')}>
            <Icon name="download" size={18} />
          </button>
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
