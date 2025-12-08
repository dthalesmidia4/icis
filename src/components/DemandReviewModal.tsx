import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Plus, Trash2, RefreshCw, Shield, Rocket, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

interface DemandItem {
  titulo: string;
  descricao?: string;
  tipo_conteudo?: string;
  canal: string;
  data_sugerida?: string;
  tipo?: string;
  objetivo?: string;
  conteudo?: string;
}

interface DemandReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'normal' | 'ultra';
  demands: DemandItem[];
  onConfirm: (selectedDemands: DemandItem[]) => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export const DemandReviewModal = ({
  open,
  onOpenChange,
  mode,
  demands,
  onConfirm,
  onRegenerate,
  isRegenerating = false
}: DemandReviewModalProps) => {
  // Track selected demands by index
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(() => 
    new Set(demands.map((_, idx) => idx))
  );
  
  // Track removed demands
  const [removedIndexes, setRemovedIndexes] = useState<Set<number>>(new Set());

  // Reset state when modal opens with new demands
  useMemo(() => {
    if (open) {
      setSelectedIndexes(new Set(demands.map((_, idx) => idx)));
      setRemovedIndexes(new Set());
    }
  }, [open, demands]);

  const visibleDemands = demands.filter((_, idx) => !removedIndexes.has(idx));
  const selectedCount = [...selectedIndexes].filter(idx => !removedIndexes.has(idx)).length;
  const totalVisible = visibleDemands.length;

  const handleToggleSelect = (originalIndex: number) => {
    const newSelected = new Set(selectedIndexes);
    if (newSelected.has(originalIndex)) {
      newSelected.delete(originalIndex);
    } else {
      newSelected.add(originalIndex);
    }
    setSelectedIndexes(newSelected);
  };

  const handleRemove = (originalIndex: number) => {
    const newRemoved = new Set(removedIndexes);
    newRemoved.add(originalIndex);
    setRemovedIndexes(newRemoved);
    
    // Also remove from selected
    const newSelected = new Set(selectedIndexes);
    newSelected.delete(originalIndex);
    setSelectedIndexes(newSelected);
  };

  const handleConfirm = () => {
    const selectedDemands = demands.filter((_, idx) => 
      selectedIndexes.has(idx) && !removedIndexes.has(idx)
    );
    onConfirm(selectedDemands);
  };

  const isNormal = mode === 'normal';
  const gradientClass = isNormal 
    ? 'from-blue-400 to-cyan-500' 
    : 'from-pink-400 to-purple-500';
  const accentColor = isNormal ? 'blue' : 'pink';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br",
              gradientClass
            )}>
              {isNormal ? <Shield className="w-6 h-6 text-white" /> : <Rocket className="w-6 h-6 text-white" />}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">
                Revisar Demandas - Modo {isNormal ? 'Normal' : 'Ultra'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Selecione as demandas que deseja incluir no seu planejamento
              </DialogDescription>
            </div>
            <Badge 
              variant="secondary" 
              className={cn(
                "text-sm px-3 py-1",
                isNormal 
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
              )}
            >
              {selectedCount} de {totalVisible} selecionadas
            </Badge>
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-3">
            {demands.map((demand, originalIndex) => {
              if (removedIndexes.has(originalIndex)) return null;
              
              const isSelected = selectedIndexes.has(originalIndex);
              const tipo = demand.tipo || demand.tipo_conteudo || '';
              
              return (
                <Card 
                  key={originalIndex}
                  className={cn(
                    "p-4 transition-all duration-200",
                    isSelected 
                      ? `border-${accentColor}-500/50 bg-${accentColor}-50/30 dark:bg-${accentColor}-900/10`
                      : "border-border/50 opacity-60"
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Selection indicator */}
                    <div 
                      onClick={() => handleToggleSelect(originalIndex)}
                      className={cn(
                        "w-8 h-8 rounded-full shrink-0 flex items-center justify-center cursor-pointer transition-all",
                        isSelected 
                          ? `bg-gradient-to-br ${gradientClass} text-white`
                          : "border-2 border-muted-foreground/30 hover:border-muted-foreground/50"
                      )}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-base line-clamp-2">
                          {demand.titulo}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {tipo && (
                            <Badge variant="outline" className="text-xs">
                              {tipo}
                            </Badge>
                          )}
                          <Badge 
                            variant="secondary" 
                            className={cn(
                              "text-xs",
                              isNormal 
                                ? "bg-blue-100/50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                : "bg-pink-100/50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400"
                            )}
                          >
                            {demand.canal}
                          </Badge>
                        </div>
                      </div>

                      {demand.objetivo && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {demand.objetivo}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant={isSelected ? "secondary" : "default"}
                        className={cn(
                          "h-8 text-xs gap-1.5",
                          isSelected && "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300"
                        )}
                        onClick={() => handleToggleSelect(originalIndex)}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Adicionado
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar
                          </>
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemove(originalIndex)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}

            {totalVisible === 0 && (
              <div className="text-center py-12">
                <LayoutGrid className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Nenhuma demanda disponível</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={onRegenerate}
                  disabled={isRegenerating}
                >
                  <RefreshCw className={cn("w-4 h-4 mr-2", isRegenerating && "animate-spin")} />
                  Gerar Novamente
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-6 pt-4 border-t shrink-0 bg-muted/30">
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
              Gerar Novamente
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4 mr-2" />
                Fechar
              </Button>
              
              {selectedCount > 0 && (
                <Button
                  onClick={handleConfirm}
                  className={cn(
                    "gap-2",
                    !isNormal && "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                  )}
                >
                  <Check className="w-4 h-4" />
                  Confirmar Planejamento ({selectedCount})
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
