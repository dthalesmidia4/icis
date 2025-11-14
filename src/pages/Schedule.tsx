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
import { ArrowLeft, Calendar, FileText, User, Link as LinkIcon, Edit2, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
  { id: "Planejamento Automatizado", title: "Planejamento Automatizado", color: "bg-purple-500" },
  { id: "A Fazer", title: "A Fazer", color: "bg-blue-500" },
  { id: "Em Andamento", title: "Em Andamento", color: "bg-amber-500" },
  { id: "Concluído", title: "Concluído", color: "bg-emerald-500" },
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
    return cards.filter((card) => (card.column_name || "Planejamento Automatizado") === columnId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] p-6">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="flex gap-6 overflow-x-auto pb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="min-w-[340px]">
                <Skeleton className="h-[500px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/plans")}
            className="hover:bg-white/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-[#111827]">
              Cronograma de Tarefas
            </h1>
            <p className="text-[#6B7280] mt-1 text-sm">
              Organize e acompanhe suas tarefas no formato Kanban
            </p>
          </div>
        </div>

        {cards.length === 0 ? (
          <Card className="p-12 text-center bg-white shadow-sm">
            <div className="w-24 h-24 bg-[#F5F7FA] rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-12 h-12 text-[#6B7280]" />
            </div>
            <h2 className="text-2xl font-semibold text-[#111827] mb-2">
              Nenhuma tarefa encontrada
            </h2>
            <p className="text-[#6B7280] mb-6">
              As tarefas são geradas automaticamente ao aprovar o plano.
            </p>
            <Button onClick={() => navigate("/plans")} className="bg-[#2563EB] hover:bg-[#1d4ed8]">
              Voltar para Planos
            </Button>
          </Card>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-6 overflow-x-auto pb-4">
              {COLUMNS.map((column) => (
                <div key={column.id} className="min-w-[340px] flex-shrink-0">
                  {/* Column Header */}
                  <div className="bg-white rounded-lg shadow-sm mb-4 border border-[#E5E7EB]">
                    <div className="h-14 px-5 flex items-center justify-between border-b border-[#E5E7EB]">
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-6 rounded ${column.color}`} />
                        <h3 className="font-semibold text-base text-[#111827]">
                          {column.title}
                        </h3>
                      </div>
                      <Badge variant="secondary" className="bg-[#E5E7EB] text-[#111827] text-xs px-2.5 py-0.5 rounded-full">
                        {getCardsByColumn(column.id).length}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Droppable Area */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-4 p-3 rounded-lg transition-all duration-200 ${
                          snapshot.isDraggingOver 
                            ? "bg-[#2563EB]/5 border-2 border-[#2563EB] border-dashed" 
                            : "bg-transparent"
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
                                    className={`cursor-pointer bg-white border border-[#E5E7EB] p-5 rounded-lg transition-all duration-200 ${
                                      snapshot.isDragging 
                                        ? "shadow-xl rotate-2 scale-105" 
                                        : "shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md"
                                    }`}
                                    onClick={() => {
                                      setSelectedCard(card);
                                      setEditMode(false);
                                    }}
                                  >
                                    {/* Card Title */}
                                    <h4 className="text-[15px] font-semibold text-[#111827] mb-3 leading-tight line-clamp-2">
                                      {card.title}
                                    </h4>
                                    
                                    {/* Card Metadata */}
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-[#6B7280] text-xs">
                                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="font-medium">
                                          {new Date(card.publication_date).toLocaleDateString("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                          })}
                                        </span>
                                      </div>
                                      
                                      {card.file_location && (
                                        <div className="flex items-center gap-2 text-xs">
                                          <LinkIcon className="w-3.5 h-3.5 flex-shrink-0 text-[#2563EB]" />
                                          <span className="truncate text-[#2563EB]">
                                            {card.file_location}
                                          </span>
                                        </div>
                                      )}
                                      
                                      {!card.file_location && (
                                        <div className="flex items-center gap-2 text-[#9CA3AF] text-xs">
                                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                          <span>Sem arquivo</span>
                                        </div>
                                      )}
                                      
                                      {card.responsible_name && (
                                        <div className="flex items-center gap-2 text-[#6B7280] text-xs">
                                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                                          <span className="truncate">{card.responsible_name}</span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Card Description */}
                                    {card.description && (
                                      <p className="text-xs text-[#4B5563] mt-3 leading-relaxed line-clamp-2">
                                        {card.description}
                                      </p>
                                    )}
                                  </Card>
                                </DialogTrigger>

                                <DialogContent className="max-w-[700px] max-h-[90vh] overflow-y-auto bg-white">
                                  <DialogHeader className="border-b pb-4">
                                    <DialogTitle className="text-2xl font-bold text-[#111827]">
                                      {editMode ? "Editar Tarefa" : "Detalhes da Tarefa"}
                                    </DialogTitle>
                                  </DialogHeader>

                                  {selectedCard && (
                                    <div className="space-y-5 pt-2">
                                      {/* Title */}
                                      <div>
                                        <Label className="text-sm font-semibold text-[#111827]">Título</Label>
                                        {editMode ? (
                                          <Input
                                            value={selectedCard.title}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                title: e.target.value,
                                              })
                                            }
                                            className="mt-2 border-[#E5E7EB] focus:border-[#2563EB] focus:ring-[#2563EB]"
                                          />
                                        ) : (
                                          <p className="text-[15px] mt-2 text-[#111827]">{selectedCard.title}</p>
                                        )}
                                      </div>

                                      {/* Status */}
                                      <div>
                                        <Label className="text-sm font-semibold text-[#111827]">Status</Label>
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
                                            <SelectTrigger className="mt-2 border-[#E5E7EB]">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="unassigned">A Fazer</SelectItem>
                                              <SelectItem value="in_progress">Em Andamento</SelectItem>
                                              <SelectItem value="completed">Concluído</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <p className="text-sm mt-2 text-[#6B7280]">
                                            {selectedCard.status === "completed" ? "Concluído" :
                                             selectedCard.status === "in_progress" ? "Em Andamento" : "A Fazer"}
                                          </p>
                                        )}
                                      </div>

                                       {/* Publication Date */}
                                      <div>
                                        <Label className="text-sm font-semibold text-[#111827]">Data de Publicação</Label>
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
                                            className="mt-2 border-[#E5E7EB] focus:border-[#2563EB] focus:ring-[#2563EB]"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-[#6B7280]">
                                            {new Date(selectedCard.publication_date).toLocaleDateString("pt-BR")}
                                          </p>
                                        )}
                                      </div>

                                      {/* Responsible */}
                                      <div>
                                        <Label className="text-sm font-semibold text-[#111827]">Responsável</Label>
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
                                            className="mt-2 border-[#E5E7EB] focus:border-[#2563EB] focus:ring-[#2563EB]"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-[#6B7280]">
                                            {selectedCard.responsible_name || "Não atribuído"}
                                          </p>
                                        )}
                                      </div>

                                      {/* File Location */}
                                      <div>
                                        <Label className="text-sm font-semibold text-[#111827]">Local do Arquivo</Label>
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
                                            className="mt-2 border-[#E5E7EB] focus:border-[#2563EB] focus:ring-[#2563EB]"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-[#6B7280]">
                                            {selectedCard.file_location || "Não especificado"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Description */}
                                      <div>
                                        <Label className="text-sm font-semibold text-[#111827]">Descrição</Label>
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
                                            className="mt-2 border-[#E5E7EB] focus:border-[#2563EB] focus:ring-[#2563EB]"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-[#4B5563] whitespace-pre-wrap leading-relaxed">
                                            {selectedCard.description || "Sem descrição"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Observations */}
                                      <div>
                                        <Label className="text-sm font-semibold text-[#111827]">Observações</Label>
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
                                            className="mt-2 border-[#E5E7EB] focus:border-[#2563EB] focus:ring-[#2563EB]"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-[#4B5563] whitespace-pre-wrap leading-relaxed">
                                            {selectedCard.observations || "Sem observações"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Action Buttons */}
                                      <div className="flex justify-end gap-3 pt-4 border-t">
                                        {editMode ? (
                                          <>
                                            <Button
                                              variant="outline"
                                              onClick={() => {
                                                setEditMode(false);
                                                setSelectedCard(card);
                                              }}
                                              disabled={saving}
                                              className="border-[#E5E7EB] hover:bg-[#F5F7FA]"
                                            >
                                              Cancelar
                                            </Button>
                                            <Button
                                              onClick={handleSaveCard}
                                              disabled={saving}
                                              className="bg-[#2563EB] hover:bg-[#1d4ed8] gap-2"
                                            >
                                              <Save className="w-4 h-4" />
                                              {saving ? "Salvando..." : "Salvar Alterações"}
                                            </Button>
                                          </>
                                        ) : (
                                          <Button 
                                            onClick={() => setEditMode(true)}
                                            className="bg-[#2563EB] hover:bg-[#1d4ed8] gap-2"
                                          >
                                            <Edit2 className="w-4 h-4" />
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