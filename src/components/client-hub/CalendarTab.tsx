import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface CalendarEntry {
  date: string;
  title: string;
  type: string | null;
  isDemand: boolean;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const labelFor = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${String(d).padStart(2, "0")} de ${MONTHS_FULL[m - 1]}`;
};

interface CalendarTabProps {
  period: CurrentPeriodInfo | null;
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
}

export default function CalendarTab({ period, planItems, demands }: CalendarTabProps) {
  const grouped = useMemo(() => {
    const entries: CalendarEntry[] = [];
    const demandTitles = new Set(demands.map((d) => (d.title || "").trim()));

    demands.forEach((d) => {
      const date = d.publish_date || d.delivery_date || d.due_date;
      if (!date) return;
      entries.push({ date, title: d.title, type: d.demand_type, isDemand: true });
    });

    planItems.forEach((i) => {
      if (!i.data || demandTitles.has(i.titulo)) return;
      entries.push({ date: i.data, title: i.titulo, type: i.tipo, isDemand: false });
    });

    const map = new Map<string, CalendarEntry[]>();
    entries.forEach((e) => {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [demands, planItems]);

  const today = todayIso();

  if (!grouped.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Nenhuma data mapeada</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {period
            ? "As demandas deste período ainda não têm datas de publicação."
            : "Planeje um período para ver o calendário do cliente."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {grouped.map(([date, items]) => {
        const isToday = date === today;
        const isPast = date < today;
        return (
          <div
            key={date}
            className={cn(
              "rounded-xl border bg-card p-4 transition-colors",
              isToday && "border-primary/60 bg-primary/5",
              isPast && !isToday && "opacity-70"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}
              >
                {labelFor(date)}
                {isToday && " · hoje"}
              </p>
              <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                {items.length} {items.length === 1 ? "item" : "itens"}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {items.map((item, idx) => (
                <li key={`${item.title}-${idx}`} className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      item.isDemand ? "bg-primary" : "bg-muted-foreground/50"
                    )}
                  />
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.type && (
                    <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {item.type}
                    </span>
                  )}
                  {!item.isDemand && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Planejado
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
