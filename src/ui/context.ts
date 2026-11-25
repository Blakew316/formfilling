/**
 * What every workspace component can reach: the open document, the editing state,
 * the saved details, and the handful of actions that change them.
 * Workspace.tsx provides it; components read it instead of receiving long prop lists.
 */
import { createContext, useContext, type Dispatch } from 'react';
import type { Field, ImageItem, SignatureBlock, FormWidget, PageInfo } from '../engine/types';
import type { EditorAction, EditorState } from '../state/editor';
import type { Saved, SavedInk } from '../state/storage';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface OpenDocument {
  name: string;
  bytes: Uint8Array;
  proxy: PDFDocumentProxy;
  pages: PageInfo[];
  fields: Field[];
  blocks: SignatureBlock[];
  widgets: FormWidget[];
  sealed: boolean;
}

export interface WorkspaceContext {
  doc: OpenDocument;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  saved: Saved;
  updateSaved: (patch: Partial<Saved>) => void;
  zoom: number;
  /** Id of the blank to draw attention to after "Next blank". */
  pulseId: string | null;
  fillField: (field: Field) => void;
  /** Called when a text item stops being edited; drops empty text and copies the value to matching blanks. */
  commitText: (id: string) => void;
  placeAt: (page: number, x: number, y: number) => void;
  /** Opens the signature dialog; `then` runs with the new ink once it is saved. */
  requestInk: (role: ImageItem['role'], then?: (ink: SavedInk) => void) => void;
}

export const Ctx = createContext<WorkspaceContext | null>(null);

export function useWorkspace(): WorkspaceContext {
  const value = useContext(Ctx);
  if (!value) throw new Error('useWorkspace must be used inside the workspace');
  return value;
}
