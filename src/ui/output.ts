/**
 * Produces the finished PDF for a document and hands it to the person: as a download or to the print dialog.
 * Used by the editor and by the saved-documents list.
 */
import type { PageInfo } from '../engine/types';
import type { Content } from '../state/editor';
import { baselineRatio, rasterizeText } from './textMetrics';

export async function finishedPdf(bytes: Uint8Array, pages: PageInfo[], content: Content): Promise<Uint8Array> {
  const { exportPdf } = await import('../engine/exportPdf');
  return exportPdf({
    bytes,
    pages,
    items: content.items,
    formValues: content.formValues,
    baselineRatio: baselineRatio(),
    rasterizeText: (item) => rasterizeText(item.text, item.fontSize),
  });
}

/** File name for the finished copy: "<original>-signed.pdf" once a signature is on it, otherwise "-filled". */
export function outputName(name: string, content: Content): string {
  const signed = content.items.some((it) => it.type === 'image');
  return `${name.replace(/\.pdf$/i, '')}-${signed ? 'signed' : 'filled'}.pdf`;
}

export function downloadPdf(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Opens the browser's print dialog for the PDF. Falls back to a new tab where a frame cannot print (some mobile browsers). */
export function printPdf(bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const frame = Object.assign(document.createElement('iframe'), { src: url, title: 'Print' });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => {
    try {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
    } catch {
      window.open(url, '_blank');
    }
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.append(frame);
}
