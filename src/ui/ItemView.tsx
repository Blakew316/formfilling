/**
 * One thing placed on a page (text, signature, initials or a check mark) with its
 * select, move, resize, edit and delete behaviour. Positions are stored in page
 * units and multiplied by the zoom only here.
 */
import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Item, PageInfo } from '../engine/types';
import { useWorkspace } from './context';
import { Icon } from './Icons';
import { DOC_FONT, DOC_LINE_HEIGHT, textWidth } from './textMetrics';

function boxOf(item: Item): { w: number; h: number } {
  if (item.type === 'image') return { w: item.w, h: item.h };
  if (item.type === 'check') return { w: item.size, h: item.size };
  return { w: Math.max(textWidth(item.text || 'Text', item.fontSize), 12), h: item.fontSize * DOC_LINE_HEIGHT };
}

export function ItemView({ item, page }: { item: Item; page: PageInfo }) {
  const { state, dispatch, zoom, commitText } = useWorkspace();
  const selected = state.selectedId === item.id;
  const editing = state.editingId === item.id && item.type === 'text';
  const editor = useRef<HTMLDivElement>(null);

  // The editable node owns its text while focused; state only seeds it, so the caret never jumps.
  useLayoutEffect(() => {
    if (!editing || !editor.current || item.type !== 'text') return;
    const el = editor.current;
    el.textContent = item.text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const patch = (update: (it: Item) => Item, key: string) =>
    dispatch({
      type: 'edit',
      coalesce: key,
      update: (c) => ({ ...c, items: c.items.map((it) => (it.id === item.id ? update(it) : it)) }),
    });

  const startDrag = (e: ReactPointerEvent, mode: 'move' | 'resize') => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    const wasSelected = selected;
    if (!selected) dispatch({ type: 'select', id: item.id });
    const start = { x: e.clientX, y: e.clientY };
    const origin = item;
    const size = boxOf(origin);
    const key = `${mode}:${item.id}:${Date.now()}`;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / zoom;
      const dy = (ev.clientY - start.y) / zoom;
      if (!moved && Math.hypot(dx, dy) * zoom < 3) return;
      moved = true;
      if (mode === 'move') {
        const x = Math.min(Math.max(0, origin.x + dx), page.width - size.w);
        const y = Math.min(Math.max(0, origin.y + dy), page.height - size.h);
        patch((it) => ({ ...it, x, y }), key);
        return;
      }
      const factor = Math.min(6, Math.max(0.3, (size.w + dx) / size.w));
      patch((it) => {
        if (it.type === 'image' && origin.type === 'image') return { ...it, w: Math.max(18, origin.w * factor), h: Math.max(18, origin.w * factor) * (origin.h / origin.w) };
        if (it.type === 'check' && origin.type === 'check') return { ...it, size: Math.min(48, Math.max(8, origin.size * factor)) };
        if (it.type === 'text' && origin.type === 'text') return { ...it, fontSize: Math.min(48, Math.max(6.5, Math.round(origin.fontSize * factor * 2) / 2)) };
        return it;
      }, key);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // A click on text that was already selected means "edit this".
      if (!moved && mode === 'move' && wasSelected && item.type === 'text') dispatch({ type: 'select', id: item.id, editing: true });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const remove = () =>
    dispatch({ type: 'edit', select: null, editing: null, update: (c) => ({ ...c, items: c.items.filter((it) => it.id !== item.id) }) });

  const { w, h } = boxOf(item);
  const style = { left: item.x * zoom, top: item.y * zoom, width: item.type === 'text' ? undefined : w * zoom, height: h * zoom };

  return (
    <div
      className={`item item-${item.type}${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
      style={style}
      data-item={item.id}
      onPointerDown={(e) => startDrag(e, 'move')}
      onDoubleClick={() => item.type === 'text' && dispatch({ type: 'select', id: item.id, editing: true })}
    >
      {item.type === 'text' &&
        (editing ? (
          <div
            ref={editor}
            className="item-text"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-label="Text on document"
            style={{ font: `${item.fontSize * zoom}px/${DOC_LINE_HEIGHT} ${DOC_FONT}` }}
            onPointerDown={(e) => e.stopPropagation()}
            onInput={(e) => {
              const text = (e.currentTarget.textContent ?? '').replace(/\n/g, ' ');
              patch((it) => (it.type === 'text' ? { ...it, text } : it), `text:${item.id}`);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onBlur={() => commitText(item.id)}
          />
        ) : (
          <div className={`item-text${item.text ? '' : ' is-empty'}`} style={{ font: `${item.fontSize * zoom}px/${DOC_LINE_HEIGHT} ${DOC_FONT}` }}>
            {item.text || 'Text'}
          </div>
        ))}
      {item.type === 'image' && <img src={item.src} alt={item.role === 'signature' ? 'Your signature' : 'Your initials'} draggable={false} />}
      {item.type === 'check' && (
        <svg viewBox="0 0 100 100" aria-label="Check mark">
          <path d="M14 55 40 82 88 20" fill="none" stroke="currentColor" strokeWidth="12" />
        </svg>
      )}
      {selected && !editing && (
        <>
          <button className="item-remove" aria-label="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={remove}>
            <Icon name="close" size={12} />
          </button>
          <span className="item-resize" aria-hidden="true" onPointerDown={(e) => startDrag(e, 'resize')} />
        </>
      )}
    </div>
  );
}
