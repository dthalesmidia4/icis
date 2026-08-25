import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";

import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { cn } from "@/lib/utils";
import { resolveStageName } from "@/lib/stageLabel";
import { dedupeSnapshotAgainstLive } from "@/lib/demandCode";
import {
  CLASSIFICATION_OPTIONS,
  EMPTY_CONTENT_FILTERS,
  buildClassificationCounts,
  buildTypeCounts,
  classificationLabel,
  countActiveContentFilters,
  matchesContentFilters,
  type ContentClassification,
  type ContentFilterState,
} from "@/lib/contentFilters";


const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface CalendarEntry {
  date: string;
  title: string;
  type: string | null;
  typeKey: string | null;
  time: string | null;
  isDemand: boolean;
  demandId: string | null;
  classifications: string[];
  /** Etapa operacional atual (current_function_key resolvida em flow_functions). */
  stage: string | null;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const labelFor = (iso: string) => {
  const d = parse(iso);
  return `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} de ${MONTHS_FULL[d.getMonth()]}`;
};

/** Acento visual por tipo de conteúdo (tokens do design system, sem cores hardcoded). */
const accentFor = (entry: CalendarEntry) => {
  if (!entry.isDemand) return "border-l-muted-foreground/40 bg-muted/60";
  const key = `${entry.typeKey || ""} ${entry.type || ""}`.toLowerCase();
  if (key.includes("video_captado") || key.includes("captado")) return "border-l-primary bg-primary/[0.07]";
  if (key.includes("video")) return "border-l-primary/60 bg-primary/[0.05]";
  if (key.includes("carrossel") || key.includes("carousel")) return "border-l-accent-foreground/70 bg-accent/40";
  if (key.includes("estatic") || key.includes("estátic")) return "border-l-secondary-foreground/60 bg-secondary/50";
  return "border-l-muted-foreground/50 bg-muted/50";
};

interface CalendarTabProps {
  period: CurrentPeriodInfo | null;
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
  /** Nomes de `flow_functions` por function_key (fonte canônica da etapa). */
  stageNames?: Record<string, string>;
  onOpenDemand?: (demandId: string) => void;
}

export default function CalendarTab({ period, planItems, demands, stageNames, onOpenDemand }: CalendarTabProps) {
  const [filters, setFilters] = useState<ContentFilterState>(EMPTY_CONTENT_FILTERS);
  const { search, type: typeFilter, classification: opFilter } = filters;
  const setSearch = (search: string) => setFilters((prev) => ({ ...prev, search }));
  const setTypeFilter = (type: string) => setFilters((prev) => ({ ...prev, type }));
  const toggleOpFilter = (key: ContentClassification) =>
    setFilters((prev) => ({ ...prev, classification: prev.classification === key ? null : key }));
  const clearFilters = () => setFilters(EMPTY_CONTENT_FILTERS);
  const activeFilterCount = countActiveContentFilters(filters);

  const allEntries = useMemo(() => {
    const entries: CalendarEntry[] = [];

    demands.forEach((d) => {
      // Calendário do cliente = calendário de PUBLICAÇÃO.
      // due_date/delivery_date são datas operacionais de produção e não entram aqui.
      const date = d.publish_date;
      if (!date) return;
      entries.push({
        date,
        title: d.title,
        type: d.demand_type,
        typeKey: d.demand_type_key,
        time: d.publish_time ? d.publish_time.slice(0, 5) : null,
        isDemand: true,
        demandId: d.id,
        classifications: Array.isArray(d.classifications) ? d.classifications : [],
        stage: resolveStageName(d.current_function_key, stageNames || {}),
      });
    });

    // Snapshot histórico do período: só entra se NÃO existir demand viva com o
    // mesmo código estável (DF-XXX). Título/tipo podem divergir após edição.
    dedupeSnapshotAgainstLive(planItems, demands.map((d) => d.title)).forEach((i) => {
      if (!i.data) return;
      entries.push({
        date: i.data,
        title: i.titulo,
        type: i.tipo,
        typeKey: i.typeKey,
        time: null,
        isDemand: false,
        demandId: null,
        classifications: [],
        stage: null,
      });
    });

    return entries;
  }, [demands, planItems, stageNames]);



  const filterable = useMemo(
    () =>
      allEntries.map((e) => ({
        title: e.title,
        typeLabel: e.type,
        classifications: e.classifications,
        isDemand: e.isDemand,
      })),
    [allEntries]
  );

  const types = useMemo(() => buildTypeCounts(filterable), [filterable]);

  const { byDate, weeks } = useMemo(() => {
    const entries = allEntries.filter((e) =>
      matchesContentFilters(
        { title: e.title, typeLabel: e.type, classifications: e.classifications, isDemand: e.isDemand },
        filters
      )
    );

    const map = new Map<string, CalendarEntry[]>();
    entries.forEach((e) => {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    });

    const dates = [...map.keys()].sort();
    if (!dates.length) return { byDate: map, weeks: [] as string[][] };

    const start = parse(period?.period_start || dates[0]);
    const end = parse(period?.period_end || dates[dates.length - 1]);
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(end);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const result: string[][] = [];
    let week: string[] = [];
    for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      week.push(isoOf(cursor));
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
      if (result.length > 20) break;
    }
    if (week.length) result.push(week);

    return { byDate: map, weeks: result };
  }, [allEntries, period, filters]);

  const opCounts = useMemo(() => buildClassificationCounts(filterable), [filterable]);

  const today = todayIso();
  const sortedDays = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const openEntry = (entry: CalendarEntry) => {
    if (!entry.isDemand || !entry.demandId || !onOpenDemand) return;
    onOpenDemand(entry.demandId);
  };

  const renderEntry = (item: CalendarEntry, idx: number) => {
    const clickable = item.isDemand && !!item.demandId && !!onOpenDemand;
    const kicker = [item.time, item.type || (item.isDemand ? "Demanda" : "Planejado")]
      .filter(Boolean)
      .join(" · ");
    const body = (
      <>
        <p className="truncate text-[9px] font-black uppercase tracking-[0.08em] text-muted-foreground">
          {kicker}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-[1.15]">{item.title}</p>
        {!!item.stage && (
          <span
            title={`Etapa atual: ${item.stage}`}
            className="mt-1 inline-flex max-w-full items-center rounded-sm bg-muted px-1 py-0 text-[8px] font-black uppercase leading-[1.5] tracking-[0.08em] text-muted-foreground"
          >
            <span className="truncate">{item.stage}</span>
          </span>
        )}
        {!!item.classifications.length && (
          <span className="mt-1 flex flex-wrap gap-1">
            {item.classifications.map((c) => (
              <span
                key={c}
                className="rounded-sm border border-primary/40 px-1 py-0 text-[8px] font-black uppercase leading-[1.4] tracking-[0.08em] text-primary"
              >
                {classificationLabel(c)}
              </span>
            ))}
          </span>
        )}
      </>
    );
    const baseClass = cn("rounded-[3px] border-l-2 px-2 py-1 transition-colors", accentFor(item));

    if (!clickable) {
      return (
        <div key={`${item.title}-${idx}`} className={baseClass}>
          {body}
        </div>
      );
    }

    return (
      <button
        key={`${item.title}-${idx}`}
        type="button"
        onClick={() => openEntry(item)}
        className={cn(
          baseClass,
          "w-full cursor-pointer text-left hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        )}
      >
        {body}
      </button>
    );
  };


  const controls = (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="w-full lg:max-w-xs">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Buscar
        </p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tema, tipo ou demanda"
          className="h-10 rounded-lg"
        />
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button
          type="button"
          onClick={() => setTypeFilter("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
            typeFilter === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
          )}
        >
          Todos <span className="tabular-nums opacity-70">{allEntries.length}</span>
        </button>
        {types.map(([type, count]) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(type)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
              typeFilter === type
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
            )}
          >
            {type} <span className="tabular-nums opacity-70">{count}</span>
          </button>
        ))}
        <span className="mx-1 h-6 w-px self-center bg-border" aria-hidden />
        {CLASSIFICATION_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleOpFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
              opFilter === key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
            )}
          >
            {label} <span className="tabular-nums opacity-70">{opCounts[key]}</span>
          </button>
        ))}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-dashed px-3 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Limpar filtros · {activeFilterCount}
          </button>
        )}
      </div>
    </div>
  );


  if (!sortedDays.length) {
    return (
      <>
        {controls}
        <div className="border-y py-14 text-center">
          <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-bold">Nenhuma data mapeada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search || typeFilter !== "all"
              ? "Nenhum conteúdo corresponde à busca ou ao filtro selecionado."
              : period
                ? "As demandas deste período ainda não têm datas de publicação."
                : "Planeje um período para ver o calendário do cliente."}
          </p>
        </div>
      </>
    );
  }


  return (
    <>
      {controls}
      {/* Grade semanal (desktop) — horizontal, compacta, com scroll quando estreita */}
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[1060px] overflow-hidden border">
          <div className="grid grid-cols-7 bg-foreground">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-[0.16em] text-background"
              >
                {w}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t">
              {week.map((iso) => {
                const items = byDate.get(iso) || [];
                const d = parse(iso);
                const isToday = iso === today;
                const inPeriod =
                  !period?.period_start ||
                  !period?.period_end ||
                  (iso >= period.period_start && iso <= period.period_end);
                return (
                  <div
                    key={iso}
                    className={cn(
                      "min-h-[108px] border-l px-1.5 py-1.5 first:border-l-0",
                      !inPeriod && "bg-muted/30",
                      isToday && "bg-primary/5 ring-1 ring-inset ring-primary/40"
                    )}
                  >
                    <div className="flex items-baseline gap-1">
                      <span
                        className={cn(
                          "text-[15px] font-black leading-none tabular-nums",
                          isToday ? "text-primary" : !inPeriod && "text-muted-foreground"
                        )}
                      >
                        {String(d.getDate()).padStart(2, "0")}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                        {MONTHS_SHORT[d.getMonth()]}
                      </span>
                    </div>

                    <div className="mt-1.5 space-y-1">
                      {items.map((item, idx) => renderEntry(item, idx))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Lista vertical (mobile) */}
      <div className="divide-y border-y md:hidden">
        {sortedDays.map(([date, items]) => {
          const isToday = date === today;
          return (
            <div key={date} className={cn("py-3.5", date < today && !isToday && "opacity-60")}>
              <p
                className={cn(
                  "text-[10px] font-black uppercase tracking-[0.16em]",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}
              >
                {labelFor(date)}
                {isToday && " · hoje"}
              </p>
              <div className="mt-2 space-y-1.5">
                {items.map((item, idx) => renderEntry(item, idx))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
