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
 * NÍVEL COLETIVO + MISSÕES DO DIA, na parede à esquerda. Tudo derivado do
 * estado real: XP vem de entregas registradas em `demand_flow_history` e as
 * missões, do próprio quadro operacional. Sem ranking individual.
 */
export const OfficeMissionPanel = memo(function OfficeMissionPanel({
  level,
  missions,
  doneCount,
  total,
}: OfficeMissionPanelProps) {
  const pct = Math.round((level.xpInLevel / level.nextLevelXp) * 100);
  return (
    <div className="w-[186px] rounded-md border border-border/70 bg-background/75 px-2 py-1.5 backdrop-blur-[2px]">
      {/* nível coletivo */}
      <div className="flex items-center justify-between" title={XP_LEGEND}>
        <span className="rounded-full bg-primary/15 px-1.5 text-[9px] font-bold uppercase leading-4 tracking-wide text-primary">
          Nível {level.level}
        </span>
        <span className="text-[8px] tabular-nums text-muted-foreground">
          {level.xpInLevel}/{level.nextLevelXp} XP
        </span>
      </div>
      <div className="mt-1 h-[4px] w-full overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full bg-primary/70 transition-[width] duration-700"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <p className="mt-[3px] text-[8px] leading-tight text-muted-foreground">{XP_LEGEND}</p>

      {/* missões coletivas */}
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Missões do dia
        </span>
        <span className="text-[9px] font-semibold tabular-nums text-foreground">
          {doneCount}/{total}
        </span>
      </div>
      <ul className="mt-1 space-y-[3px]">
        {missions.map((m) => (
          <li key={m.id} className="flex items-start gap-1">
            <span
              aria-hidden="true"
              className={cn(
                "mt-[2px] flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border",
                m.done ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {m.done && <Check className="h-2 w-2" />}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-[9px] leading-tight",
                  m.done ? "text-muted-foreground line-through" : "font-medium text-foreground",
                )}
              >
                {m.label}
              </span>
              {m.detail && (
                <span className="block text-[8px] leading-tight text-muted-foreground">
                  {m.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});

export default OfficeMissionPanel;
