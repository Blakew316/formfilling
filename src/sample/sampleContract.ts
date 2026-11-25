/**
 * Builds the two-page demo agreement behind "Try a sample".
 *
 * The parties are fictional. The layout deliberately mirrors what real contracts
 * do (blanks inside sentences, a running header, a two-column signature block
 * where one side is pre-printed), so the tests use it as their fixture too.
 */
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

export interface SampleOptions {
  /** Page rotation in degrees, used by tests to prove export handles turned pages. */
  rotate?: 0 | 90 | 180 | 270;
}

export async function buildSampleContract(options: SampleOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  doc.setTitle('Sample Services Agreement');

  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([612, 792]);
    const line = (text: string, x: number, top: number, size = 11, f = font) =>
      page.drawText(text, { x, y: 792 - top, size, font: f, color: ink });

    line('Company Name:', 72, 48, 10);
    line(`Sample Services Agreement  |  Page ${p + 1} of 2`, 72, 752, 8);

    if (p === 0) {
      line('SERVICES AGREEMENT', 220, 96, 15, bold);
      const body = [
        'This Services Agreement is made on ______________ (the “Effective Date”) by and',
        'between ______________________________ (“CUSTOMER”), located at ____________________,',
        'executed by ___________________, its __________________, and Northwind Supply Co.,',
        'a fictional company used only for this sample document (“Northwind”).',
        '',
        '1.  Services. Northwind will provide the services described in each order form.',
        '2.  Fees. Customer will pay the fees shown on each order form within thirty days.',
        '3.  Term. This Agreement runs for one year and renews unless either side objects.',
        '4.  Notices. Notices go to the addresses the parties give each other in writing.',
      ];
      body.forEach((text, i) => line(text, 72, 140 + i * 18));
    } else {
      line('IN WITNESS WHEREOF, the parties have signed this Agreement.', 72, 110);
      line('NORTHWIND SUPPLY CO.', 72, 160, 11, bold);
      line('______________________', 324, 160);
      line('By: _____________________', 72, 190);
      line('By: _____________________', 324, 190);
      line('Name: Dana Whitfield', 72, 220);
      line('Name: ___________________', 324, 220);
      line('Title: Director', 72, 250);
      line('Title: ____________________', 324, 250);
      line('Date: ___________________', 72, 280);
      line('Date: ____________________', 324, 280);
    }
    if (options.rotate) page.setRotation({ type: 'degrees', angle: options.rotate } as never);
  }
  return doc.save();
}
