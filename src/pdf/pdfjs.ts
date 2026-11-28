/**
 * Browser-side setup for the PDF renderer: worker, bundled data files, and opening a document.
 * Everything pdf.js needs is served from this site; nothing is fetched from elsewhere.
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractDocument, type ExtractedDocument } from './extract';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const assets = new URL('./pdfjs/', document.baseURI).href;

export interface OpenedPdf extends ExtractedDocument {
  proxy: PDFDocumentProxy;
}

/**
 * Opens a PDF for display and analysis.
 * Throws an Error with a message fit to show the person when the file is locked or not a readable PDF.
 */
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  let proxy: PDFDocumentProxy;
  try {
    proxy = await pdfjs.getDocument({
      // pdf.js takes ownership of the buffer it is given, so it gets its own copy.
      data: bytes.slice(),
      cMapUrl: `${assets}cmaps/`,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
      iccUrl: `${assets}iccs/`,
    }).promise;
  } catch (cause) {
    const name = (cause as { name?: string })?.name;
    throw new Error(
      name === 'PasswordException'
        ? 'Password-protected PDFs aren’t supported.'
        : 'Not a readable PDF.',
      { cause },
    );
  }
  const extracted = await extractDocument(pdfjs, proxy, bytes);
  return { ...extracted, proxy };
}

export { pdfjs };
