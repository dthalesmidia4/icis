import { memo } from "react";
import { cn } from "@/lib/utils";

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

interface OfficeCharacterProps {
  name: string;
  avatarUrl?: string | null;
  /** Está com card em andamento (postura de digitação + animação leve). */
  working: boolean;
}

/**
 * Personagem 2D sentado: cadeira, torso, braços apontando ao teclado e cabeça
 * com avatar/iniciais. Escala pensada para caber na mesa (não é um avatar solto).
 */
export const OfficeCharacter = memo(function OfficeCharacter({
  name,
  avatarUrl,
  working,
}: OfficeCharacterProps) {
  return (
    <div className="pointer-events-none relative flex w-[54px] flex-col items-center">
      {/* cabeça */}
      <span
        className={cn(
          "relative z-20 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 bg-muted text-[9px] font-bold text-muted-foreground",
          working ? "border-primary/70" : "border-border",
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(name)
        )}
      </span>

      {/* torso + braços */}
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 -mt-1.5 h-8 w-[38px] rounded-t-[42%] rounded-b-sm",
          working ? "bg-primary/85" : "bg-muted-foreground/50",
        )}
      >
        <span className="absolute left-1/2 top-1 h-2 w-3.5 -translate-x-1/2 rounded-b-full bg-background/40" />
        {/* braço esquerdo */}
        <span
          className={cn(
            "absolute -left-3 top-3 h-1.5 w-5 origin-right rotate-[-16deg] rounded-full",
            working ? "bg-primary/70" : "bg-muted-foreground/45",
            working && "animate-office-typing motion-reduce:animate-none",
          )}
        />
        {/* braço direito */}
        <span
          className={cn(
            "absolute -right-3 top-3.5 h-1.5 w-5 origin-left rotate-[16deg] rounded-full",
            working ? "bg-primary/70" : "bg-muted-foreground/45",
            working && "animate-office-typing motion-reduce:animate-none",
          )}
          style={working ? { animationDelay: "220ms" } : undefined}
        />
      </span>

      {/* cadeira: encosto atrás, assento e base */}
      <span aria-hidden="true" className="relative z-0 flex flex-col items-center">
        <span className="h-1.5 w-11 rounded-sm bg-foreground/30 dark:bg-foreground/35" />
        <span className="h-3 w-1.5 bg-foreground/25 dark:bg-foreground/30" />
        <span className="h-1 w-8 rounded-full bg-foreground/25 dark:bg-foreground/30" />
      </span>
    </div>
  );
});

export default OfficeCharacter;
