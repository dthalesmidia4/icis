import { useNavigate, useLocation } from "react-router-dom";
import JSZip from "jszip";
import { Card } from "@/components/ui/card";
import { FileText, Lightbulb, CalendarDays, ClipboardList, History, Clock, Zap, CheckSquare, Image, LayoutGrid, Video, PenTool, Bot, PenLine, Palette, Clapperboard, Sparkles, User, Plus, Trash2, Loader2, Download, ThumbsDown, ChevronDown, Upload, Play, ChevronLeft, ChevronRight, ScrollText, Maximize2, Minimize2, RotateCcw, ArchiveRestore, RefreshCw } from "lucide-react";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useHubPermissions, type ClientHubButtonId } from "@/hooks/useHubPermissions";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { useTenant } from "@/contexts/TenantContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getPeriodDemandReviewCounts } from "@/lib/periodCounts";
import VisualIdentityModal from "@/components/VisualIdentityModal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const buildFallbackDemandaQuestions = (solicitacaoCliente: string, estrategiaGeral?: string | null) => {
  const normalizedRequest = solicitacaoCliente.toLowerCase();
  const normalizedStrategy = estrategiaGeral?.toLowerCase() ?? '';

  const contextualQuestions: string[] = [];

  if (/anivers|comemora|feliz aniversário/.test(normalizedRequest)) {
    contextualQuestions.push(
      'Qual é a data do aniversário e de quem exatamente é essa comemoração?',
      'O tom do post deve ser mais emocional, institucional, divertido ou promocional?',
      'Existe alguma mensagem principal, homenagem ou agradecimento que precisa aparecer?',
    );
  }

  if (/promo|oferta|desconto|campanha|lançamento/.test(normalizedRequest)) {
    contextualQuestions.push(
      'Qual oferta, condição ou benefício precisa ficar mais evidente nessa peça?',
      'Existe prazo, data limite ou senso de urgência que precisa ser comunicado?',
    );
  }

  if (/carrossel/.test(normalizedRequest)) {
    contextualQuestions.push(
      'Quantos slides fazem sentido para explicar essa demanda sem ficar cansativo?',
      'Qual deve ser o gancho do primeiro slide para prender a atenção logo no início?',
    );
  }

  if (/reels|vídeo|video|story/.test(normalizedRequest)) {
    contextualQuestions.push(
      'Essa demanda precisa de roteiro falado, texto em tela ou apenas direção visual?',
      'Há alguma referência de ritmo, estilo ou enquadramento que precisa ser seguida?',
    );
  }

  if (/produto|serviço|servico|atendimento|consult[aó]ria/.test(normalizedRequest + ' ' + normalizedStrategy)) {
    contextualQuestions.push(
      'Qual produto, serviço ou solução deve ser o foco principal dessa demanda?',
    );
  }

  const baseQuestions = [
    'Qual é o objetivo principal dessa demanda: alcance, relacionamento, autoridade, conversão ou outro?',
    'Quem é o público exato que precisa se identificar com esse conteúdo?',
    'Que informação já está definida pelo cliente e não pode ser alterada?',
    'Existe alguma oferta, detalhe operacional, data, horário ou link que precisa aparecer obrigatoriamente?',
    'Quais objeções, dúvidas ou percepções do público esse conteúdo deve quebrar?',
    'Qual ação a pessoa deve tomar depois de consumir esse conteúdo?',
    'Existe alguma restrição visual, textual, jurídica ou de posicionamento que devemos respeitar?',
    estrategiaGeral
      ? 'Como essa demanda deve refletir a estratégia geral e o posicionamento atual da marca?'
      : 'Qual diferencial da marca precisa aparecer para essa demanda não ficar genérica?',
    'Há referências, campanhas anteriores ou exemplos que representem bem o resultado esperado?',
  ];

  return [...new Set([...contextualQuestions, ...baseQuestions])].slice(0, 8);
};

const ClientHub = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const { canAccess: canAccessButton } = useHubPermissions();
  const { role } = useAgencyRole();
  
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [productionModalOpen, setProductionModalOpen] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState<string | null>(null);
  const [approvedCardsCount, setApprovedCardsCount] = useState(0);
  const [rejectedCardsCount, setRejectedCardsCount] = useState(0);
  const [visualIdentityModalOpen, setVisualIdentityModalOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoIdea, setVideoIdea] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [videoAspectRatio, setVideoAspectRatio] = useState('9:16');
  const [videoStep, setVideoStep] = useState<1 | 2>(1);
  const [videoScenes, setVideoScenes] = useState<Array<{ scene_description: string; mascot_speech: string; frame0_url?: string; video_url?: string; generating?: boolean }>>([]);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [uploadingFrame, setUploadingFrame] = useState<number | null>(null);
  const [videoPreviewIndex, setVideoPreviewIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; primary_color: string | null; secondary_color: string | null }>>([]);
  const [aiPostModalOpen, setAiPostModalOpen] = useState(false);
  const [postIdea, setPostIdea] = useState('');
  const [selectedMascotIds, setSelectedMascotIds] = useState<string[]>([]);
  const [mascotImages, setMascotImages] = useState<Array<{ id: string; image_url: string; file_name: string | null }>>([]);
  const [aiCarouselModalOpen, setAiCarouselModalOpen] = useState(false);
  const [carouselIdea, setCarouselIdea] = useState('');
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [carouselStep, setCarouselStep] = useState<1 | 2>(1);
  const [carouselSlides, setCarouselSlides] = useState<Array<{ text: string; label: string }>>([]);
  const [generatingCarousel, setGeneratingCarousel] = useState(false);
  const [carouselAspectRatio, setCarouselAspectRatio] = useState('1:1');
  const [carouselAiModel, setCarouselAiModel] = useState<'nanobanana3' | 'nanobanana25' | 'gpt2'>('gpt2');
  const [staticAiModel, setStaticAiModel] = useState<'nanobanana3' | 'nanobanana25' | 'gpt2'>('gpt2');
  const [staticAspectRatio, setStaticAspectRatio] = useState('1:1');
  const [generatingCarouselImages, setGeneratingCarouselImages] = useState(false);
  const [carouselGeneratedImages, setCarouselGeneratedImages] = useState<Array<{ slideIndex: number; imageUrl: string }>>([]);
  const [carouselImageProgress, setCarouselImageProgress] = useState('');
  const [manualCarouselOpen, setManualCarouselOpen] = useState(false);
  const [manualSlides, setManualSlides] = useState<Array<{ text: string; label: string }>>([
    { text: '', label: 'Gancho (Atração)' },
    { text: '', label: 'Conteúdo' },
    { text: '', label: 'Chamada para Ação (CTA)' },
  ]);
  const [manualPostOpen, setManualPostOpen] = useState(false);
  const [manualPostText, setManualPostText] = useState('');
  const [generatingPost, setGeneratingPost] = useState(false);
  const [generatedPostImage, setGeneratedPostImage] = useState<string | null>(null);
  const [generatingManualPost, setGeneratingManualPost] = useState(false);
  const [generatedManualPostImage, setGeneratedManualPostImage] = useState<string | null>(null);
  // ids de `generated_contents` para o botão "Gerar Card"
  const [lastPostContentId, setLastPostContentId] = useState<string | null>(null);
  const [lastManualPostContentId, setLastManualPostContentId] = useState<string | null>(null);
  const [lastCarouselContentId, setLastCarouselContentId] = useState<string | null>(null);
  const [sceneContentIds, setSceneContentIds] = useState<Record<number, string>>({});
  const [creatingCardFor, setCreatingCardFor] = useState<string | null>(null);
  const [finalizedKeys, setFinalizedKeys] = useState<Set<string>>(new Set());
  const [contentHubModalOpen, setContentHubModalOpen] = useState(false);
  const [avaliarDemandasModalOpen, setAvaliarDemandasModalOpen] = useState(false);
  const [demandaPlanejadaHubModalOpen, setDemandaPlanejadaHubModalOpen] = useState(false);
  const [contentRequirementsModalOpen, setContentRequirementsModalOpen] = useState(false);
  const [planPeriodModalOpen, setPlanPeriodModalOpen] = useState(false);
  const [contentRequirements, setContentRequirements] = useState('');
  const [savingRequirements, setSavingRequirements] = useState(false);
  const [demandaPlanejadaModalOpen, setDemandaPlanejadaModalOpen] = useState(false);
  const [solicitacaoCliente, setSolicitacaoCliente] = useState('');
  const [demandaStep, setDemandaStep] = useState<1 | 2 | 3>(1);
  const [generatingDemandaQuestions, setGeneratingDemandaQuestions] = useState(false);
  const [demandaQuestions, setDemandaQuestions] = useState<string[]>([]);
  const [demandaAnswers, setDemandaAnswers] = useState<string[]>([]);
  const [generatingDemandaFinal, setGeneratingDemandaFinal] = useState(false);
  const [demandaFinal, setDemandaFinal] = useState<{ titulo?: string; secoes: { titulo: string; itens: string[]; conteudo?: string }[] } | null>(null);
  const [approvingDemanda, setApprovingDemanda] = useState(false);
  const [preparingProducao, setPreparingProducao] = useState(false);
  const [captacaoModalOpen, setCaptacaoModalOpen] = useState(false);
  const [captacaoData, setCaptacaoData] = useState<{
    aviso?: string;
    briefing_captacao?: {
      objetivo?: string;
      mensagem_principal?: string;
      cenas_sugeridas?: string[];
      orientacoes_para_responsavel?: string;
      cuidados?: string[];
    };
    observacoes?: string;
  } | null>(null);

  type DemandaHistoricoItem = {
    id: string;
    createdAt: number;
    solicitacao: string;
    perguntas: string[];
    respostas: string[];
    demanda: { titulo?: string; secoes: { titulo: string; itens: string[]; conteudo?: string }[] };
  };
  const [demandaHistorico, setDemandaHistorico] = useState<DemandaHistoricoItem[]>([]);
  const [demandaHistoricoModalOpen, setDemandaHistoricoModalOpen] = useState(false);
  const [demandaHistoricoExpandedId, setDemandaHistoricoExpandedId] = useState<string | null>(null);

  const loadDemandaHistorico = async () => {
    if (!selectedClient?.id || !tenantId) { setDemandaHistorico([]); return; }
    try {
      const { data, error } = await supabase
        .from('planned_demand_history' as any)
        .select('id, created_at, solicitacao, perguntas, respostas, demanda')
        .eq('tenant_id', tenantId)
        .eq('client_id', selectedClient.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const mapped: DemandaHistoricoItem[] = (data || []).map((row: any) => ({
        id: row.id,
        createdAt: new Date(row.created_at).getTime(),
        solicitacao: row.solicitacao || '',
        perguntas: Array.isArray(row.perguntas) ? row.perguntas : [],
        respostas: Array.isArray(row.respostas) ? row.respostas : [],
        demanda: row.demanda || { secoes: [] },
      }));
      setDemandaHistorico(mapped);
    } catch (err) {
      console.error('Erro ao carregar histórico de demanda planejada:', err);
      setDemandaHistorico([]);
    }
  };

  const migrateLocalHistoricoToDB = async () => {
    if (!selectedClient?.id || !tenantId) return;
    const key = `demanda_planejada_history_${selectedClient.id}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) {
        localStorage.removeItem(key);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const rows = items.map((item: any) => ({
        tenant_id: tenantId,
        client_id: selectedClient.id,
        created_by: user?.id ?? null,
        solicitacao: item.solicitacao || '',
        perguntas: Array.isArray(item.perguntas) ? item.perguntas : [],
        respostas: Array.isArray(item.respostas) ? item.respostas : [],
        demanda: item.demanda || { secoes: [] },
        created_at: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
      }));
      const { error } = await supabase.from('planned_demand_history' as any).insert(rows as any);
      if (!error) {
        localStorage.removeItem(key);
        console.log(`[ClientHub] Migrados ${rows.length} itens de histórico local para o banco.`);
      } else {
        console.error('[ClientHub] Erro ao migrar histórico local:', error);
      }
    } catch (err) {
      console.error('[ClientHub] Falha ao migrar histórico local:', err);
    }
  };

  useEffect(() => {
    (async () => {
      await migrateLocalHistoricoToDB();
      await loadDemandaHistorico();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id, tenantId]);

  const saveDemandaToHistorico = async (demanda: { titulo?: string; secoes: { titulo: string; itens: string[]; conteudo?: string }[] }) => {
    if (!selectedClient?.id || !tenantId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('planned_demand_history' as any)
        .insert({
          tenant_id: tenantId,
          client_id: selectedClient.id,
          created_by: user?.id ?? null,
          solicitacao: solicitacaoCliente,
          perguntas: demandaQuestions,
          respostas: demandaAnswers,
          demanda,
        } as any);
      if (error) throw error;
      await loadDemandaHistorico();
    } catch (err) {
      console.error('Erro ao salvar histórico de demanda planejada:', err);
    }
  };

  const removerDemandaHistorico = async (id: string) => {
    try {
      await supabase.from('planned_demand_history' as any).delete().eq('id', id);
    } catch (err) {
      console.error('Erro ao remover histórico:', err);
    }
    setDemandaHistorico((prev) => prev.filter((d) => d.id !== id));
    if (demandaHistoricoExpandedId === id) setDemandaHistoricoExpandedId(null);
  };

  const reabrirDemandaHistorico = (item: DemandaHistoricoItem) => {
    setSolicitacaoCliente(item.solicitacao);
    setDemandaQuestions(item.perguntas);
    setDemandaAnswers(item.respostas);
    setDemandaFinal(item.demanda);
    setDemandaStep(3);
    setDemandaHistoricoModalOpen(false);
    setDemandaHistoricoExpandedId(null);
    setDemandaPlanejadaModalOpen(true);
  };

  const resetDemandaPlanejada = () => {
    setSolicitacaoCliente('');
    setDemandaStep(1);
    setDemandaQuestions([]);
    setDemandaAnswers([]);
    setGeneratingDemandaQuestions(false);
    setGeneratingDemandaFinal(false);
    setDemandaFinal(null);
  };


  const openFallbackDemandaQuestions = async () => {
    let estrategiaGeralCliente = '';

    try {
      const { data } = await supabase
        .from('strategies')
        .select('strategy_text')
        .eq('company_id', selectedClient!.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      estrategiaGeralCliente = data?.strategy_text?.trim() ?? '';
    } catch (strategyError) {
      console.error('Erro ao buscar estratégia para fallback da demanda planejada:', strategyError);
    }

    const fallbackQuestions = buildFallbackDemandaQuestions(solicitacaoCliente, estrategiaGeralCliente);

    if (!fallbackQuestions.length) {
      return false;
    }

    setDemandaQuestions(fallbackQuestions);
    setDemandaStep(2);
    toast.success('Usei um modo alternativo para gerar as perguntas desta demanda.');
    return true;
  };

  const handleContinuarDemandaPlanejada = async () => {
    if (!solicitacaoCliente.trim()) {
      toast.error('Descreva o que o cliente solicitou antes de continuar.');
      return;
    }
    if (!selectedClient?.id || !tenantId) {
      toast.error('Selecione um cliente antes de continuar.');
      return;
    }
    setGeneratingDemandaQuestions(true);
    try {
      // 1. Estratégia Geral do Cliente
      const { data: strategy, error: strategyError } = await supabase
        .from('strategies')
        .select('strategy_text')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (strategyError) throw strategyError;

      const estrategiaGeralCliente = strategy?.strategy_text?.trim();
      if (!estrategiaGeralCliente) {
        toast.error('Cadastre a Estratégia Geral do cliente antes de gerar perguntas para a demanda planejada.');
        return;
      }

      // 2. Prompt "Gerador de perguntas" (custom_prompt_1780339940303)
      const { data: promptRow, error: promptError } = await supabase
        .from('system_prompts')
        .select('prompt_content')
        .eq('tenant_id', tenantId)
        .eq('prompt_key', 'custom_prompt_1780339940303')
        .maybeSingle();

      if (promptError) throw promptError;

      const promptContent = promptRow?.prompt_content?.trim();
      if (!promptContent) {
        toast.error('Prompt "Gerador de perguntas" (custom_prompt_1780339940303) não encontrado em Dev → Prompts.');
        return;
      }

      // 3. Chave da OpenAI
      const { data: apiKeyRow, error: apiKeyError } = await supabase
        .from('api_keys')
        .select('key_value')
        .eq('key_name', 'OPENAI_API_KEY')
        .maybeSingle();

      if (apiKeyError) throw apiKeyError;

      const openaiApiKey = apiKeyRow?.key_value?.trim();
      if (!openaiApiKey) {
        toast.error('Chave da API OpenAI não configurada. Configure em Dev → APIs.');
        return;
      }

      // 4. Chamada direta à OpenAI (gpt-5-mini)
      const userPrompt = `SOLICITAÇÃO DO CLIENTE:
${solicitacaoCliente}

ESTRATÉGIA GERAL DO CLIENTE:
${estrategiaGeralCliente}

Com base na solicitação acima e na estratégia geral do cliente, gere perguntas estratégicas personalizadas que ajudem a planejar essa demanda com qualidade. Não repita perguntas cuja resposta já foi fornecida pela solicitação. Retorne apenas as perguntas, numeradas, sem comentários adicionais.`;

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            { role: 'system', content: promptContent },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('OpenAI error:', aiResponse.status, errorText);
        if (aiResponse.status === 429) {
          toast.error('Limite de requisições da OpenAI excedido. Tente novamente em instantes.');
        } else if (aiResponse.status === 401) {
          toast.error('Chave da API OpenAI inválida.');
        } else {
          toast.error('Erro ao gerar perguntas com a OpenAI.');
        }
        return;
      }

      const aiData = await aiResponse.json();
      const rawText: string = aiData?.choices?.[0]?.message?.content?.trim() ?? '';

      // Parse: aceita JSON (array de strings ou objetos com 'pergunta'/'question') ou texto numerado.
      const parseQuestions = (txt: string): string[] => {
        const cleaned = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        // tenta extrair primeiro array/objeto JSON
        const first = cleaned.search(/[\[{]/);
        const lastArr = cleaned.lastIndexOf(']');
        const lastObj = cleaned.lastIndexOf('}');
        const last = Math.max(lastArr, lastObj);
        if (first !== -1 && last > first) {
          const slice = cleaned.slice(first, last + 1);
          try {
            const parsed = JSON.parse(slice);
            const arr = Array.isArray(parsed)
              ? parsed
              : Array.isArray((parsed as any)?.perguntas)
                ? (parsed as any).perguntas
                : Array.isArray((parsed as any)?.questions)
                  ? (parsed as any).questions
                  : null;
            if (arr) {
              const out = arr
                .map((it: any) => {
                  if (typeof it === 'string') return it.trim();
                  if (it && typeof it === 'object') {
                    return String(it.pergunta ?? it.question ?? it.texto ?? it.text ?? '').trim();
                  }
                  return '';
                })
                .filter((s: string) => s.length > 0);
              if (out.length) return out;
            }
          } catch {
            // cai pro fallback de texto
          }
        }
        return cleaned
          .split('\n')
          .map((l) => l.replace(/^\s*\d+[\).:\-]\s*/, '').trim())
          .filter((l) => l.length > 0 && !/^[\[\]{},]+$/.test(l));
      };

      const questions = parseQuestions(rawText);

      if (!questions.length) {
        toast.error('Nenhuma pergunta foi gerada. Tente novamente.');
        return;
      }

      setDemandaQuestions(questions);
      setDemandaAnswers(questions.map(() => ''));
      setDemandaStep(2);
    } catch (err: any) {
      console.error('Erro Demanda Planejada (direct):', err);
      toast.error(err?.message || 'Erro ao gerar perguntas.');
    } finally {
      setGeneratingDemandaQuestions(false);
    }
  };

  const handleGerarDemandaFinal = async () => {
    if (!selectedClient?.id || !tenantId) {
      toast.error('Selecione um cliente antes de continuar.');
      return;
    }
    if (!demandaQuestions.length) {
      toast.error('Nenhuma pergunta foi gerada.');
      return;
    }
    const unanswered = demandaQuestions.filter((_, i) => !demandaAnswers[i]?.trim()).length;
    if (unanswered > 0) {
      toast.error(`Responda todas as perguntas antes de continuar (${unanswered} pendente${unanswered > 1 ? 's' : ''}).`);
      return;
    }

    setGeneratingDemandaFinal(true);
    try {
      // 1. Estratégia geral do cliente
      const { data: strategy } = await supabase
        .from('strategies')
        .select('strategy_text')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const estrategiaGeralCliente = strategy?.strategy_text?.trim() ?? '';

      // 2. Prompt DEV custom_prompt_1780342556676 ("Gerar a demanda de perguntas")
      const { data: promptRow, error: promptError } = await supabase
        .from('system_prompts')
        .select('prompt_content')
        .eq('tenant_id', tenantId)
        .eq('prompt_key', 'custom_prompt_1780342556676')
        .maybeSingle();
      if (promptError) throw promptError;

      const promptContent = promptRow?.prompt_content?.trim();
      if (!promptContent) {
        toast.error('Prompt "Gerar a demanda de perguntas" (custom_prompt_1780342556676) não encontrado em Dev → Prompts.');
        return;
      }

      // 3. Chave da OpenAI (mantida no banco, não exposta em código)
      const { data: apiKeyRow, error: apiKeyError } = await supabase
        .from('api_keys')
        .select('key_value')
        .eq('key_name', 'OPENAI_API_KEY')
        .maybeSingle();
      if (apiKeyError) throw apiKeyError;

      const openaiApiKey = apiKeyRow?.key_value?.trim();
      if (!openaiApiKey) {
        toast.error('Chave da API OpenAI não configurada em Dev → APIs.');
        return;
      }

      // 4. Monta payload preservando ordem Pergunta N → Resposta N
      const perguntasERespostas = demandaQuestions
        .map((q, i) => `Pergunta ${i + 1}: ${q}\nResposta ${i + 1}: ${demandaAnswers[i]?.trim() ?? ''}`)
        .join('\n\n');

      const userPrompt = `SOLICITAÇÃO ORIGINAL DO CLIENTE:
${solicitacaoCliente}

ESTRATÉGIA GERAL DO CLIENTE:
${estrategiaGeralCliente || '(não cadastrada)'}

PERGUNTAS E RESPOSTAS DO BRIEFING:
${perguntasERespostas}

Retorne APENAS um JSON válido (sem markdown, sem comentários). A estrutura do JSON é livre — pode usar as chaves que fizerem sentido para esta demanda; arrays serão renderizados como listas e objetos como sub-itens.`;

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            { role: 'system', content: promptContent },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('OpenAI error (demanda final):', aiResponse.status, errorText);
        if (aiResponse.status === 429) toast.error('Limite de requisições da OpenAI excedido.');
        else if (aiResponse.status === 401) toast.error('Chave da API OpenAI inválida.');
        else toast.error('Erro ao gerar a demanda final.');
        return;
      }

      const aiData = await aiResponse.json();
      const rawText: string = aiData?.choices?.[0]?.message?.content?.trim() ?? '';

      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch {}
        }
      }

      // Humaniza chaves: "informacoes_obrigatorias" -> "Informações Obrigatórias"
      const SIGLAS = new Set(['cta', 'cpf', 'cnpj', 'crp', 'url', 'kpi', 'faq', 'ia', 'ai', 'seo']);
      const humanize = (k: string) => {
        const accents: Record<string, string> = {
          informacoes: 'Informações', obrigatorias: 'Obrigatórias', publico: 'Público',
          alvo: 'Alvo', mensagem: 'Mensagem', formato: 'Formato', estrategia: 'Estratégia',
          observacoes: 'Observações', pendencias: 'Pendências', referencias: 'Referências',
          objetivo: 'Objetivo', tom: 'Tom', voz: 'Voz', evitar: 'Evitar',
        };
        return k.replace(/[_-]+/g, ' ').trim().split(/\s+/).map(w => {
          const lower = w.toLowerCase();
          if (SIGLAS.has(lower)) return lower.toUpperCase();
          if (accents[lower]) return accents[lower];
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        }).join(' ');
      };

      const valueToBullets = (v: any): string[] => {
        if (v == null) return [];
        if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
        if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
        if (Array.isArray(v)) {
          return v.flatMap((item) => {
            if (item == null) return [];
            if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
            if (typeof item === 'number' || typeof item === 'boolean') return [String(item)];
            if (Array.isArray(item)) return valueToBullets(item);
            if (typeof item === 'object') {
              return Object.entries(item).map(([k, val]) => {
                const inner = valueToBullets(val).join('; ');
                return `${humanize(k)}: ${inner}`;
              });
            }
            return [String(item)];
          });
        }
        if (typeof v === 'object') {
          return Object.entries(v).map(([k, val]) => {
            const inner = valueToBullets(val).join('; ');
            return `${humanize(k)}: ${inner}`;
          });
        }
        return [String(v)];
      };

      type Secao = { titulo: string; itens: string[]; conteudo?: string };
      let secoes: Secao[] = [];
      let tituloTop: string | undefined;

      if (parsed && typeof parsed === 'object') {
        // Formato antigo: { titulo, secoes:[{titulo, conteudo}] }
        if (Array.isArray(parsed.secoes)) {
          tituloTop = typeof parsed.titulo === 'string' ? parsed.titulo : undefined;
          secoes = parsed.secoes
            .map((s: any) => {
              const conteudoRaw = s?.conteudo;
              const itens = Array.isArray(conteudoRaw) ? valueToBullets(conteudoRaw) : [];
              const conteudo = typeof conteudoRaw === 'string' ? conteudoRaw.trim() : undefined;
              return {
                titulo: String(s?.titulo ?? '').trim(),
                itens,
                conteudo: conteudo || undefined,
              };
            })
            .filter((s: Secao) => s.titulo || s.itens.length || s.conteudo);
        } else {
          // Formato genérico: cada chave top-level vira uma seção
          if (typeof parsed.titulo === 'string') tituloTop = parsed.titulo;
          for (const [k, v] of Object.entries(parsed)) {
            if (k === 'titulo' || k === 'title') continue;
            const itens = valueToBullets(v);
            const conteudo = typeof v === 'string' ? v.trim() : undefined;
            if (!itens.length && !conteudo) continue;
            secoes.push({
              titulo: humanize(k),
              itens: conteudo ? [] : itens,
              conteudo,
            });
          }
        }
      }

      if (!secoes.length) {
        if (rawText) {
          const fallback = { titulo: 'Demanda', secoes: [{ titulo: 'Conteúdo', itens: [], conteudo: rawText }] };
          setDemandaFinal(fallback);
          saveDemandaToHistorico(fallback);
          setDemandaStep(3);
          return;
        }
        toast.error('Não foi possível interpretar a resposta da OpenAI.');
        return;
      }

      const finalDemanda = { titulo: tituloTop, secoes };
      setDemandaFinal(finalDemanda);
      saveDemandaToHistorico(finalDemanda);
      setDemandaStep(3);
    } catch (err: any) {
      console.error('Erro Gerar Demanda Final:', err);
      toast.error(err?.message || 'Erro ao gerar a demanda final.');
    } finally {
      setGeneratingDemandaFinal(false);
    }
  };

  const handleAprovarDemandaFinal = async () => {
    if (!selectedClient?.id || !tenantId) {
      toast.error('Selecione um cliente antes de aprovar.');
      return;
    }
    if (!demandaFinal || !demandaFinal.secoes?.length) {
      toast.error('Gere a demanda final antes de aprovar.');
      return;
    }
    setApprovingDemanda(true);
    try {
      const title = (demandaFinal.titulo?.trim() || 'Demanda planejada').slice(0, 200);
      const descriptionHtml = demandaFinal.secoes.map((s) => {
        const heading = s.titulo ? `<h3>${s.titulo}</h3>` : '';
        const conteudo = s.conteudo ? `<p>${s.conteudo}</p>` : '';
        const list = s.itens?.length
          ? `<ul>${s.itens.map((i) => `<li>${i}</li>`).join('')}</ul>`
          : '';
        return `${heading}${conteudo}${list}`;
      }).join('');

      const { data, error } = await supabase.rpc('create_demand_from_template', {
        p_client_id: selectedClient.id,
        p_template_id: null,
        p_pipeline_id: null,
        p_status_id: null,
        p_title: title,
        p_description: descriptionHtml,
        p_demand_type: null,
        p_channel: null,
        p_publish_date: null,
        p_due_date: null,
        p_period_plan_id: null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; demand_id?: string; error?: string } | null;
      if (result?.success) {
        toast.success('Demanda aprovada e criada com sucesso!');
        setDemandaPlanejadaModalOpen(false);
        setDemandaStep(1);
      } else {
        toast.error(result?.error || 'Erro ao aprovar demanda.');
      }
    } catch (err: any) {
      console.error('Erro Aprovar Demanda:', err);
      toast.error(err?.message || 'Erro ao aprovar demanda.');
    } finally {
      setApprovingDemanda(false);
    }
  };

  const handleCriarProducao = async () => {
    if (!selectedClient?.id || !tenantId) {
      toast.error('Selecione um cliente antes de continuar.');
      return;
    }
    if (!demandaFinal || !demandaFinal.secoes?.length) {
      toast.error('Gere a demanda final antes de criar a produção.');
      return;
    }

    setPreparingProducao(true);
    try {
      // 1. Buscar prompt organizador (NUNCA hardcoded no código)
      const { data: promptRow, error: promptError } = await supabase
        .from('system_prompts')
        .select('prompt_content')
        .eq('tenant_id', tenantId)
        .eq('prompt_key', 'custom_prompt_1780407072020')
        .maybeSingle();
      if (promptError) throw promptError;
      const promptContent = promptRow?.prompt_content?.trim();
      if (!promptContent) {
        toast.error('Prompt "Organizador de informações" (custom_prompt_1780407072020) não encontrado em Dev → Prompts.');
        return;
      }

      // 2. Chave da OpenAI
      const { data: apiKeyRow, error: apiKeyError } = await supabase
        .from('api_keys')
        .select('key_value')
        .eq('key_name', 'OPENAI_API_KEY')
        .maybeSingle();
      if (apiKeyError) throw apiKeyError;
      const openaiApiKey = apiKeyRow?.key_value?.trim();
      if (!openaiApiKey) {
        toast.error('Chave da API OpenAI não configurada em Dev → APIs.');
        return;
      }

      // 3. Serializa a demanda final em texto legível
      const demandaTexto = [
        demandaFinal.titulo ? `TÍTULO: ${demandaFinal.titulo}` : '',
        ...demandaFinal.secoes.map((s) => {
          const itens = (s.itens || []).map((i) => `- ${i}`).join('\n');
          return `### ${s.titulo}\n${s.conteudo || ''}\n${itens}`.trim();
        }),
      ].filter(Boolean).join('\n\n');

      const userPrompt = `DEMANDA PLANEJADA APROVADA:\n${demandaTexto}\n\nRetorne APENAS um JSON válido conforme o formato definido no prompt do sistema (sem markdown, sem comentários).`;

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            { role: 'system', content: promptContent },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('OpenAI error (organizador):', aiResponse.status, errorText);
        if (aiResponse.status === 429) toast.error('Limite de requisições da OpenAI excedido.');
        else if (aiResponse.status === 401) toast.error('Chave da API OpenAI inválida.');
        else toast.error('Não foi possível preparar a produção. Revise a demanda planejada e tente novamente.');
        return;
      }

      const aiData = await aiResponse.json();
      const rawText: string = aiData?.choices?.[0]?.message?.content?.trim() ?? '';

      let parsed: any = null;
      try { parsed = JSON.parse(rawText); }
      catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) { try { parsed = JSON.parse(match[0]); } catch {} }
      }

      const tipo = parsed?.tipo;
      if (!parsed || typeof tipo !== 'string') {
        console.error('Resposta do organizador inválida:', rawText);
        toast.error('Resposta do organizador inválida. Revise a demanda planejada e tente novamente.');
        return;
      }

      // Helper: encontrar preset por nome (case-insensitive)
      const findPresetId = (name?: string): string | null => {
        if (!name || typeof name !== 'string') return null;
        const n = name.trim().toLowerCase();
        if (!n) return null;
        const match = presets.find((p) => p.name?.toLowerCase() === n)
          || presets.find((p) => p.name?.toLowerCase().includes(n) || n.includes(p.name?.toLowerCase() ?? ''));
        return match?.id ?? null;
      };

      console.log('[Criar produção] tipo retornado:', tipo, parsed);

      if (tipo === 'erro') {
        toast.error(parsed.mensagem || 'O organizador retornou um erro para essa demanda.');
        return;
      }

      // Fecha modal de demanda planejada
      setDemandaPlanejadaModalOpen(false);
      setDemandaStep(1);

      if (tipo === 'post_estatico') {
        const conteudo = String(parsed.conteudo ?? '').trim();
        const restricoes = Array.isArray(parsed.restricoes) ? parsed.restricoes.join('; ') : '';
        const observacoes = String(parsed.observacoes ?? '').trim();
        const extras = [
          restricoes ? `Restrições: ${restricoes}` : '',
          observacoes ? `Observações: ${observacoes}` : '',
        ].filter(Boolean).join('\n');
        setPostIdea(extras ? `${conteudo}\n\n${extras}` : conteudo);
        const proporcao = String(parsed.proporcao ?? '').trim();
        if (['1:1', '9:16', '16:9', '4:5'].includes(proporcao)) setStaticAspectRatio(proporcao);
        const presetId = findPresetId(parsed.predefinicao_visual);
        if (presetId) setSelectedPresetId(presetId);
        setAiPostModalOpen(true);
        toast.success('Demanda preparada como Post Estático. Revise antes de gerar.');
        return;
      }

      if (tipo === 'carrossel') {
        const slidesIn = Array.isArray(parsed.slides) ? parsed.slides : [];
        const slides = slidesIn.map((s: any) => ({
          text: String(s?.texto ?? '').trim(),
          label: String(s?.funcao ?? 'Conteúdo').trim() || 'Conteúdo',
        })).filter((s: any) => s.text);
        if (!slides.length) {
          toast.error('O organizador retornou um carrossel sem slides.');
          return;
        }
        const restricoes = Array.isArray(parsed.restricoes) ? parsed.restricoes.join('; ') : '';
        const observacoes = String(parsed.observacoes ?? '').trim();
        if (restricoes || observacoes) {
          toast.message('Orientações do organizador', {
            description: [restricoes && `Restrições: ${restricoes}`, observacoes && `Observações: ${observacoes}`].filter(Boolean).join(' | '),
          });
        }
        setCarouselSlides(slides);
        setSlideCount(slides.length);
        const presetId = findPresetId(parsed.predefinicao_visual);
        if (presetId) setSelectedPresetId(presetId);
        setCarouselStep(2);
        setAiCarouselModalOpen(true);
        toast.success('Demanda preparada como Carrossel. Revise os slides antes de gerar.');
        return;
      }

      if (tipo === 'video_mascote') {
        const conteudo = String(parsed.conteudo ?? '').trim();
        const restricoes = Array.isArray(parsed.restricoes) ? parsed.restricoes.join('; ') : '';
        const observacoes = String(parsed.observacoes ?? '').trim();
        const extras = [
          restricoes ? `Restrições: ${restricoes}` : '',
          observacoes ? `Observações: ${observacoes}` : '',
        ].filter(Boolean).join('\n');
        setVideoIdea(extras ? `${conteudo}\n\n${extras}` : conteudo);
        const cenas = Number(parsed.cenas);
        if (Number.isFinite(cenas) && cenas >= 1 && cenas <= 5) setSceneCount(cenas);
        const formato = String(parsed.formato ?? '').trim();
        if (['9:16', '16:9', '1:1', '4:5'].includes(formato)) setVideoAspectRatio(formato);
        const presetId = findPresetId(parsed.predefinicao_visual);
        if (presetId) setSelectedPresetId(presetId);
        setVideoStep(1);
        setVideoModalOpen(true);
        toast.success('Demanda preparada como Vídeo de Mascote. Revise antes de gerar o storyboard.');
        return;
      }

      if (tipo === 'video_captacao_presencial') {
        setCaptacaoData({
          aviso: parsed.aviso,
          briefing_captacao: parsed.briefing_captacao,
          observacoes: parsed.observacoes,
        });
        setCaptacaoModalOpen(true);
        return;
      }

      toast.error(`Tipo de produção desconhecido: "${tipo}".`);
    } catch (err: any) {
      console.error('Erro Criar Produção:', err);
      toast.error(err?.message || 'Não foi possível preparar a produção. Revise a demanda planejada e tente novamente.');
    } finally {
      setPreparingProducao(false);
    }
  };






  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchPresets = async () => {
      const { data } = await supabase
        .from('visual_identity_presets')
        .select('id, name, primary_color, secondary_color')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (data) {
        setPresets(data);
        if (data.length > 0) {
          setSelectedPresetId((current) => current ?? data[0].id);
        }
      }
    };
    fetchPresets();
  }, [selectedClient?.id, tenantId]);

  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchMascots = async () => {
      const { data } = await supabase
        .from('company_mascot_images')
        .select('id, image_url, file_name')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('position', { ascending: true });
      if (data) setMascotImages(data);
    };
    fetchMascots();
  }, [selectedClient?.id, tenantId]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);

  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchRequirements = async () => {
      const { data } = await supabase
        .from('tenant_companies')
        .select('content_requirements')
        .eq('id', selectedClient.id)
        .single();
      if (data) setContentRequirements((data as any).content_requirements || '');
    };
    fetchRequirements();
  }, [selectedClient?.id, tenantId]);

  useEffect(() => {
    // Sempre resetar antes de recarregar para não vazar contagem do cliente/período anterior.
    setApprovedCardsCount(0);
    setRejectedCardsCount(0);
    if (!selectedClient || !tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const counts = await getPeriodDemandReviewCounts({
          tenantId,
          clientId: selectedClient.id,
        });
        if (cancelled) return;
        setApprovedCardsCount(counts.pendingApprovalCount);
        setRejectedCardsCount(counts.rejectedCount);
      } catch {
        if (cancelled) return;
        setApprovedCardsCount(0);
        setRejectedCardsCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedClient?.id, tenantId]);


  // Handle opening content from history navigation state
  useEffect(() => {
    const state = location.state as { openContentFromHistory?: { type: string; prompt: string; title: string; metadata?: any; image_urls?: string[]; content_type?: string } } | null;
    if (!state?.openContentFromHistory || !isInitialized || !selectedClient) return;

    const { type, prompt, metadata, image_urls, content_type } = state.openContentFromHistory;

    // Clear the state so it doesn't re-trigger
    window.history.replaceState({}, document.title);

    // Small delay to let component mount fully
    setTimeout(() => {
      if (type === "post") {
        setPostIdea(prompt || "");
        setAiPostModalOpen(true);
        if (image_urls?.length) {
          setGeneratedPostImage(image_urls[0]);
        }
      } else if (type === "carousel") {
        setCarouselIdea(prompt || "");
        setAiCarouselModalOpen(true);
        if (image_urls?.length) {
          setCarouselGeneratedImages(image_urls.map((url, i) => ({ slideIndex: i, imageUrl: url })));
          setCarouselStep(2);
          // Reconstruct slides from metadata if available
          if (metadata?.slides && Array.isArray(metadata.slides)) {
            setCarouselSlides(metadata.slides);
          } else {
            setCarouselSlides(image_urls.map((_, i) => ({ text: '', label: `Slide ${i + 1}` })));
          }
        }
      } else if (type === "video") {
        setVideoIdea(prompt || "");
        setVideoModalOpen(true);
        // If it's a storyboard with metadata scenes, restore them
        if (metadata?.scenes && Array.isArray(metadata.scenes)) {
          setVideoScenes(metadata.scenes.map((s: any) => ({
            scene_description: s.scene_description || '',
            mascot_speech: s.mascot_speech || '',
            frame0_url: s.frame0_url || undefined,
            video_url: s.video_url || undefined,
            generating: false,
          })));
          setVideoStep(2);
        } else if (content_type === "video_scene" && image_urls?.length) {
          // Single scene - go to step 2 with the video
          setVideoScenes([{
            scene_description: prompt || '',
            mascot_speech: '',
            video_url: image_urls[0],
            generating: false,
          }]);
          setVideoStep(2);
        }
      }
    }, 100);
  }, [location.state, isInitialized, selectedClient]);

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const saveGeneratedContent = async (
    contentType: string,
    title: string,
    prompt: string,
    imageUrls: string[],
  ): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('generated_contents').insert({
        tenant_id: tenantId!,
        client_id: selectedClient!.id,
        content_type: contentType,
        title,
        prompt,
        image_urls: imageUrls as any,
        created_by: user?.id || null,
      }).select('id').single();
      if (error) {
        console.error('Error saving generated content to DB:', error);
        return null;
      }
      console.log('Generated content saved successfully:', contentType, imageUrls.length, 'images');
      return (data as any)?.id ?? null;
    } catch (err) {
      console.error('Error saving generated content:', err);
      return null;
    }
  };

  const handleCreateCardFromContent = async (opts: {
    key: string;
    contentId: string | null;
    contentType: string;
    prompt: string;
    imageUrls: string[];
  }) => {
    if (!tenantId || !selectedClient) return;
    if (!opts.contentId) {
      toast.error('Conteúdo ainda não foi salvo. Gere novamente antes.');
      return;
    }
    if (finalizedKeys.has(opts.key)) return;
    setCreatingCardFor(opts.key);
    try {
      const { createCardFromContent } = await import('@/lib/createCardFromContent');
      const result = await createCardFromContent({
        tenantId,
        clientId: selectedClient.id,
        contentId: opts.contentId,
        contentType: opts.contentType,
        prompt: opts.prompt,
        imageUrls: opts.imageUrls,
      });
      if (result.success) {
        toast.success('Conteúdo finalizado e card criado no Kanban.');
        setFinalizedKeys(prev => new Set(prev).add(opts.key));
      } else if (result.duplicated) {
        toast.info('Esse conteúdo já possui um card criado.');
        setFinalizedKeys(prev => new Set(prev).add(opts.key));
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error('[createCardFromContent] error:', err);
      toast.error('Erro ao criar o card.');
    } finally {
      setCreatingCardFor(null);
    }
  };

  const handleGeneratePost = async (idea: string, isManual: boolean = false) => {
    const setGenerating = isManual ? setGeneratingManualPost : setGeneratingPost;
    const setImage = isManual ? setGeneratedManualPostImage : setGeneratedPostImage;
    setGenerating(true);
    setImage(null);
    try {
      const selectedMascotUrls = mascotImages
        .filter(m => selectedMascotIds.includes(m.id))
        .map(m => m.image_url);
      const { data, error } = await supabase.functions.invoke('generate-standalone-post', {
        body: { idea, isManual, exactText: isManual ? idea : undefined, presetId: selectedPresetId, mascotImageUrls: selectedMascotUrls, clientId: selectedClient.id, tenantId, aiModel: staticAiModel, aspectRatio: staticAspectRatio },
      });
      if (error) { console.error('Edge function error:', error); toast.error('Erro ao gerar o post. Tente novamente.'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.imageUrl) {
        setImage(data.imageUrl);
        toast.success('Post gerado com sucesso!');
        const savedId = await saveGeneratedContent('post', isManual ? 'Post Manual' : 'Post com IA', idea, [data.imageUrl]);
        if (isManual) setLastManualPostContentId(savedId); else setLastPostContentId(savedId);
      } else { toast.error('Nenhuma imagem retornada.'); }
    } catch (err) { console.error('Generate post error:', err); toast.error('Erro inesperado ao gerar o post.'); }
    finally { setGenerating(false); }
  };

  const handleGenerateCarouselContent = async () => {
    if (!carouselIdea.trim() || !slideCount) return;
    setGeneratingCarousel(true);
    try {
      const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
      const { data, error } = await supabase.functions.invoke('generate-carousel-content', {
        body: { idea: carouselIdea, slideCount, presetId: selectedPresetId, mascotImageUrls: selectedMascotUrls, clientId: selectedClient.id, tenantId },
      });
      if (error) { console.error('Edge function error:', error); toast.error('Erro ao gerar conteúdo do carrossel. Tente novamente.'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.slides && Array.isArray(data.slides)) { setCarouselSlides(data.slides); setCarouselStep(2); toast.success('Conteúdo gerado! Revise e edite os slides.'); }
      else { toast.error('Nenhum conteúdo retornado.'); }
    } catch (err) { console.error('Generate carousel error:', err); toast.error('Erro inesperado ao gerar o carrossel.'); }
    finally { setGeneratingCarousel(false); }
  };

  const handleGenerateCarouselImages = async () => {
    setGeneratingCarouselImages(true);
    setCarouselGeneratedImages([]);
    setCarouselImageProgress('Preparando geração...');
    try {
      const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
      const allImages: Array<{ slideIndex: number; imageUrl: string }> = [];
      const BATCH_SIZE = 2;
      const totalSlides = carouselSlides.length;

      for (let batchStart = 0; batchStart < totalSlides; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSlides);
        const batchSlides = carouselSlides.slice(batchStart, batchEnd);
        setCarouselImageProgress(`Gerando slides ${batchStart + 1}-${batchEnd} de ${totalSlides}...`);

        const { data, error } = await supabase.functions.invoke('generate-carousel-images', {
          body: {
            slides: batchSlides,
            allSlides: carouselSlides,
            batchOffset: batchStart,
            aspectRatio: carouselAspectRatio,
            aiModel: carouselAiModel,
            presetId: selectedPresetId,
            mascotImageUrls: selectedMascotUrls,
            clientId: selectedClient.id,
            tenantId,
          },
        });

        if (error) { console.error('Edge function error (batch):', error); toast.error(`Erro ao gerar slides ${batchStart + 1}-${batchEnd}.`); continue; }
        if (data?.error) { toast.error(data.error); if (data.partialImages?.length > 0) allImages.push(...data.partialImages); continue; }
        if (data?.images && Array.isArray(data.images)) {
          // Adjust slide indices to global positions
          const adjustedImages = data.images.map((img: any) => ({
            slideIndex: img.slideIndex + batchStart,
            imageUrl: img.imageUrl,
          }));
          allImages.push(...adjustedImages);
          setCarouselGeneratedImages([...allImages]);
        }
      }

      if (allImages.length === 0) {
        toast.error('Nenhuma imagem foi gerada. Tente novamente.');
      } else {
        toast.success(`${allImages.length}/${totalSlides} imagens geradas com sucesso!`);
        const urls = allImages.map(img => img.imageUrl).filter(Boolean);
        if (urls.length > 0) {
          const savedId = await saveGeneratedContent('carousel', 'Carrossel com IA', carouselIdea, urls);
          setLastCarouselContentId(savedId);
        }
      }
    } catch (err) { console.error('Generate carousel images error:', err); toast.error('Erro inesperado ao gerar imagens.'); }
    finally { setGeneratingCarouselImages(false); setCarouselImageProgress(''); }
  };

  const handleGenerateStoryboard = async () => {
    if (!videoIdea.trim()) return;
    setGeneratingStoryboard(true);
    try {
      const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
      const { data, error } = await supabase.functions.invoke('generate-video-storyboard', {
        body: { idea: videoIdea, sceneCount, presetId: selectedPresetId, mascotImageUrls: selectedMascotUrls, clientId: selectedClient.id, tenantId },
      });
      if (error) { console.error('Edge function error:', error); toast.error('Erro ao gerar storyboard. Tente novamente.'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.scenes && Array.isArray(data.scenes)) {
        setVideoScenes(data.scenes.map((s: any) => ({ ...s, frame0_url: undefined, video_url: undefined, generating: false })));
        setVideoStep(2);
        toast.success('Storyboard gerado! Insira os frames e gere as cenas.');
        await saveGeneratedContent('video_storyboard', 'Storyboard de Vídeo', videoIdea, []);
      } else { toast.error('Nenhuma cena retornada.'); }
    } catch (err) { console.error('Generate storyboard error:', err); toast.error('Erro inesperado ao gerar o storyboard.'); }
    finally { setGeneratingStoryboard(false); }
  };

  const handleFrameUpload = async (sceneIndex: number, file: File) => {
    setUploadingFrame(sceneIndex);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `video-frames/${selectedClient.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('card-attachments').upload(filePath, file, { contentType: file.type, upsert: true });
      if (uploadError) { toast.error('Erro ao fazer upload da imagem.'); return; }
      const { data: publicUrlData } = supabase.storage.from('card-attachments').getPublicUrl(filePath);
      setVideoScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, frame0_url: publicUrlData.publicUrl } : s));
      toast.success(`Frame 0 da Cena ${sceneIndex + 1} carregado!`);
    } catch (err) { console.error('Frame upload error:', err); toast.error('Erro ao fazer upload.'); }
    finally { setUploadingFrame(null); }
  };

  const handleGenerateScene = async (sceneIndex: number) => {
    const scene = videoScenes[sceneIndex];
    if (!scene.scene_description.trim()) { toast.error('Descrição da cena é obrigatória.'); return; }
    
    setVideoScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, generating: true } : s));
    try {
      const { data, error } = await supabase.functions.invoke('generate-video-scene', {
        body: {
          sceneDescription: scene.scene_description,
          mascotSpeech: scene.mascot_speech || null,
          frameUrl: scene.frame0_url || null,
          clientId: selectedClient.id,
          tenantId,
          sceneIndex,
          aspectRatio: videoAspectRatio,
        },
      });
      if (error) { console.error('Edge function error:', error); toast.error(`Erro ao gerar Cena ${sceneIndex + 1}.`); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.videoUrl) {
        setVideoScenes(prev => {
          const updated = prev.map((s, i) => i === sceneIndex ? { ...s, video_url: data.videoUrl } : s);
          // Auto-navigate to the newly generated scene in the preview carousel
          const generatedScenes = updated.filter(s => s.video_url || s.generating);
          const newIndex = generatedScenes.findIndex((_, gi) => {
            let count = -1;
            for (let j = 0; j < updated.length; j++) {
              if (updated[j].video_url || updated[j].generating) count++;
              if (j === sceneIndex) return count === gi;
            }
            return false;
          });
          if (newIndex >= 0) setVideoPreviewIndex(newIndex);
          return updated;
        });
        toast.success(`Cena ${sceneIndex + 1} gerada com sucesso!`);
        const savedSceneId = await saveGeneratedContent('video_scene', `Cena ${sceneIndex + 1} - Vídeo`, scene.scene_description, [data.videoUrl]);
        if (savedSceneId) setSceneContentIds(prev => ({ ...prev, [sceneIndex]: savedSceneId }));
      } else { toast.error('Nenhum vídeo retornado.'); }
    } catch (err) { console.error('Generate scene error:', err); toast.error('Erro inesperado ao gerar a cena.'); }
    finally { setVideoScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, generating: false } : s)); }
  };

  const handleSaveContentRequirements = async () => {
    if (!selectedClient?.id) return;
    setSavingRequirements(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .update({ content_requirements: contentRequirements } as any)
        .eq('id', selectedClient.id);
      if (error) throw error;
      toast.success('Exigências de conteúdo salvas!');
      setContentRequirementsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar exigências.');
    } finally {
      setSavingRequirements(false);
    }
  };


  const isAdmin = role === 'agency_admin' || role === 'super_admin' || role === 'agency_manager';

  const allActionCards = [

    { id: 'client_anamnese' as ClientHubButtonId, title: "Anamnese", icon: FileText, action: () => navigate("/client-guide") },
    { id: 'client_estrategia' as ClientHubButtonId, title: "Estratégia", icon: Lightbulb, action: () => navigate("/strategies") },
    { id: 'client_planejar_periodo' as ClientHubButtonId, title: "Planejar Período", icon: CalendarDays, action: () => setPlanPeriodModalOpen(true) },
    { id: 'client_aprovar_producao' as ClientHubButtonId, title: "Avaliar Demandas", icon: CheckSquare, action: () => setAvaliarDemandasModalOpen(true), badge: (approvedCardsCount + rejectedCardsCount) > 0 ? (approvedCardsCount + rejectedCardsCount) : undefined },
    { id: 'client_cronograma_atual' as ClientHubButtonId, title: "Cronograma Atual", icon: Clock, action: () => navigate("/plan-period?tab=history&view=latest") },
    { id: 'client_historico' as ClientHubButtonId, title: "Histórico de Períodos", icon: History, action: () => navigate("/plan-period?tab=history") },
    { id: 'client_identidade_visual' as ClientHubButtonId, title: "Identidade Visual", icon: Palette, action: () => setVisualIdentityModalOpen(true) },
    { id: 'client_conteudo_avulso' as ClientHubButtonId, title: "Conteúdo Avulso", icon: PenTool, action: () => setContentHubModalOpen(true) },
    
    { id: 'client_demanda_planejada' as ClientHubButtonId, title: "Demanda Planejada", icon: ClipboardList, action: () => setDemandaPlanejadaHubModalOpen(true) },
  ];

  // Admins see all buttons; others are filtered by permissions
  const actionCards = isAdmin
    ? allActionCards
    : allActionCards.filter(card => canAccessButton(card.id));

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="mb-8 sm:mb-12 text-center relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/home" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
            {displayName}
          </h1>
          
          {(isAdmin || canAccessButton('client_cadastro' as ClientHubButtonId)) && (
            <button
              onClick={() => navigate(`/clientes/${selectedClient.id}`)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-full transition-colors"
            >
              <ClipboardList className="w-4 h-4 text-primary-foreground" />
              <span className="text-xs sm:text-sm font-medium text-primary-foreground">Mostrar Cadastro do Cliente</span>
            </button>
          )}

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {actionCards.map((card, index) => (
            <Card key={index} className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" onClick={card.action}>
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
              {'badge' in card && card.badge && (
                <div className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">{card.badge}</div>
              )}
              <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                </div>
                <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">{card.title}</h3>
              </div>
            </Card>
          ))}
        </div>

        {/* Modal Hub Conteúdo Avulso - Criar ou Histórico */}
        <Dialog open={contentHubModalOpen} onOpenChange={setContentHubModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Conteúdo Avulso</DialogTitle>
              <p className="text-sm text-muted-foreground">O que deseja fazer?</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setContentHubModalOpen(false); setContentModalOpen(true); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Criar</h3>
                  <p className="text-xs text-muted-foreground mt-2">Criar novo conteúdo avulso</p>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setContentHubModalOpen(false); navigate('/content-history'); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <History className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Histórico de Criações</h3>
                  <p className="text-xs text-muted-foreground mt-2">Ver conteúdos já gerados</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Avaliar Demandas - Aprovar ou Reprovar */}
        <Dialog open={avaliarDemandasModalOpen} onOpenChange={setAvaliarDemandasModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Avaliar Demandas</DialogTitle>
              <p className="text-sm text-muted-foreground">O que deseja fazer?</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-green-500/50 active:scale-[0.98]"
                onClick={() => { setAvaliarDemandasModalOpen(false); navigate('/approve-cards'); }}>
                <div className="absolute inset-0 bg-green-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                {approvedCardsCount > 0 && (
                  <div className="absolute top-2 right-2 z-10 bg-green-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">{approvedCardsCount}</div>
                )}
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-green-500 flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-green-600 dark:text-green-500">Aprovar Demandas</h3>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-red-500/50 active:scale-[0.98]"
                onClick={() => { setAvaliarDemandasModalOpen(false); navigate('/rejected-cards'); }}>
                <div className="absolute inset-0 bg-red-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                {rejectedCardsCount > 0 && (
                  <div className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">{rejectedCardsCount}</div>
                )}
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-red-500 flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <ThumbsDown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-red-600 dark:text-red-500">Reprovar Demandas</h3>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Hub Demanda Planejada - Criar ou Histórico */}
        <Dialog open={demandaPlanejadaHubModalOpen} onOpenChange={setDemandaPlanejadaHubModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Demanda Planejada</DialogTitle>
              <p className="text-sm text-muted-foreground">O que deseja fazer?</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setDemandaPlanejadaHubModalOpen(false); setDemandaPlanejadaModalOpen(true); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Demanda Planejada</h3>
                  <p className="text-xs text-muted-foreground mt-2">Criar nova demanda planejada</p>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setDemandaPlanejadaHubModalOpen(false); setDemandaHistoricoExpandedId(null); setDemandaHistoricoModalOpen(true); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                {demandaHistorico.length > 0 && (
                  <div className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">{demandaHistorico.length}</div>
                )}
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <ArchiveRestore className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Histórico</h3>
                  <p className="text-xs text-muted-foreground mt-2">Ver demandas planejadas anteriores</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Conteúdo Avulso */}
        <Dialog open={contentModalOpen} onOpenChange={setContentModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setContentModalOpen(false); setContentHubModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-xl">O que você vai criar hoje?</DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">Escolha o formato do conteúdo avulso para {displayName}.</p>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 py-4">
              {[
                { title: "Post Estático", icon: Image, description: "Uma única imagem impactante. Ideal para frases, avisos rápidos ou lembretes." },
                { title: "Carrossel", icon: LayoutGrid, description: "Uma sequência narrativa. Ideal para tutoriais, listas e storytelling." },
                { title: "Vídeo", icon: Video, description: "Vídeos realistas de alta qualidade gerados por IA." },
               ].map((item, idx) => (
                <Card
                  key={idx}
                  className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                  onClick={() => {
                    setContentModalOpen(false);
                    if (item.title === "Vídeo") {
                      setContentModalOpen(false);
                      setVideoModalOpen(true);
                    } else {
                      setSelectedContentType(item.title);
                      setProductionModalOpen(true);
                    }
                  }}
                >
                  <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                    </div>
                    <h3 className="text-base sm:text-lg font-bold transition-colors text-primary">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Tipo de Produção */}
        <Dialog open={productionModalOpen} onOpenChange={(open) => { setProductionModalOpen(open); if (!open) setSelectedContentType(null); }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setProductionModalOpen(false); setContentModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-xl">{selectedContentType}</DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">Escolha como deseja criar o conteúdo.</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => {
                  setProductionModalOpen(false);
                  if (selectedContentType === "Post Estático") {
                    setManualPostOpen(true);
                  } else if (selectedContentType === "Carrossel") {
                    setManualCarouselOpen(true);
                  }
                }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <PenLine className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Criar Manualmente</h3>
                  <p className="text-xs text-muted-foreground mt-2">Você escreve o conteúdo</p>
                </div>
              </Card>
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => {
                  setProductionModalOpen(false);
                  if (selectedContentType === "Post Estático") {
                    setAiPostModalOpen(true);
                  } else if (selectedContentType === "Carrossel") {
                    setAiCarouselModalOpen(true);
                  }
                }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Gerar com IA</h3>
                  <p className="text-xs text-muted-foreground mt-2">A IA cria o conteúdo</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Gerar Post Estático com IA */}
        <Dialog open={aiPostModalOpen} onOpenChange={(open) => { setAiPostModalOpen(open); if (!open) { setPostIdea(''); setSelectedPresetId(presets[0]?.id ?? null); setSelectedMascotIds([]); setGeneratedPostImage(null); setStaticAiModel('gpt2'); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${generatedPostImage ? 'sm:max-w-5xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[90vh]'}`}>
            <DialogHeader>
             <div className="flex items-center gap-2">
                <button onClick={() => { setAiPostModalOpen(false); setPostIdea(''); setSelectedPresetId(null); setSelectedMascotIds([]); setGeneratedPostImage(null); setSelectedContentType("Post Estático"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />Gerar Post com IA
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className={`flex-1 min-h-0 ${generatedPostImage ? 'flex gap-6' : 'overflow-y-auto'}`}>
              <div className={`space-y-4 py-1 ${generatedPostImage ? 'w-[40%] flex-shrink-0 overflow-y-auto' : 'w-full'}`}>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Ideia do Post</Label>
                  <Textarea placeholder="Ex: 'Crie um post de natal com tom acolhedor...'" value={postIdea}
                    onChange={(e) => setPostIdea(e.target.value)} className="min-h-[100px] resize-none" disabled={generatingPost} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Predefinição Visual</Label>
                    {presets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((preset) => (
                          <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingPost}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                            <div className="flex gap-0.5">
                              {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                              {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                            </div>
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mascote</Label>
                    {mascotImages.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {mascotImages.map((mascot) => {
                          const isSelected = selectedMascotIds.includes(mascot.id);
                          return (
                            <button key={mascot.id} disabled={generatingPost} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                              className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                              <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                              {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Modelo de IA</Label>
                      <Select value={staticAiModel} onValueChange={(v) => setStaticAiModel(v as 'nanobanana3' | 'nanobanana25' | 'gpt2')} disabled={generatingPost}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nanobanana3">Nanobanana 3 (Pro)</SelectItem>
                          <SelectItem value="nanobanana25">Nanobanana 2.5 (Flash)</SelectItem>
                          <SelectItem value="gpt2">GPT Image 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Proporção</Label>
                      <Select value={staticAspectRatio} onValueChange={setStaticAspectRatio} disabled={generatingPost}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1:1">1:1 (Quadrado)</SelectItem>
                          <SelectItem value="9:16">9:16 (Stories/Reels)</SelectItem>
                          <SelectItem value="16:9">16:9 (Paisagem)</SelectItem>
                          <SelectItem value="4:5">4:5 (Feed)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {generatedPostImage && (
                <div className="w-[60%] flex-shrink-0 flex flex-col py-1">
                  <Label className="text-sm font-medium mb-2">Resultado</Label>
                  <div className="flex-1 min-h-0 flex items-center justify-center rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg bg-black/5">
                    <img src={generatedPostImage} alt="Post gerado pela IA" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}
            </div>

            <div className={`flex gap-3 mt-1 ${generatedPostImage ? '' : 'flex-col'}`}>
              {generatedPostImage ? (
                <Button
                  className="h-11 text-sm font-semibold w-full bg-gradient-to-r from-primary to-primary/70"
                  disabled={!lastPostContentId || creatingCardFor === 'ai-post' || finalizedKeys.has('ai-post')}
                  onClick={() => handleCreateCardFromContent({
                    key: 'ai-post',
                    contentId: lastPostContentId,
                    contentType: 'post',
                    prompt: postIdea,
                    imageUrls: [generatedPostImage],
                  })}
                >
                  {creatingCardFor === 'ai-post'
                    ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Finalizando...</>)
                    : finalizedKeys.has('ai-post')
                      ? (<><CheckSquare className="w-4 h-4 mr-2" />Finalizado</>)
                      : (<><CheckSquare className="w-4 h-4 mr-2" />Finalizar</>)}
                </Button>
              ) : (
                <Button className="h-11 text-sm font-semibold w-full bg-gradient-to-r from-primary to-primary/70" disabled={!postIdea.trim() || generatingPost} onClick={() => handleGeneratePost(postIdea)}>
                  {generatingPost ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>) : (<><Sparkles className="w-4 h-4 mr-2" />Gerar Post</>)}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Post Estático Manual */}
        <Dialog open={manualPostOpen} onOpenChange={(open) => { setManualPostOpen(open); if (!open) { setManualPostText(''); setSelectedPresetId(null); setSelectedMascotIds([]); setGeneratedManualPostImage(null); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${generatedManualPostImage ? 'sm:max-w-5xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[90vh]'}`}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setManualPostOpen(false); setManualPostText(''); setSelectedPresetId(null); setSelectedMascotIds([]); setGeneratedManualPostImage(null); setSelectedContentType("Post Estático"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <PenLine className="w-5 h-5 text-primary" />Editor de Post
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className={`flex-1 min-h-0 ${generatedManualPostImage ? 'flex gap-6' : 'overflow-y-auto'}`}>
              <div className={`space-y-4 py-1 ${generatedManualPostImage ? 'w-[40%] flex-shrink-0 overflow-y-auto' : 'w-full'}`}>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Texto do Post</Label>
                  <Textarea placeholder="Escreva o texto que aparecerá no post..." value={manualPostText}
                    onChange={(e) => setManualPostText(e.target.value)} className="min-h-[100px] resize-none" disabled={generatingManualPost} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Predefinição Visual</Label>
                    {presets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((preset) => (
                          <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingManualPost}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                            <div className="flex gap-0.5">
                              {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                              {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                            </div>
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mascote</Label>
                    {mascotImages.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {mascotImages.map((mascot) => {
                          const isSelected = selectedMascotIds.includes(mascot.id);
                          return (
                            <button key={mascot.id} disabled={generatingManualPost} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                              className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                              <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                              {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {generatedManualPostImage && (
                <div className="w-[60%] flex-shrink-0 flex flex-col py-1">
                  <Label className="text-sm font-medium mb-2">Resultado</Label>
                  <div className="flex-1 min-h-0 flex items-center justify-center rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg bg-black/5">
                    <img src={generatedManualPostImage} alt="Post gerado" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}
            </div>

            <div className={`flex gap-3 mt-1 ${generatedManualPostImage ? '' : 'flex-col'}`}>
              {generatedManualPostImage ? (
                <Button
                  className="h-11 text-sm font-semibold w-full bg-gradient-to-r from-primary to-primary/70"
                  disabled={!lastManualPostContentId || creatingCardFor === 'manual-post' || finalizedKeys.has('manual-post')}
                  onClick={() => handleCreateCardFromContent({
                    key: 'manual-post',
                    contentId: lastManualPostContentId,
                    contentType: 'post',
                    prompt: manualPostText,
                    imageUrls: [generatedManualPostImage],
                  })}
                >
                  {creatingCardFor === 'manual-post'
                    ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Finalizando...</>)
                    : finalizedKeys.has('manual-post')
                      ? (<><CheckSquare className="w-4 h-4 mr-2" />Finalizado</>)
                      : (<><CheckSquare className="w-4 h-4 mr-2" />Finalizar</>)}
                </Button>
              ) : (
                <Button className="h-11 text-sm font-semibold w-full bg-gradient-to-r from-primary to-primary/70" disabled={!manualPostText.trim() || generatingManualPost} onClick={() => handleGeneratePost(manualPostText, true)}>
                  {generatingManualPost ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>) : (<><Clapperboard className="w-4 h-4 mr-2" />Gerar Post</>)}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Carrossel Manual */}
        <Dialog open={manualCarouselOpen} onOpenChange={(open) => { setManualCarouselOpen(open); if (!open) { setSelectedPresetId(null); setSelectedMascotIds([]); } }}>
          <DialogContent className="sm:max-w-2xl !flex !flex-col overflow-hidden max-h-[90vh]">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setManualCarouselOpen(false); setSelectedPresetId(null); setSelectedMascotIds([]); setSelectedContentType("Carrossel"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-primary" />Editor de Carrossel
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 py-1">
              {manualSlides.map((slide, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">Slide {idx + 1}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{slide.label}</span>
                    </div>
                    {manualSlides.length > 1 && (
                      <button onClick={() => setManualSlides(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <Textarea placeholder={`Texto do slide ${idx + 1}...`} value={slide.text}
                    onChange={(e) => { setManualSlides(prev => prev.map((s, i) => i === idx ? { ...s, text: e.target.value } : s)); }}
                    className="min-h-[60px] resize-none" />
                </div>
              ))}

              {manualSlides.length < 10 && (
                <button onClick={() => setManualSlides(prev => [...prev, { text: '', label: 'Conteúdo' }])}
                  className="w-full py-2.5 rounded-lg border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-primary text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  <Plus className="w-4 h-4" />Adicionar Slide
                </button>
              )}

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Predefinição Visual</Label>
                  {presets.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {presets.map((preset) => (
                        <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                          <div className="flex gap-0.5">
                            {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                            {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                          </div>
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Mascote</Label>
                  {mascotImages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {mascotImages.map((mascot) => {
                        const isSelected = selectedMascotIds.includes(mascot.id);
                        return (
                          <button key={mascot.id} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                            className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                            <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                            {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 mt-1" disabled={manualSlides.every(s => !s.text.trim()) || generatingCarouselImages}
              onClick={async () => {
                const validSlides = manualSlides.filter(s => s.text.trim());
                if (validSlides.length === 0) return;
                setCarouselSlides(validSlides);
                setManualCarouselOpen(false);
                setCarouselGeneratedImages([]);
                setGeneratingCarouselImages(true);
                setCarouselImageProgress(`Gerando ${validSlides.length} imagens... Isso pode levar alguns minutos.`);
                setAiCarouselModalOpen(true);
                setCarouselStep(2);
                try {
                  const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
                  const allImages: Array<{ slideIndex: number; imageUrl: string }> = [];
                  const BATCH_SIZE = 2;
                  const totalSlides = validSlides.length;

                  for (let batchStart = 0; batchStart < totalSlides; batchStart += BATCH_SIZE) {
                    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSlides);
                    const batchSlides = validSlides.slice(batchStart, batchEnd);
                    setCarouselImageProgress(`Gerando slides ${batchStart + 1}-${batchEnd} de ${totalSlides}...`);

                    const { data, error } = await supabase.functions.invoke('generate-carousel-images', {
                      body: {
                        slides: batchSlides,
                        allSlides: validSlides,
                        batchOffset: batchStart,
                        aspectRatio: '1:1',
                        aiModel: 'gpt2',
                        presetId: selectedPresetId,
                        mascotImageUrls: selectedMascotUrls,
                        clientId: selectedClient.id,
                        tenantId,
                      },
                    });
                    if (error) { console.error('Edge function error (batch):', error); toast.error(`Erro ao gerar slides ${batchStart + 1}-${batchEnd}.`); continue; }
                    if (data?.error) { toast.error(data.error); if (data.partialImages?.length > 0) allImages.push(...data.partialImages.map((img: any) => ({ slideIndex: img.slideIndex + batchStart, imageUrl: img.imageUrl }))); continue; }
                    if (data?.images && Array.isArray(data.images)) {
                      const adjustedImages = data.images.map((img: any) => ({
                        slideIndex: img.slideIndex + batchStart,
                        imageUrl: img.imageUrl,
                      }));
                      allImages.push(...adjustedImages);
                      setCarouselGeneratedImages([...allImages]);
                    }
                  }

                  if (allImages.length === 0) {
                    toast.error('Nenhuma imagem foi gerada. Tente novamente.');
                  } else {
                    toast.success(`${allImages.length}/${totalSlides} imagens geradas com sucesso!`);
                    const urls = allImages.map(img => img.imageUrl).filter(Boolean);
                    if (urls.length > 0) {
                      const savedId = await saveGeneratedContent('carousel', 'Carrossel Manual', 'Manual', urls);
                      setLastCarouselContentId(savedId);
                    }
                  }
                } catch (err) { console.error('Generate carousel images error:', err); toast.error('Erro inesperado ao gerar imagens.'); }
                finally { setGeneratingCarouselImages(false); setCarouselImageProgress(''); }
              }}>
              {generatingCarouselImages ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>) : (<><Clapperboard className="w-4 h-4 mr-2" />Gerar Imagens do Carrossel</>)}
            </Button>
          </DialogContent>
        </Dialog>

        {/* Modal Gerar Carrossel com IA - Two Steps */}
        <Dialog open={aiCarouselModalOpen} onOpenChange={(open) => { setAiCarouselModalOpen(open); if (!open) { setCarouselIdea(''); setSelectedPresetId(presets[0]?.id ?? null); setSelectedMascotIds([]); setSlideCount(null); setCarouselStep(1); setCarouselSlides([]); setCarouselAspectRatio('1:1'); setCarouselAiModel('gpt2'); setCarouselGeneratedImages([]); setGeneratingCarouselImages(false); setCarouselImageProgress(''); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${carouselGeneratedImages.length > 0 || generatingCarouselImages ? 'sm:max-w-6xl max-h-[95vh]' : carouselStep === 2 ? 'sm:max-w-4xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[85vh]'}`}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setAiCarouselModalOpen(false); setCarouselIdea(''); setSelectedPresetId(null); setSelectedMascotIds([]); setSlideCount(null); setCarouselStep(1); setCarouselSlides([]); setCarouselGeneratedImages([]); setSelectedContentType("Carrossel"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {carouselStep === 1 ? 'Gerar Carrossel com IA' : 'Editar Slides do Carrossel'}
                </DialogTitle>
              </div>
            </DialogHeader>

            {carouselStep === 1 ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Sua Ideia para o Carrossel</Label>
                    <Textarea placeholder="Ex: 'Crie um carrossel sobre 5 dicas de produtividade...'" value={carouselIdea}
                      onChange={(e) => setCarouselIdea(e.target.value)} className="min-h-[100px] resize-none" disabled={generatingCarousel} />
                  </div>

                  <div className={`space-y-1.5 rounded-lg border-2 p-3 transition-colors ${slideCount ? 'border-primary/50' : 'border-primary/80 bg-primary/5'}`}>
                    <Label className="text-sm font-medium">Quantidade de slides <span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <button key={n} onClick={() => setSlideCount(n)} disabled={generatingCarousel}
                          className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${slideCount === n ? 'bg-primary text-primary-foreground shadow-lg scale-110' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    {!slideCount && <p className="text-xs text-primary">● Selecione para habilitar a geração.</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Predefinição Visual</Label>
                      {presets.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {presets.map((preset) => (
                            <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingCarousel}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                              <div className="flex gap-0.5">
                                {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                                {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                              </div>
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Mascote</Label>
                      {mascotImages.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {mascotImages.map((mascot) => {
                            const isSelected = selectedMascotIds.includes(mascot.id);
                            return (
                              <button key={mascot.id} disabled={generatingCarousel} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                                className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                                <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                                {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Button className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 mt-1" disabled={!carouselIdea.trim() || !slideCount || generatingCarousel} onClick={handleGenerateCarouselContent}>
                  {generatingCarousel ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando conteúdo...</>) : (<><Sparkles className="w-4 h-4 mr-2" />Gerar Carrossel</>)}
                </Button>
              </>
            ) : (
              <>
                <div className={`flex-1 min-h-0 ${carouselGeneratedImages.length > 0 || generatingCarouselImages ? 'flex gap-6' : 'overflow-y-auto'}`}>
                  <div className={`space-y-4 py-2 ${carouselGeneratedImages.length > 0 || generatingCarouselImages ? 'w-[40%] flex-shrink-0 overflow-y-auto' : 'w-full'}`}>
                    {carouselSlides.map((slide, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">Slide {idx + 1}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{slide.label}</span>
                        </div>
                        <Textarea placeholder={`Texto do slide ${idx + 1}...`} value={slide.text}
                          onChange={(e) => { setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, text: e.target.value } : s)); }}
                          className="min-h-[80px] resize-none" disabled={generatingCarouselImages} />
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Proporção</Label>
                        <Select value={carouselAspectRatio} onValueChange={setCarouselAspectRatio} disabled={generatingCarouselImages}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1:1">1:1 (Quadrado)</SelectItem>
                            <SelectItem value="9:16">9:16 (Stories/Reels)</SelectItem>
                            <SelectItem value="16:9">16:9 (Paisagem)</SelectItem>
                            <SelectItem value="4:5">4:5 (Feed Instagram)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Modelo de IA</Label>
                        <Select value={carouselAiModel} onValueChange={(v) => setCarouselAiModel(v as 'nanobanana3' | 'nanobanana25' | 'gpt2')} disabled={generatingCarouselImages}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nanobanana3">Nanobanana 3 (Pro)</SelectItem>
                            <SelectItem value="nanobanana25">Nanobanana 2.5 (Flash)</SelectItem>
                            <SelectItem value="gpt2">GPT Image 2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  {(carouselGeneratedImages.length > 0 || generatingCarouselImages) && (
                    <div className="w-[60%] flex-shrink-0 flex flex-col py-2 overflow-y-auto">
                      <Label className="text-sm font-medium mb-3">Imagens Geradas</Label>
                      {generatingCarouselImages && (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                          <Loader2 className="w-10 h-10 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground text-center">{carouselImageProgress}</p>
                        </div>
                      )}
                      <div className="space-y-4">
                        {carouselGeneratedImages.map((img, idx) => (
                          <div key={idx} className="rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <span className="text-xs font-bold text-primary">Slide {img.slideIndex + 1}</span>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                                const link = document.createElement('a'); link.href = img.imageUrl; link.download = `carousel-slide-${img.slideIndex + 1}-${Date.now()}.png`; link.click();
                              }}>
                                <Download className="w-3.5 h-3.5 mr-1" />Baixar
                              </Button>
                            </div>
                            <img src={img.imageUrl} alt={`Slide ${img.slideIndex + 1}`} className="w-full object-contain bg-black/5" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="h-12 text-base font-semibold flex-1" onClick={() => { setCarouselStep(1); setCarouselGeneratedImages([]); }} disabled={generatingCarouselImages}>
                    Voltar
                  </Button>
                  {carouselGeneratedImages.length > 0 ? (
                    <Button
                      className="h-12 text-base font-semibold flex-1 bg-gradient-to-r from-primary to-primary/70"
                      disabled={!lastCarouselContentId || creatingCardFor === 'carousel' || finalizedKeys.has('carousel')}
                      onClick={() => handleCreateCardFromContent({
                        key: 'carousel',
                        contentId: lastCarouselContentId,
                        contentType: 'carousel',
                        prompt: carouselIdea,
                        imageUrls: carouselGeneratedImages
                          .slice()
                          .sort((a, b) => a.slideIndex - b.slideIndex)
                          .map(i => i.imageUrl),
                      })}
                    >
                      {creatingCardFor === 'carousel'
                        ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Finalizando...</>)
                        : finalizedKeys.has('carousel')
                          ? (<><CheckSquare className="w-5 h-5 mr-2" />Finalizado</>)
                          : (<><CheckSquare className="w-5 h-5 mr-2" />Finalizar</>)}
                    </Button>
                  ) : (
                    <Button className="h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/70 flex-1"
                      disabled={carouselSlides.every(s => !s.text.trim()) || generatingCarouselImages} onClick={handleGenerateCarouselImages}>
                      {generatingCarouselImages ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Gerando...</>) : (<><Sparkles className="w-5 h-5 mr-2" />Gerar Imagens</>)}
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>




        <VisualIdentityModal open={visualIdentityModalOpen} onOpenChange={setVisualIdentityModalOpen} companyId={selectedClient?.id || ''} companyName={selectedClient?.fantasy_name || selectedClient?.name || ''} tenantId={tenantId || ''} />

        {/* Modal Vídeo - Storyboard */}
        <Dialog open={videoModalOpen} onOpenChange={(open) => { setVideoModalOpen(open); if (!open) { setVideoIdea(''); setSceneCount(3); setSelectedPresetId(null); setVideoAspectRatio('9:16'); setSelectedMascotIds([]); setVideoStep(1); setVideoScenes([]); setVideoPreviewIndex(0); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${videoStep === 2 ? 'sm:max-w-4xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[85vh]'}`}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setVideoModalOpen(false); setVideoIdea(''); setSceneCount(3); setSelectedPresetId(null); setVideoAspectRatio('9:16'); setSelectedMascotIds([]); setVideoStep(1); setVideoScenes([]); setVideoPreviewIndex(0); setContentModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Clapperboard className="w-5 h-5 text-primary" />
                  {videoStep === 1 ? 'Criar Storyboard de Vídeo' : 'Editar Cenas do Storyboard'}
                </DialogTitle>
              </div>
            </DialogHeader>

            {videoStep === 1 ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Ideia do Vídeo</Label>
                    <Textarea placeholder="Ex: Um comercial cinematográfico de um café robótico cyberpunk..." value={videoIdea} onChange={(e) => setVideoIdea(e.target.value)} className="min-h-[90px] resize-none" disabled={generatingStoryboard} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Cenas</Label>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setSceneCount(n)} disabled={generatingStoryboard}
                            className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${sceneCount === n ? 'bg-primary text-primary-foreground shadow-lg scale-110' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Formato</Label>
                      <div className="flex gap-1.5">
                        {['9:16', '16:9', '1:1', '4:5'].map((ratio) => (
                          <button key={ratio} onClick={() => setVideoAspectRatio(ratio)} disabled={generatingStoryboard}
                            className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${videoAspectRatio === ratio ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Predefinição Visual</Label>
                      {presets.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {presets.map((preset) => (
                            <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingStoryboard}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                              <div className="flex gap-0.5">
                                {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                                {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                              </div>
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Mascote</Label>
                      {mascotImages.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {mascotImages.map((mascot) => {
                            const isSelected = selectedMascotIds.includes(mascot.id);
                            return (
                              <button key={mascot.id} disabled={generatingStoryboard}
                                onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                                className={`relative w-14 h-14 rounded-lg border-2 overflow-hidden transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                                <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                                {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Button className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 mt-1" disabled={!videoIdea.trim() || generatingStoryboard} onClick={handleGenerateStoryboard}>
                  {generatingStoryboard ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando storyboard...</>) : (<><Clapperboard className="w-4 h-4 mr-2" />Gerar Storyboard</>)}
                </Button>
              </>
            ) : (
              <>
                <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
                  {/* Left side - scene inputs */}
                  <div className={`flex-shrink-0 overflow-y-auto space-y-4 py-2 ${videoScenes.some(s => s.video_url) ? 'w-[45%]' : 'w-full'}`}>
                    {videoScenes.map((scene, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">Cena {idx + 1}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            {idx === 0 ? 'Abertura' : idx === videoScenes.length - 1 ? 'Encerramento (CTA)' : 'Desenvolvimento'}
                          </span>
                          {scene.generating && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary ml-auto" />}
                        </div>

                        {/* Mascot images as Frame 0 options */}
                        {mascotImages.length > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">Usar Mascote como Frame 0</Label>
                            <div className="flex flex-wrap gap-2">
                              {mascotImages.map((mascot) => (
                                <button key={mascot.id} onClick={() => {
                                  setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, frame0_url: mascot.image_url } : s));
                                  toast.success(`Mascote aplicado como Frame 0 da Cena ${idx + 1}`);
                                }}
                                  className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${scene.frame0_url === mascot.image_url ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                                  <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                                  {scene.frame0_url === mascot.image_url && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Frame 0 upload */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Frame 0 (Imagem Inicial)</Label>
                          {scene.frame0_url ? (
                            <div className="relative rounded-lg overflow-hidden border border-primary/30">
                              <img src={scene.frame0_url} alt={`Frame 0 - Cena ${idx + 1}`} className="w-full h-28 object-cover" />
                              <button
                                className="absolute top-1.5 right-1.5 bg-destructive text-destructive-foreground rounded-full p-1 hover:scale-110 transition-transform"
                                onClick={() => setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, frame0_url: undefined } : s))}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className={`flex flex-col items-center justify-center w-full h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/30 ${uploadingFrame === idx ? 'opacity-50 pointer-events-none' : ''}`}>
                              {uploadingFrame === idx ? (
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                              ) : (
                                <>
                                  <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                                  <span className="text-xs text-muted-foreground">Clique para inserir o frame</span>
                                </>
                              )}
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFrameUpload(idx, file);
                                e.target.value = '';
                              }} />
                            </label>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Descrição da Cena (EN)</Label>
                          <Textarea placeholder="Scene description in English..." value={scene.scene_description}
                            onChange={(e) => setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, scene_description: e.target.value } : s))}
                            className="min-h-[70px] resize-none text-sm" disabled={scene.generating} />
                        </div>
                        {scene.mascot_speech && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">Fala do Mascote (PT-BR)</Label>
                            <Textarea placeholder="O mascote diz: ..." value={scene.mascot_speech}
                              onChange={(e) => setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, mascot_speech: e.target.value } : s))}
                              className="min-h-[50px] resize-none text-sm" disabled={scene.generating} />
                          </div>
                        )}

                        <Button
                          className="w-full h-9 text-xs font-semibold bg-gradient-to-r from-primary to-primary/70"
                          disabled={!scene.scene_description.trim() || scene.generating}
                          onClick={() => handleGenerateScene(idx)}
                        >
                          {scene.generating ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Gerando cena...</>
                          ) : scene.video_url ? (
                            <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Gerar Novamente</>
                          ) : (
                            <><Play className="w-3.5 h-3.5 mr-1.5" />Gerar Cena</>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Right side - generated videos carousel */}
                  {videoScenes.some(s => s.video_url || s.generating) && (() => {
                    const generatedScenes = videoScenes.map((s, idx) => ({ ...s, originalIndex: idx })).filter(s => s.video_url || s.generating);
                    const currentPreviewIndex = Math.min(videoPreviewIndex, generatedScenes.length - 1);
                    const currentScene = generatedScenes[currentPreviewIndex];
                    return (
                      <div className="w-[55%] flex-shrink-0 flex flex-col py-2">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-sm font-medium">Vídeos Gerados ({generatedScenes.length})</Label>
                          <span className="text-xs text-muted-foreground">{currentPreviewIndex + 1} / {generatedScenes.length}</span>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col">
                          <div className="rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg flex-1 min-h-0 flex flex-col">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <span className="text-xs font-bold text-primary">Cena {currentScene.originalIndex + 1}</span>
                              {currentScene.video_url && (() => {
                                const sceneContentId = sceneContentIds[currentScene.originalIndex] || null;
                                const key = `video-scene-${currentScene.originalIndex}`;
                                const isFinalized = finalizedKeys.has(key);
                                return (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={!sceneContentId || creatingCardFor === key || isFinalized}
                                    onClick={() => handleCreateCardFromContent({
                                      key,
                                      contentId: sceneContentId,
                                      contentType: 'video_scene',
                                      prompt: currentScene.scene_description || '',
                                      imageUrls: [currentScene.video_url!],
                                    })}
                                  >
                                    {creatingCardFor === key
                                      ? (<><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Finalizando...</>)
                                      : isFinalized
                                        ? (<><CheckSquare className="w-3.5 h-3.5 mr-1" />Finalizado</>)
                                        : (<><CheckSquare className="w-3.5 h-3.5 mr-1" />Finalizar</>)}
                                  </Button>
                                );
                              })()}
                            </div>
                            {currentScene.generating ? (
                              <div className="flex flex-col items-center justify-center py-12 gap-3 bg-black/5 flex-1">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="text-xs text-muted-foreground">Gerando vídeo... Isso pode levar alguns minutos.</p>
                              </div>
                            ) : currentScene.video_url ? (
                              <video key={currentScene.video_url} src={currentScene.video_url} controls className="w-full bg-black/5 flex-1 min-h-0 object-contain" />
                            ) : null}
                          </div>
                          {/* Navigation arrows */}
                          {generatedScenes.length > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-3">
                              <button
                                className="w-9 h-9 rounded-full bg-muted hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-30"
                                disabled={currentPreviewIndex === 0}
                                onClick={() => setVideoPreviewIndex(prev => Math.max(0, prev - 1))}
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>
                              <div className="flex gap-1.5">
                                {generatedScenes.map((_, i) => (
                                  <button key={i} onClick={() => setVideoPreviewIndex(i)}
                                    className={`w-2 h-2 rounded-full transition-all ${i === currentPreviewIndex ? 'bg-primary scale-125' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'}`} />
                                ))}
                              </div>
                              <button
                                className="w-9 h-9 rounded-full bg-muted hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-30"
                                disabled={currentPreviewIndex === generatedScenes.length - 1}
                                onClick={() => setVideoPreviewIndex(prev => Math.min(generatedScenes.length - 1, prev + 1))}
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="h-11 text-sm font-semibold flex-1" onClick={() => { setVideoStep(1); setVideoScenes([]); setVideoPreviewIndex(0); }}>
                    Voltar
                  </Button>
                  {videoScenes.some(s => s.video_url) && (
                    <Button variant="outline" className="h-11 text-sm font-semibold flex-1" onClick={async () => {
                      try {
                        toast.info('Preparando ZIP com todas as cenas...');
                        const zip = new JSZip();
                        const scenesWithVideo = videoScenes.filter(s => s.video_url);
                        await Promise.all(scenesWithVideo.map(async (s, idx) => {
                          const response = await fetch(s.video_url!);
                          const blob = await response.blob();
                          zip.file(`cena-${idx + 1}.mp4`, blob);
                        }));
                        const zipBlob = await zip.generateAsync({ type: 'blob' });
                        const url = URL.createObjectURL(zipBlob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `videos-${selectedClient?.name || 'cliente'}-${Date.now()}.zip`;
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success('ZIP baixado com sucesso!');
                      } catch (err) {
                        console.error(err);
                        toast.error('Erro ao gerar ZIP');
                      }
                    }}>
                      <Download className="w-4 h-4 mr-2" />Baixar Todos
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal Planejar Período - Hub com 2 opções */}
        <Dialog open={planPeriodModalOpen} onOpenChange={setPlanPeriodModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Planejar Período</DialogTitle>
              <p className="text-sm text-muted-foreground">O que deseja fazer?</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setPlanPeriodModalOpen(false); navigate("/plan-period"); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Planejar Período</h3>
                  <p className="text-xs text-muted-foreground mt-2">Criar ou gerenciar períodos de conteúdo</p>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setPlanPeriodModalOpen(false); setContentRequirementsModalOpen(true); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                    <ScrollText className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">Exigências de Conteúdo</h3>
                  <p className="text-xs text-muted-foreground mt-2">Definir regras e tom dos conteúdos</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Exigências de Conteúdo */}
        <Dialog open={contentRequirementsModalOpen} onOpenChange={setContentRequirementsModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setContentRequirementsModalOpen(false); setPlanPeriodModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <ScrollText className="w-5 h-5" />
                  Exigências de Conteúdo
                </DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Defina as exigências e regras de como os conteúdos devem ser gerados para {displayName}. Essas instruções serão seguidas pela IA em todas as gerações.
              </p>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                placeholder="Ex: Posts devem ser super explicativos, com linguagem acessível e detalhamento técnico dos veículos. Não usar gírias. Sempre incluir chamada para ação com link..."
                value={contentRequirements}
                onChange={(e) => setContentRequirements(e.target.value)}
                className="min-h-[200px]"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setContentRequirementsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveContentRequirements} disabled={savingRequirements}>
                  {savingRequirements ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Demanda Planejada */}
        <Dialog open={demandaPlanejadaModalOpen} onOpenChange={(open) => { setDemandaPlanejadaModalOpen(open); if (!open) resetDemandaPlanejada(); }}>
          <DialogContent className={demandaStep === 1 ? "sm:max-w-2xl" : "sm:max-w-3xl"}>
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Demanda Planejada
              </DialogTitle>
              <DialogDescription>
                {demandaStep === 1
                  ? 'Informe a solicitação do cliente para gerar perguntas estratégicas da demanda.'
                  : demandaStep === 2
                    ? 'Responda cada pergunta para refinar a demanda antes de avançar.'
                    : 'Demanda final gerada com base nas respostas e na estratégia do cliente.'}
              </DialogDescription>
            </DialogHeader>

            {demandaStep === 1 ? (
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-base font-semibold">O que o cliente solicitou?</Label>
                  <p className="text-xs text-muted-foreground mt-1">Coloque o máximo de informações possíveis que o cliente forneceu!</p>
                </div>
                <Textarea
                  placeholder="Ex: O cliente pediu um carrossel sobre uma nova campanha, quer destacar uma promoção específica, informou prazo, referências visuais e objetivo da postagem..."
                  value={solicitacaoCliente}
                  onChange={(e) => setSolicitacaoCliente(e.target.value)}
                  className="min-h-[200px]"
                  disabled={generatingDemandaQuestions}
                />
                <div className="flex justify-end">
                  <Button onClick={handleContinuarDemandaPlanejada} disabled={generatingDemandaQuestions}>
                    {generatingDemandaQuestions ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando perguntas...</>
                    ) : 'Continuar'}
                  </Button>
                </div>
              </div>
            ) : demandaStep === 2 ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Label className="text-base font-semibold">Perguntas estratégicas</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Responda abaixo para enriquecer o briefing da demanda.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {demandaAnswers.filter((a) => a.trim()).length} / {demandaQuestions.length} respondidas
                  </span>
                </div>
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 -mr-2">
                  {demandaQuestions.map((q, i) => {
                    const answered = !!demandaAnswers[i]?.trim();
                    return (
                      <div
                        key={i}
                        className="rounded-lg border bg-card shadow-sm transition-colors hover:border-primary/40"
                      >
                        <div className="flex items-start gap-3 px-4 pt-4">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${answered ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                            {i + 1}
                          </div>
                          <p className="text-sm leading-relaxed pt-0.5 flex-1">{q}</p>
                        </div>
                        <div className="px-4 pb-4 pt-3 pl-14">
                          <Textarea
                            value={demandaAnswers[i] ?? ''}
                            onChange={(e) => {
                              const next = [...demandaAnswers];
                              next[i] = e.target.value;
                              setDemandaAnswers(next);
                            }}
                            placeholder="Digite a resposta..."
                            className="min-h-[80px] resize-y bg-background"
                            disabled={generatingDemandaFinal}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="outline" onClick={() => setDemandaStep(1)} disabled={generatingDemandaFinal}>Voltar</Button>
                  <Button onClick={handleGerarDemandaFinal} disabled={generatingDemandaFinal}>
                    {generatingDemandaFinal ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando demanda...</>
                    ) : 'Continuar'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Label className="text-base font-semibold">
                      {demandaFinal?.titulo || 'Demanda final'}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gerada com base na solicitação, respostas do briefing e estratégia do cliente.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {demandaFinal?.secoes.length ?? 0} {((demandaFinal?.secoes.length ?? 0) === 1) ? 'seção' : 'seções'}
                  </span>
                </div>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 -mr-2">
                  {demandaFinal?.secoes.map((s, i) => (
                    <div key={i} className="rounded-lg border bg-card shadow-sm">
                      <div className="flex items-center gap-3 px-4 pt-4">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {i + 1}
                        </div>
                        <h3 className="text-sm font-semibold flex-1">{s.titulo || `Seção ${i + 1}`}</h3>
                      </div>
                      <div className="px-4 pb-4 pt-2 pl-14 space-y-2">
                        {s.conteudo && (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                            {s.conteudo}
                          </p>
                        )}
                        {(s.itens?.length ?? 0) > 0 && (
                          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
                            {s.itens!.map((it, j) => (
                              <li key={j}>{it}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="outline" onClick={() => setDemandaStep(2)}>Voltar</Button>
                  <div className="flex gap-2">
                    <Button onClick={handleGerarDemandaFinal} variant="secondary" disabled={generatingDemandaFinal || approvingDemanda}>
                      {generatingDemandaFinal ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Regenerando...</>
                      ) : 'Regenerar demanda'}
                    </Button>
                    <Button onClick={handleAprovarDemandaFinal} variant="secondary" disabled={approvingDemanda || generatingDemandaFinal || preparingProducao}>
                      {approvingDemanda ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aprovando...</>
                      ) : (<><CheckSquare className="w-4 h-4 mr-2" />Aprovar demanda</>)}
                    </Button>
                    <Button onClick={handleCriarProducao} disabled={preparingProducao || approvingDemanda || generatingDemandaFinal}>
                      {preparingProducao ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Preparando produção...</>
                      ) : (<><Zap className="w-4 h-4 mr-2" />Criar produção</>)}
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </DialogContent>
        </Dialog>

        {/* Modal Captação Presencial */}
        <Dialog open={captacaoModalOpen} onOpenChange={(open) => { setCaptacaoModalOpen(open); if (!open) setCaptacaoData(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Video className="w-5 h-5 text-primary" />
                Captação presencial necessária
              </DialogTitle>
              <DialogDescription>
                Essa demanda depende de gravação presencial com o responsável antes de avançar para a produção.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {captacaoData?.aviso && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed">
                  {captacaoData.aviso}
                </div>
              )}

              {captacaoData?.briefing_captacao && (
                <div className="space-y-3 rounded-lg border p-4">
                  <h3 className="text-sm font-semibold">Briefing de captação</h3>

                  {captacaoData.briefing_captacao.objetivo && (
                    <div>
                      <Label className="text-xs uppercase text-muted-foreground">Objetivo</Label>
                      <p className="text-sm leading-relaxed">{captacaoData.briefing_captacao.objetivo}</p>
                    </div>
                  )}

                  {captacaoData.briefing_captacao.mensagem_principal && (
                    <div>
                      <Label className="text-xs uppercase text-muted-foreground">Mensagem principal</Label>
                      <p className="text-sm leading-relaxed">{captacaoData.briefing_captacao.mensagem_principal}</p>
                    </div>
                  )}

                  {Array.isArray(captacaoData.briefing_captacao.cenas_sugeridas) && captacaoData.briefing_captacao.cenas_sugeridas.length > 0 && (
                    <div>
                      <Label className="text-xs uppercase text-muted-foreground">Cenas sugeridas</Label>
                      <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                        {captacaoData.briefing_captacao.cenas_sugeridas.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {captacaoData.briefing_captacao.orientacoes_para_responsavel && (
                    <div>
                      <Label className="text-xs uppercase text-muted-foreground">Orientações para o responsável</Label>
                      <p className="text-sm leading-relaxed">{captacaoData.briefing_captacao.orientacoes_para_responsavel}</p>
                    </div>
                  )}

                  {Array.isArray(captacaoData.briefing_captacao.cuidados) && captacaoData.briefing_captacao.cuidados.length > 0 && (
                    <div>
                      <Label className="text-xs uppercase text-muted-foreground">Cuidados</Label>
                      <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                        {captacaoData.briefing_captacao.cuidados.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {captacaoData?.observacoes && (
                <div className="rounded-lg border p-3">
                  <Label className="text-xs uppercase text-muted-foreground">Observações</Label>
                  <p className="text-sm leading-relaxed">{captacaoData.observacoes}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => { setCaptacaoModalOpen(false); setDemandaPlanejadaModalOpen(true); setDemandaStep(3); }}>
                Voltar para demanda
              </Button>
              <Button onClick={() => { toast.success('Demanda registrada como pendente de captação presencial.'); setCaptacaoModalOpen(false); }}>
                <CalendarDays className="w-4 h-4 mr-2" />Marcar captação
              </Button>
            </div>
          </DialogContent>
        </Dialog>


        {/* Modal Histórico de Demanda Planejada */}
        <Dialog open={demandaHistoricoModalOpen} onOpenChange={(open) => { setDemandaHistoricoModalOpen(open); if (!open) setDemandaHistoricoExpandedId(null); }}>
          <DialogContent className={demandaHistoricoExpandedId ? "max-w-[95vw] sm:max-w-5xl" : "sm:max-w-3xl"}>
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <ArchiveRestore className="w-5 h-5 text-primary" />
                Histórico de Demanda Planejada
              </DialogTitle>
              <DialogDescription>
                {demandaHistoricoExpandedId
                  ? 'Visualização completa da demanda. Você pode reabrir para regenerar ou voltar para a lista.'
                  : 'Todas as demandas planejadas geradas para este cliente. Clique em maximizar para ver completa.'}
              </DialogDescription>
            </DialogHeader>

            {(() => {
              const expanded = demandaHistorico.find((d) => d.id === demandaHistoricoExpandedId) || null;
              if (expanded) {
                return (
                  <div className="space-y-4 py-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <Label className="text-base font-semibold">{expanded.demanda.titulo || 'Demanda final'}</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Gerada em {new Date(expanded.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {expanded.demanda.secoes.length} {expanded.demanda.secoes.length === 1 ? 'seção' : 'seções'}
                      </span>
                    </div>

                    {expanded.solicitacao && (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Solicitação original</p>
                        <p className="text-sm whitespace-pre-wrap">{expanded.solicitacao}</p>
                      </div>
                    )}

                    <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-2 -mr-2">
                      {expanded.demanda.secoes.map((s, i) => (
                        <div key={i} className="rounded-lg border bg-card shadow-sm">
                          <div className="flex items-center gap-3 px-4 pt-4">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                              {i + 1}
                            </div>
                            <h3 className="text-sm font-semibold flex-1">{s.titulo || `Seção ${i + 1}`}</h3>
                          </div>
                          <div className="px-4 pb-4 pt-2 pl-14 space-y-2">
                            {s.conteudo && (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{s.conteudo}</p>
                            )}
                            {(s.itens?.length ?? 0) > 0 && (
                              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
                                {s.itens!.map((it, j) => (<li key={j}>{it}</li>))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between gap-2 pt-2 border-t flex-wrap">
                      <Button variant="outline" onClick={() => setDemandaHistoricoExpandedId(null)}>
                        <Minimize2 className="w-4 h-4 mr-2" />Voltar para o histórico
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removerDemandaHistorico(expanded.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />Excluir
                        </Button>
                        <Button onClick={() => reabrirDemandaHistorico(expanded)}>
                          <RotateCcw className="w-4 h-4 mr-2" />Reabrir e regenerar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-2 -mr-2">
                  {demandaHistorico.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Nenhuma demanda planejada salva ainda.</p>
                      <p className="text-xs mt-1">Gere uma demanda planejada para começar.</p>
                    </div>
                  ) : (
                    demandaHistorico.map((item) => {
                      const resumoSolicitacao = item.solicitacao?.trim().slice(0, 140) || 'Sem solicitação registrada';
                      return (
                        <div key={item.id} className="rounded-lg border bg-card shadow-sm p-4 hover:border-primary/40 transition-colors">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold truncate">{item.demanda.titulo || 'Demanda final'}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(item.createdAt).toLocaleString('pt-BR')} · {item.demanda.secoes.length} {item.demanda.secoes.length === 1 ? 'seção' : 'seções'}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removerDemandaHistorico(item.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setDemandaHistoricoExpandedId(item.id)}>
                                <Maximize2 className="w-4 h-4 mr-1" />Maximizar
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {resumoSolicitacao}{(item.solicitacao?.length ?? 0) > 140 ? '…' : ''}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>

    </div>
  );
};


export default ClientHub;
