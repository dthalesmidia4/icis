import type { ReactNode, RefObject } from "react";
import { WALL_DECOR_BAND_PCT, WALL_HEIGHT_PCT } from "@/lib/officeLayout";


interface OfficeWorldProps {
  children: ReactNode;
  /**
   * Slot reservado para as zonas físicas posicionadas sobre o palco
   * (painel da parede, planejamento, revisão, café, reunião, espera).
   */
  upperZone?: ReactNode;
  /** HUD flutuante sobre a cena (métricas, filtro de área). */
  hud?: ReactNode;
  /** Camada de overlay livre (ex.: animação de transferência). */
  overlay?: ReactNode;
  /** Referência da SALA (medida por ResizeObserver). */
  containerRef?: RefObject<HTMLElement>;
  /**
   * Referência do PALCO LÓGICO: é ele que serve de sistema de coordenadas para
   * personagens e animação de transferência, então mesas e zonas ficam coesas
   * também em ultrawide.
   */
  stageRef?: RefObject<HTMLDivElement>;
  /** Largura máxima (px) do palco lógico. */
  stageWidth?: number;
}

/**
 * Cenário contínuo do escritório: parede com decoração, rodapé, piso em
 * perspectiva e um PALCO LÓGICO centralizado onde vivem mesas e zonas.
 * Somente CSS/SVG — nenhuma imagem externa.
 */
export default function OfficeWorld({
  children,
  hud,
  upperZone,
  overlay,
  containerRef,
  stageRef,
  stageWidth,
}: OfficeWorldProps) {
  return (
    <section
      ref={containerRef as RefObject<HTMLElement> as any}
      aria-label="Planta do escritório"
      className="relative flex min-h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-muted/70 via-muted/30 to-muted/55"
    >
      {/* ---------- Parede (faixa decorativa acima + faixa funcional abaixo) ---------- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-background/95 via-background/70 to-background/15"
        style={{ height: `${WALL_HEIGHT_PCT}%` }}
      />
      {/* moldura/junção parede-piso: rodapé + sombra de contato */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 h-[6px] bg-foreground/20"
        style={{ top: `${WALL_HEIGHT_PCT}%` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-foreground/12 to-transparent"
        style={{ top: `calc(${WALL_HEIGHT_PCT}% + 6px)` }}
      />

      {/* decoração da parede: confinada à FAIXA SUPERIOR. A região esquerda é
          reservada ao quadro de Missões, por isso resta UMA única janela
          compacta ao lado dele — nada de janela atrás de painel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 hidden sm:block"
        style={{ height: `${WALL_DECOR_BAND_PCT}%` }}
      >
        {/* JANELA única, centralizada no vão livre da parede esquerda (entre o
            quadro de Missões e o Painel da Agência) e um pouco mais VERTICAL,
            para leitura arquitetônica. A planta vive fora desta faixa: ela é
            objeto de PISO (ver abaixo), não de parede. */}
        <div className="absolute left-[31%] top-[18%]">
          <div className="relative h-24 w-20 rounded-sm border-[3px] border-foreground/25 bg-gradient-to-br from-primary/25 to-background/70 shadow-[inset_0_2px_8px_hsl(var(--foreground)/0.12)]">
            <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-foreground/25" />
            <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-foreground/20" />
            <span className="absolute -bottom-[4px] inset-x-[-3px] h-[4px] rounded-sm bg-foreground/25" />
          </div>
        </div>


        {/* QUADRO/GRÁFICO DECORATIVO DE PAREDE (único elemento com esta função,
            à direita do Painel da Agência): moldura clara + 4 barras verticais.
            A antiga prateleira de pastas foi removida porque disputava a mesma
            leitura de "gráfico" e criava ambiguidade. */}
        <div className="absolute right-[18%] top-[24%] hidden md:block">
          <div className="relative h-16 w-24 rounded-[3px] border-[3px] border-foreground/30 bg-background/90 shadow-[0_6px_10px_-10px_hsl(var(--foreground)/0.9)]">
            <div className="absolute inset-x-2 bottom-2 flex h-[70%] items-end justify-between">
              <span className="h-[42%] w-3 rounded-t-[2px] bg-primary/45" />
              <span className="h-[74%] w-3 rounded-t-[2px] bg-primary/70" />
              <span className="h-[56%] w-3 rounded-t-[2px] bg-primary/50" />
              <span className="h-[92%] w-3 rounded-t-[2px] bg-primary/85" />
            </div>
            <span className="absolute inset-x-2 bottom-2 h-[2px] bg-foreground/30" />
          </div>
        </div>



        {/* luminária pendente */}
        <div className="absolute left-[44%] top-0 flex flex-col items-center">
          <span className="h-6 w-[2px] bg-foreground/30" />
          <span className="h-2.5 w-12 rounded-b-full bg-foreground/35" />
        </div>
      </div>


      {/* armário e planta encostados na parede */}
      <div aria-hidden="true" className="pointer-events-none absolute left-[2.5%] top-[19%] hidden sm:block">
        <div className="h-20 w-14 rounded-sm bg-gradient-to-b from-muted-foreground/40 to-muted-foreground/20 shadow-[0_8px_12px_-10px_hsl(var(--foreground)/0.9)]">
          <div className="mx-auto mt-3 h-[3px] w-9 bg-foreground/25" />
          <div className="mx-auto mt-5 h-[3px] w-9 bg-foreground/25" />
          <div className="mx-auto mt-5 h-[3px] w-9 bg-foreground/25" />
        </div>
        <span className="mx-auto block h-1.5 w-12 rounded-[50%] bg-foreground/15 blur-[2px]" />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-[2.5%] top-[18%] hidden flex-col items-center sm:flex">
        <span className="h-9 w-1.5 rounded bg-foreground/35" />
        <span className="-mt-10 h-8 w-8 -rotate-45 rounded-full bg-primary/40" />
        <span className="-mt-4 ml-6 h-6 w-6 rotate-45 rounded-full bg-primary/32" />
        <span className="mt-1 h-7 w-9 rounded-b-md bg-foreground/35" />
        <span className="mx-auto block h-1.5 w-10 rounded-[50%] bg-foreground/15 blur-[2px]" />
      </div>

      {/* ---------- Piso ---------- */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-auto w-full text-foreground/[0.13]"
        style={{ top: `${WALL_HEIGHT_PCT}%` }}
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

      {/* ---------- Palco lógico centralizado ----------
          A cena NÃO se espalha pela largura bruta: em ultrawide as margens
          externas ficam calmas e o escritório continua coeso. Este elemento é
          o sistema de coordenadas dos personagens e da animação. */}
      <div
        ref={stageRef}
        className="relative mx-auto flex w-full flex-1 flex-col"
        style={stageWidth ? { maxWidth: stageWidth } : undefined}
      >
        {hud}
        {upperZone}
        {overlay}
        <div className="relative flex-1">{children}</div>
      </div>
    </section>
  );
}
