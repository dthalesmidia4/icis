import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";

interface CreateColumnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  onSuccess: () => void;
  existingPositions: number[];
}

const CreateColumnModal = ({
  open,
  onOpenChange,
  pipelineId,
  onSuccess,
  existingPositions,
}: CreateColumnModalProps) => {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState("#8b5cf6");
  const [loading, setLoading] = useState(false);
  const [producaoStatusId, setProducaoStatusId] = useState<string | null>(null);
  const [showDoneWarning, setShowDoneWarning] = useState(false);

  const DONE_NAMES = ["feito", "feitos"];
  const isDoneName = (n: string) => DONE_NAMES.includes(n.toLowerCase().trim());

  // Fetch Produção status ID when modal opens
  useEffect(() => {
    if (open && pipelineId) {
      supabase
        .from("pipeline_statuses")
        .select("id")
        .eq("pipeline_id", pipelineId)
        .eq("name", "Produção")
        .maybeSingle()
        .then(({ data }) => {
          setProducaoStatusId(data?.id || null);
        });
    }
  }, [open, pipelineId]);

  const doCreate = async () => {
    setLoading(true);
    try {
      const maxPosition = existingPositions.length > 0 
        ? Math.max(...existingPositions) 
        : 0;
      const newPosition = maxPosition + 1;

      const { error } = await supabase
        .from("pipeline_statuses")
        .insert({
          pipeline_id: pipelineId,
          name: name.trim(),
          color: selectedColor,
          position: newPosition,
          is_initial: false,
          is_final: false,
          requires_fields: [],
          is_fixed: false,
          parent_status_id: producaoStatusId,
        });

      if (error) throw error;

      toast.success(`Coluna "${name}" criada com sucesso!`);
      setName("");
      setSelectedColor("#8b5cf6");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error creating column:", error);
      toast.error("Erro ao criar coluna");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Digite um nome para a coluna");
      return;
    }

    if (!pipelineId) {
      toast.error("Pipeline não encontrado");
      return;
    }

    if (isDoneName(name.trim())) {
      setShowDoneWarning(true);
      return;
    }

    await doCreate();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Criar Nova Coluna</DialogTitle>
          <DialogDescription>
            Adicione uma nova coluna ao seu Kanban. Você poderá mover cards entre as colunas.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="column-name">Nome da Coluna</Label>
            <Input
              id="column-name"
              placeholder="Ex: Em Aprovação"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Cor da Coluna</Label>
            <ColorPicker
              value={selectedColor}
              onChange={setSelectedColor}
            />
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Coluna
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showDoneWarning} onOpenChange={setShowDoneWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Coluna de demandas completas</AlertDialogTitle>
          <AlertDialogDescription>
            Esta coluna não vai aparecer no Kanban. Os cards movidos para ela serão exibidos na página <strong>"Demandas Completas"</strong> na tela inicial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => { setShowDoneWarning(false); doCreate(); }}>
            Entendi, criar coluna
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default CreateColumnModal;
