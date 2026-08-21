import { memo } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Inbox } from "lucide-react";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

const timeLabel = (date?: string | null, time?: string | null) => {
  if (!date) return null;
  const [, m, d] = date.split("-");
  return `${d}/${m}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

interface OfficeStationProps {
  station: OfficeStationData;
  onOpenCard: (cardId: string) => void;
  onOpenQueue: (userId: string) => void;
  /** Estação em destaque (1–4 pessoas na sala). */
  large?: boolean;
}

/**
 * Móvel de escritório 2D: cadeira + pessoa sentada + mesa + monitor + pilha de papéis.
 * Read-only: a mesa delimita a estação (sem Card/borda de dashboard).
 */
export const OfficeStation = memo(function OfficeStation({
  station,
  onOpenCard,
  onOpenQueue,
  large = false,
}: OfficeStationProps) {
  const { collaborator, current, next, queueCount, awaitingClientCount, loadRatio } = station;
  const working = !!current;
  const monitorCard = current || next;
  const stackSheets = Math.min(queueCount, 6);

  return (
    <div className={cn("group relative select-none", large ? "pt-6" : "pt-4")}>
      {/* Sombra de contato no piso */}
      <div
        aria-hidden="true"
        className="absolute inset-x-4 bottom-1 h-3 rounded-[50%] bg-foreground/10 blur-[2px] dark:bg-background/60"
      />

      <div className="relative flex items-end justify-center gap-1">
        {/* ---------- Pessoa + cadeira ---------- */}
        <button
          type="button"
          onClick={() => onOpenQueue(collaborator.userId)}
          aria-label={`Ver fila de ${collaborator.fullName}`}
          className="relative z-10 -mr-1 flex flex-col items-center rounded-md pb-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* cabeça (avatar/iniciais) */}
          <span
            className={cn(
              "relative z-10 flex items-center justify-center overflow-hidden rounded-full border-2 bg-muted text-[10px] font-semibold text-muted-foreground shadow-sm",
              working ? "border-primary/60" : "border-border",
              large ? "h-11 w-11 text-xs" : "h-9 w-9",
            )}
          >
            {collaborator.avatarUrl ? (
              <img src={collaborator.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsOf(collaborator.fullName)
            )}
          </span>

          {/* torso + braços */}
          <span
            className={cn(
              "relative -mt-1 flex justify-center rounded-t-[45%] shadow-inner",
              working ? "bg-primary/80" : "bg-muted-foreground/45",
              large ? "h-10 w-14" : "h-8 w-11",
            )}
          >
            {/* braço esquerdo (dedos digitando quando trabalhando) */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute bottom-1 -right-2 h-1.5 w-5 origin-left rotate-[18deg] rounded-full",
                working ? "bg-primary/70" : "bg-muted-foreground/40",
                working && "animate-office-typing motion-reduce:animate-none",
              )}
            />
            {/* gola */}
            <span aria-hidden="true" className="absolute top-1 h-2 w-4 rounded-b-full bg-background/40" />
          </span>

          {/* cadeira */}
          <span aria-hidden="true" className="relative flex flex-col items-center">
            <span
              className={cn(
                "rounded-b-sm bg-foreground/25 dark:bg-foreground/30",
                large ? "h-2 w-16" : "h-1.5 w-12",
              )}
            />
            <span className="h-3 w-1.5 bg-foreground/20 dark:bg-foreground/25" />
            <span className="h-1 w-8 rounded-full bg-foreground/20 dark:bg-foreground/25" />
          </span>
        </button>

        {/* ---------- Monitor sobre a mesa ---------- */}
        <div className="relative z-20 flex min-w-0 flex-1 flex-col items-center">
          <button
            type="button"
            onClick={() => monitorCard && onOpenCard(monitorCard.id)}
            disabled={!monitorCard}
            aria-label={monitorCard ? `Abrir card ${monitorCard.title}` : "Monitor em standby"}
            className={cn(
              "relative w-full overflow-hidden rounded-md border-[3px] bg-card px-2.5 py-2 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              working
                ? "border-foreground/25 shadow-[0_2px_0_0_hsl(var(--foreground)/0.15),0_6px_10px_-6px_hsl(var(--foreground)/0.35)]"
                : "border-foreground/15 shadow-[0_2px_0_0_hsl(var(--foreground)/0.1)]",
              monitorCard ? "hover:border-primary/60" : "cursor-default",
              large ? "min-h-[104px]" : "min-h-[92px]",
            )}
          >
            {/* brilho de tela (decorativo) */}
            {working && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 animate-office-screen-glow bg-gradient-to-br from-primary/15 via-transparent to-transparent motion-reduce:animate-none"
              />
            )}

            {monitorCard ? (
              <div className="relative space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {current ? "Em andamento" : "Próximo"}
                    {current && (
                      <span className="animate-office-caret motion-reduce:animate-none">▌</span>
                    )}
                  </span>
                  {current?.isLate && (
                    <span className="flex items-center gap-0.5 text-[9px] font-semibold text-destructive">
                      <AlertTriangle className="h-3 w-3" /> atrasado
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{monitorCard.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {monitorCard.clientName || "Sem cliente"} · {monitorCard.stageLabel}
                </p>
                {timeLabel(monitorCard.dueDate, monitorCard.dueTime) && (
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {timeLabel(monitorCard.dueDate, monitorCard.dueTime)}
                    {!current && " · não começou"}
                  </p>
                )}
              </div>
            ) : (
              <div className="relative flex h-full min-h-[72px] flex-col items-center justify-center gap-1 text-muted-foreground">
                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                <span className="text-[11px]">Standby</span>
              </div>
            )}
          </button>

          {/* pé do monitor */}
          <span aria-hidden="true" className="h-2 w-6 bg-foreground/20 dark:bg-foreground/25" />
          <span aria-hidden="true" className="h-1 w-12 rounded-sm bg-foreground/25 dark:bg-foreground/30" />

          {/* teclado */}
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 h-1.5 rounded-[2px] bg-foreground/15 dark:bg-foreground/25",
              large ? "w-20" : "w-16",
            )}
          />
        </div>

        {/* ---------- Pilha de papéis + bandeja ---------- */}
        <button
          type="button"
          onClick={() => onOpenQueue(collaborator.userId)}
          aria-label={`${queueCount} demandas na fila de ${collaborator.fullName}`}
          className="relative z-20 -ml-1 flex flex-col items-center gap-1 rounded-md pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {awaitingClientCount > 0 && (
            <span className="flex items-center gap-0.5 rounded-sm border border-dashed border-border bg-background/70 px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
              <Inbox className="h-2.5 w-2.5" />
              {awaitingClientCount}
            </span>
          )}
          <span aria-hidden="true" className="relative block h-8 w-10">
            {Array.from({ length: stackSheets }).map((_, i) => (
              <span
                key={i}
                className="absolute left-0 h-[7px] w-9 rounded-[2px] border border-border bg-card shadow-[0_1px_0_0_hsl(var(--foreground)/0.08)]"
                style={{ bottom: i * 4.5, left: (i % 2) * 1.5 }}
              />
            ))}
            {queueCount === 0 && (
              <span className="absolute bottom-0 left-0 h-1.5 w-9 rounded-[2px] border border-dashed border-border" />
            )}
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{queueCount}</span>
        </button>
      </div>

      {/* ---------- Mesa ---------- */}
      <div className="relative">
        {/* tampo em leve perspectiva (decorativo) */}
        <div
          aria-hidden="true"
          className="h-2 rounded-t-[3px] bg-gradient-to-b from-foreground/25 to-foreground/15 dark:from-foreground/30 dark:to-foreground/20"
          style={{ transform: "perspective(160px) rotateX(28deg)" }}
        />
        <div className="relative rounded-b-md bg-gradient-to-b from-muted to-muted/60 px-3 pb-1.5 pt-1 shadow-[inset_0_1px_0_0_hsl(var(--background)/0.5),0_2px_4px_-2px_hsl(var(--foreground)/0.3)]">
          <p className="truncate text-center text-[11px] font-semibold leading-tight">
            {collaborator.fullName}
          </p>
          <p className="truncate text-center text-[9px] leading-tight text-muted-foreground">
            {working ? "trabalhando" : "disponível"}
            {collaborator.roleLabel ? ` · ${collaborator.roleLabel}` : ""}
          </p>
          {/* carga relativa integrada ao rodapé da mesa */}
          <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className={cn("h-full rounded-full", working ? "bg-primary/70" : "bg-muted-foreground/40")}
              style={{ width: `${Math.max(4, Math.round(loadRatio * 100))}%` }}
            />
          </div>
        </div>
        {/* pernas */}
        <div aria-hidden="true" className="flex justify-between px-2">
          <span className="h-3 w-1.5 rounded-b bg-foreground/20 dark:bg-foreground/25" />
          <span className="h-3 w-1.5 rounded-b bg-foreground/20 dark:bg-foreground/25" />
        </div>
      </div>
    </div>
  );
});

export default OfficeStation;
