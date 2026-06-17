// Shared image prompt builders so avulso/período always use the same wording.
// Keep these as pure string composition over the `VisualIdentity` returned by
// `loadVisualIdentity`, so a single edit propagates everywhere.

import {
  COLOR_APPLICATION_RULES,
  renderColorPaletteBlock,
  renderContentRequirementsBlock,
  renderLogoBlock,
  renderMascotBlock,
  type VisualIdentity,
} from "./visual-identity.ts";

const STATIC_POST_STYLE_BLOCK = `ESTILO VISUAL OBRIGATÓRIO:
- Crie designs com estilo de ilustração 3D estilizada, moderna e profissional
- Tipografia bold, grande e impactante integrada ao design (não sobreposta de forma genérica)
- Composição dinâmica com profundidade e camadas visuais
- Qualidade de design de agência profissional de alto nível
- Contraste alto entre texto e fundo para legibilidade perfeita
- Elementos gráficos decorativos sutis que enriquecem o layout
- Cores vibrantes e paleta coerente com a identidade visual da marca
- Apenas o TÍTULO do post deve aparecer legível e bem posicionado na imagem

CENÁRIO E AMBIENTAÇÃO (OBRIGATÓRIO):
- PROIBIDO fundo chapado, gradiente puro ou apenas shapes geométricos abstratos como cenário.
- O fundo DEVE ser um ambiente 3D real e contextual ao tema do post (ex.: clínica, sala de espera, casa, rua, escritório, oficina, loja), com props e objetos relevantes em cena.
- Inclua múltiplas camadas de profundidade: primeiro plano (mascote/objetos próximos), plano médio (mobiliário/elementos do tema) e fundo (paredes, janelas, ambientação).
- Use iluminação cinematográfica com sombras realistas para criar volume.
- Os boxes/banners de texto devem CONVIVER com o cenário, não substituí-lo nem ocupar a tela inteira.`;

const CAROUSEL_COVER_RULES = `REGRAS ESPECIAIS PARA CAPA (SLIDE 1 - OBRIGATÓRIO):
Este é o slide de CAPA do carrossel — o mais importante de todos.
- Design VISUALMENTE IMPACTANTE e CHAMATIVO que capture atenção imediata no feed
- Use elementos gráficos bold: boxes coloridos, banners vibrantes, balões de fala (speech bubbles) ou shapes dinâmicos para conter o texto — SEM cobrir o cenário
- Tipografia EXTRA BOLD, centralizada e com tamanho grande — o texto deve ser o protagonista visual
- Composição com profundidade: sombras, gradientes e camadas visuais que criem dimensão
- Use ícones ou emojis 3D estilizados para enriquecer o layout
- O design deve transmitir "profissionalismo de agência" e incentivar o usuário a DESLIZAR para ver mais
- A capa deve comunicar CLARAMENTE o tema do carrossel de forma concisa e atraente
- NÃO use layouts simples ou minimalistas — a capa deve ser visualmente rica e elaborada`;

const CAROUSEL_CONTINUITY = `CONTINUIDADE VISUAL: Mantenha o estilo visual coerente com a capa, mas com layout adequado para conteúdo informativo e variando a composição/pose do mascote.`;

const CAROUSEL_SINGLE_SLIDE_RULE = `REGRA CRÍTICA — UMA ÚNICA CENA POR IMAGEM:
- Esta chamada gera UMA ÚNICA imagem que representa SOMENTE o slide atual.
- PROIBIDO ABSOLUTO: colagens, grids, mosaicos, recap, montagens, divisão da arte em múltiplos quadros/painéis, miniaturas de outros slides, "antes/depois" lado a lado representando outros slides, ou qualquer composição que mostre mais de uma cena ou mais de um slide.
- A imagem deve ser uma cena 3D coesa e contínua (um único ambiente, uma única composição), NÃO uma página de resumo do carrossel.
- Apenas o texto do SLIDE ATUAL pode aparecer legível na arte. NENHUM texto de outros slides (S1, S2, S3...) pode aparecer renderizado na imagem — eles foram fornecidos apenas como contexto narrativo textual.`;

const CAROUSEL_FINAL_SLIDE_RULE = `REGRA ESPECIAL DO SLIDE FINAL (CTA/FECHAMENTO):
- Este é o slide final do carrossel, mas continua sendo UMA ÚNICA cena 3D de fechamento/CTA.
- NÃO é um slide de resumo visual: PROIBIDO mostrar miniaturas, recap, colagem ou grid dos slides anteriores.
- Componha uma cena única que reforce a chamada para ação do texto atual, com o mascote em pose convidativa.`;

export type StaticPostPromptInput = {
  vi: VisualIdentity;
  basePrompt?: string;       // generate_posts_prompt content
  strategySnippet?: string;  // tom de voz da estratégia ativa
  contentSection: string;    // título + objetivo + descrição + instruções já formatados
  hasMascotReference: boolean;
  aspectLabel?: string;      // "1:1 (square)", "9:16 (portrait)", etc. Default: 1:1
};

export function buildStaticPostPrompt(input: StaticPostPromptInput): string {
  const { vi, basePrompt, strategySnippet, contentSection, hasMascotReference } = input;
  const aspect = input.aspectLabel || "1:1 (quadrado)";
  const logoUrl = vi.logo.url;

  return `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}${renderContentRequirementsBlock(vi)}Crie uma imagem profissional de post para rede social.

${contentSection}

${renderColorPaletteBlock(vi)}
${renderMascotBlock(vi, hasMascotReference)}
${renderLogoBlock(vi)}
${COLOR_APPLICATION_RULES}

${STATIC_POST_STYLE_BLOCK}

REGRAS OBRIGATÓRIAS:
${logoUrl ? "- A LOGO da marca DEVE aparecer no design conforme as instruções acima" : "- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem"}
- Design profissional para redes sociais
- Formato: ${aspect}
- IMPORTANTE: Gere um POST COMPLETO para rede social, não apenas um elemento isolado
`.trim();
}

export type CarouselSlidePromptInput = {
  vi: VisualIdentity;
  basePrompt?: string;       // generate_carousel_prompt content (or fallback)
  strategySnippet?: string;
  slideNumber: number;
  totalSlides: number;
  slideText: string;
  slideLabel?: string;
  slideContextLine: string;  // "S1: '...' | S2: '...' | ..."
  hasMascotReference: boolean;
  aspectLabel?: string;
};

export function buildCarouselSlidePrompt(input: CarouselSlidePromptInput): string {
  const { vi, basePrompt, strategySnippet, slideNumber, totalSlides, slideText, slideLabel,
    slideContextLine, hasMascotReference } = input;
  const aspect = input.aspectLabel || "1:1 (quadrado)";
  const isHighlight = slideNumber === 1 || slideNumber === totalSlides;
  const isCover = slideNumber === 1;
  const logoUrl = vi.logo.url;

  const isFinal = slideNumber === totalSlides && totalSlides > 1;
  const isMiddleSlide = !!logoUrl && !isHighlight;

  const logoSection = logoUrl
    ? (isHighlight
        ? renderLogoBlock(vi, { highlight: true })
        : `\nLOGO DA MARCA (REGRA CRÍTICA — SLIDE DO MIOLO):
- PROIBIDO ABSOLUTO renderizar a logo, logotipo, marca d'água, monograma, ícone da marca ou o nome da marca neste slide.
- A logo aparece SOMENTE na capa (slide 1) e no slide final do carrossel — NUNCA nos slides intermediários.
- Não inclua nenhuma faixa, badge, rodapé ou box contendo a logo ou o nome "${vi.brandName}".\n`)
    : "";

  return `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}${renderContentRequirementsBlock(vi)}Crie imagem profissional para SLIDE ${slideNumber}/${totalSlides} de carrossel social.

TEXTO DO SLIDE ATUAL (único texto que pode aparecer renderizado): "${slideText}"${slideLabel ? ` (${slideLabel})` : ""}

CONTEXTO NARRATIVO (apenas para coerência de tom e estilo — NÃO renderize estes textos na imagem, NÃO os ilustre como slides separados):
${slideContextLine}

${renderColorPaletteBlock(vi)}
${renderMascotBlock(vi, hasMascotReference)}
${logoSection}
${COLOR_APPLICATION_RULES}

${STATIC_POST_STYLE_BLOCK}

${CAROUSEL_SINGLE_SLIDE_RULE}

${isCover ? CAROUSEL_COVER_RULES : CAROUSEL_CONTINUITY}
${isFinal ? "\n" + CAROUSEL_FINAL_SLIDE_RULE : ""}

REGRAS: Formato ${aspect}. Apenas o texto "${slideText}" DEVE aparecer legível. Design coerente entre slides, mas cada slide é UMA imagem independente.
PROIBIDO ABSOLUTO: NÃO desenhe nenhum número de página, contador, "1/5", "2/5", "${slideNumber}/${totalSlides}", paginação, dots indicadores, badges de slide ou qualquer marcação de sequência na imagem. O Instagram já mostra a posição do slide automaticamente.
PROIBIDO ABSOLUTO: NÃO crie colagem, grid, mosaico, recap ou montagem dos demais slides do carrossel — gere SOMENTE a cena do slide ${slideNumber}.
${isMiddleSlide
  ? `- PROIBIDO renderizar logo, logotipo, marca d'água ou o nome "${vi.brandName}" neste slide. A logo só aparece na capa e no slide final.`
  : (logoUrl ? "- A LOGO da marca DEVE aparecer no design conforme as instruções acima" : "- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem")}
`.trim();
}
