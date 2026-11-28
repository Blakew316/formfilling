/**
 * One page of the document: the rendered sheet, the blanks that can be filled,
 * the PDF's own form fields, and everything placed so far.
 * Pages render only while near the viewport, so long contracts stay light.
 */
import { useEffect, useRef, useState } from 'react';
import { ownerOf } from '../engine/autofill';
import type { FormWidget, PageInfo } from '../engine/types';
import { pdfjs } from '../pdf/pdfjs';
import { useWorkspace } from './context';
import { ItemView } from './ItemView';

/** Upper bound on canvas pixels; beyond this phones run out of memory. */
const MAX_PIXELS = 9_000_000;

function Widget({ widget }: { widget: FormWidget }) {
  const { state, dispatch, zoom } = useWorkspace();
  const value = state.present.formValues[widget.name] ?? widget.value;
  const set = (next: string) =>
    dispatch({
      type: 'edit',
      coalesce: `form:${widget.name}`,
      update: (c) => ({ ...c, formValues: { ...c.formValues, [widget.name]: next } }),
    });
  const style = {
    left: widget.rect.x * zoom,
    top: widget.rect.y * zoom,
    width: widget.rect.w * zoom,
    height: widget.rect.h * zoom,
    fontSize: Math.min(widget.fontSize || 11, widget.rect.h * 0.72) * zoom,
  };
  const common = { className: `widget widget-${widget.type}`, style, 'aria-label': widget.label || widget.name, disabled: widget.readOnly };

  if (widget.type === 'checkbox') {
    const on = value !== '' && value !== 'Off';
    return <input type="checkbox" {...common} checked={on} onChange={(e) => set(e.target.checked ? 'true' : '')} />;
  }
  if (widget.type === 'radio') {
    return <input type="radio" {...common} name={widget.name} checked={value === widget.exportValue} onChange={() => set(widget.exportValue ?? '')} />;
  }
  if (widget.type === 'select') {
    return (
      <select {...common} value={value} onChange={(e) => set(e.target.value)}>
        <option value="" />
        {widget.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (widget.multiline) return <textarea {...common} value={value} maxLength={widget.maxLength} onChange={(e) => set(e.target.value)} />;
  return <input type="text" {...common} value={value} maxLength={widget.maxLength} onChange={(e) => set(e.target.value)} />;
}

export function PageView({ page }: { page: PageInfo }) {
  const { doc, state, dispatch, saved, zoom, pulseId, fillField, placeAt } = useWorkspace();
  const frame = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(page.index < 2);
  const widgets = doc.widgets.filter((w) => w.page === page.index);
  const hasWidgets = widgets.length > 0;

  useEffect(() => {
    const el = frame.current!;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '900px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    // Zoom changes arrive in bursts; only the last one is worth rendering.
    const timer = setTimeout(async () => {
      const proxy = await doc.proxy.getPage(page.index + 1);
      if (cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const scale = Math.min(zoom * ratio, Math.sqrt(MAX_PIXELS / (page.width * page.height)));
      const viewport = proxy.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      task = proxy.render({
        canvas,
        viewport,
        annotationMode: hasWidgets ? pdfjs.AnnotationMode.ENABLE_FORMS : pdfjs.AnnotationMode.ENABLE,
      });
      try {
        await task.promise;
        if (!cancelled) sheet.current?.replaceChildren(canvas);
      } catch {
        // A cancelled render is expected when the zoom changes mid-draw.
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [near, zoom, doc.proxy, page.index, page.width, page.height, hasWidgets]);

  const items = state.present.items.filter((it) => it.page === page.index);
  const taken = new Set(state.present.items.map((it) => it.fieldId));
  const fields = doc.fields.filter((f) => f.page === page.index && !taken.has(f.id));

  return (
    <div
      ref={frame}
      className={`page${state.tool ? ' is-placing' : ''}`}
      style={{ width: page.width * zoom, height: page.height * zoom }}
      data-page={page.index}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('.page-sheet')) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (state.tool) placeAt(page.index, (e.clientX - box.left) / zoom, (e.clientY - box.top) / zoom);
        else if (state.selectedId) dispatch({ type: 'select', id: null });
      }}
    >
      <div ref={sheet} className="page-sheet" />
      {!state.tool &&
        fields.map((field) => {
          const owner = ownerOf(field, doc.blocks, saved.profile);
          const label = field.label || 'Fill';
          return (
            <button
              key={field.id}
              id={`slot-${field.id}`}
              className={`slot slot-${owner}${field.confidence !== 'auto' ? ' is-optional' : ''}${pulseId === field.id ? ' is-pulsing' : ''}`}
              style={{ left: field.rect.x * zoom, top: field.rect.y * zoom, width: field.rect.w * zoom, height: field.rect.h * zoom, fontSize: Math.min(10, field.rect.h * zoom * 0.6) }}
              title={owner === 'other' ? `${field.label} — this looks like the other party’s line` : `Fill ${field.label.toLowerCase() || 'this blank'}`}
              onClick={() => fillField(field)}
            >
              <span>{label}</span>
            </button>
          );
        })}
      {widgets.map((w) => (
        <Widget key={w.id} widget={w} />
      ))}
      {items.map((it) => (
        <ItemView key={it.id} item={it} page={page} />
      ))}
    </div>
  );
}
