import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, GripVertical, Trash2, AlertTriangle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPortal } from "react-dom";

// Custom portal for draggable items to render correctly inside modal
const DraggablePortal = ({ children }: { children: React.ReactNode }) => {
  const element = document.body;
  return createPortal(children, element);
};

interface PipelineStatus {
  id: string;
  name: string;
  color: string;
  position: number;
  pipeline_id: string;
  is_fixed?: boolean;
  parent_status_id?: string | null;
}

interface ManageColumnsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: PipelineStatus[];
  pipelineId: string;
  onSuccess: () => void;
}

const ManageColumnsModal = ({
  open,
  onOpenChange,
  columns: initialColumns,
  pipelineId,
  onSuccess,
}: ManageColumnsModalProps) => {
  const [columns, setColumns] = useState<PipelineStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<PipelineStatus | null>(null);
  const [cardCount, setCardCount] = useState<number>(0);
  const [activeCardCount, setActiveCardCount] = useState<number>(0);
  const [checkingCards, setCheckingCards] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [moveToColumnId, setMoveToColumnId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setColumns([...initialColumns].sort((a, b) => a.position - b.position));
    }
  }, [open, initialColumns]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    if (sourceIndex === destIndex) return;

    // Reorder locally
    const newColumns = [...columns];
    const [removed] = newColumns.splice(sourceIndex, 1);
    newColumns.splice(destIndex, 0, removed);

    // Update positions
    const updatedColumns = newColumns.map((col, index) => ({
      ...col,
      position: index + 1,
    }));

    setColumns(updatedColumns);

    // Save to database
    setLoading(true);
    try {
      const updates = updatedColumns.map((col) => ({
        id: col.id,
        pipeline_id: col.pipeline_id,
        name: col.name,
        color: col.color,
        position: col.position,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("pipeline_statuses")
          .update({ position: update.position })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast.success("Ordem das colunas atualizada");
      onSuccess();
    } catch (error) {
      console.error("Error reordering columns:", error);
      toast.error("Erro ao reordenar colunas");
      // Revert on error
      setColumns([...initialColumns].sort((a, b) => a.position - b.position));
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditing = (column: PipelineStatus) => {
    setEditingColumnId(column.id);
    setEditingName(column.name);
  };

  const handleSaveName = async (columnId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error("O nome da coluna não pode ser vazio");
      return;
    }
    const original = columns.find((c) => c.id === columnId);
    if (original && original.name === trimmed) {
      setEditingColumnId(null);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("pipeline_statuses")
        .update({ name: trimmed })
        .eq("id", columnId);
      if (error) throw error;
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c))
      );
      toast.success("Nome da coluna atualizado");
      onSuccess();
    } catch (error) {
      console.error("Error renaming column:", error);
      toast.error("Erro ao renomear coluna");
    } finally {
      setLoading(false);
      setEditingColumnId(null);
    }
  };

  const handleDeleteClick = async (column: PipelineStatus) => {
    setColumnToDelete(column);
    setCheckingCards(true);
    setMoveToColumnId("");

    try {
      // Count ALL cards (including archived) in this column, filtered by pipeline
      const { count: totalCount, error: totalError } = await supabase
        .from("demands")
        .select("id", { count: "exact", head: true })
        .eq("status_id", column.id)
        .eq("pipeline_id", column.pipeline_id);

      if (totalError) throw totalError;

      // Count active cards only
      const { count: activeCount, error: activeError } = await supabase
        .from("demands")
        .select("id", { count: "exact", head: true })
        .eq("status_id", column.id)
        .eq("pipeline_id", column.pipeline_id)
        .is("archived_at", null);

      if (activeError) throw activeError;

      setCardCount(totalCount || 0);
      setActiveCardCount(activeCount || 0);
      setDeleteConfirmOpen(true);
    } catch (error) {
      console.error("Error checking cards:", error);
      toast.error("Erro ao verificar cards");
    } finally {
      setCheckingCards(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!columnToDelete) return;

    // If there are cards and no target column selected, block
    if (cardCount > 0 && !moveToColumnId) {
      toast.error("Selecione uma coluna para mover os cards antes de excluir");
      return;
    }

    setLoading(true);
    try {
      // Move cards to the target column first
      if (cardCount > 0 && moveToColumnId) {
        const { error: moveError } = await supabase
          .from("demands")
          .update({ 
            status_id: moveToColumnId,
            updated_at: new Date().toISOString()
          })
          .eq("status_id", columnToDelete.id);

        if (moveError) throw moveError;

        const targetCol = columns.find(c => c.id === moveToColumnId);
        toast.success(`${cardCount} card(s) movido(s) para "${targetCol?.name}"`);
      }

      // Now delete the column
      const { error } = await supabase
        .from("pipeline_statuses")
        .delete()
        .eq("id", columnToDelete.id);

      if (error) throw error;

      toast.success(`Coluna "${columnToDelete.name}" excluída`);
      setColumns((prev) => prev.filter((c) => c.id !== columnToDelete.id));
      onSuccess();
    } catch (error) {
      console.error("Error deleting column:", error);
      toast.error("Erro ao excluir coluna");
    } finally {
      setLoading(false);
      setDeleteConfirmOpen(false);
      setColumnToDelete(null);
      setMoveToColumnId("");
    }
  };

  const availableTargetColumns = columns.filter(c => c.id !== columnToDelete?.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Gerenciar Colunas</DialogTitle>
            <DialogDescription>
              Arraste para reordenar as colunas ou clique no ícone de lixeira para excluir.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {loading && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="columns-list">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {columns.map((column, index) => (
                      <Draggable
                        key={column.id}
                        draggableId={column.id}
                        index={index}
                      >
                        {(provided, snapshot) => {
                          const draggableContent = (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                snapshot.isDragging
                                  ? "shadow-xl border-primary bg-background"
                                  : "bg-muted/50 border-border/50"
                              }`}
                              style={{
                                ...provided.draggableProps.style,
                                zIndex: snapshot.isDragging ? 99999 : undefined,
                              }}
                            >
                              <div
                                {...provided.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing"
                              >
                                <GripVertical className="h-5 w-5 text-muted-foreground" />
                              </div>

                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: column.color }}
                              />

                              {editingColumnId === column.id ? (
                                <Input
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveName(column.id);
                                    if (e.key === "Escape") setEditingColumnId(null);
                                  }}
                                  onBlur={() => handleSaveName(column.id)}
                                  autoFocus
                                  className="flex-1 h-8 text-sm"
                                />
                              ) : (
                                <span
                                  className="flex-1 font-medium text-sm text-foreground flex items-center gap-1.5 group/name cursor-pointer"
                                  onClick={() => handleStartEditing(column)}
                                >
                                  {column.name}
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity" />
                                </span>
                              )}

                              <span className="text-xs text-muted-foreground">
                                #{column.position}
                              </span>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteClick(column)}
                                disabled={loading || checkingCards}
                              >
                                {checkingCards && columnToDelete?.id === column.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          );

                          // Use portal when dragging to ensure visibility above modal
                          if (snapshot.isDragging) {
                            return <DraggablePortal>{draggableContent}</DraggablePortal>;
                          }

                          return draggableContent;
                        }}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {columns.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma coluna encontrada
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {cardCount > 0 && <AlertTriangle className="h-5 w-5 text-amber-500" />}
              {cardCount > 0 ? "Mover cards antes de excluir" : "Excluir coluna"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {cardCount > 0 ? (
                  <div className="space-y-3">
                    <p>
                      A coluna <strong>"{columnToDelete?.name}"</strong> possui{" "}
                      <strong>{cardCount} {cardCount === 1 ? "card" : "cards"}</strong>
                      {activeCardCount !== cardCount && (
                        <span className="text-muted-foreground">
                          {" "}({activeCardCount} {activeCardCount === 1 ? "ativo" : "ativos"}, {cardCount - activeCardCount} {cardCount - activeCardCount === 1 ? "arquivado" : "arquivados"})
                        </span>
                      )}
                      .
                    </p>
                    <p>Selecione uma coluna para mover os cards:</p>
                    <Select value={moveToColumnId} onValueChange={setMoveToColumnId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a coluna destino..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTargetColumns.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: col.color }}
                              />
                              {col.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p>
                    Tem certeza que deseja excluir a coluna{" "}
                    <strong>"{columnToDelete?.name}"</strong>?
                    <br />
                    <br />
                    Esta ação não pode ser desfeita.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {(cardCount === 0 || moveToColumnId) && (
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cardCount > 0 ? "Mover e Excluir" : "Excluir"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ManageColumnsModal;
