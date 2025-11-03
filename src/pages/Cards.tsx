import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KanbanSquare, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

const Cards = () => {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("planId");
  const [cards, setCards] = useState<CardItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!planId) {
      toast.error("ID do plano não encontrado");
      return;
    }

    const fetchCards = async () => {
      const { data: plan, error: planError } = await supabase
        .from("marketing_plans")
        .select("plan_data")
        .eq("id", planId)
        .single();

      if (planError) {
        toast.error("Erro ao carregar plano");
        return;
      }

      const planItems = (plan.plan_data as any).items || [];
      const generatedCards: any[] = [];

      planItems.forEach((item: any, index: number) => {
        generatedCards.push({
          plan_id: planId,
          title: `${item.contentType} - ${item.channel}`,
          responsible_name: null,
          publication_date: new Date().toISOString().split("T")[0],
          description: item.description,
          status: "unassigned",
          column_name: null,
        });
      });

      const { data: insertedCards, error: insertError } = await supabase
        .from("cards")
        .insert(generatedCards)
        .select();

      if (insertError) {
        console.error("Error creating cards:", insertError);
        toast.error("Erro ao criar cards");
        return;
      }

      setCards(insertedCards || []);
    };

    fetchCards();
  }, [planId]);

  const columns = [
    { name: "Tarefas Não Atribuídas", key: "unassigned" },
    ...Array.from(new Set(cards.filter((c) => c.column_name).map((c) => c.column_name))).map(
      (name) => ({ name: name as string, key: name as string })
    ),
  ];

  const getCardsByColumn = (columnKey: string) => {
    if (columnKey === "unassigned") {
      return cards.filter((c) => c.status === "unassigned" || !c.column_name);
    }
    return cards.filter((c) => c.column_name === columnKey);
  };

  const filteredCards = cards.filter(
    (card) =>
      card.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <Card className="shadow-[var(--shadow-elevated)]">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                <KanbanSquare className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-2xl">Gestão de Cards</CardTitle>
                <CardDescription>Organize e gerencie suas tarefas de marketing</CardDescription>
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
                Novo Card
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {columns.map((column) => (
            <div key={column.key} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{column.name}</h3>
                <Badge variant="secondary">{getCardsByColumn(column.key).length}</Badge>
              </div>
              <div className="space-y-3">
                {getCardsByColumn(column.key)
                  .filter((card) =>
                    searchTerm
                      ? filteredCards.some((fc) => fc.id === card.id)
                      : true
                  )
                  .map((card) => (
                    <Card
                      key={card.id}
                      className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all cursor-pointer"
                    >
                      <CardContent className="p-4 space-y-3">
                        <h4 className="font-medium text-foreground">{card.title}</h4>
                        {card.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {card.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{new Date(card.publication_date).toLocaleDateString("pt-BR")}</span>
                          {card.responsible_name && (
                            <Badge variant="outline" className="text-xs">
                              {card.responsible_name}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Cards;