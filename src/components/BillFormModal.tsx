import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, X, Loader2, Check } from "lucide-react";
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

export default function BillFormModal({ open, onOpenChange, onSuccess, bill }: BillFormModalProps) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [observations, setObservations] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<{ url: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { agencyId } = useAgency();
  const { user } = useAuth();

  const isEditing = !!bill;

  useEffect(() => {
    if (open && bill) {
      setName(bill.name);
      setDueDate(bill.due_date);
      setObservations(bill.observations || "");
      setAmount(bill.amount != null ? String(bill.amount) : "");
      setPaymentMethod(bill.payment_method || "");
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
      };

      if (isEditing && bill) {
        const { error } = await supabase
          .from("bills_payable" as any)
          .update(payload as any)
          .eq("id", bill.id);
        if (error) throw error;
        toast.success("Conta atualizada com sucesso!");
      } else {
        const { error } = await supabase.from("bills_payable" as any).insert({
          ...payload,
          tenant_id: agencyId,
          created_by: user?.id,
        } as any);
        if (error) throw error;
        toast.success("Conta cadastrada com sucesso!");
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
        .from("bills_payable" as any)
        .update({ paid_at: new Date().toISOString() } as any)
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
        <div className="space-y-4 pt-2">
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
