/**
 * Converte as cores da identidade visual cadastrada no cliente em variáveis
 * CSS semânticas, aplicadas apenas no escopo do Hub do Cliente.
 * Sem cor cadastrada => retorna undefined e o tema padrão do sistema é mantido.
 */

type Hsl = { h: number; s: number; l: number };

const hexToHsl = (input?: string | null): Hsl | null => {
  if (!input) return null;
  let hex = input.trim().replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const str = ({ h, s, l }: Hsl) => `${h} ${s}% ${l}%`;

export interface ClientBrandColors {
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_highlight_color?: string | null;
  brand_text_color?: string | null;
}

export function buildClientBrandStyle(
  client: ClientBrandColors | null | undefined
): React.CSSProperties | undefined {
  if (!client) return undefined;

  const primary = hexToHsl(client.brand_primary_color);
  const highlight = hexToHsl(client.brand_highlight_color) || hexToHsl(client.brand_secondary_color);

  if (!primary && !highlight) return undefined;

  const style: Record<string, string> = {};

  if (primary) {
    style["--primary"] = str(primary);
    style["--primary-foreground"] = primary.l > 62 ? "0 0% 10%" : "0 0% 100%";
    style["--ring"] = str(primary);
    style["--accent"] = str({ h: primary.h, s: Math.max(20, Math.min(70, primary.s)), l: 94 });
    style["--accent-foreground"] = str({ h: primary.h, s: primary.s, l: Math.min(30, primary.l) });
    style["--sidebar-primary"] = str(primary);
  }

  const accentSource = highlight || primary;
  if (accentSource) {
    style["--secondary"] = str({ h: accentSource.h, s: Math.min(40, accentSource.s), l: 96 });
    style["--secondary-foreground"] = str({ h: accentSource.h, s: accentSource.s, l: Math.min(28, accentSource.l) });
  }

  return style as React.CSSProperties;
}
