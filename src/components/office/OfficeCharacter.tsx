import { memo } from "react";
import { cn } from "@/lib/utils";

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

interface OfficeCharacterProps {
  name: string;
  avatarUrl?: string | null;
  /** Postura de digitação (microanimação nos braços). */
  working: boolean;
  /** Largura total do personagem em px (escala com a mesa). */
  size?: number;
  /** Personagem em pé (cafeteria) — sem cadeira, braço segurando caneca. */
  standing?: boolean;
}

/**
 * Personagem 2D. Sentado, o conjunto cadeira+torso fica logo atrás do tampo,
 * de modo que o torso é parcialmente encoberto pela mesa e só a cabeça (com a
 * foto do perfil) aparece acima do monitor. Em pé, é usado na cafeteria.
 */
export const OfficeCharacter = memo(function OfficeCharacter({
  name,
  avatarUrl,
  working,
  size = 52,
  standing = false,
}: OfficeCharacterProps) {
  const head = Math.round(size * 0.6);
  const torsoW = Math.round(size * 0.72);
  const torsoH = Math.round(size * (standing ? 0.62 : 0.5));

  return (
    <div
      className="pointer-events-none relative flex flex-col items-center"
      style={{ width: size }}
      aria-hidden="true"
    >
      {/* cabeça (foto do perfil quando existir) — tamanho idêntico com e sem foto */}
      <span
        className={cn(
          "relative z-30 block shrink-0 overflow-hidden rounded-full border-2 bg-muted",
          working ? "border-primary/70" : "border-border",
        )}
        style={{ height: head, width: head, boxSizing: "border-box" }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full rounded-full object-cover object-center"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center font-bold leading-none text-muted-foreground"
            style={{ fontSize: Math.max(8, Math.round(head * 0.34)) }}
          >
            {initialsOf(name)}
          </span>
        )}
      </span>


      {/* torso + braços chegando à altura do tampo/teclado */}
      <span
        className={cn(
          "relative z-20 rounded-t-[45%] rounded-b-sm",
          working ? "bg-primary/85" : "bg-muted-foreground/50",
        )}
        style={{ width: torsoW, height: torsoH, marginTop: -Math.round(head * 0.16) }}
      >
        <span className="absolute left-1/2 top-1 h-2 w-3 -translate-x-1/2 rounded-b-full bg-background/40" />
        <span
          className={cn(
            "absolute rounded-full",
            working ? "bg-primary/70" : "bg-muted-foreground/45",
            working && !standing && "animate-office-typing motion-reduce:animate-none",
          )}
          style={{
            left: -Math.round(size * 0.2),
            top: Math.round(torsoH * 0.32),
            width: Math.round(size * 0.38),
            height: Math.max(4, Math.round(size * 0.1)),
            transform: `rotate(${standing ? -34 : 18}deg)`,
            transformOrigin: "right center",
          }}
        />
        <span
          className={cn(
            "absolute rounded-full",
            working ? "bg-primary/70" : "bg-muted-foreground/45",
            working && !standing && "animate-office-typing motion-reduce:animate-none",
          )}
          style={{
            right: -Math.round(size * 0.2),
            top: Math.round(torsoH * 0.38),
            width: Math.round(size * 0.38),
            height: Math.max(4, Math.round(size * 0.1)),
            transform: "rotate(-18deg)",
            transformOrigin: "left center",
            animationDelay: working ? "220ms" : undefined,
          }}
        />
      </span>

      {!standing && (
        /* encosto da cadeira aparece atrás dos ombros */
        <span
          className="absolute z-10 rounded-t-md bg-foreground/25 dark:bg-foreground/30"
          style={{
            width: Math.round(size * 0.86),
            height: Math.round(size * 0.46),
            top: Math.round(head * 0.62),
          }}
        />
      )}
    </div>
  );
});

export default OfficeCharacter;
