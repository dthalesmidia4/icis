/**
 * Catálogo fixo de objetos que o colaborador pode colocar na PRÓPRIA mesa
 * no `/escritorio`. Tudo é desenhado em CSS/SVG — nunca upload/asset externo.
 */
export const DESK_OBJECT_KEYS = [
  "mug",
  "plant",
  "pen_holder",
  "headphones",
  "lamp",
  "notebook",
  "photo_frame",
  "mini_calendar",
] as const;

export type DeskObjectKey = (typeof DESK_OBJECT_KEYS)[number];

export const MAX_DESK_OBJECTS = 3;

export const DESK_OBJECT_LABELS: Record<DeskObjectKey, string> = {
  mug: "Caneca",
  plant: "Plantinha",
  pen_holder: "Porta-canetas",
  headphones: "Fone de ouvido",
  lamp: "Luminária",
  notebook: "Caderno",
  photo_frame: "Porta-retrato",
  mini_calendar: "Mini calendário",
};

/** Slots pré-determinados (o sistema decide a posição; sem drag-and-drop). */
export type DeskSlotName = "left" | "center-side" | "right";
export const DESK_SLOT_ORDER: DeskSlotName[] = ["left", "center-side", "right"];

const KEY_SET = new Set<string>(DESK_OBJECT_KEYS);

/** Normaliza o que veio do banco: só chaves válidas, sem repetição, máx. 3. */
export function sanitizeDeskObjects(input: unknown): DeskObjectKey[] {
  const arr = Array.isArray(input) ? input : [];
  const out: DeskObjectKey[] = [];
  for (const raw of arr) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!KEY_SET.has(key)) continue;
    if (out.includes(key as DeskObjectKey)) continue;
    out.push(key as DeskObjectKey);
    if (out.length >= MAX_DESK_OBJECTS) break;
  }
  return out;
}

/** Alterna uma escolha respeitando o limite da V1. */
export function toggleDeskObject(current: DeskObjectKey[], key: DeskObjectKey): DeskObjectKey[] {
  if (current.includes(key)) return current.filter((k) => k !== key);
  if (current.length >= MAX_DESK_OBJECTS) return current;
  return [...current, key];
}

/** Distribui as escolhas nos slots fixos, na ordem de seleção. */
export function assignDeskSlots(objects: DeskObjectKey[]): Array<{ slot: DeskSlotName; key: DeskObjectKey }> {
  return sanitizeDeskObjects(objects).map((key, i) => ({ slot: DESK_SLOT_ORDER[i], key }));
}
