import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";

import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { cn } from "@/lib/utils";

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
  time: string | null;
  isDemand: boolean;
  classifications: string[];
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

interface CalendarTabProps {
  period: CurrentPeriodInfo | null;
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
}

export default function CalendarTab({ period, planItems, demands }: CalendarTabProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [opFilter, setOpFilter] = useState<"anuncio" | "grafica" | null>(null);

  const allEntries = useMemo(() => {
    const entries: CalendarEntry[] = [];
    const demandTitles = new Set(demands.map((d) => (d.title || "").trim()));

    demands.forEach((d) => {
      // Calendário do cliente = calendário de PUBLICAÇÃO.
      // due_date/delivery_date são datas operacionais de produção e não entram aqui.
      const date = d.publish_date;
      if (!date) return;
      entries.push({
        date,
        title: d.title,
        type: d.demand_type,
        time: d.publish_time ? d.publish_time.slice(0, 5) : null,
        isDemand: true,
        classifications: Array.isArray(d.classifications) ? d.classifications : [],
      });
    });

    planItems.forEach((i) => {
      if (!i.data || demandTitles.has(i.titulo)) return;
      entries.push({
        date: i.data,
        title: i.titulo,
        type: i.tipo,
        time: null,
        isDemand: false,
        classifications: [],
      });
    });

    return entries;
  }, [demands, planItems]);


  const types = useMemo(() => {
    const map = new Map<string, number>();
    allEntries.forEach((e) => {
      const key = (e.type || "Sem tipo").trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [allEntries]);

  const { byDate, weeks } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const entries = allEntries.filter((e) => {
      if (term && !e.title.toLowerCase().includes(term) && !(e.type || "").toLowerCase().includes(term)) {
        return false;
      }
      if (typeFilter !== "all" && (e.type || "Sem tipo").trim() !== typeFilter) return false;
      if (opFilter && !(e.isDemand && e.classifications.includes(opFilter))) return false;
      return true;
    });

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
  }, [allEntries, period, search, typeFilter, opFilter]);

  const opCounts = useMemo(
    () => ({
      anuncio: allEntries.filter((e) => e.isDemand && e.classifications.includes("anuncio")).length,
      grafica: allEntries.filter((e) => e.isDemand && e.classifications.includes("grafica")).length,
    }),
    [allEntries]
  );

  const today = todayIso();
  const sortedDays = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const controls = (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="w-full lg:max-w-xs">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Buscar
        </p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tema, tipo ou demanda"
          className="h-11 rounded-lg"
        />
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button
          type="button"
          onClick={() => setTypeFilter("all")}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors",
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
              "rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors",
              typeFilter === type
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
            )}
          >
            {type} <span className="tabular-nums opacity-70">{count}</span>
          </button>
        ))}
        <span className="mx-1 h-6 w-px self-center bg-border" aria-hidden />
        {([
          ["anuncio", "Anúncios"],
          ["grafica", "Gráfica"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOpFilter((prev) => (prev === key ? null : key))}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors",
              opFilter === key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
            )}
          >
            {label} <span className="tabular-nums opacity-70">{opCounts[key]}</span>
          </button>
        ))}
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
      {/* Grade semanal (desktop) */}

      <div className="hidden overflow-hidden border md:block">
        <div className="grid grid-cols-7 bg-foreground">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.16em] text-background"
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
                    "min-h-[130px] border-l p-2 first:border-l-0",
                    !inPeriod && "bg-muted/30",
                    isToday && "bg-primary/5 ring-1 ring-inset ring-primary/40"
                  )}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-lg font-black leading-none tabular-nums",
                        isToday ? "text-primary" : !inPeriod && "text-muted-foreground"
                      )}
                    >
                      {String(d.getDate()).padStart(2, "0")}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                      {MONTHS_SHORT[d.getMonth()]}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {items.map((item, idx) => (
                      <div
                        key={`${item.title}-${idx}`}
                        className={cn(
                          "border-l-2 px-2 py-1.5",
                          item.isDemand
                            ? "border-l-primary bg-primary/10"
                            : "border-l-muted-foreground/40 bg-muted"
                        )}
                      >
                        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">
                          {[item.time, item.type || (item.isDemand ? "Demanda" : "Planejado")]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="mt-0.5 line-clamp-3 text-[11px] font-bold leading-snug">
                          {item.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Lista vertical (mobile) */}
      <div className="divide-y border-y md:hidden">
        {sortedDays.map(([date, items]) => {
          const isToday = date === today;
          return (
            <div key={date} className={cn("py-4", date < today && !isToday && "opacity-60")}>
              <p
                className={cn(
                  "text-[10px] font-black uppercase tracking-[0.16em]",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}
              >
                {labelFor(date)}
                {isToday && " · hoje"}
              </p>
              <ul className="mt-2 space-y-2">
                {items.map((item, idx) => (
                  <li
                    key={`${item.title}-${idx}`}
                    className={cn(
                      "border-l-2 px-2 py-1.5",
                      item.isDemand ? "border-l-primary bg-primary/10" : "border-l-muted-foreground/40 bg-muted"
                    )}
                  >
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">
                      {[item.time, item.type || (item.isDemand ? "Demanda" : "Planejado")]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-xs font-bold">{item.title}</p>
                    {!!item.classifications.length && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {item.classifications.map((c) => (
                          <span
                            key={c}
                            className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-primary"
                          >
                            {c === "anuncio" ? "Anúncio" : "Gráfica"}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
