import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import OfficeCharacter, { type CharacterPosture } from "./OfficeCharacter";
import { characterSizePx } from "@/lib/officeLayout";

export interface OfficePerson {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  working: boolean;
  /** Chave do anchor onde a pessoa está agora (`desk:<id>`, `coffee:0`, ...). */
  anchorKey: string;
  posture: CharacterPosture;
  /** Legenda opcional (ex.: retorno do intervalo) mostrada nas zonas coletivas. */
  caption?: string | null;
}

interface OfficePeopleLayerProps {
  people: OfficePerson[];
  containerRef: RefObject<HTMLElement>;
  /** Mapa vivo de anchors registrados pelas mesas e zonas. */
  anchors: RefObject<Map<string, HTMLElement>>;
  /** Muda quando o layout do mundo muda (força nova medição). */
  layoutToken?: string | number;
}

interface Spot {
  x: number;
  y: number;
  size: number;
}

/**
 * CAMADA ÚNICA DE PERSONAGENS.
 *
 * Cada colaborador existe UMA vez na cena: a zona resolvida define apenas o
 * anchor de destino, e a transição CSS entre dois anchors é a "caminhada".
 * As posições são MEDIDAS dos anchors reais (mesas escalam junto), então não há
 * offset mágico duplicado entre layout e personagem.
 */
export const OfficePeopleLayer = memo(function OfficePeopleLayer({
  people,
  containerRef,
  anchors,
  layoutToken,
}: OfficePeopleLayerProps) {
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  const prevAnchor = useRef<Record<string, string>>({});
  const keys = useMemo(() => people.map((p) => `${p.userId}@${p.anchorKey}`).join("|"), [people]);

  // Medição sob demanda (mount, mudança de zona, resize) — nunca por frame.
  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const map = anchors.current;
      if (!container || !map) return;
      const base = container.getBoundingClientRect();
      const next: Record<string, Spot> = {};
      people.forEach((person) => {
        const el = map.get(person.anchorKey);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        next[person.userId] = {
          x: rect.left - base.left + rect.width / 2,
          y: rect.top - base.top,
          // Largura NOMINAL medida do lugar; a escala por postura é aplicada na
          // renderização (personagens têm protagonismo sem sair da cadeira).
          size: Math.max(24, Math.round(rect.width)),
        };
      });
      setSpots(next);
    };
    measure();
    // Segunda passada no próximo frame: cobre anchors montados no mesmo commit.
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [keys, layoutToken, people, containerRef, anchors]);

  useEffect(() => {
    const onResize = () => setSpots((prev) => ({ ...prev }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[35]">
      {people.map((person) => {
        const spot = spots[person.userId];
        if (!spot) return null;
        const moved = prevAnchor.current[person.userId] !== person.anchorKey;
        prevAnchor.current[person.userId] = person.anchorKey;
        const posture: CharacterPosture = moved ? "walking" : person.posture;
        return (
          <div
            key={person.userId}
            className="absolute flex flex-col items-center transition-[left,top] duration-[900ms] ease-in-out motion-reduce:transition-none"
            style={{
              left: spot.x,
              top: spot.y,
              transform: "translate(-50%, -100%)",
            }}
            title={`${person.name}${person.caption ? ` · ${person.caption}` : ""}`}
          >
            <OfficeCharacter
              name={person.name}
              avatarUrl={person.avatarUrl}
              working={person.working}
              posture={posture}
              // Copo apenas para quem está de fato na zona do café.
              holdingCup={person.anchorKey.startsWith("coffee:")}
              size={characterSizePx(spot.size, posture)}
            />

            {/* NOME integrado ao ambiente: plaquinha discreta sob os pés, nunca
                um label solto flutuando no piso. */}
            {person.posture !== "seated" && (
              <span className="mt-[1px] max-w-[76px] truncate rounded-[2px] border border-border/60 bg-background/80 px-1 text-[8px] font-semibold leading-[12px] text-foreground/85">
                {person.name.split(" ")[0]}
              </span>
            )}
            {person.posture !== "seated" && person.caption && (
              <span className="max-w-[76px] truncate text-[7px] leading-tight text-muted-foreground">
                {person.caption}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default OfficePeopleLayer;
