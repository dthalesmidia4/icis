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
  const [checkingCards, setCheckingCards] = useState(false);

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

  const handleDeleteClick = async (column: PipelineStatus) => {
    setColumnToDelete(column);
    setCheckingCards(true);

    try {
      // Check if there are cards in this column
      const { count, error } = await supabase
        .from("demands")
        .select("id", { count: "exact", head: true })
        .eq("status_id", column.id);

      if (error) throw error;

      setCardCount(count || 0);
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

    // If there are cards, don't allow deletion
    if (cardCount > 0) {
      toast.error("Mova os cards para outra coluna antes de excluir");
      setDeleteConfirmOpen(false);
      setColumnToDelete(null);
      return;
    }

    setLoading(true);
    try {
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
    }
  };

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

                              <span className="flex-1 font-medium text-sm text-foreground">
                                {column.name}
                              </span>

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
              {cardCount > 0 && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {cardCount > 0 ? "Não é possível excluir" : "Excluir coluna"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cardCount > 0 ? (
                <>
                  A coluna <strong>"{columnToDelete?.name}"</strong> possui{" "}
                  <strong>{cardCount} {cardCount === 1 ? "card" : "cards"}</strong>.
                  <br />
                  <br />
                  Mova os cards para outra coluna antes de excluir esta.
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir a coluna{" "}
                  <strong>"{columnToDelete?.name}"</strong>?
                  <br />
                  <br />
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {cardCount === 0 && (
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ManageColumnsModal;
