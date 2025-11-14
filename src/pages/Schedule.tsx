import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { ArrowLeft, Calendar, FileText, User, Link as LinkIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface KanbanCard {
  id: string;
  title: string;
  status: string;
  column_name: string | null;
  publication_date: string;
  file_location: string | null;
  description: string | null;
  observations: string | null;
  responsible_name: string | null;
  plan_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = [
  { id: "A Fazer", title: "A Fazer", color: "border-blue-500" },
  { id: "Em Andamento", title: "Em Andamento", color: "border-yellow-500" },
  { id: "Concluído", title: "Concluído", color: "border-green-500" },
];

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const planId = searchParams.get("planId");

  useEffect(() => {
    const initializeSchedule = async () => {
      if (!planId && tenantId) {
        // Fetch the most recent approved plan
        const { data: approvedPlan, error } = await supabase
          .from("marketing_plans")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("approved", true)
          .order("approved_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching approved plan:", error);
          navigate("/plans");
          return;
        }

        if (approvedPlan) {
          navigate(`/schedule?planId=${approvedPlan.id}`, { replace: true });
          return;
        } else {
          navigate("/plans");
          return;
        }
      }

      if (planId) {
        fetchCards();
      }
    };

    initializeSchedule();
  }, [planId, tenantId]);

  const fetchCards = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setCards(data || []);
    } catch (error) {
      console.error("Error fetching cards:", error);
      toast({
        title: "Erro ao carregar tarefas",
        description: "Não foi possível carregar as tarefas do cronograma.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId) return;

    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    const newColumnName = destination.droppableId;
    const newStatus = newColumnName === "Concluído" ? "completed" : 
                      newColumnName === "Em Andamento" ? "in_progress" : "unassigned";

    // Atualizar localmente
    setCards((prev) =>
      prev.map((c) =>
        c.id === draggableId
          ? { ...c, column_name: newColumnName, status: newStatus }
          : c
      )
    );

    // Atualizar no banco
    try {
      const { error } = await supabase
        .from("cards")
        .update({ column_name: newColumnName, status: newStatus })
        .eq("id", draggableId);

      if (error) throw error;

      toast({
        title: "Tarefa movida!",
        description: `Movida para "${newColumnName}"`,
      });
    } catch (error) {
      console.error("Error updating card:", error);
      toast({
        title: "Erro ao mover tarefa",
        description: "Não foi possível atualizar a tarefa.",
        variant: "destructive",
      });
      // Reverter mudança local
      fetchCards();
    }
  };

  const handleSaveCard = async () => {
    if (!selectedCard) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("cards")
        .update({
          title: selectedCard.title,
          description: selectedCard.description,
          publication_date: selectedCard.publication_date,
          file_location: selectedCard.file_location,
          observations: selectedCard.observations,
          responsible_name: selectedCard.responsible_name,
          status: selectedCard.status,
        })
        .eq("id", selectedCard.id);

      if (error) throw error;

      toast({
        title: "Tarefa atualizada!",
        description: "As alterações foram salvas com sucesso.",
      });

      setEditMode(false);
      fetchCards();
    } catch (error) {
      console.error("Error saving card:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getCardsByColumn = (columnId: string) => {
    return cards.filter((card) => (card.column_name || "A Fazer") === columnId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/plans")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Cronograma de Tarefas
            </h1>
            <p className="text-muted-foreground mt-1">
              Organize e acompanhe suas tarefas no formato Kanban
            </p>
          </div>
        </div>

        {cards.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-12 h-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Nenhuma tarefa encontrada
            </h2>
            <p className="text-muted-foreground mb-6">
              As tarefas são geradas automaticamente ao aprovar o plano.
            </p>
            <Button onClick={() => navigate("/plans")}>
              Voltar para Planos
            </Button>
          </Card>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {COLUMNS.map((column) => (
                <div key={column.id} className="flex flex-col">
                  <div className={`border-t-4 ${column.color} bg-card rounded-lg p-4 shadow-sm mb-4`}>
                    <h3 className="font-semibold text-lg text-foreground flex items-center justify-between">
                      {column.title}
                      <span className="text-sm text-muted-foreground">
                        {getCardsByColumn(column.id).length}
                      </span>
                    </h3>
                  </div>
                  
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 space-y-3 p-4 rounded-lg transition-colors ${
                          snapshot.isDraggingOver ? "bg-muted/50" : "bg-muted/20"
                        }`}
                        style={{ minHeight: "400px" }}
                      >
                        {getCardsByColumn(column.id).map((card, index) => (
                          <Draggable
                            key={card.id}
                            draggableId={card.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Card
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`cursor-pointer hover:shadow-lg transition-shadow ${
                                      snapshot.isDragging ? "shadow-xl" : ""
                                    }`}
                                    onClick={() => {
                                      setSelectedCard(card);
                                      setEditMode(false);
                                    }}
                                  >
                                    <CardHeader className="p-4 pb-2">
                                      <CardTitle className="text-sm font-semibold">
                                        {card.title}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                      <div className="space-y-2 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                          <Calendar className="w-3 h-3" />
                                          <span>
                                            {new Date(card.publication_date).toLocaleDateString("pt-BR")}
                                          </span>
                                        </div>
                                        {card.file_location && (
                                          <div className="flex items-center gap-2">
                                            <LinkIcon className="w-3 h-3" />
                                            <span className="truncate">
                                              {card.file_location}
                                            </span>
                                          </div>
                                        )}
                                        {card.responsible_name && (
                                          <div className="flex items-center gap-2">
                                            <User className="w-3 h-3" />
                                            <span>{card.responsible_name}</span>
                                          </div>
                                        )}
                                      </div>
                                      {card.description && (
                                        <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                                          {card.description}
                                        </p>
                                      )}
                                    </CardContent>
                                  </Card>
                                </DialogTrigger>

                                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>
                                      {editMode ? "Editar Tarefa" : "Detalhes da Tarefa"}
                                    </DialogTitle>
                                  </DialogHeader>

                                  {selectedCard && (
                                    <div className="space-y-4">
                                      <div>
                                        <Label>Título</Label>
                                        {editMode ? (
                                          <Input
                                            value={selectedCard.title}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                title: e.target.value,
                                              })
                                            }
                                          />
                                        ) : (
                                          <p className="text-sm mt-1">{selectedCard.title}</p>
                                        )}
                                      </div>

                                      <div>
                                        <Label>Status</Label>
                                        {editMode ? (
                                          <Select
                                            value={selectedCard.status}
                                            onValueChange={(value) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                status: value,
                                              })
                                            }
                                          >
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="unassigned">A Fazer</SelectItem>
                                              <SelectItem value="in_progress">Em Andamento</SelectItem>
                                              <SelectItem value="completed">Concluído</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <p className="text-sm mt-1">
                                            {selectedCard.status === "completed" ? "Concluído" :
                                             selectedCard.status === "in_progress" ? "Em Andamento" : "A Fazer"}
                                          </p>
                                        )}
                                      </div>

                                      <div>
                                        <Label>Data de Publicação</Label>
                                        {editMode ? (
                                          <Input
                                            type="date"
                                            value={selectedCard.publication_date}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                publication_date: e.target.value,
                                              })
                                            }
                                          />
                                        ) : (
                                          <p className="text-sm mt-1">
                                            {new Date(selectedCard.publication_date).toLocaleDateString("pt-BR")}
                                          </p>
                                        )}
                                      </div>

                                      <div>
                                        <Label>Responsável</Label>
                                        {editMode ? (
                                          <Input
                                            value={selectedCard.responsible_name || ""}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                responsible_name: e.target.value,
                                              })
                                            }
                                            placeholder="Nome do responsável"
                                          />
                                        ) : (
                                          <p className="text-sm mt-1">
                                            {selectedCard.responsible_name || "Não atribuído"}
                                          </p>
                                        )}
                                      </div>

                                      <div>
                                        <Label>Local do Arquivo</Label>
                                        {editMode ? (
                                          <Input
                                            value={selectedCard.file_location || ""}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                file_location: e.target.value,
                                              })
                                            }
                                            placeholder="Link, upload ou anotação"
                                          />
                                        ) : (
                                          <p className="text-sm mt-1">
                                            {selectedCard.file_location || "Não especificado"}
                                          </p>
                                        )}
                                      </div>

                                      <div>
                                        <Label>Descrição</Label>
                                        {editMode ? (
                                          <Textarea
                                            value={selectedCard.description || ""}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                description: e.target.value,
                                              })
                                            }
                                            rows={4}
                                            placeholder="Explicação do que deve ser feito"
                                          />
                                        ) : (
                                          <p className="text-sm mt-1 whitespace-pre-wrap">
                                            {selectedCard.description || "Sem descrição"}
                                          </p>
                                        )}
                                      </div>

                                      <div>
                                        <Label>Observações</Label>
                                        {editMode ? (
                                          <Textarea
                                            value={selectedCard.observations || ""}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                observations: e.target.value,
                                              })
                                            }
                                            rows={3}
                                            placeholder="Detalhes adicionais"
                                          />
                                        ) : (
                                          <p className="text-sm mt-1 whitespace-pre-wrap">
                                            {selectedCard.observations || "Sem observações"}
                                          </p>
                                        )}
                                      </div>

                                      <div className="flex justify-end gap-2 pt-4">
                                        {editMode ? (
                                          <>
                                            <Button
                                              variant="outline"
                                              onClick={() => {
                                                setEditMode(false);
                                                setSelectedCard(card);
                                              }}
                                              disabled={saving}
                                            >
                                              Cancelar
                                            </Button>
                                            <Button
                                              onClick={handleSaveCard}
                                              disabled={saving}
                                            >
                                              {saving ? "Salvando..." : "Salvar Alterações"}
                                            </Button>
                                          </>
                                        ) : (
                                          <Button onClick={() => setEditMode(true)}>
                                            Editar
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </DialogContent>
                              </Dialog>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}