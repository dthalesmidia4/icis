import { memo } from "react";
import { cn } from "@/lib/utils";

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export type CharacterPosture = "seated" | "standing" | "walking";

interface OfficeCharacterProps {
  name: string;
  avatarUrl?: string | null;
  /** Postura de digitação (microanimação nos braços). */
  working: boolean;
  /** Largura total do personagem em px (escala com a mesa). */
  size?: number;
  /** Postura física. `seated` encaixa na cadeira da mesa. */
  posture?: CharacterPosture;
  /** Retrocompatibilidade: `standing` equivale a `posture="standing"`. */
  standing?: boolean;
}

/**
 * Personagem 2D — somente CSS (nenhum asset externo, nenhuma animação por
 * frame). Sentado, o conjunto cadeira+torso fica logo atrás do tampo e só a
 * cabeça (foto do perfil) aparece acima do monitor. Em pé/andando ganha pernas
 * simples, usadas nas zonas coletivas (café, planejamento, revisão).
 */
export const OfficeCharacter = memo(function OfficeCharacter({
  name,
  avatarUrl,
  working,
  size = 52,
  posture,
  standing = false,
}: OfficeCharacterProps) {
  const pose: CharacterPosture = posture ?? (standing ? "standing" : "seated");
  const seated = pose === "seated";
  const walking = pose === "walking";
  const head = Math.round(size * 0.6);
  const torsoW = Math.round(size * 0.72);
  const torsoH = Math.round(size * (seated ? 0.5 : 0.62));
  const legH = Math.round(size * 0.3);
  const armsAnimate = (working && seated) || walking;

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
            armsAnimate && "animate-office-typing motion-reduce:animate-none",
          )}
          style={{
            left: -Math.round(size * 0.2),
            top: Math.round(torsoH * 0.32),
            width: Math.round(size * 0.38),
            height: Math.max(4, Math.round(size * 0.1)),
            transform: `rotate(${seated ? 18 : -34}deg)`,
            transformOrigin: "right center",
          }}
        />
        <span
          className={cn(
            "absolute rounded-full",
            working ? "bg-primary/70" : "bg-muted-foreground/45",
            armsAnimate && "animate-office-typing motion-reduce:animate-none",
          )}
          style={{
            right: -Math.round(size * 0.2),
            top: Math.round(torsoH * 0.38),
            width: Math.round(size * 0.38),
            height: Math.max(4, Math.round(size * 0.1)),
            transform: "rotate(-18deg)",
            transformOrigin: "left center",
            animationDelay: armsAnimate ? "220ms" : undefined,
          }}
        />
      </span>

      {/* pernas simples: só em pé / andando */}
      {!seated && (
        <span className="relative z-10 flex" style={{ gap: Math.round(size * 0.1) }}>
          {[0, 1].map((i) => (
            <span
              key={i}
              className={cn(
                "block rounded-b-sm bg-muted-foreground/55",
                walking && "animate-office-typing motion-reduce:animate-none",
              )}
              style={{
                width: Math.max(4, Math.round(size * 0.13)),
                height: legH,
                transformOrigin: "top center",
                animationDelay: walking && i === 1 ? "300ms" : undefined,
              }}
            />
          ))}
        </span>
      )}

      {seated && (
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
