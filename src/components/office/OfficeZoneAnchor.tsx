import { memo } from "react";

interface OfficeZoneAnchorProps {
  /** Chave do lugar físico (ex.: `coffee:0`, `planning:1`, `desk:<userId>`). */
  anchorKey: string;
  /**
   * Largura NOMINAL do lugar (px, antes da escala do mundo). A `OfficePeopleLayer`
   * mede a largura real: assim o personagem escala junto com a mesa sem número
   * mágico duplicado.
   */
  width: number;
  /** Registra/desregistra o elemento no mapa mantido por `Office.tsx`. */
  register?: (key: string, el: HTMLElement | null) => void;
}

/**
 * ANCHOR DOM invisível: marca o ponto exato (base/pés) onde um personagem deve
 * ficar numa zona ou mesa. A posição é MEDIDA via `getBoundingClientRect`,
 * nunca calculada por offset arbitrário.
 */
export const OfficeZoneAnchor = memo(function OfficeZoneAnchor({
  anchorKey,
  width,
  register,
}: OfficeZoneAnchorProps) {
  return (
    <span
      aria-hidden="true"
      data-office-anchor={anchorKey}
      className="pointer-events-none block h-0"
      style={{ width }}
      ref={(el) => register?.(anchorKey, el)}
    />
  );
});

export default OfficeZoneAnchor;
