import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface NewBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function NewBillModal({ open, onOpenChange, onSuccess }: NewBillModalProps) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [observations, setObservations] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { agencyId } = useAgency();
  const { user } = useAuth();

  const resetForm = () => {
    setName("");
    setDueDate("");
    setObservations("");
    setFile(null);
  };

  const handleSave = async () => {
    if (!name.trim() || !dueDate || !agencyId) {
      toast.error("Preencha o nome e a data de vencimento.");
      return;
    }

    setSaving(true);
    try {
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;

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

      const { error } = await supabase.from("bills_payable" as any).insert({
        tenant_id: agencyId,
        name: name.trim(),
        due_date: dueDate,
        observations: observations.trim() || null,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        created_by: user?.id,
      } as any);

      if (error) throw error;

      toast.success("Conta cadastrada com sucesso!");
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Conta a Pagar</DialogTitle>
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
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}>
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
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
