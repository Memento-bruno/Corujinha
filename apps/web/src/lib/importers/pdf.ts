import "server-only";
import { getDocumentProxy } from "unpdf";
import { parsePdfText } from "./pdf-text";
import type { ParseResult } from "./types";

interface TextItem {
  str: string;
  transform: number[];
}

/**
 * Lê o PDF no servidor (nada é enviado a terceiros), reconstrói as linhas pela
 * posição vertical dos textos e aplica a heurística de lançamentos.
 */
export async function parsePdf(buffer: Uint8Array, fallbackYear: number): Promise<ParseResult> {
  const pdf = await getDocumentProxy(buffer);
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const raw of content.items as unknown[]) {
      const item = raw as TextItem;
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2; // tolerância de 2pt
      const list = rows.get(y) ?? [];
      list.push({ x: item.transform[4], s: item.str });
      rows.set(y, list);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      lines.push(
        rows
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((i) => i.s)
          .join(" "),
      );
    }
  }
  return parsePdfText(lines.join("\n"), fallbackYear);
}
