import { useState, useEffect } from "react";
import BackButton from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Paperclip, Download, Eye, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";
import BillFormModal, { type BillData } from "@/components/BillFormModal";

export default function BillsList() {
  const [bills, setBills] = useState<BillData[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<BillData | null>(null);
  const { agencyId } = useAgency();

  const fetchBills = async () => {
    if (!agencyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bills_payable" as any)
      .select("*")
      .eq("tenant_id", agencyId)
      .order("due_date", { ascending: true });

    if (!error && data) {
      setBills(data as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBills();
  }, [agencyId]);

  const handlePreview = (e: React.MouseEvent, url: string, name: string) => {
    e.stopPropagation();
    setPreviewUrl(url);
    setPreviewName(name);
    setPreviewOpen(true);
  };

  const handleRowClick = (bill: BillData) => {
    setEditingBill(bill);
    setFormOpen(true);
  };

  const handleNewBill = () => {
    setEditingBill(null);
    setFormOpen(true);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value == null) return "—";
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <div className="pb-8">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BackButton to="/financeiro" />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Contas a Pagar</h1>
                <p className="text-sm text-muted-foreground">
                  Todas as contas cadastradas
                </p>
              </div>
            </div>
            <Button onClick={handleNewBill} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nova Conta
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Nenhuma conta cadastrada</p>
              <p className="text-sm">Cadastre sua primeira conta a pagar.</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Vencimento</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Nome</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Valor</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Forma Pgto</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Observação</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider text-center">Anexo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow
                      key={bill.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => handleRowClick(bill)}
                    >
                      <TableCell className="whitespace-nowrap">{formatDate(bill.due_date)}</TableCell>
                      <TableCell>{bill.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(bill.amount)}</TableCell>
                      <TableCell>{bill.payment_method || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {bill.observations || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {bill.attachment_url ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Visualizar"
                              onClick={(e) => handlePreview(e, bill.attachment_url!, bill.attachment_name || "Anexo")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <a
                              href={bill.attachment_url}
                              download={bill.attachment_name || "anexo"}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Baixar">
                                <Download className="h-4 w-4" />
                              </Button>
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <AttachmentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fileUrl={previewUrl}
        fileName={previewName}
      />

      <BillFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchBills}
        bill={editingBill}
      />
    </div>
  );
}
