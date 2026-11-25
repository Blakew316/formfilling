/**
 * Editing state for the open document: what has been placed, form values, selection, and undo history.
 *
 * Edits carry an optional `coalesce` key so a drag or a burst of typing becomes
 * one undo step instead of hundreds.
 */
import { useReducer } from 'react';
import type { Item } from '../engine/types';

export interface Content {
  items: Item[];
  formValues: Record<string, string>;
}

export type Tool = 'text' | 'date' | 'check' | 'signature' | 'initials';

export interface EditorState {
  present: Content;
  past: Content[];
  future: Content[];
  lastKey: string | null;
  selectedId: string | null;
  editingId: string | null;
  tool: Tool | null;
}

export type EditorAction =
  | { type: 'reset' }
  | { type: 'edit'; update: (c: Content) => Content; coalesce?: string; select?: string | null; editing?: string | null }
  | { type: 'select'; id: string | null; editing?: boolean }
  | { type: 'tool'; tool: Tool | null }
  | { type: 'undo' }
  | { type: 'redo' };

const EMPTY: Content = { items: [], formValues: {} };

export const initialEditor: EditorState = {
  present: EMPTY,
  past: [],
  future: [],
  lastKey: null,
  selectedId: null,
  editingId: null,
  tool: null,
};

const HISTORY_LIMIT = 200;

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'reset':
      return initialEditor;
    case 'edit': {
      const present = action.update(state.present);
      if (present === state.present) return state;
      const merge = !!action.coalesce && action.coalesce === state.lastKey;
      return {
        ...state,
        present,
        past: merge ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: action.coalesce ?? null,
        selectedId: action.select !== undefined ? action.select : state.selectedId,
        editingId: action.editing !== undefined ? action.editing : state.editingId,
      };
    }
    case 'select':
      return {
        ...state,
        selectedId: action.id,
        editingId: action.editing ? action.id : null,
        lastKey: null,
        tool: action.id ? null : state.tool,
      };
    case 'tool':
      return { ...state, tool: action.tool, selectedId: null, editingId: null, lastKey: null };
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
        lastKey: null,
        selectedId: null,
        editingId: null,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        present: next,
        past: [...state.past, state.present],
        future: state.future.slice(1),
        lastKey: null,
        selectedId: null,
        editingId: null,
      };
    }
  }
}

export function useEditor() {
  return useReducer(editorReducer, initialEditor);
}

let counter = 0;
/** Ids only need to be unique within one browser session. */
export function newId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter}`;
}
