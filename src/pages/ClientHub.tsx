import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { FileText, Lightbulb, CalendarDays, ClipboardList, History, Clock, Zap, CheckSquare, Image, LayoutGrid, Video, PenTool, Bot, PenLine, Palette, Clapperboard, Sparkles, User } from "lucide-react";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import VisualIdentityModal from "@/components/VisualIdentityModal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const ClientHub = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [productionModalOpen, setProductionModalOpen] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState<string | null>(null);
  const [pendingCardsCount, setPendingCardsCount] = useState(0);
  const [visualIdentityModalOpen, setVisualIdentityModalOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoIdea, setVideoIdea] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; primary_color: string | null; secondary_color: string | null }>>([]);
  const [aiPostModalOpen, setAiPostModalOpen] = useState(false);
  const [postIdea, setPostIdea] = useState('');
  const [selectedMascotIds, setSelectedMascotIds] = useState<string[]>([]);
  const [mascotImages, setMascotImages] = useState<Array<{ id: string; image_url: string; file_name: string | null }>>([]);

  // Fetch visual identity presets for the video modal
  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchPresets = async () => {
      const { data } = await supabase
        .from('visual_identity_presets')
        .select('id, name, primary_color, secondary_color')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (data) setPresets(data);
    };
    fetchPresets();
  }, [selectedClient?.id, tenantId]);

  // Fetch mascot images
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
  }, [isInitialized, selectedClient, navigate]);

  // Fetch pending cards count
  useEffect(() => {
    if (!selectedClient || !tenantId) return;

    const fetchCount = async () => {
      try {
        const { data: periods } = await supabase
          .from('period_plans')
          .select('id, default_plan, ultra_plan')
          .eq('company_id', selectedClient.id)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!periods) return;

        // Find first period with plans
        for (const p of periods) {
          const dp = Array.isArray(p.default_plan) ? p.default_plan : [];
          const up = Array.isArray(p.ultra_plan) ? p.ultra_plan : [];
          const totalCards = dp.length + up.length;

          if (totalCards > 0) {
            // Count already approved
            const { data: existingDemands } = await supabase
              .from('demands')
              .select('title')
              .eq('period_plan_id', p.id)
              .eq('client_id', selectedClient.id)
              .is('archived_at', null);

            const approvedTitles = new Set((existingDemands || []).map(d => d.title));
            const allItems = [...dp, ...up] as any[];
            const pending = allItems.filter(item => {
              const title = item.titulo || item.title || '';
              return !approvedTitles.has(title);
            });

            setPendingCardsCount(pending.length);
            return;
          }
        }

        setPendingCardsCount(0);
      } catch {
        // silently fail
      }
    };

    fetchCount();
  }, [selectedClient, tenantId]);

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const actionCards = [
    {
      title: "Cadastro",
      icon: ClipboardList,
      action: () => navigate(`/clientes/${selectedClient.id}`),
    },
    {
      title: "Anamnese",
      icon: FileText,
      action: () => navigate("/client-guide"),
    },
    {
      title: "Estratégia",
      icon: Lightbulb,
      action: () => navigate("/strategies"),
    },
    {
      title: "Planejar Período",
      icon: CalendarDays,
      action: () => navigate("/plan-period"),
    },
    {
      title: "Aprovar Produção de Demandas",
      icon: CheckSquare,
      action: () => navigate("/approve-cards"),
      badge: pendingCardsCount > 0 ? pendingCardsCount : undefined,
    },
    {
      title: "Cronograma Atual",
      icon: Clock,
      action: () => setScheduleModalOpen(true),
    },
    {
      title: "Histórico de Períodos",
      icon: History,
      action: () => navigate("/plan-period?tab=history"),
    },
    {
      title: "Identidade Visual",
      icon: Palette,
      action: () => setVisualIdentityModalOpen(true),
    },
    {
      title: "Conteúdo Avulso",
      icon: PenTool,
      action: () => setContentModalOpen(true),
    },
  ];

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
          <p className="text-sm sm:text-lg text-muted-foreground mb-3 sm:mb-4">
            Hub do Cliente
          </p>
          <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-primary/10 rounded-full">
            <div className="w-2 h-2 sm:w-3 sm:h-3 bg-primary rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm font-medium text-primary">Cliente Ativo</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {actionCards.map((card, index) => (
            <Card 
              key={index} 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" 
              onClick={card.action}
            >
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
              
              {/* Notification badge */}
              {'badge' in card && card.badge && (
                <div className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
                  {card.badge}
                </div>
              )}

              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                </div>
                
                <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">
                  {card.title}
                </h3>
              </div>
            </Card>
          ))}
        </div>

        {/* Modal Conteúdo Avulso */}
        <Dialog open={contentModalOpen} onOpenChange={setContentModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">O que você vai criar hoje?</DialogTitle>
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
                  <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <item.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                    </div>
                    <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">{item.title}</h3>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Como Produzir */}
        <Dialog open={productionModalOpen} onOpenChange={setProductionModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Como você quer produzir?</DialogTitle>
              <p className="text-sm text-muted-foreground">Defina como o conteúdo de <span className="font-semibold text-primary">{selectedContentType}</span> será gerado.</p>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => {
                  setProductionModalOpen(false);
                  if (selectedContentType === 'Post Estático') {
                    setPostIdea('');
                    setSelectedPresetId(null);
                    setSelectedMascotIds([]);
                    setAiPostModalOpen(true);
                  } else {
                    toast.info(`Gerar ${selectedContentType} com IA em breve!`);
                  }
                }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">Gerar com IA</h3>
                  <p className="text-xs text-muted-foreground">Descreva sua ideia e deixe a IA criar os textos e a estrutura para você.</p>
                </div>
              </Card>
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setProductionModalOpen(false); toast.info(`Criar ${selectedContentType} manualmente em breve!`); }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <PenLine className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">Criar Manualmente</h3>
                  <p className="text-xs text-muted-foreground">Tenha controle total. Escreva e personalize cada lâmina do zero.</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Gerar Post Estático com IA */}
        <Dialog open={aiPostModalOpen} onOpenChange={(open) => { setAiPostModalOpen(open); if (!open) { setPostIdea(''); setSelectedPresetId(null); setSelectedMascotIds([]); } }}>
          <DialogContent className="sm:max-w-xl !flex !flex-col overflow-hidden max-h-[85vh]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-center">Gerar Conteúdo com IA</DialogTitle>
              <p className="text-sm text-muted-foreground text-center">
                Descreva o tema, cole um texto ou apenas jogue uma ideia. A IA vai estruturar tudo em um post único para você.
              </p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-5 py-2">
              {/* Ideia do Post */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Sua Ideia para o Post</Label>
                <Textarea
                  placeholder="Ex: 'Crie uma frase motivacional sobre foco...'"
                  value={postIdea}
                  onChange={(e) => setPostIdea(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
              </div>

              {/* Predefinição de ID Visual */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Identidade Visual (Predefinição)</Label>
                {presets.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva. Crie uma no botão "Identidade Visual" do Hub.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                          selectedPresetId === preset.id
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                            : 'border-border bg-card hover:border-primary/40 text-foreground'
                        }`}
                      >
                        <div className="flex gap-1">
                          {preset.primary_color && (
                            <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />
                          )}
                          {preset.secondary_color && (
                            <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />
                          )}
                        </div>
                        {preset.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mascotes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mascotes</Label>
                {mascotImages.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado. Adicione na "Identidade Visual" do Hub.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {mascotImages.map((mascot) => {
                      const isSelected = selectedMascotIds.includes(mascot.id);
                      return (
                        <button
                          key={mascot.id}
                          onClick={() => {
                            setSelectedMascotIds(prev =>
                              isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id]
                            );
                          }}
                          className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                            isSelected
                              ? 'border-primary ring-2 ring-primary/30 scale-105'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <img
                            src={mascot.image_url}
                            alt={mascot.file_name || 'Mascote'}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <CheckSquare className="w-5 h-5 text-primary" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Botão Gerar */}
            <Button
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/70 mt-2"
              disabled={!postIdea.trim()}
              onClick={() => {
                setAiPostModalOpen(false);
                toast.info("Geração de Post com IA em breve!");
              }}
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Gerar Post
            </Button>
          </DialogContent>
        </Dialog>


        <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Cronograma Atual</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setScheduleModalOpen(false); navigate("/plan-period?tab=history&view=latest"); }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Demanda Comum</h3>
                </div>
              </Card>
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setScheduleModalOpen(false); navigate("/plan-period?tab=history&view=latest&mode=ultra"); }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Demanda Ultra</h3>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
        <VisualIdentityModal
          open={visualIdentityModalOpen}
          onOpenChange={setVisualIdentityModalOpen}
          companyId={selectedClient?.id || ''}
          companyName={selectedClient?.fantasy_name || selectedClient?.name || ''}
          tenantId={tenantId || ''}
        />

        {/* Modal Vídeo - Storyboard */}
        <Dialog open={videoModalOpen} onOpenChange={(open) => { setVideoModalOpen(open); if (!open) { setVideoIdea(''); setSceneCount(3); setSelectedPresetId(null); } }}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Clapperboard className="w-5 h-5 text-primary" />
                Criar Storyboard de Vídeo
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Descreva sua ideia e escolha quantas cenas você quer. A IA vai criar um storyboard completo.
              </p>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Ideia do Vídeo */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Ideia do Vídeo</Label>
                <Textarea
                  placeholder="Ex: Um comercial cinematográfico de um café robótico cyberpunk..."
                  value={videoIdea}
                  onChange={(e) => setVideoIdea(e.target.value)}
                  className="min-h-[100px] resize-none"
                />
              </div>

              {/* Quantidade de Cenas */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Quantidade de Cenas</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSceneCount(n)}
                      className={`w-10 h-10 rounded-lg font-bold text-sm transition-all duration-200 ${
                        sceneCount === n
                          ? 'bg-primary text-primary-foreground shadow-lg scale-110'
                          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Predefinição de ID Visual */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Identidade Visual (Predefinição)</Label>
                {presets.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva. Crie uma no botão "Identidade Visual" do Hub.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                          selectedPresetId === preset.id
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                            : 'border-border bg-card hover:border-primary/40 text-foreground'
                        }`}
                      >
                        <div className="flex gap-1">
                          {preset.primary_color && (
                            <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />
                          )}
                          {preset.secondary_color && (
                            <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />
                          )}
                        </div>
                        {preset.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Botão Gerar */}
              <Button
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/70"
                disabled={!videoIdea.trim()}
                onClick={() => {
                  setVideoModalOpen(false);
                  toast.info("Geração de Storyboard em breve!");
                }}
              >
                <Clapperboard className="w-5 h-5 mr-2" />
                Gerar Storyboard
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ClientHub;
