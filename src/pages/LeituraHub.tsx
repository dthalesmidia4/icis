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
import { toast } from "sonner";
import { useVoiceSearch } from "@/hooks/useVoiceSearch";

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

  // Resultado do dia modal
  const [resultadoModalOpen, setResultadoModalOpen] = useState(false);
  const [resultadoText, setResultadoText] = useState("");
  const [savingResultado, setSavingResultado] = useState(false);

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

  const handleSelectMember = (member: TeamMember) => {
    setSelectedMember(member);
    setCollaboratorModalOpen(false);

    if (activeAction === "anamnese") {
      navigate(`/anamnese-pessoal?employeeId=${member.id}&employeeName=${encodeURIComponent(member.full_name)}`);
      return;
    } else if (activeAction === "livros") {
      setBookName("");
      setBookAuthor("");
      setLivrosModalOpen(true);
    } else if (activeAction === "resultado") {
      setResultadoText("");
      setResultadoModalOpen(true);
    }
  };

  const handleSaveBook = async () => {
    if (!bookName.trim()) {
      toast.error("Informe o nome do livro");
      return;
    }
    setSavingBook(true);
    // TODO: Salvar no banco quando a tabela for criada
    await new Promise((r) => setTimeout(r, 500));
    toast.success(`Livro "${bookName}" salvo para ${selectedMember?.full_name}`);
    setSavingBook(false);
    setLivrosModalOpen(false);
  };

  const handleSaveResultado = async () => {
    if (!resultadoText.trim()) {
      toast.error("Escreva algo sobre o resultado do dia");
      return;
    }
    setSavingResultado(true);
    // TODO: Salvar no banco quando a tabela for criada
    await new Promise((r) => setTimeout(r, 500));
    toast.success(`Resultado salvo para ${selectedMember?.full_name}`);
    setSavingResultado(false);
    setResultadoModalOpen(false);
    if (isListening) stopListening();
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
    </div>
  );
};

export default LeituraHub;
