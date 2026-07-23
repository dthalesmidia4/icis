import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSeedancePricing } from "@/hooks/useSeedancePricing";

import type { SeedanceModelKey } from "@/lib/seedanceModel";

type Props = {
  model: SeedanceModelKey;
  resolution: "480p" | "720p" | "1080p";
  durationSeconds: number;
  className?: string;
};

/** Inline chip showing estimated cost for a single Seedance generation. */
export default function CostBadge({ model, resolution, durationSeconds, className }: Props) {
  const { estimate, loading } = useSeedancePricing();
  if (loading) return null;
  const est = estimate({ model, resolution, durationSeconds });

  if (!est) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground",
          className,
        )}
        title="Nenhum preço configurado. Cadastre em Dev · Preços Seedance."
      >
        <Coins className="h-3 w-3" />
        Custo não configurado
      </span>
    );
  }

  const brl =
    est.brl != null
      ? est.brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary",
        className,
      )}
      title={`≈ ${est.credits.toFixed(1)} créditos • ${durationSeconds}s @ ${resolution} (${model})`}
    >
      <Coins className="h-3 w-3" />
      ≈ {est.credits.toFixed(1)} créditos{brl ? ` · ${brl}` : ""}
    </span>
  );
}
