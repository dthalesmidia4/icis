import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botão flutuante topo/fim. Só renderiza quando existe overflow vertical real.
 * z-index abaixo de dialogs (z-50) para nunca cobrir modais.
 */
export default function ScrollEdgeButton({
  action,
  visible,
  onClick,
  className,
}: {
  action: "down" | "up";
  visible: boolean;
  onClick: () => void;
  className?: string;
}) {
  if (!visible) return null;
  const label = action === "down" ? "Ir para o fim" : "Ir para o topo";
  const Icon = action === "down" ? ArrowDown : ArrowUp;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-6 right-6 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-xl backdrop-blur transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
      style={{
        bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
        right: "calc(1.5rem + env(safe-area-inset-right, 0px))",
      }}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}
