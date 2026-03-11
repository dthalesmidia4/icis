import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  ClipboardList,
  Library,
  Eye,
  CalendarCheck,
  History,
  Loader2,
  Mic,
  MicOff,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useVoiceSearch } from "@/hooks/useVoiceSearch";
import { logProgressEvent } from "@/lib/progressHistory";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

const leituraCards = [
  { id: "anamnese", title: "Anamnese Pessoal", icon: ClipboardList },
  { id: "estrategia", title: "Estratégia Geral", icon: BookOpen },
  { id: "livros", title: "Livros sendo usados", icon: Library },
  { id: "supervisao", title: "Supervisão", icon: Eye },
  { id: "resultado", title: "Resultado do dia", icon: CalendarCheck },
  { id: "historico", title: "Histórico de progresso", icon: History },
];

const LeituraHub = () => {
  const navigate = useNavigate();
  const { agencyId } = useAgency();
  const { user } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Collaborator selection modal
  const [collaboratorModalOpen, setCollaboratorModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // Livros modal (anamnese now navigates to dedicated page)

  // Livros modal
  const [livrosModalOpen, setLivrosModalOpen] = useState(false);
  const [bookName, setBookName] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [savingBook, setSavingBook] = useState(false);

  // Supervisão modal
  const [supervisaoModalOpen, setSupervisaoModalOpen] = useState(false);
  const [supervisaoText, setSupervisaoText] = useState("");
  const [generatingSupervision, setGeneratingSupervision] = useState(false);

  // Resultado do dia modal
  const [resultadoModalOpen, setResultadoModalOpen] = useState(false);
  const [resultadoText, setResultadoText] = useState("");
  const [savingResultado, setSavingResultado] = useState(false);

  // Estratégia modal
  const [estrategiaModalOpen, setEstrategiaModalOpen] = useState(false);
  const [estrategiaText, setEstrategiaText] = useState("");
  const [loadingEstrategia, setLoadingEstrategia] = useState(false);
  const [savingEstrategia, setSavingEstrategia] = useState(false);

  // Histórico modal
  const [historicoModalOpen, setHistoricoModalOpen] = useState(false);
  const [historicoItems, setHistoricoItems] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const { isListening, isSupported, startListening, stopListening } = useVoiceSearch({
    onTranscript: (text) => {
      setResultadoText((prev) => (prev ? prev + " " + text : text));
    },
    language: "pt-BR",
  });

  useEffect(() => {
    if (agencyId) loadMembers();
  }, [agencyId]);

  const loadMembers = async () => {
    if (!agencyId) return;
    setLoadingMembers(true);
    try {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", agencyId);

      if (rolesError) throw rolesError;
      if (!roles?.length) {
        setMembers([]);
        return;
      }

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      if (profilesError) throw profilesError;
      setMembers(profiles || []);
    } catch (err) {
      console.error("Erro ao carregar membros:", err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleCardClick = (cardId: string) => {
    setActiveAction(cardId);
    setCollaboratorModalOpen(true);
  };

  const handleSelectMember = async (member: TeamMember) => {
    setSelectedMember(member);
    setCollaboratorModalOpen(false);

    if (activeAction === "anamnese") {
      navigate(`/anamnese-pessoal?employeeId=${member.id}&employeeName=${encodeURIComponent(member.full_name)}`);
      return;
    } else if (activeAction === "estrategia") {
      setEstrategiaText("");
      setEstrategiaModalOpen(true);
      setLoadingEstrategia(true);
      // Load existing strategy from history
      try {
        const { data } = await supabase
          .from("employee_progress_history" as any)
          .select("event_data")
          .eq("tenant_id", agencyId!)
          .eq("employee_id", member.id)
          .eq("event_type", "estrategia")
          .order("created_at", { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const eventData = (data[0] as any).event_data;
          if (eventData?.strategyText) {
            setEstrategiaText(eventData.strategyText);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar estratégia:", err);
      } finally {
        setLoadingEstrategia(false);
      }
      return;
    } else if (activeAction === "livros") {
      setBookName("");
      setBookAuthor("");
      setLivrosModalOpen(true);
    } else if (activeAction === "resultado") {
      setResultadoText("");
      setResultadoModalOpen(true);
    } else if (activeAction === "supervisao") {
      setSupervisaoText("");
      setSupervisaoModalOpen(true);
      handleGenerateSupervision(member);
      return;
    } else if (activeAction === "historico") {
      setHistoricoModalOpen(true);
      loadHistorico(member);
      return;
    }
  };

  const handleGenerateSupervision = async (member: TeamMember) => {
    setGeneratingSupervision(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-supervision", {
        body: {
          employeeId: member.id,
          employeeName: member.full_name,
          tenantId: agencyId,
          bookName,
          bookAuthor,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setSupervisaoText("");
      } else if (data?.supervisionText) {
        setSupervisaoText(data.supervisionText);
        toast.success("Análise de supervisão gerada!");

        // Log to history
        if (agencyId) {
          await logProgressEvent({
            tenantId: agencyId,
            employeeId: member.id,
            eventType: "supervisao",
            eventTitle: "Supervisão realizada",
            eventData: { preview: data.supervisionText.substring(0, 200) },
            createdBy: user?.id,
          });
        }
      }
    } catch (err: any) {
      console.error("Erro ao gerar supervisão:", err);
      toast.error("Erro ao gerar análise de supervisão");
    } finally {
      setGeneratingSupervision(false);
    }
  };

  const handleSaveBook = async () => {
    if (!bookName.trim()) {
      toast.error("Informe o nome do livro");
      return;
    }
    setSavingBook(true);
    try {
      if (agencyId && selectedMember) {
        await logProgressEvent({
          tenantId: agencyId,
          employeeId: selectedMember.id,
          eventType: "livro",
          eventTitle: `Livro adicionado: ${bookName}`,
          eventData: { bookName, bookAuthor },
          createdBy: user?.id,
        });
      }
      toast.success(`Livro "${bookName}" salvo para ${selectedMember?.full_name}`);
    } catch {
      toast.error("Erro ao salvar livro");
    }
    setSavingBook(false);
    setLivrosModalOpen(false);
  };

  const handleSaveResultado = async () => {
    if (!resultadoText.trim()) {
      toast.error("Escreva algo sobre o resultado do dia");
      return;
    }
    setSavingResultado(true);
    try {
      if (agencyId && selectedMember) {
        await logProgressEvent({
          tenantId: agencyId,
          employeeId: selectedMember.id,
          eventType: "resultado_dia",
          eventTitle: "Resultado do dia registrado",
          eventData: { text: resultadoText },
          createdBy: user?.id,
        });
      }
      toast.success(`Resultado salvo para ${selectedMember?.full_name}`);
    } catch {
      toast.error("Erro ao salvar resultado");
    }
    setSavingResultado(false);
    setResultadoModalOpen(false);
    if (isListening) stopListening();
  };

  const loadHistorico = async (member: TeamMember) => {
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from("employee_progress_history" as any)
        .select("*")
        .eq("tenant_id", agencyId!)
        .eq("employee_id", member.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistoricoItems(data || []);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoadingHistorico(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "anamnese": return "📋";
      case "estrategia": return "📖";
      case "livro": return "📚";
      case "supervisao": return "👁️";
      case "resultado_dia": return "📅";
      default: return "📝";
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case "anamnese": return "border-l-blue-500";
      case "estrategia": return "border-l-green-500";
      case "livro": return "border-l-purple-500";
      case "supervisao": return "border-l-amber-500";
      case "resultado_dia": return "border-l-cyan-500";
      default: return "border-l-muted-foreground";
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <PageHeader title="Leitura" backTo="/home" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-6">
          {leituraCards.map((card, index) => (
            <Card
              key={index}
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
              onClick={() => handleCardClick(card.id)}
            >
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
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
      </div>

      {/* Modal: Selecionar Colaborador */}
      <Dialog open={collaboratorModalOpen} onOpenChange={setCollaboratorModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar Colaborador</DialogTitle>
          </DialogHeader>
          {loadingMembers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhum colaborador encontrado.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {members.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleSelectMember(member)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors text-left"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {getInitials(member.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">{member.full_name}</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Livros sendo usados */}
      <Dialog open={livrosModalOpen} onOpenChange={setLivrosModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Livro — {selectedMember?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="book-name">Nome do Livro</Label>
              <Input
                id="book-name"
                placeholder="Ex: A Arte da Guerra"
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-author">Autor</Label>
              <Input
                id="book-author"
                placeholder="Ex: Sun Tzu"
                value={bookAuthor}
                onChange={(e) => setBookAuthor(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setLivrosModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveBook} disabled={savingBook}>
              {savingBook ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Resultado do dia */}
      <Dialog
        open={resultadoModalOpen}
        onOpenChange={(open) => {
          setResultadoModalOpen(open);
          if (!open && isListening) stopListening();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resultado do dia — {selectedMember?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Observações sobre o colaborador</Label>
              <AutoResizeTextarea
                placeholder="Escreva ou use o microfone para ditar..."
                value={resultadoText}
                onChange={(e) => setResultadoText(e.target.value)}
                minHeight={120}
              />
            </div>
            {isSupported && (
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="sm"
                onClick={isListening ? stopListening : startListening}
                className="gap-2"
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4" /> Parar gravação
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" /> Ditar por voz
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setResultadoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveResultado} disabled={savingResultado}>
              {savingResultado ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Estratégia Geral */}
      <Dialog open={estrategiaModalOpen} onOpenChange={setEstrategiaModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>📋 Estratégia Geral — {selectedMember?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 overflow-y-auto max-h-[55vh]">
            {loadingEstrategia ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Carregando estratégia...</p>
              </div>
            ) : estrategiaText ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Estratégia personalizada gerada com base nas respostas da anamnese. Você pode editar o texto abaixo.
                </p>
                <AutoResizeTextarea
                  value={estrategiaText}
                  onChange={(e) => setEstrategiaText(e.target.value)}
                  minHeight={200}
                  className="text-sm whitespace-pre-wrap"
                />
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma estratégia encontrada. Salve a anamnese do colaborador para gerar automaticamente.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEstrategiaModalOpen(false)}>
              Fechar
            </Button>
            {estrategiaText && (
              <Button onClick={handleSaveEstrategia} disabled={savingEstrategia}>
                {savingEstrategia ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar alterações
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

  const handleSaveEstrategia = async () => {
    if (!estrategiaText.trim()) {
      toast.error("Nenhuma estratégia para salvar");
      return;
    }
    setSavingEstrategia(true);
    try {
      if (agencyId && selectedMember) {
        await logProgressEvent({
          tenantId: agencyId,
          employeeId: selectedMember.id,
          eventType: "estrategia",
          eventTitle: "Estratégia geral atualizada",
          eventData: { strategyText: estrategiaText, strategyPreview: estrategiaText.substring(0, 300) },
          createdBy: user?.id,
        });
      }
      toast.success("Estratégia salva com sucesso!");
      setEstrategiaModalOpen(false);
    } catch {
      toast.error("Erro ao salvar estratégia");
    } finally {
      setSavingEstrategia(false);
    }
  };


      <Dialog open={supervisaoModalOpen} onOpenChange={setSupervisaoModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Supervisão — {selectedMember?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 overflow-y-auto max-h-[60vh]">
            {generatingSupervision ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Gerando análise de supervisão...</p>
              </div>
            ) : supervisaoText ? (
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap text-foreground">
                {supervisaoText}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhuma análise disponível.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSupervisaoModalOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Histórico de Progresso */}
      <Dialog open={historicoModalOpen} onOpenChange={setHistoricoModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Histórico de Progresso — {selectedMember?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 overflow-y-auto max-h-[60vh]">
            {loadingHistorico ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : historicoItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum registro encontrado.</p>
            ) : (
              <div className="space-y-3">
                {historicoItems.map((item: any) => (
                  <div
                    key={item.id}
                    className={`border-l-4 ${getEventColor(item.event_type)} rounded-r-lg bg-muted/30 p-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getEventIcon(item.event_type)}</span>
                        <span className="font-semibold text-sm text-foreground">{item.event_title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {item.event_data && Object.keys(item.event_data).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        {item.event_data.bookName && (
                          <p>📕 {item.event_data.bookName}{item.event_data.bookAuthor ? ` — ${item.event_data.bookAuthor}` : ""}</p>
                        )}
                        {item.event_data.text && (
                          <p className="line-clamp-3">{item.event_data.text}</p>
                        )}
                        {item.event_data.preview && (
                          <p className="line-clamp-3">{item.event_data.preview}</p>
                        )}
                        {item.event_data.strategyPreview && (
                          <p className="line-clamp-2">{item.event_data.strategyPreview}...</p>
                        )}
                        {item.event_data.answeredCount && (
                          <p>✅ {item.event_data.answeredCount} perguntas respondidas</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setHistoricoModalOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeituraHub;
