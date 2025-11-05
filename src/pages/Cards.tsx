import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KanbanSquare, Plus, Search, ArrowLeft, Calendar, FileText, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface CardItem {
  id: string;
  title: string;
  responsible_name: string | null;
  publication_date: string;
  file_location: string | null;
  description: string | null;
  observations: string | null;
  status: string;
  column_name: string | null;
}

interface Column {
  id: string;
  title: string;
  cards: CardItem[];
}

const Cards = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("planId");
  const [columns, setColumns] = useState<Column[]>([
    { id: "todo", title: "A Fazer", cards: [] },
    { id: "in_progress", title: "Em Andamento", cards: [] },
    { id: "done", title: "Concluído", cards: [] },
  ]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [showCardDialog, setShowCardDialog] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!planId) {
      toast.error("ID do plano não encontrado");
      navigate("/");
      return;
    }

    const fetchCards = async () => {
      const { data: plan, error: planError } = await supabase
        .from("marketing_plans")
        .select("plan_data, company_id")
        .eq("id", planId)
        .single();

      if (planError) {
        toast.error("Erro ao carregar plano");
        return;
      }

      // Fetch company name
      if (plan.company_id) {
        const { data: company } = await supabase
          .from("tenant_companies")
          .select("name")
          .eq("id", plan.company_id)
          .single();
        
        if (company) {
          setCompanyName(company.name);
        }
      }

      // Check if cards already exist
      const { data: existingCards } = await supabase
        .from("cards")
        .select("*")
        .eq("plan_id", planId);

      if (existingCards && existingCards.length > 0) {
        organizeCards(existingCards);
        return;
      }

      // Generate cards from plan
      const planItems = (plan.plan_data as any).items || [];
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      const generatedCards: any[] = planItems.map((item: any, index: number) => ({
        plan_id: planId,
        title: `${item.contentType} - ${item.channel}`,
        responsible_name: null,
        publication_date: new Date().toISOString().split("T")[0],
        description: item.description,
        status: "todo",
        column_name: "todo",
        tenant_id: profile.tenant_id,
      }));

      const { data: insertedCards, error: insertError } = await supabase
        .from("cards")
        .insert(generatedCards)
        .select();

      if (insertError) {
        console.error("Error creating cards:", insertError);
        toast.error("Erro ao criar cards");
        return;
      }

      organizeCards(insertedCards || []);
    };

    fetchCards();
  }, [planId, navigate]);

  const organizeCards = (cards: CardItem[]) => {
    const newColumns = [
      { id: "todo", title: "A Fazer", cards: cards.filter(c => c.column_name === "todo" || c.status === "todo") },
      { id: "in_progress", title: "Em Andamento", cards: cards.filter(c => c.column_name === "in_progress" || c.status === "in_progress") },
      { id: "done", title: "Concluído", cards: cards.filter(c => c.column_name === "done" || c.status === "done") },
    ];
    setColumns(newColumns);
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceColumn = columns.find(col => col.id === source.droppableId);
    const destColumn = columns.find(col => col.id === destination.droppableId);

    if (!sourceColumn || !destColumn) return;

    const sourceCards = Array.from(sourceColumn.cards);
    const destCards = source.droppableId === destination.droppableId 
      ? sourceCards 
      : Array.from(destColumn.cards);

    const [movedCard] = sourceCards.splice(source.index, 1);
    
    if (source.droppableId === destination.droppableId) {
      sourceCards.splice(destination.index, 0, movedCard);
    } else {
      destCards.splice(destination.index, 0, movedCard);
    }

    const newColumns = columns.map(col => {
      if (col.id === source.droppableId) {
        return { ...col, cards: sourceCards };
      }
      if (col.id === destination.droppableId) {
        return { ...col, cards: destCards };
      }
      return col;
    });

    setColumns(newColumns);

    // Update in database
    const { error } = await supabase
      .from("cards")
      .update({
        column_name: destination.droppableId,
        status: destination.droppableId,
      })
      .eq("id", draggableId);

    if (error) {
      console.error("Error updating card:", error);
      toast.error("Erro ao atualizar card");
      organizeCards(columns.flatMap(c => c.cards));
    } else {
      toast.success("Card atualizado!");
    }
  };

  const handleCardClick = (card: CardItem) => {
    setSelectedCard(card);
    setShowCardDialog(true);
  };

  const handleUpdateCard = async () => {
    if (!selectedCard) return;

    const { error } = await supabase
      .from("cards")
      .update({
        title: selectedCard.title,
        description: selectedCard.description,
        responsible_name: selectedCard.responsible_name,
        publication_date: selectedCard.publication_date,
        file_location: selectedCard.file_location,
        observations: selectedCard.observations,
      })
      .eq("id", selectedCard.id);

    if (error) {
      toast.error("Erro ao atualizar card");
      return;
    }

    const updatedColumns = columns.map(col => ({
      ...col,
      cards: col.cards.map(card => 
        card.id === selectedCard.id ? selectedCard : card
      ),
    }));

    setColumns(updatedColumns);
    setShowCardDialog(false);
    toast.success("Card atualizado com sucesso!");
  };

  const filteredColumns = searchTerm
    ? columns.map(col => ({
        ...col,
        cards: col.cards.filter(
          card =>
            card.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            card.description?.toLowerCase().includes(searchTerm.toLowerCase())
        ),
      }))
    : columns;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Hub
          </Button>

          <Card className="shadow-[var(--shadow-elevated)]">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                  <KanbanSquare className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl">Quadro Kanban</CardTitle>
                  <CardDescription>
                    {companyName && `${companyName} - `}
                    Organize e gerencie suas tarefas de marketing
                  </CardDescription>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cards..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Tarefa
                </Button>
              </div>
            </CardHeader>
          </Card>

          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {filteredColumns.map((column) => (
                <div key={column.id} className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border shadow-sm">
                    <h3 className="font-semibold text-lg">{column.title}</h3>
                    <Badge variant="secondary" className="text-sm">
                      {column.cards.length}
                    </Badge>
                  </div>

                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-3 min-h-[200px] p-2 rounded-lg transition-colors ${
                          snapshot.isDraggingOver ? "bg-accent/50" : ""
                        }`}
                      >
                        {column.cards.map((card, index) => (
                          <Draggable key={card.id} draggableId={card.id} index={index}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all cursor-pointer ${
                                  snapshot.isDragging ? "rotate-2 scale-105" : ""
                                }`}
                                onClick={() => handleCardClick(card)}
                              >
                                <CardContent className="p-4 space-y-3">
                                  <h4 className="font-medium text-foreground leading-snug">
                                    {card.title}
                                  </h4>
                                  {card.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {card.description}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      <span>
                                        {new Date(card.publication_date).toLocaleDateString("pt-BR")}
                                      </span>
                                    </div>
                                    {card.responsible_name && (
                                      <Badge variant="outline" className="text-xs">
                                        {card.responsible_name}
                                      </Badge>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
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
        </div>
      </div>

      <Dialog open={showCardDialog} onOpenChange={setShowCardDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Card</DialogTitle>
            <DialogDescription>
              Atualize as informações desta tarefa
            </DialogDescription>
          </DialogHeader>

          {selectedCard && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="card-title">Título</Label>
                <Input
                  id="card-title"
                  value={selectedCard.title}
                  onChange={(e) => setSelectedCard({ ...selectedCard, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="card-description">
                  <FileText className="h-4 w-4 inline mr-2" />
                  Descrição
                </Label>
                <Textarea
                  id="card-description"
                  value={selectedCard.description || ""}
                  onChange={(e) => setSelectedCard({ ...selectedCard, description: e.target.value })}
                  className="min-h-[100px]"
                  placeholder="Descreva a tarefa..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="card-date">
                    <Calendar className="h-4 w-4 inline mr-2" />
                    Data de Publicação
                  </Label>
                  <Input
                    id="card-date"
                    type="date"
                    value={selectedCard.publication_date}
                    onChange={(e) =>
                      setSelectedCard({ ...selectedCard, publication_date: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="card-responsible">Responsável</Label>
                  <Input
                    id="card-responsible"
                    value={selectedCard.responsible_name || ""}
                    onChange={(e) =>
                      setSelectedCard({ ...selectedCard, responsible_name: e.target.value })
                    }
                    placeholder="Nome do responsável"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="card-file">Local do Arquivo</Label>
                <Input
                  id="card-file"
                  value={selectedCard.file_location || ""}
                  onChange={(e) =>
                    setSelectedCard({ ...selectedCard, file_location: e.target.value })
                  }
                  placeholder="URL, caminho ou anotação do arquivo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="card-observations">
                  <MessageSquare className="h-4 w-4 inline mr-2" />
                  Observações
                </Label>
                <Textarea
                  id="card-observations"
                  value={selectedCard.observations || ""}
                  onChange={(e) =>
                    setSelectedCard({ ...selectedCard, observations: e.target.value })
                  }
                  className="min-h-[80px]"
                  placeholder="Adicione observações adicionais..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCardDialog(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdateCard}
                  className="bg-gradient-to-r from-primary to-secondary"
                >
                  Salvar Alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cards;
