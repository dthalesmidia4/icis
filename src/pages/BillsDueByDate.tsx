import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, Eye, Loader2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";

interface Bill {
  id: string;
  name: string;
  due_date: string;
  observations: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
}

export default function BillsDueByDate() {
  const [searchParams] = useSearchParams();
  const offset = Number(searchParams.get("offset") ?? "0"); // 0 = today, 1 = tomorrow
  const targetDate = addDays(new Date(), offset);
  const targetDateStr = format(targetDate, "yyyy-MM-dd");
  const targetDateDisplay = format(targetDate, "dd/MM/yyyy", { locale: ptBR });

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");
  const { agencyId } = useAgency();

  const title = offset === 0
    ? `Contas que vencem hoje — ${targetDateDisplay}`
    : `Contas que vencem amanhã — ${targetDateDisplay}`;

  useEffect(() => {
    if (!agencyId) return;
    setLoading(true);
    supabase
      .from("bills_payable" as any)
      .select("*")
      .eq("tenant_id", agencyId)
      .eq("due_date", targetDateStr)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setBills(data as any);
        setLoading(false);
      });
  }, [agencyId, targetDateStr]);

  const handlePreview = (url: string, name: string) => {
    setPreviewUrl(url);
    setPreviewName(name);
    setPreviewOpen(true);
  };

  return (
    <div className="pb-8">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <BackButton to="/financeiro" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
              <p className="text-sm text-muted-foreground">
                Contas cadastradas com vencimento em {targetDateDisplay}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Nenhuma conta vence {offset === 0 ? "hoje" : "amanhã"}</p>
              <p className="text-sm">Sem contas com vencimento em {targetDateDisplay}.</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Vencimento</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Nome</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider">Observação</TableHead>
                    <TableHead className="font-bold text-foreground uppercase text-xs tracking-wider text-center">Anexo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="whitespace-nowrap">{targetDateDisplay}</TableCell>
                      <TableCell>{bill.name}</TableCell>
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
                              onClick={() => handlePreview(bill.attachment_url!, bill.attachment_name || "Anexo")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <a href={bill.attachment_url} download={bill.attachment_name || "anexo"} target="_blank" rel="noopener noreferrer">
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
    </div>
  );
}
