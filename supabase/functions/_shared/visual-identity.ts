// Centralized loader + prompt renderer for client visual identity.
// Single source of truth so avulso and período (and every other function)
// stay 100% in sync on colors, fonts, logo and mascot rules.

export type VisualIdentity = {
  brandName: string;
  sector: string;
  productsServices: string;
  contentRequirements: string | null;
  logo: {
    url: string | null;
    position: string;
    size: string;
  };
  mascot: {
    has: boolean;
    description: string | null;
    galleryUrls: string[];
  };
  colors: {
    primary: string;
    secondary: string;
    highlight: string | null;
    text: string | null;
    auxiliary: string | null;
  };
  fonts: {
    primary: string;
    secondary: string | null;
  };
};

export type LoadVisualIdentityOptions = {
  // When provided, loads exactly this preset (used by Client Hub avulso flows
  // where the user explicitly picks a preset). When omitted, falls back to the
  // most recent preset for the company (period/auto flows).
  presetId?: string | null;
  // Max mascot reference images to fetch from the gallery.
  mascotImageLimit?: number;
};

const TENANT_COMPANY_FIELDS =
  "name, fantasy_name, sector, products_services, content_requirements, " +
  "logo_url, logo_position, logo_size, " +
  "brand_primary_color, brand_secondary_color, brand_auxiliary_color, " +
  "brand_font, brand_secondary_font, " +
  "has_mascot, mascot_url, mascot_description";

const PRESET_FIELDS =
  "primary_color, secondary_color, highlight_color, text_color, auxiliary_color, " +
  "font_name, secondary_font";

export async function loadVisualIdentity(
  supabase: any,
  clientId: string,
  options: LoadVisualIdentityOptions = {},
): Promise<VisualIdentity> {
  const mascotLimit = options.mascotImageLimit ?? 2;

  const { data: client } = await supabase
    .from("tenant_companies")
    .select(TENANT_COMPANY_FIELDS)
    .eq("id", clientId)
    .single();

  // Resolve preset (explicit > most recent for company > none)
  let preset: any = null;
  if (options.presetId) {
    const { data } = await supabase
      .from("visual_identity_presets")
      .select(PRESET_FIELDS)
      .eq("id", options.presetId)
      .maybeSingle();
    preset = data;
  } else {
    const { data } = await supabase
      .from("visual_identity_presets")
      .select(PRESET_FIELDS)
      .eq("company_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    preset = data;
  }

  // Mascot gallery
  let galleryUrls: string[] = [];
  if (client?.has_mascot && mascotLimit > 0) {
    const { data: mascotImages } = await supabase
      .from("company_mascot_images")
      .select("image_url")
      .eq("company_id", clientId)
      .order("position", { ascending: true })
      .limit(mascotLimit);
    if (Array.isArray(mascotImages)) {
      galleryUrls = mascotImages.map((m: any) => m.image_url).filter(Boolean);
    }
  }

  return {
    brandName: client?.fantasy_name || client?.name || "Marca",
    sector: client?.sector || "",
    productsServices: client?.products_services || "",
    contentRequirements: client?.content_requirements ?? null,
    logo: {
      url: client?.logo_url ?? null,
      position: client?.logo_position || "bottom-right",
      size: client?.logo_size || "medium",
    },
    mascot: {
      has: !!client?.has_mascot,
      description: client?.mascot_description ?? null,
      galleryUrls,
    },
    colors: {
      primary: preset?.primary_color || client?.brand_primary_color || "#000000",
      secondary: preset?.secondary_color || client?.brand_secondary_color || "#FFFFFF",
      highlight: preset?.highlight_color ?? null,
      text: preset?.text_color ?? null,
      auxiliary: preset?.auxiliary_color || client?.brand_auxiliary_color || null,
    },
    fonts: {
      primary: preset?.font_name || client?.brand_font || "Montserrat",
      secondary: preset?.secondary_font ?? client?.brand_secondary_font ?? null,
    },
  };
}

// ============================================================================
// Prompt rendering helpers — keep wording identical across all functions.
// ============================================================================

const LOGO_POSITION_MAP: Record<string, string> = {
  "top-left": "canto superior esquerdo",
  "top-center": "centro superior (topo centralizado horizontalmente)",
  "top-right": "canto superior direito",
  "bottom-left": "canto inferior esquerdo",
  "bottom-center": "centro inferior (base centralizada horizontalmente)",
  "bottom-right": "canto inferior direito",
};

const LOGO_SIZE_MAP: Record<string, string> = {
  small: "~8%",
  medium: "~12%",
  large: "~18%",
};

const LOGO_SIZE_HIGHLIGHT_MAP: Record<string, string> = {
  small: "~12%",
  medium: "~18%",
  large: "~22%",
};

export function renderColorPaletteBlock(vi: VisualIdentity): string {
  const c = vi.colors;
  const f = vi.fonts;
  const lines = [
    "PALETA DE CORES E APLICAÇÃO (REGRAS CRÍTICAS):",
    `- Marca: "${vi.brandName}" | ${vi.sector || "N/A"} | ${vi.productsServices || "N/A"}`,
    `- Cor primária (${c.primary}): Use em fundos, banners, boxes, shapes e elementos gráficos dominantes do layout`,
    `- Cor secundária (${c.secondary}): Use em acentos, bordas, elementos complementares e variações de fundo`,
  ];
  if (c.highlight) {
    lines.push(`- Cor de destaque (${c.highlight}): Use em botões, badges, CTAs, ícones e pequenos destaques visuais`);
  }
  if (c.text) {
    lines.push(`- Cor do texto (${c.text}): Use na tipografia principal sobre os fundos`);
  }
  if (c.auxiliary) {
    lines.push(
      `- Cor auxiliar (${c.auxiliary}): Use APENAS em elementos gráficos de apoio (formas decorativas, divisores, badges menores, gradientes secundários, fundos de seção). NUNCA como cor dominante — serve para enriquecer e variar a composição.`,
    );
  }
  lines.push(`- Tipografia principal: ${f.primary} — use em títulos e textos de impacto.`);
  if (f.secondary) {
    lines.push(
      `- Tipografia secundária: ${f.secondary} — use em subtítulos, legendas, listas e textos de apoio (NÃO use no título principal).`,
    );
  }
  return lines.join("\n");
}

export const COLOR_APPLICATION_RULES = `REGRA CRÍTICA DE APLICAÇÃO DE CORES:
As cores da marca devem ser aplicadas APENAS em elementos de design gráfico (fundos, gradientes, boxes, banners, shapes, tipografia, ícones, bordas).
NUNCA aplique as cores da marca em objetos reais, pessoas, animais ou elementos figurativos.
Exemplo: se a cor primária é verde, o fundo e os boxes devem ser verdes, mas um leão deve ter cores NATURAIS realistas.
Os sujeitos e ilustrações figurativas devem manter aparência NATURAL e REALISTA.
A paleta de cores cria a identidade visual através do LAYOUT e DESIGN, não tingindo os elementos figurativos.`;

export function renderMascotBlock(vi: VisualIdentity, hasReferenceImage: boolean): string {
  const desc = vi.mascot.description ? `Descrição detalhada: ${vi.mascot.description}.` : "";
  if (hasReferenceImage) {
    return `- MASCOTE: A marca possui um mascote oficial. ${desc}
  OBRIGATÓRIO PRESERVAR (identidade): mesma espécie, cores, roupa/uniforme, proporções, traços faciais e estilo de arte da imagem de referência — ele deve ser RECONHECIDO como o mesmo personagem.
  OBRIGATÓRIO VARIAR (composição): pose corporal, expressão facial, ângulo de câmera e enquadramento ADEQUADOS ao tema; evite a pose neutra padrão da imagem de referência. O mascote DEVE interagir com o cenário/objetos do tema.
  O mascote aparece integrado ao design como protagonista visual.`;
  }
  if (vi.mascot.has) {
    return `- A marca possui um mascote (${vi.mascot.description || "sem descrição"}), mas nenhuma imagem de referência está disponível. Tente incluí-lo se possível.`;
  }
  return `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;
}

export function renderLogoBlock(vi: VisualIdentity, opts: { highlight?: boolean } = {}): string {
  if (!vi.logo.url) return "";
  const sizeMap = opts.highlight ? LOGO_SIZE_HIGHLIGHT_MAP : LOGO_SIZE_MAP;
  const sizeText = sizeMap[vi.logo.size] || (opts.highlight ? "~18%" : "~12%");
  const positionText = LOGO_POSITION_MAP[vi.logo.position] || vi.logo.position;
  const proeminence = opts.highlight
    ? "- Este é um slide de DESTAQUE — a logo deve ser PROEMINENTE e mais visível"
    : "";
  return `\nLOGO DA MARCA (REGRA CRÍTICA — FIDELIDADE PIXEL A PIXEL):
- A logo da marca está fornecida como imagem de referência. INCLUA a logo no design OBRIGATORIAMENTE.
- Posição: ${positionText}
- Tamanho: ${sizeText} da área da imagem
${proeminence}
- TRATE A LOGO COMO ASSET FIXO: copie e cole a imagem de referência da logo no layout. NÃO redesenhe, NÃO recrie, NÃO ilustre uma versão própria.
- REPRODUZA A LOGO PIXEL A PIXEL exatamente como na imagem de referência fornecida — mesmas cores, mesma tipografia, mesmo símbolo/ícone, mesmas proporções, mesmo espaçamento interno, mesmo arranjo (horizontal/vertical/empilhado).
- PROIBIDO ABSOLUTO: redesenhar o símbolo/ícone da logo; trocar a fonte do nome da marca; reescrever, traduzir ou parafrasear o texto da logo; mudar as cores da logo; adicionar tagline, slogan ou texto que não exista na referência; remover elementos da logo; aplicar efeitos (sombra dura, contorno, brilho, gradiente) sobre a logo; inclinar, distorcer ou estilizar a logo; inventar variações ou "interpretações" da logo.
- A logo deve aparecer NÍTIDA e LEGÍVEL, com fundo de contraste suficiente (use um pequeno padding/box neutro se necessário) — sem cobrir parcialmente, sem cortar, sem sobrepor outros elementos por cima dela.
- Se a logo já contém o nome da marca, NÃO renderize o nome da marca novamente em outro lugar do design.\n`;
}

export function renderContentRequirementsBlock(vi: VisualIdentity): string {
  if (!vi.contentRequirements) return "";
  return `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):
${vi.contentRequirements}\n`;
}

// Convenience: brand identity context line for text-only prompts (carousel content, storyboard).
export function renderBrandContextLine(vi: VisualIdentity): string {
  const c = vi.colors;
  const f = vi.fonts;
  const palette = [
    c.primary && `primária ${c.primary}`,
    c.secondary && `secundária ${c.secondary}`,
    c.highlight && `destaque ${c.highlight}`,
    c.text && `texto ${c.text}`,
    c.auxiliary && `auxiliar ${c.auxiliary}`,
  ].filter(Boolean).join(", ");
  const fonts = [f.primary && `fonte principal ${f.primary}`, f.secondary && `fonte secundária ${f.secondary}`]
    .filter(Boolean).join(" / ");
  return `Identidade visual: ${palette}. ${fonts}.`;
}
