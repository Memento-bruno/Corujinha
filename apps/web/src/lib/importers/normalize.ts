import type { CategoryId, Installment } from "../domain/types";

/**
 * Normaliza a descrição de uma fatura num "merchantKey" estável:
 * "IFD*IFOOD   SAO PAULO BR" -> "ifood", "NETFLIX.COM 0800" -> "netflix".
 */
export function merchantKeyOf(description: string): string {
  let s = description
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  s = s.replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " "); // parcelas
  s = s.replace(/^(pag\*|pg\s*\*|mp\s*\*|mercadopago\s*\*|ifd\s*\*|ec\s*\*|pp\s*\*|paypal\s*\*|dl\s*\*|ebn\s*\*|htm\s*\*)/, "");
  s = s.replace(/\*/g, " ");
  s = s.replace(/\.com(\.br)?/g, " ");
  s = s.replace(/\b(sao paulo|rio de janeiro|belo horizonte|curitiba|br|bra|brasil|ltda|s\.?a\.?|me|eireli)\b/g, " ");
  s = s.replace(/[^a-z0-9+ ]/g, " ");
  s = s.replace(/\b\d{3,}\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  for (const [alias, canonical] of ALIASES) if (s.includes(alias)) return canonical;
  return s.split(" ").slice(0, 3).join(" ") || "desconhecido";
}

const ALIASES: [string, string][] = [
  ["ifood club", "ifood club"],
  ["ifood", "ifood"],
  ["uber one", "uber one"],
  ["uber eats", "uber eats"],
  ["uber", "uber"],
  ["99 app", "99"],
  ["99app", "99"],
  ["99 pop", "99"],
  ["netflix", "netflix"],
  ["spotify", "spotify"],
  ["disney", "disney+"],
  ["hbo max", "max"],
  ["globoplay", "globoplay"],
  ["prime video", "prime video"],
  ["amazon prime", "amazon prime"],
  ["youtube", "youtube premium"],
  ["apple com bill", "apple"],
  ["icloud", "icloud"],
  ["google one", "google one"],
  ["smart fit", "smart fit"],
  ["smartfit", "smart fit"],
  ["wellhub", "wellhub"],
  ["gympass", "wellhub"],
  ["rappi", "rappi"],
  ["starbucks", "starbucks"],
  ["drogasil", "drogasil"],
  ["droga raia", "droga raia"],
  ["raia", "droga raia"],
  ["pao de acucar", "pao de acucar"],
  ["carrefour", "carrefour"],
  ["assai", "assai"],
  ["shell", "shell"],
  ["ipiranga", "ipiranga"],
  ["petrobras", "petrobras"],
  ["mercado livre", "mercado livre"],
  ["mercadolivre", "mercado livre"],
  ["amazon", "amazon"],
  ["shopee", "shopee"],
  ["magalu", "magalu"],
];

const RULES: [RegExp, CategoryId][] = [
  [/ifood club|rappi prime|uber one|netflix|spotify|disney|max\b|hbo|globoplay|prime video|amazon prime|youtube premium|deezer|apple music|icloud|google one|dropbox|paramount|chatgpt|assinatura/, "assinaturas"],
  [/smart fit|wellhub|gympass|bodytech|totalpass/, "saude"],
  [/ifood|rappi|uber eats|ze delivery|aiqfome|james/, "delivery"],
  [/^99\b|\b99 ?(app|pop|taxi)|\buber\b|cabify|indriver/, "transporte_app"],
  [/estapar|estacionamento|estaciona\b|zona azul|parking|multipark|indigo park|autopark/, "estacionamento"],
  [/starbucks|padaria|cafe|coffee|lanchonete|mc ?donald|burger|bk\b|subway|kopenhagen|cacau show|habib/, "lanches"],
  [/restaurante|outback|madero|coco bambu|churrascaria|pizzaria|sushi|bar\b|bistro/, "restaurantes"],
  [/pao de acucar|carrefour|assai|extra|atacadao|mercado\b|supermercado|hortifruti|oba|st marche|dia\b/, "mercado"],
  [/drogasil|droga raia|pague menos|farmacia|drogaria/, "farmacia"],
  [/hospital|clinica|laboratorio|fleury|dasa|unimed|amil|sulamerica|dentista|odonto/, "saude"],
  [/shell|ipiranga|petrobras|posto|br mania|combustivel/, "combustivel"],
  [/sem parar|conectcar|veloe|move mais|pedagio|oficina|mecanica|auto ?pecas|auto ?center|lava ?rapido|lava ?jato|pneu|ipva|detran|licenciamento|seguro auto|concessionaria|funilaria/, "carro"],
  [/escola|faculdade|curso|udemy|alura|livraria|colegio/, "educacao"],
  [/cinema|cinemark|ingresso|sympla|show|teatro|parque|steam|playstation|xbox|nintendo/, "lazer"],
  [/latam|gol\b|azul\b|airbnb|booking|hotel|decolar|123milhas/, "viagem"],
  [/petz|cobasi|petlove|veterinari/, "pets"],
  [/condominio|aluguel|enel|light|sabesp|comgas|claro|vivo|tim\b|internet|energia|agua/, "moradia"],
  [/mercado livre|amazon|shopee|magalu|renner|zara|c&a|riachuelo|americanas|shein|aliexpress|leroy|tok stok|ikea/, "compras"],
];

export function guessCategory(description: string, merchantKey = merchantKeyOf(description)): CategoryId {
  const hay = `${merchantKey} ${description.toLowerCase()}`;
  for (const [re, cat] of RULES) if (re.test(hay)) return cat;
  return "outros";
}

/** Extrai parcela "03/10" ou "PARC 03/10" da descrição. */
export function parseInstallment(description: string): Installment | undefined {
  const m = description.match(/(?:parc(?:ela)?\.?\s*)?\b(\d{1,2})\s*\/\s*(\d{1,2})\b/i);
  if (!m) return undefined;
  const current = Number(m[1]);
  const total = Number(m[2]);
  if (current < 1 || total < 2 || current > total || total > 48) return undefined;
  return { current, total };
}

/** Remove o "03/10" do fim da descrição para exibição. */
export function cleanDescription(description: string): string {
  return description
    .replace(/\s*(?:parc(?:ela)?\.?\s*)?\b\d{1,2}\s*\/\s*\d{1,2}\b\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte "dd/mm/aaaa", "dd/mm/aa", "aaaa-mm-dd" ou "aaaammdd" para ISO. */
export function parseDate(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3] ? Number(m[3]) : fallbackYear;
    if (!y) return null;
    if (y < 100) y += 2000;
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}-${mo}-${d}`;
  }
  return null;
}
