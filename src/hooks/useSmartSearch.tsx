import { useMemo, useCallback } from "react";
import { format, parse, isValid, startOfWeek, endOfWeek, addWeeks, addDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface SearchableItem {
  id: string;
  title: string;
  description?: string | null;
  objetivo?: string | null;
  instrucoes?: string | null;
  observations?: string | null;
  clientName?: string;
  clientId?: string;
  delivery_date?: string;
  publication_dates?: Array<{ date: string; time?: string }> | null;
  attachments?: Array<{ 
    name: string; 
    type?: string;
    storagePath?: string;
  }> | null;
  column_name?: string | null;
  status?: string;
}

export interface SearchResult<T extends SearchableItem> {
  item: T;
  score: number;
  matchedFields: string[];
  matchedText?: string;
}

interface UseSmartSearchOptions<T extends SearchableItem> {
  items: T[];
  searchQuery: string;
  maxResults?: number;
}

interface ParsedDateQuery {
  type: "date" | "month" | "week" | "day" | "year" | "relative";
  value: Date | { start: Date; end: Date };
  original: string;
}

// Month names in Portuguese
const MONTHS_PT: Record<string, number> = {
  janeiro: 0, jan: 0,
  fevereiro: 1, fev: 1,
  março: 2, mar: 2, marco: 2,
  abril: 3, abr: 3,
  maio: 4, mai: 4,
  junho: 5, jun: 5,
  julho: 6, jul: 6,
  agosto: 7, ago: 7,
  setembro: 8, set: 8,
  outubro: 9, out: 9,
  novembro: 10, nov: 10,
  dezembro: 11, dez: 11,
};

// Day names in Portuguese
const DAYS_PT: Record<string, number> = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1, "segunda-feira": 1,
  terça: 2, ter: 2, terca: 2, "terça-feira": 2, "terca-feira": 2,
  quarta: 3, qua: 3, "quarta-feira": 3,
  quinta: 4, qui: 4, "quinta-feira": 4,
  sexta: 5, sex: 5, "sexta-feira": 5,
  sábado: 6, sab: 6, sabado: 6,
};

function parseDateQuery(query: string): ParsedDateQuery | null {
  const normalizedQuery = query.toLowerCase().trim();
  const today = new Date();
  
  // Relative dates
  if (normalizedQuery === "hoje") {
    return { type: "relative", value: today, original: query };
  }
  
  if (normalizedQuery === "amanhã" || normalizedQuery === "amanha") {
    return { type: "relative", value: addDays(today, 1), original: query };
  }
  
  if (normalizedQuery === "essa semana" || normalizedQuery === "esta semana") {
    return {
      type: "week",
      value: {
        start: startOfWeek(today, { weekStartsOn: 0 }),
        end: endOfWeek(today, { weekStartsOn: 0 }),
      },
      original: query,
    };
  }
  
  if (normalizedQuery === "próxima semana" || normalizedQuery === "proxima semana") {
    const nextWeek = addWeeks(today, 1);
    return {
      type: "week",
      value: {
        start: startOfWeek(nextWeek, { weekStartsOn: 0 }),
        end: endOfWeek(nextWeek, { weekStartsOn: 0 }),
      },
      original: query,
    };
  }
  
  // Month name (e.g., "janeiro", "jan")
  for (const [monthName, monthIndex] of Object.entries(MONTHS_PT)) {
    if (normalizedQuery === monthName || normalizedQuery.startsWith(monthName + " ")) {
      // Check for year after month (e.g., "janeiro 2025")
      const yearMatch = normalizedQuery.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : today.getFullYear();
      
      return {
        type: "month",
        value: {
          start: new Date(year, monthIndex, 1),
          end: new Date(year, monthIndex + 1, 0),
        },
        original: query,
      };
    }
  }
  
  // Day of week (e.g., "terça", "seg")
  for (const [dayName, dayIndex] of Object.entries(DAYS_PT)) {
    if (normalizedQuery === dayName) {
      // Find next occurrence of this day
      const currentDay = today.getDay();
      let daysToAdd = dayIndex - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      
      return {
        type: "day",
        value: addDays(today, daysToAdd),
        original: query,
      };
    }
  }
  
  // Year only (e.g., "2025")
  if (/^\d{4}$/.test(normalizedQuery)) {
    const year = parseInt(normalizedQuery);
    return {
      type: "year",
      value: {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31),
      },
      original: query,
    };
  }
  
  // Date format dd/mm or dd/mm/yyyy
  const dateMatch = normalizedQuery.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : today.getFullYear();
    const date = new Date(year, month, day);
    
    if (isValid(date)) {
      return { type: "date", value: date, original: query };
    }
  }
  
  return null;
}

function matchesDateQuery(itemDate: string, parsedDate: ParsedDateQuery): boolean {
  if (!itemDate) return false;
  
  const date = new Date(itemDate + "T00:00:00");
  if (!isValid(date)) return false;
  
  const dateValue = parsedDate.value;
  
  if (parsedDate.type === "date" || parsedDate.type === "relative" || parsedDate.type === "day") {
    const targetDate = dateValue as Date;
    return format(date, "yyyy-MM-dd") === format(targetDate, "yyyy-MM-dd");
  }
  
  if (parsedDate.type === "month" || parsedDate.type === "week" || parsedDate.type === "year") {
    const range = dateValue as { start: Date; end: Date };
    return isWithinInterval(date, range);
  }
  
  return false;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function calculateScore<T extends SearchableItem>(
  item: T,
  searchTerms: string[],
  parsedDate: ParsedDateQuery | null
): { score: number; matchedFields: string[] } {
  let score = 0;
  const matchedFields: string[] = [];
  
  const normalizedTitle = normalizeText(item.title || "");
  const normalizedClient = normalizeText(item.clientName || "");
  const normalizedObjetivo = normalizeText(item.objetivo || "");
  const normalizedDescription = normalizeText(item.description || "");
  const normalizedObservations = normalizeText(item.observations || "");
  const normalizedInstrucoes = normalizeText(item.instrucoes || "");
  
  // Get attachment names and metadata
  const attachmentText = (item.attachments || [])
    .map(a => `${a.name || ""} ${a.type || ""} ${a.storagePath || ""}`)
    .join(" ");
  const normalizedAttachments = normalizeText(attachmentText);
  
  for (const term of searchTerms) {
    const normalizedTerm = normalizeText(term);
    
    // Title match (highest priority - 100 points)
    if (normalizedTitle.includes(normalizedTerm)) {
      score += 100;
      if (!matchedFields.includes("título")) matchedFields.push("título");
    }
    
    // Client name match (high priority - 80 points)
    if (normalizedClient.includes(normalizedTerm)) {
      score += 80;
      if (!matchedFields.includes("cliente")) matchedFields.push("cliente");
    }
    
    // Objetivo match (medium-high priority - 60 points)
    if (normalizedObjetivo.includes(normalizedTerm)) {
      score += 60;
      if (!matchedFields.includes("objetivo")) matchedFields.push("objetivo");
    }
    
    // Description match (medium priority - 50 points)
    if (normalizedDescription.includes(normalizedTerm)) {
      score += 50;
      if (!matchedFields.includes("atividade")) matchedFields.push("atividade");
    }
    
    // Attachments match (medium priority - 40 points)
    if (normalizedAttachments.includes(normalizedTerm)) {
      score += 40;
      if (!matchedFields.includes("anexos")) matchedFields.push("anexos");
    }
    
    // Observations match (lower priority - 30 points)
    if (normalizedObservations.includes(normalizedTerm)) {
      score += 30;
      if (!matchedFields.includes("observações")) matchedFields.push("observações");
    }
    
    // Instrucoes match (lower priority - 20 points)
    if (normalizedInstrucoes.includes(normalizedTerm)) {
      score += 20;
      if (!matchedFields.includes("instruções")) matchedFields.push("instruções");
    }
  }
  
  // Date matching
  if (parsedDate) {
    // Check delivery date
    if (item.delivery_date && matchesDateQuery(item.delivery_date, parsedDate)) {
      score += 70;
      if (!matchedFields.includes("data")) matchedFields.push("data");
    }
    
    // Check publication dates
    const pubDates = item.publication_dates || [];
    for (const pubDate of pubDates) {
      if (pubDate.date && matchesDateQuery(pubDate.date, parsedDate)) {
        score += 70;
        if (!matchedFields.includes("data de publicação")) matchedFields.push("data de publicação");
        break;
      }
    }
  }
  
  return { score, matchedFields };
}

export function useSmartSearch<T extends SearchableItem>({
  items,
  searchQuery,
  maxResults = 10,
}: UseSmartSearchOptions<T>): SearchResult<T>[] {
  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const trimmedQuery = searchQuery.trim();
    const searchTerms = trimmedQuery.split(/\s+/).filter(t => t.length > 0);
    
    // Try to parse date from query
    const parsedDate = parseDateQuery(trimmedQuery);
    
    // Filter terms that are not date-related for text search
    const textTerms = parsedDate 
      ? searchTerms.filter(t => !normalizeText(t).includes(normalizeText(parsedDate.original)))
      : searchTerms;
    
    const scored: SearchResult<T>[] = [];
    
    for (const item of items) {
      const { score, matchedFields } = calculateScore(item, textTerms.length > 0 ? textTerms : searchTerms, parsedDate);
      
      if (score > 0) {
        scored.push({
          item,
          score,
          matchedFields,
        });
      }
    }
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, maxResults);
  }, [items, searchQuery, maxResults]);
  
  return results;
}

export function formatSearchResultDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, "dd/MM", { locale: ptBR });
  } catch {
    return "";
  }
}
