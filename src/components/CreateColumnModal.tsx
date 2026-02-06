import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CreateColumnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  onSuccess: () => void;
  existingPositions: number[];
}

const PRESET_COLORS = [
  { name: "Roxo", value: "#8b5cf6" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Ciano", value: "#06b6d4" },
  { name: "Verde", value: "#22c55e" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Laranja", value: "#f97316" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Rosa", value: "#ec4899" },
];

const CreateColumnModal = ({
  open,
  onOpenChange,
  pipelineId,
  onSuccess,
  existingPositions,
}: CreateColumnModalProps) => {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].value);
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    try {
      // Calcular próxima posição
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
        });

      if (error) throw error;

      toast.success(`Coluna "${name}" criada com sucesso!`);
      setName("");
      setSelectedColor(PRESET_COLORS[0].value);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error creating column:", error);
      toast.error("Erro ao criar coluna");
    } finally {
      setLoading(false);
    }
  };

  return (
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
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color.value)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    selectedColor === color.value
                      ? "ring-2 ring-offset-2 ring-primary scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
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
  );
};

export default CreateColumnModal;
