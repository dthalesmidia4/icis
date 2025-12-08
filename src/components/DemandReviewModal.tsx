import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Plus, Trash2, RefreshCw, Shield, Rocket, LayoutGrid, Sparkles, Lightbulb } from "lucide-react";
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
  smartSuggestions?: DemandItem[];
  onConfirm: (selectedDemands: DemandItem[], smartSelections: DemandItem[]) => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export const DemandReviewModal = ({
  open,
  onOpenChange,
  mode,
  demands,
  smartSuggestions = [],
  onConfirm,
  onRegenerate,
  isRegenerating = false
}: DemandReviewModalProps) => {
  const [activeTab, setActiveTab] = useState<'demands' | 'smart'>('demands');
  
  // Track selected demands by index
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(() => 
    new Set(demands.map((_, idx) => idx))
  );
  
  // Track removed demands
  const [removedIndexes, setRemovedIndexes] = useState<Set<number>>(new Set());

  // Track selected smart suggestions
  const [selectedSmartIndexes, setSelectedSmartIndexes] = useState<Set<number>>(new Set());
  const [removedSmartIndexes, setRemovedSmartIndexes] = useState<Set<number>>(new Set());

  // Reset state when modal opens with new demands
  useMemo(() => {
    if (open) {
      setSelectedIndexes(new Set(demands.map((_, idx) => idx)));
      setRemovedIndexes(new Set());
      setSelectedSmartIndexes(new Set());
      setRemovedSmartIndexes(new Set());
      setActiveTab('demands');
    }
  }, [open, demands]);

  const visibleDemands = demands.filter((_, idx) => !removedIndexes.has(idx));
  const selectedCount = [...selectedIndexes].filter(idx => !removedIndexes.has(idx)).length;
  const totalVisible = visibleDemands.length;

  const visibleSmartSuggestions = smartSuggestions.filter((_, idx) => !removedSmartIndexes.has(idx));
  const selectedSmartCount = [...selectedSmartIndexes].filter(idx => !removedSmartIndexes.has(idx)).length;
  const totalSmartVisible = visibleSmartSuggestions.length;

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
    
    const newSelected = new Set(selectedIndexes);
    newSelected.delete(originalIndex);
    setSelectedIndexes(newSelected);
  };

  const handleToggleSmartSelect = (originalIndex: number) => {
    const newSelected = new Set(selectedSmartIndexes);
    if (newSelected.has(originalIndex)) {
      newSelected.delete(originalIndex);
    } else {
      newSelected.add(originalIndex);
    }
    setSelectedSmartIndexes(newSelected);
  };

  const handleRemoveSmart = (originalIndex: number) => {
    const newRemoved = new Set(removedSmartIndexes);
    newRemoved.add(originalIndex);
    setRemovedSmartIndexes(newRemoved);
    
    const newSelected = new Set(selectedSmartIndexes);
    newSelected.delete(originalIndex);
    setSelectedSmartIndexes(newSelected);
  };

  const handleConfirm = () => {
    const selectedDemands = demands.filter((_, idx) => 
      selectedIndexes.has(idx) && !removedIndexes.has(idx)
    );
    const smartSelections = smartSuggestions.filter((_, idx) =>
      selectedSmartIndexes.has(idx) && !removedSmartIndexes.has(idx)
    );
    onConfirm(selectedDemands, smartSelections);
  };

  const isNormal = mode === 'normal';
  const gradientClass = isNormal 
    ? 'from-blue-400 to-cyan-500' 
    : 'from-pink-400 to-purple-500';
  const smartGradientClass = isNormal
    ? 'from-pink-400 to-purple-500'
    : 'from-blue-400 to-cyan-500';
  const accentColor = isNormal ? 'blue' : 'pink';
  const smartAccentColor = isNormal ? 'pink' : 'blue';

  const totalSelected = selectedCount + selectedSmartCount;

  const renderDemandCard = (
    demand: DemandItem, 
    originalIndex: number, 
    isSelected: boolean,
    onToggle: (idx: number) => void,
    onRemove: (idx: number) => void,
    isSmart: boolean = false
  ) => {
    const tipo = demand.tipo || demand.tipo_conteudo || '';
    const currentGradient = isSmart ? smartGradientClass : gradientClass;
    const currentAccent = isSmart ? smartAccentColor : accentColor;
    
    return (
      <Card 
        key={`${isSmart ? 'smart' : 'main'}-${originalIndex}`}
        className={cn(
          "p-4 transition-all duration-200",
          isSelected 
            ? `border-${currentAccent}-500/50 bg-${currentAccent}-50/30 dark:bg-${currentAccent}-900/10`
            : "border-border/50 opacity-60"
        )}
      >
        <div className="flex items-start gap-4">
          {/* Selection indicator */}
          <div 
            onClick={() => onToggle(originalIndex)}
            className={cn(
              "w-8 h-8 rounded-full shrink-0 flex items-center justify-center cursor-pointer transition-all",
              isSelected 
                ? `bg-gradient-to-br ${currentGradient} text-white`
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
                {isSmart && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs gap-1",
                      isNormal 
                        ? "border-pink-300 text-pink-600 dark:border-pink-700 dark:text-pink-400"
                        : "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                    )}
                  >
                    <Sparkles className="w-3 h-3" />
                    {isNormal ? 'Ultra' : 'Normal'}
                  </Badge>
                )}
                {tipo && (
                  <Badge variant="outline" className="text-xs">
                    {tipo}
                  </Badge>
                )}
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs",
                    isSmart
                      ? (isNormal 
                          ? "bg-pink-100/50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400"
                          : "bg-blue-100/50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400")
                      : (isNormal 
                          ? "bg-blue-100/50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                          : "bg-pink-100/50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400")
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
              onClick={() => onToggle(originalIndex)}
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
              onClick={() => onRemove(originalIndex)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  };

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
                Selecione as demandas e sugestões inteligentes para seu planejamento
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
              {totalSelected} selecionadas
            </Badge>
          </div>
        </DialogHeader>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'demands' | 'smart')} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 shrink-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="demands" className="gap-2">
                {isNormal ? <Shield className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
                Demandas do Plano
                <Badge variant="outline" className="ml-1 text-xs">{selectedCount}/{totalVisible}</Badge>
              </TabsTrigger>
              <TabsTrigger value="smart" className="gap-2">
                <Lightbulb className="w-4 h-4" />
                Pacote Inteligente
                {selectedSmartCount > 0 && (
                  <Badge className={cn(
                    "ml-1 text-xs",
                    isNormal 
                      ? "bg-pink-500 text-white"
                      : "bg-blue-500 text-white"
                  )}>
                    +{selectedSmartCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="demands" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-[calc(90vh-280px)]">
              <div className="p-6 space-y-3">
                {demands.map((demand, originalIndex) => {
                  if (removedIndexes.has(originalIndex)) return null;
                  const isSelected = selectedIndexes.has(originalIndex);
                  return renderDemandCard(
                    demand, 
                    originalIndex, 
                    isSelected,
                    handleToggleSelect,
                    handleRemove,
                    false
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
          </TabsContent>

          <TabsContent value="smart" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-[calc(90vh-280px)]">
              <div className="p-6">
                {/* Smart package header */}
                <Card className={cn(
                  "p-4 mb-4 border-dashed",
                  isNormal 
                    ? "border-pink-300 bg-pink-50/30 dark:border-pink-800 dark:bg-pink-900/10"
                    : "border-blue-300 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-900/10"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br",
                      smartGradientClass
                    )}>
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm">
                        Sugestões do Modo {isNormal ? 'Ultra' : 'Normal'}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isNormal 
                          ? "Ideias criativas e ousadas que podem complementar seu planejamento"
                          : "Sugestões mais tradicionais e seguras para equilibrar seu plano"}
                      </p>
                    </div>
                    {totalSmartVisible > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {selectedSmartCount} de {totalSmartVisible}
                      </Badge>
                    )}
                  </div>
                </Card>

                <div className="space-y-3">
                  {smartSuggestions.map((demand, originalIndex) => {
                    if (removedSmartIndexes.has(originalIndex)) return null;
                    const isSelected = selectedSmartIndexes.has(originalIndex);
                    return renderDemandCard(
                      demand, 
                      originalIndex, 
                      isSelected,
                      handleToggleSmartSelect,
                      handleRemoveSmart,
                      true
                    );
                  })}

                  {totalSmartVisible === 0 && (
                    <div className="text-center py-12">
                      <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">
                        Nenhuma sugestão inteligente disponível
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        As sugestões são baseadas no plano alternativo ({isNormal ? 'Ultra' : 'Normal'})
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

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
              
              {totalSelected > 0 && (
                <Button
                  onClick={handleConfirm}
                  className={cn(
                    "gap-2",
                    !isNormal && "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                  )}
                >
                  <Check className="w-4 h-4" />
                  Confirmar Planejamento ({totalSelected})
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};