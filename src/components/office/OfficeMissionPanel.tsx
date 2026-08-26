import { memo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { XP_LEGEND, type AgencyLevel, type OfficeMission } from "@/lib/officeAgencyPulse";

interface OfficeMissionPanelProps {
  level: AgencyLevel;
  missions: OfficeMission[];
  doneCount: number;
  total: number;
}

/**
 * QUADRO DE AVISOS MONTADO NA PAREDE (placar coletivo): nível + XP + missões do
 * dia. Visual de quadro fixado (moldura fina + parafusos), sem sombra de card
 * flutuante: pertence à parede, não ao piso. Tudo derivado do estado real — XP
 * vem de entregas registradas em `demand_flow_history` e as missões, do próprio
 * quadro operacional. Sem ranking individual.
 */
export const OfficeMissionPanel = memo(function OfficeMissionPanel({
  level,
  missions,
  doneCount,
  total,
}: OfficeMissionPanelProps) {
  const pct = Math.round((level.xpInLevel / level.nextLevelXp) * 100);
  return (
    <div className="relative w-full max-w-[268px] rounded-[3px] border-2 border-foreground/25 bg-muted/55 p-[3px]">
      {/* parafusos de fixação na parede */}
      <span aria-hidden="true" className="absolute left-1 top-1 h-1 w-1 rounded-full bg-foreground/35" />
      <span aria-hidden="true" className="absolute right-1 top-1 h-1 w-1 rounded-full bg-foreground/35" />

      <div className="rounded-[2px] bg-background/80 px-2 py-1.5">

        {/* nível coletivo */}
        <div className="flex items-center justify-between" title={XP_LEGEND}>
          <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold uppercase leading-[16px] tracking-wide text-primary">
            Nível {level.level}
          </span>
          <span className="text-[9px] font-medium tabular-nums text-muted-foreground">
            {level.xpInLevel}/{level.nextLevelXp} XP
          </span>
        </div>
        <div className="mt-1 h-[6px] w-full overflow-hidden rounded-full bg-foreground/12 ring-1 ring-inset ring-foreground/10">
          <span
            className="block h-full rounded-full bg-primary/80 transition-[width] duration-700"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <p className="mt-[3px] text-[8px] leading-tight text-muted-foreground">{XP_LEGEND}</p>

        {/* missões coletivas */}
        <div className="mt-2 flex items-baseline justify-between border-t border-border/60 pt-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Missões do dia
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-foreground">
            {doneCount}/{total}
          </span>
        </div>
        <ul className="mt-1 space-y-[4px]">
          {missions.map((m) => (
            <li key={m.id} className="flex items-start gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                  m.done ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30",
                )}
              >
                {m.done && <Check className="h-2.5 w-2.5" />}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-[10px] leading-tight",
                    m.done ? "text-muted-foreground line-through" : "font-medium text-foreground",
                  )}
                >
                  {m.label}
                </span>
                {m.detail && (
                  <span className="block text-[9px] leading-tight text-muted-foreground">
                    {m.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});

export default OfficeMissionPanel;
