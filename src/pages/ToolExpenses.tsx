import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";

interface ToolExpense {
  id: string;
  name: string;
  due_date: string;
  card_used: string | null;
  amount: number;
  subscription_date: string | null;
  observations: string | null;
  created_at: string;
}

interface ColumnConfig {
  key: keyof ToolExpense;
  label: string;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "due_date", label: "Data Vencimento" },
  { key: "card_used", label: "Cartão Utilizado" },
  { key: "amount", label: "Valor (R$)" },
  { key: "name", label: "Nome" },
  { key: "subscription_date", label: "Data da Assinatura" },
  { key: "observations", label: "Observação" },
];

const STORAGE_KEY = "tool_expenses_column_order";

export default function ToolExpenses() {
  const { agencyId } = useAgency();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ToolExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_COLUMNS;
  });
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cardUsed, setCardUsed] = useState("");
  const [amount, setAmount] = useState("");
  const [subscriptionDate, setSubscriptionDate] = useState("");
  const [observations, setObservations] = useState("");

  const fetchExpenses = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("tool_expenses" as any)
      .select("*")
      .eq("tenant_id", agencyId)
      .order("due_date", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar gastos");
    } else {
      setExpenses((data as any[]) || []);
    }
    setLoading(false);
  }, [agencyId]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const resetForm = () => {
    setName(""); setDueDate(""); setCardUsed(""); setAmount("");
    setSubscriptionDate(""); setObservations("");
  };

  const handleSave = async () => {
    if (!name.trim() || !dueDate || !amount) {
      toast.error("Preencha Nome, Data de Vencimento e Valor");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tool_expenses" as any).insert({
      tenant_id: agencyId,
      name: name.trim(),
      due_date: dueDate,
      card_used: cardUsed.trim() || null,
      amount: parseFloat(amount.replace(",", ".")),
      subscription_date: subscriptionDate || null,
      observations: observations.trim() || null,
      created_by: user?.id,
    } as any);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar gasto");
    } else {
      toast.success("Gasto cadastrado com sucesso!");
      setModalOpen(false);
      resetForm();
      fetchExpenses();
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const renderCell = (expense: ToolExpense, key: keyof ToolExpense) => {
    switch (key) {
      case "due_date": return formatDate(expense.due_date);
      case "subscription_date": return formatDate(expense.subscription_date);
      case "amount": return formatCurrency(expense.amount);
      case "card_used": return expense.card_used || "—";
      case "observations": return expense.observations || "—";
      case "name": return expense.name;
      default: return String(expense[key] ?? "—");
    }
  };

  // Drag & drop column reorder
  const handleDragStart = (idx: number) => setDraggedIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    const newCols = [...columns];
    const [moved] = newCols.splice(draggedIdx, 1);
    newCols.splice(idx, 0, moved);
    setColumns(newCols);
    setDraggedIdx(idx);
  };
  const handleDragEnd = () => {
    setDraggedIdx(null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  };

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <PageHeader
          title="Controle de Gasto de Ferramentas"
          subtitle="Gerencie os gastos com ferramentas e assinaturas"
          backTo="/financeiro"
          actions={[
            {
              label: "Novo Cadastro",
              onClick: () => setModalOpen(true),
              icon: <Plus className="w-4 h-4" />,
            },
          ]}
        />

        <Card className="mt-6 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              Nenhum gasto cadastrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {columns.map((col, idx) => (
                      <TableHead
                        key={col.key}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className="cursor-grab select-none text-xs uppercase tracking-wider font-bold whitespace-nowrap"
                      >
                        <span className="inline-flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-muted-foreground/50" />
                          {col.label}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      {columns.map((col) => (
                        <TableCell key={col.key} className="whitespace-nowrap">
                          {renderCell(expense, col.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Gasto de Ferramenta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: ChatGPT Plus" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data Vencimento *</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cartão Utilizado</Label>
                <Input value={cardUsed} onChange={(e) => setCardUsed(e.target.value)} placeholder="Final 1234" />
              </div>
              <div>
                <Label>Data da Assinatura</Label>
                <Input type="date" value={subscriptionDate} onChange={(e) => setSubscriptionDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Observações..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
