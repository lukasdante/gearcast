/** Upload text extraction (rag.extract_text): PDF pages (unpdf / pdf.js), DOCX paragraphs + table rows, TXT/MD. */
import { unzipSync, strFromU8 } from 'fflate';
import { El, kid, kids, parse } from './doc/xml';
import { cellText, paraText } from './doc/render';

export class UploadError extends Error {}

/** Path(filename).suffix / .stem */
export function suffixStem(filename: string): [string, string] {
  const name = filename.split(/[\\/]/).pop() || '';
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? [name.slice(i), name.slice(0, i)] : ['', name];
}

function docxText(data: Uint8Array): string[] {
  const files = unzipSync(data, { filter: f => f.name === 'word/document.xml' });
  const doc = parse(strFromU8(files['word/document.xml']));
  const body = kid(doc.root, 'w:body')!;
  const parts = kids(body, 'w:p').map(paraText);
  for (const t of kids(body, 'w:tbl')) {
    const tg = kid(t, 'w:tblGrid');
    const ncols = tg ? kids(tg, 'w:gridCol').length : 0;
    const above: (El | null)[] = [];
    for (const tr of kids(t, 'w:tr')) {
      const row: El[] = [];
      for (const tc of kids(tr, 'w:tc')) {
        const pr = kid(tc, 'w:tcPr');
        const gs = pr && kid(pr, 'w:gridSpan');
        const vm = pr && kid(pr, 'w:vMerge');
        const span = gs ? parseInt(gs.a['w:val'], 10) || 1 : 1;
        const col = row.length;
        const cell = vm && vm.a['w:val'] !== 'restart' && above[col] ? above[col]! : tc;
        for (let k = 0; k < span; k++) { row.push(cell); above[col + k] = cell; }
      }
      void ncols;
      parts.push(row.map(cellText).join(' | '));
    }
  }
  return [parts.join('\n')];
}

export async function extractText(filename: string, data: Uint8Array): Promise<string[]> {
  const [ext] = suffixStem(filename);
  const e = ext.toLowerCase();
  if (e === '.pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await pdfText(pdf, { mergePages: false });
    return text as string[];
  }
  if (e === '.docx') return docxText(data);
  if (['.txt', '.md', '.markdown'].includes(e)) return [new TextDecoder('utf-8').decode(data)];
  throw new UploadError(`Unsupported file type ${ext.toLowerCase()} (PDF, DOCX, TXT, MD)`);
}
