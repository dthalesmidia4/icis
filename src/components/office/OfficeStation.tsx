import { memo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertTriangle, Clock, Layers, UserCheck } from "lucide-react";
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
  const hhmm = time ? ` ${time.slice(0, 5)}` : "";
  return `${d}/${m}${hhmm}`;
};

interface OfficeStationProps {
  station: OfficeStationData;
  onOpenCard: (cardId: string) => void;
  onOpenQueue: (userId: string) => void;
}

/**
 * Estação de trabalho (mesa + pessoa + monitor + pilha de cards).
 * Puramente visual/read-only: cliques delegam para a Visão Geral real.
 */
export const OfficeStation = memo(function OfficeStation({
  station,
  onOpenCard,
  onOpenQueue,
}: OfficeStationProps) {
  const { collaborator, current, next, queueCount, awaitingClientCount, loadRatio } = station;
  const working = !!current;
  const monitorCard = current || next;

  return (
    <div className="relative rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm transition-colors hover:border-primary/40">
      {/* Cabeçalho: pessoa */}
      <button
        type="button"
        onClick={() => onOpenQueue(collaborator.userId)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="relative">
          <Avatar className="h-10 w-10 border border-border">
            {collaborator.avatarUrl && <AvatarImage src={collaborator.avatarUrl} alt={collaborator.fullName} />}
            <AvatarFallback className="text-xs">{initialsOf(collaborator.fullName)}</AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
              working ? "bg-primary" : "bg-muted-foreground/40",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{collaborator.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {working ? "Trabalhando" : "Disponível"} · {collaborator.roleLabel}
          </p>
        </div>
      </button>

      {/* Monitor + mesa */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => monitorCard && onOpenCard(monitorCard.id)}
          disabled={!monitorCard}
          className={cn(
            "w-full rounded-lg border-2 bg-background/90 p-3 text-left transition-shadow",
            working ? "border-primary/50 animate-pulse motion-reduce:animate-none" : "border-border",
            monitorCard ? "hover:shadow-md" : "cursor-default opacity-80",
          )}
        >
          {monitorCard ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={current ? "default" : "secondary"} className="text-[10px]">
                  {current ? "Em andamento" : "Próximo trabalho"}
                </Badge>
                {current?.isLate && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-destructive">
                    <AlertTriangle className="h-3 w-3" /> atrasado
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-sm font-medium leading-snug">{monitorCard.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {monitorCard.clientName || "Sem cliente"} · {monitorCard.stageLabel}
              </p>
              {timeLabel(monitorCard.dueDate, monitorCard.dueTime) && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {timeLabel(monitorCard.dueDate, monitorCard.dueTime)}
                  {!current && " · ainda não começou"}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <UserCheck className="h-4 w-4" /> Disponível
            </div>
          )}
        </button>

        {/* Mesa (pura decoração leve) */}
        <div className="mx-auto h-1.5 w-1/3 rounded-b bg-border" />
        <div className="h-2 rounded-md bg-gradient-to-b from-border to-border/50" />
      </div>

      {/* Fila visual */}
      <button
        type="button"
        onClick={() => onOpenQueue(collaborator.userId)}
        className="mt-3 flex w-full items-end gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/60"
      >
        <div className="relative h-10 w-12 shrink-0">
          {Array.from({ length: Math.min(queueCount, 5) }).map((_, i) => (
            <span
              key={i}
              className="absolute left-0 h-3 w-11 rounded-sm border border-border bg-muted"
              style={{ bottom: i * 4, left: i * 1.5 }}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs font-medium">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            {queueCount} na fila
            {awaitingClientCount > 0 && (
              <span className="ml-1 text-muted-foreground">· {awaitingClientCount} aguardando cliente</span>
            )}
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.round(loadRatio * 100)}%` }}
            />
          </div>
        </div>
      </button>
    </div>
  );
});

export default OfficeStation;
