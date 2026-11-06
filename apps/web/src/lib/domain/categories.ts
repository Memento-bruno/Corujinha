import type { CategoryId, CategoryMeta } from "./types";

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  mercado: { id: "mercado", label: "Mercado", essential: true, highFrequency: false, color: "#10b981" },
  restaurantes: { id: "restaurantes", label: "Restaurantes", essential: false, highFrequency: false, color: "#f97316" },
  delivery: { id: "delivery", label: "Delivery", essential: false, highFrequency: true, color: "#f43f5e" },
  lanches: { id: "lanches", label: "Lanches & Café", essential: false, highFrequency: true, color: "#ec4899" },
  transporte_app: { id: "transporte_app", label: "Transporte por app", essential: false, highFrequency: true, color: "#8b5cf6" },
  combustivel: { id: "combustivel", label: "Combustível", essential: true, highFrequency: false, color: "#0ea5e9" },
  carro: { id: "carro", label: "Carro", essential: true, highFrequency: false, color: "#b45309" },
  estacionamento: { id: "estacionamento", label: "Estacionamento", essential: false, highFrequency: true, color: "#1e40af" },
  moradia: { id: "moradia", label: "Moradia", essential: true, highFrequency: false, color: "#6366f1" },
  saude: { id: "saude", label: "Saúde", essential: true, highFrequency: false, color: "#14b8a6" },
  farmacia: { id: "farmacia", label: "Farmácia", essential: true, highFrequency: false, color: "#22c55e" },
  educacao: { id: "educacao", label: "Educação", essential: true, highFrequency: false, color: "#3b82f6" },
  assinaturas: { id: "assinaturas", label: "Assinaturas", essential: false, highFrequency: false, color: "#a855f7" },
  lazer: { id: "lazer", label: "Lazer", essential: false, highFrequency: false, color: "#eab308" },
  compras: { id: "compras", label: "Compras", essential: false, highFrequency: false, color: "#06b6d4" },
  viagem: { id: "viagem", label: "Viagem", essential: false, highFrequency: false, color: "#84cc16" },
  pets: { id: "pets", label: "Pets", essential: true, highFrequency: false, color: "#d946ef" },
  servicos: { id: "servicos", label: "Serviços", essential: true, highFrequency: false, color: "#64748b" },
  outros: { id: "outros", label: "Outros", essential: false, highFrequency: false, color: "#94a3b8" },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === "string" && v in CATEGORIES;
}
