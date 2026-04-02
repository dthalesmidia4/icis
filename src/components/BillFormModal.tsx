import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Paperclip, X, Loader2, Check, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface BillData {
  id: string;
  name: string;
  due_date: string;
  observations: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  amount: number | null;
  payment_method: string | null;
  paid_at: string | null;
  is_recurring?: boolean;
  recurrence_months?: number | null;
  parent_bill_id?: string | null;
}

interface BillFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  bill?: BillData | null;
}

const PAYMENT_METHODS = [
  "Pix",
  "Boleto",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência",
  "Dinheiro",
];

const RECURRENCE_OPTIONS = [
  { value: "2", label: "2 meses" },
  { value: "3", label: "3 meses" },
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
  { value: "24", label: "24 meses" },
];

function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyBR(formatted: string): number | null {
  if (!formatted) return null;
  // Remove dots (thousands) and replace comma with dot (decimal)
  const cleaned = formatted.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function maskCurrency(raw: string): string {
  // Keep only digits
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  const value = cents / 100;
  return formatCurrencyBR(value);
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  // Handle month overflow (e.g. Jan 31 + 1 month = Feb 28)
  if (date.getDate() !== d) {
    date.setDate(0); // last day of previous month
  }
  return date.toISOString().slice(0, 10);
}

export default function BillFormModal({ open, onOpenChange, onSuccess, bill }: BillFormModalProps) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [observations, setObservations] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<{ url: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceMonths, setRecurrenceMonths] = useState("12");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { agencyId } = useAgency();
  const { user } = useAuth();

  const isEditing = !!bill?.id;
  const isChildRecurring = !!bill?.parent_bill_id;

  useEffect(() => {
    if (open && bill) {
      setName(bill.name);
      setDueDate(bill.due_date);
      setObservations(bill.observations || "");
      setAmount(bill.amount != null ? formatCurrencyBR(bill.amount) : "");
      setPaymentMethod(bill.payment_method || "");
      setIsRecurring(bill.is_recurring || false);
      setRecurrenceMonths(bill.recurrence_months ? String(bill.recurrence_months) : "12");
      setFile(null);
      if (bill.attachment_url) {
        setExistingAttachment({ url: bill.attachment_url, name: bill.attachment_name || "Anexo" });
      } else {
        setExistingAttachment(null);
      }
    } else if (open && !bill) {
      resetForm();
    }
  }, [open, bill]);

  const resetForm = () => {
    setName("");
    setDueDate("");
    setObservations("");
    setAmount("");
    setPaymentMethod("");
    setFile(null);
    setExistingAttachment(null);
    setIsRecurring(false);
    setRecurrenceMonths("12");
  };

  const handleSave = async () => {
    if (!name.trim() || !dueDate || !agencyId) {
      toast.error("Preencha o nome e a data de vencimento.");
      return;
    }

    setSaving(true);
    try {
      let attachmentUrl: string | null = existingAttachment?.url || null;
      let attachmentName: string | null = existingAttachment?.name || null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${agencyId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("bill-attachments")
          .upload(path, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("bill-attachments")
          .getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
        attachmentName = file.name;
      }

      const payload: Record<string, any> = {
        name: name.trim(),
        due_date: dueDate,
        observations: observations.trim() || null,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        amount: amount ? parseFloat(amount) : null,
        payment_method: paymentMethod || null,
        is_recurring: isRecurring,
        recurrence_months: isRecurring ? parseInt(recurrenceMonths) : null,
      };

      if (isEditing && bill) {
        const { error } = await supabase
          .from("bills_payable")
          .update(payload)
          .eq("id", bill.id);
        if (error) throw error;
        toast.success("Conta atualizada com sucesso!");
      } else {
        // Insert the main bill
        const { data: inserted, error } = await supabase.from("bills_payable").insert({
          ...payload,
          tenant_id: agencyId!,
          created_by: user?.id,
        } as any).select("id").single();
        if (error) throw error;

        // If recurring, create future copies
        if (isRecurring && inserted) {
          const months = parseInt(recurrenceMonths);
          const futureBills = [];
          for (let i = 1; i < months; i++) {
            futureBills.push({
              name: name.trim(),
              due_date: addMonths(dueDate, i),
              observations: observations.trim() || null,
              attachment_url: attachmentUrl,
              attachment_name: attachmentName,
              amount: amount ? parseFloat(amount) : null,
              payment_method: paymentMethod || null,
              is_recurring: true,
              recurrence_months: months,
              parent_bill_id: (inserted as any).id,
              tenant_id: agencyId,
              created_by: user?.id,
            });
          }
          if (futureBills.length > 0) {
            const { error: recError } = await supabase
              .from("bills_payable")
              .insert(futureBills as any);
            if (recError) throw recError;
          }
        }

        toast.success(
          isRecurring
            ? `Conta cadastrada com ${parseInt(recurrenceMonths)} lançamentos!`
            : "Conta cadastrada com sucesso!"
        );
      }

      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!bill) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bills_payable")
        .update({ paid_at: new Date().toISOString() })
        .eq("id", bill.id);
      if (error) throw error;
      toast.success("Conta marcada como paga!");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error("Erro ao marcar como paga: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAttachment = () => {
    setFile(null);
    setExistingAttachment(null);
  };

  const hasAttachment = file || existingAttachment;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Conta" : "Nova Conta a Pagar"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="bill-due-date">Data de Vencimento *</Label>
            <Input
              id="bill-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bill-name">Nome *</Label>
            <Input
              id="bill-name"
              placeholder="Ex: Aluguel, Licença Canva..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bill-amount">Valor (R$)</Label>
            <Input
              id="bill-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bill-obs">Observação</Label>
            <Textarea
              id="bill-obs"
              placeholder="Observações sobre a conta..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
            />
          </div>

          {/* Recurrence section - only for new bills or editing the parent */}
          {!isChildRecurring && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="bill-recurring" className="cursor-pointer font-medium">
                    Conta recorrente mensal
                  </Label>
                </div>
                <Switch
                  id="bill-recurring"
                  checked={isRecurring}
                  onCheckedChange={setIsRecurring}
                />
              </div>
              {isRecurring && (
                <div className="space-y-2">
                  <Label>Duração da recorrência</Label>
                  <Select value={recurrenceMonths} onValueChange={setRecurrenceMonths}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {isEditing
                      ? "A duração será atualizada nesta conta."
                      : `Serão criados ${recurrenceMonths} lançamentos a partir de ${dueDate || "a data informada"}.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {isChildRecurring && (
            <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Esta conta foi gerada automaticamente por uma recorrência.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Anexo</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setExistingAttachment(null);
              }}
            />
            {hasAttachment ? (
              <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">
                  {file ? file.name : existingAttachment?.name}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRemoveAttachment}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 mr-2" />
                Anexar documento
              </Button>
            )}
          </div>
        </div>
        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          {isEditing && !bill?.paid_at && (
            <Button
              variant="secondary"
              onClick={handleMarkPaid}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Pago
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Atualizar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
