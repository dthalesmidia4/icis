import type { ReactNode, RefObject } from "react";

interface OfficeWorldProps {
  children: ReactNode;
  /**
   * Slot reservado para futuras zonas acima da sala principal
   * (ex.: área de descanso). Não renderiza nada quando ausente.
   */
  upperZone?: ReactNode;
  /** HUD flutuante sobre a cena (métricas, filtro de área). */
  hud?: ReactNode;
  /** Camada de overlay livre (ex.: animação de transferência). */
  overlay?: ReactNode;
  /** Referência do container, usada para coordenadas relativas do overlay. */
  containerRef?: RefObject<HTMLElement>;
}

/**
 * Cenário contínuo do escritório: parede com decoração leve, piso em
 * perspectiva e uma camada livre onde as mesas são posicionadas.
 * Somente CSS/SVG — nenhuma imagem externa.
 */
export default function OfficeWorld({
  children,
  hud,
  upperZone,
  overlay,
  containerRef,
}: OfficeWorldProps) {
  return (
    <section
      ref={containerRef as RefObject<HTMLElement> as any}
      aria-label="Planta do escritório"
      className="relative flex min-h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-muted/60 via-muted/25 to-muted/45"
    >
      {hud}
      {upperZone}
      {overlay}


      {/* ---------- Parede ---------- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-background/85 to-background/10"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[20%] h-[3px] bg-foreground/10" />

      {/* decoração da parede em escala coerente com as mesas */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[20%] hidden sm:block">
        {/* janelas */}
        <div className="absolute left-[6%] top-[22%] flex gap-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 w-24 rounded-sm border-2 border-foreground/15 bg-gradient-to-br from-primary/15 to-background/60"
            >
              <div className="absolute" />
              <div className="mx-auto h-full w-[2px] bg-foreground/15" />
            </div>
          ))}
        </div>
        {/* quadro */}
        <div className="absolute left-[42%] top-[30%] h-12 w-16 rounded-sm border-2 border-foreground/15 bg-background/50" />
        {/* prateleira com pastas */}
        <div className="absolute right-[16%] top-[34%] w-28">
          <div className="flex items-end gap-1 pl-1">
            <span className="h-6 w-1.5 rounded-sm bg-primary/50" />
            <span className="h-5 w-1.5 rounded-sm bg-foreground/25" />
            <span className="h-7 w-2 rounded-sm bg-primary/35" />
            <span className="h-4 w-1.5 rounded-sm bg-foreground/20" />
          </div>
          <div className="h-1 w-full rounded-sm bg-foreground/20" />
        </div>
        {/* luminária */}
        <div className="absolute left-[62%] top-0 flex flex-col items-center">
          <span className="h-6 w-[2px] bg-foreground/20" />
          <span className="h-2 w-10 rounded-b-full bg-foreground/25" />
          <span className="h-6 w-10 rounded-b-full bg-primary/10 blur-[3px]" />
        </div>
      </div>

      {/* armário e planta encostados na parede */}
      <div aria-hidden="true" className="pointer-events-none absolute left-[3%] top-[18%] hidden sm:block">
        <div className="h-16 w-12 rounded-sm bg-gradient-to-b from-muted-foreground/25 to-muted-foreground/10">
          <div className="mx-auto mt-2 h-[2px] w-8 bg-foreground/15" />
          <div className="mx-auto mt-4 h-[2px] w-8 bg-foreground/15" />
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-[3%] top-[16%] hidden flex-col items-center sm:flex">
        <span className="h-7 w-1 rounded bg-foreground/25" />
        <span className="-mt-8 h-6 w-6 -rotate-45 rounded-full bg-primary/30" />
        <span className="-mt-3 ml-5 h-5 w-5 rotate-45 rounded-full bg-primary/25" />
        <span className="mt-1 h-5 w-7 rounded-b-md bg-foreground/25" />
      </div>

      {/* ---------- Piso ---------- */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[20%] h-auto w-full text-foreground/[0.07]"
      >
        <defs>
          <pattern
            id="office-floor-tiles"
            width="86"
            height="46"
            patternUnits="userSpaceOnUse"
            patternTransform="skewX(-20)"
          >
            <path d="M86 0H0V46" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#office-floor-tiles)" />
      </svg>

      {/* ---------- Camada das mesas ---------- */}
      <div className="relative flex-1">{children}</div>
    </section>
  );
}
