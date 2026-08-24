/**
 * Registro do fato do mês (`finance_occurrences`): valor real, câmbio,
 * vencimento, pagamento e comprovante. Só aqui a linha é materializada.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Paperclip, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  FinanceOccurrence,
  MonthRow,
  formatBRL,
  formatDateBR,
  installmentRowLabel,
  KIND_LABELS,
} from "@/lib/financeModel";

const BUCKET = "bill-attachments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MonthRow | null;
  defaultUsdRate: number | null;
  onSave: (row: MonthRow, patch: Partial<FinanceOccurrence>) => Promise<FinanceOccurrence | null>;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function FinanceOccurrenceModal({ open, onOpenChange, row, defaultUsdRate, onSave }: Props) {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paid, setPaid] = useState(false);
  const [observations, setObservations] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setAmount(
      row.currency === "USD"
        ? row.amountOriginal != null ? String(row.amountOriginal) : ""
        : row.amountBrl != null ? String(row.amountBrl) : "",
    );
    setRate(row.exchangeRate != null ? String(row.exchangeRate) : defaultUsdRate != null ? String(defaultUsdRate) : "");
    setDueDate(row.dueDate ?? row.chargeDate ?? "");
    setPaid(row.paid);
    setObservations(row.occurrence?.observations ?? "");
    setAttachmentUrl(row.occurrence?.attachment_url ?? null);
    setAttachmentName(row.occurrence?.attachment_name ?? null);
  }, [open, row, defaultUsdRate]);

  const amountNumber = numberOrNull(amount);
  const rateNumber = numberOrNull(rate) ?? defaultUsdRate;

  const brl = useMemo(() => {
    if (amountNumber == null) return null;
    if (row?.currency === "USD") return rateNumber != null ? Number((amountNumber * rateNumber).toFixed(2)) : null;
    return amountNumber;
  }, [amountNumber, rateNumber, row?.currency]);

  const handleUpload = async (file: File) => {
    if (!row) return;
    setUploading(true);
    const path = `finance/${row.item.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.error("Não foi possível anexar o comprovante");
      return;
    }
    setAttachmentUrl(path);
    setAttachmentName(file.name);
    toast.success("Comprovante anexado");
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    const patch: Partial<FinanceOccurrence> = {
      currency: row.currency,
      amount_original: amountNumber,
      exchange_rate: row.currency === "USD" ? rateNumber : null,
      amount_brl: brl,
      due_date: dueDate || null,
      charge_date: row.chargeDate,
      is_estimated: false,
      observations: observations.trim() || null,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      paid_at: paid ? row.occurrence?.paid_at ?? new Date().toISOString() : null,
      paid_amount_brl: paid ? brl : null,
    };
    const saved = await onSave(row, patch);
    setSaving(false);
    if (saved) {
      toast.success("Lançamento salvo");
      onOpenChange(false);
    }
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.item.name}</DialogTitle>
          <DialogDescription>
            {installmentRowLabel(row) ? `${installmentRowLabel(row)} · ` : ""}
            {KIND_LABELS[row.item.kind]} · vencimento previsto {formatDateBR(row.dueDate ?? row.chargeDate)}
            {row.projected && " · ainda não lançado neste mês"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor real ({row.currency})</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            {row.currency === "USD" ? (
              <div>
                <Label>Câmbio do mês</Label>
                <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
              </div>
            ) : (
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>

          {row.currency === "USD" && (
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <p className="text-sm text-muted-foreground pb-2">
                Em reais: <span className="font-semibold text-foreground">{formatBRL(brl)}</span>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Pago</p>
              <p className="text-xs text-muted-foreground">
                {row.item.card_item_id
                  ? "Esta despesa também é liquidada ao pagar a fatura do cartão."
                  : "Marque quando a saída de caixa acontecer."}
              </p>
            </div>
            <Switch checked={paid} onCheckedChange={setPaid} />
          </div>

          <div>
            <Label>Comprovante</Label>
            {attachmentUrl ? (
              <div className="flex items-center justify-between rounded-lg border p-2 mt-1">
                <span className="flex items-center gap-2 text-sm truncate">
                  <Paperclip className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{attachmentName ?? "Comprovante"}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setAttachmentUrl(null);
                    setAttachmentName(null);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ) : (
              <Input
                type="file"
                className="mt-1"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
            )}
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? "Salvando..." : "Salvar lançamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
