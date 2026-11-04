import { parseCsv } from "@/lib/importers/csv";
import { parseOfx } from "@/lib/importers/ofx";
import { parsePdf } from "@/lib/importers/pdf";
import { BadRequestError, handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

/** Lê o arquivo enviado e devolve uma PRÉVIA. Nada é gravado aqui. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireViewer();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new BadRequestError("Envie um arquivo.");
    if (file.size > MAX_BYTES) throw new BadRequestError("Arquivo maior que 8 MB.");
    const year = Number(form.get("year")) || new Date().getFullYear();
    const invert = form.get("invertSign") === "true";
    const name = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const head = new TextDecoder().decode(bytes.slice(0, 1024));

    if (name.endsWith(".pdf") || head.startsWith("%PDF")) return parsePdf(bytes, year);
    const text = new TextDecoder("utf-8").decode(bytes);
    if (name.endsWith(".ofx") || /<OFX>|OFXHEADER/i.test(head)) return parseOfx(text);
    if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(text, { invertSign: invert, fallbackYear: year });
    throw new BadRequestError("Formato não suportado. Use CSV, OFX ou PDF.");
  });
}
