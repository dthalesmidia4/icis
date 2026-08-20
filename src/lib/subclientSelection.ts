import type { SystemsClient } from "@/lib/systemsClients";

/** Item exibido no seletor de clientes solicitantes de uma demanda. */
export interface SubclientOption {
  id: string;
  name: string;
  /** Selecionável apenas quando é customer + ativo. */
  selectable: boolean;
  /** Vínculo já gravado na demanda que não é mais elegível. */
  legacy: boolean;
  /** Rótulo de contexto do vínculo histórico (Oportunidade/Pausado/Cancelado). */
  contextBadge?: string;
}

export function legacyContextBadge(client: SystemsClient): string {
  if (client.lifecycle === "prospect") return "Oportunidade";
  if (client.status === "pausado") return "Pausado";
  if (client.status === "cancelado") return "Cancelado";
  return "Inativo";
}

/**
 * Une opções ativas (customer + ativo) com vínculos já gravados na demanda.
 * Vínculos históricos permanecem visíveis, porém não selecionáveis.
 */
export function buildSubclientOptions(
  activeOptions: SystemsClient[],
  linkedRecords: SystemsClient[],
  value: string[],
): SubclientOption[] {
  const activeIds = new Set(activeOptions.map((c) => c.id));
  const options: SubclientOption[] = activeOptions.map((c) => ({
    id: c.id,
    name: c.name,
    selectable: true,
    legacy: false,
  }));
  const seen = new Set(activeIds);
  (value || []).forEach((id) => {
    if (seen.has(id)) return;
    const rec = linkedRecords.find((r) => r.id === id);
    if (!rec) return;
    seen.add(id);
    options.push({
      id: rec.id,
      name: rec.name,
      selectable: false,
      legacy: true,
      contextBadge: legacyContextBadge(rec),
    });
  });
  return options;
}

/** Ids do valor atual que correspondem a vínculos históricos (não elegíveis). */
export function legacyIds(options: SubclientOption[], value: string[]): string[] {
  const legacy = new Set(options.filter((o) => o.legacy).map((o) => o.id));
  return (value || []).filter((id) => legacy.has(id));
}

/** Alterna um id ativo preservando sempre os vínculos históricos. */
export function toggleSubclient(
  options: SubclientOption[],
  value: string[],
  id: string,
): string[] {
  const target = options.find((o) => o.id === id);
  if (!target || !target.selectable) return value || [];
  const current = value || [];
  const next = current.includes(id)
    ? current.filter((v) => v !== id)
    : [...current, id];
  const keep = legacyIds(options, current);
  return Array.from(new Set([...next, ...keep]));
}

/** "Limpar seleção" remove apenas os ativos, nunca os vínculos históricos. */
export function clearActiveSelection(
  options: SubclientOption[],
  value: string[],
): string[] {
  return legacyIds(options, value || []);
}

/** Nomes exibidos no label fechado (ativos selecionados + históricos). */
export function selectedLabelNames(
  options: SubclientOption[],
  value: string[],
): string[] {
  return (value || [])
    .map((id) => options.find((o) => o.id === id)?.name)
    .filter(Boolean) as string[];
}
