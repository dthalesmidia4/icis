import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, X, Plus, Trash2, RefreshCw, Shield, Rocket, LayoutGrid, Sparkles, Lightbulb, CheckSquare, Square, ChevronDown, ChevronUp } from "lucide-react";
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
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
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
      setExpandedCards(new Set());
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

  const handleSelectAll = () => {
    const newSelected = new Set<number>();
    demands.forEach((_, idx) => {
      if (!removedIndexes.has(idx)) {
        newSelected.add(idx);
      }
    });
    setSelectedIndexes(newSelected);
  };

  const handleDeselectAll = () => {
    setSelectedIndexes(new Set());
  };

  const handleSelectAllSmart = () => {
    const newSelected = new Set<number>();
    smartSuggestions.forEach((_, idx) => {
      if (!removedSmartIndexes.has(idx)) {
        newSelected.add(idx);
      }
    });
    setSelectedSmartIndexes(newSelected);
  };

  const handleDeselectAllSmart = () => {
    setSelectedSmartIndexes(new Set());
  };

  const toggleExpanded = (cardId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(cardId)) {
      newExpanded.delete(cardId);
    } else {
      newExpanded.add(cardId);
    }
    setExpandedCards(newExpanded);
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
  const modeLabel = isNormal ? 'Normal' : 'Ultra';
  const oppositeLabel = isNormal ? 'Ultra' : 'Normal';
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
    const cardId = `${isSmart ? 'smart' : 'main'}-${originalIndex}`;
    const isExpanded = expandedCards.has(cardId);
    const hasExpandableContent = demand.objetivo || demand.conteudo || demand.descricao;
    
    return (
      <Card 
        key={cardId}
        className={cn(
          "transition-all duration-200 overflow-hidden",
          isSelected 
            ? isSmart 
              ? isNormal 
                ? "border-pink-400/60 bg-pink-50/40 dark:bg-pink-950/20 dark:border-pink-700/40"
                : "border-blue-400/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-700/40"
              : isNormal
                ? "border-blue-400/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-700/40"
                : "border-pink-400/60 bg-pink-50/40 dark:bg-pink-950/20 dark:border-pink-700/40"
            : "border-border/40 bg-muted/20 opacity-70"
        )}
      >
        {/* Main content row */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggle(originalIndex)}
              className={cn(
                "mt-1 h-5 w-5",
                isSelected && (
                  isSmart 
                    ? isNormal ? "border-pink-500 data-[state=checked]:bg-pink-500" : "border-blue-500 data-[state=checked]:bg-blue-500"
                    : isNormal ? "border-blue-500 data-[state=checked]:bg-blue-500" : "border-pink-500 data-[state=checked]:bg-pink-500"
                )
              )}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm leading-snug mb-2">
                    {demand.titulo}
                  </h4>
                  
                  {/* Tags row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isSmart && (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] gap-1 font-medium px-1.5 py-0",
                          isNormal 
                            ? "border-pink-400 text-pink-600 bg-pink-50/50 dark:border-pink-600 dark:text-pink-400 dark:bg-pink-950/30"
                            : "border-blue-400 text-blue-600 bg-blue-50/50 dark:border-blue-600 dark:text-blue-400 dark:bg-blue-950/30"
                        )}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        {oppositeLabel}
                      </Badge>
                    )}
                    {tipo && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {tipo}
                      </Badge>
                    )}
                    <Badge 
                      variant="secondary" 
                      className="text-[10px] px-1.5 py-0 font-normal bg-muted/80"
                    >
                      {demand.canal}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {hasExpandableContent && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => toggleExpanded(cardId)}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onRemove(originalIndex)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expandable content */}
        {hasExpandableContent && isExpanded && (
          <div className="px-4 pb-4 pt-0">
            <div className="ml-8 pl-3 border-l-2 border-muted-foreground/20">
              {demand.objetivo && (
                <div className="mb-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Objetivo</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{demand.objetivo}</p>
                </div>
              )}
              {(demand.conteudo || demand.descricao) && (
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Conteúdo</span>
                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line line-clamp-4">
                    {demand.conteudo || demand.descricao}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                isNormal 
                  ? "bg-gradient-to-br from-blue-500 to-cyan-500" 
                  : "bg-gradient-to-br from-pink-500 to-purple-500"
              )}>
                {isNormal ? <Shield className="w-5 h-5 text-white" /> : <Rocket className="w-5 h-5 text-white" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  Modo {modeLabel}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Revise e selecione as demandas para seu planejamento
                </DialogDescription>
              </div>
            </div>
            
            {/* Summary chips */}
            <div className="flex items-center gap-2">
              <div className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5",
                isNormal 
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"
              )}>
                <CheckSquare className="w-3.5 h-3.5" />
                {selectedCount} do plano
              </div>
              {selectedSmartCount > 0 && (
                <div className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5",
                  isNormal 
                    ? "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                )}>
                  <Sparkles className="w-3.5 h-3.5" />
                  +{selectedSmartCount} extras
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'demands' | 'smart')} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-5 pt-3 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <TabsList className="grid grid-cols-2 w-auto">
                <TabsTrigger value="demands" className="gap-2 px-4">
                  {isNormal ? <Shield className="w-3.5 h-3.5" /> : <Rocket className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Demandas</span>
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 h-5">{selectedCount}/{totalVisible}</Badge>
                </TabsTrigger>
                <TabsTrigger value="smart" className="gap-2 px-4">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pacote Inteligente</span>
                  <Badge 
                    variant={selectedSmartCount > 0 ? "default" : "secondary"} 
                    className={cn(
                      "ml-1 text-[10px] px-1.5 h-5",
                      selectedSmartCount > 0 && (isNormal ? "bg-pink-500" : "bg-blue-500")
                    )}
                  >
                    {selectedSmartCount > 0 ? `+${selectedSmartCount}` : totalSmartVisible}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Quick actions */}
              <div className="flex items-center gap-1">
                {activeTab === 'demands' && totalVisible > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={handleSelectAll}
                      disabled={selectedCount === totalVisible}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Selecionar tudo</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={handleDeselectAll}
                      disabled={selectedCount === 0}
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Limpar</span>
                    </Button>
                  </>
                )}
                {activeTab === 'smart' && totalSmartVisible > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={handleSelectAllSmart}
                      disabled={selectedSmartCount === totalSmartVisible}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Selecionar tudo</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={handleDeselectAllSmart}
                      disabled={selectedSmartCount === 0}
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Limpar</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <TabsContent value="demands" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-[calc(90vh-300px)]">
              <div className="p-5 pt-3 space-y-2">
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
                  <div className="text-center py-16">
                    <LayoutGrid className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhuma demanda disponível</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="mt-4 gap-2"
                      onClick={onRegenerate}
                      disabled={isRegenerating}
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5", isRegenerating && "animate-spin")} />
                      Gerar Novamente
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="smart" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-[calc(90vh-300px)]">
              <div className="p-5 pt-3">
                {/* Smart package intro */}
                <div className={cn(
                  "p-4 rounded-xl mb-4 border",
                  isNormal 
                    ? "border-pink-200 bg-gradient-to-r from-pink-50/80 to-purple-50/50 dark:border-pink-800/40 dark:from-pink-950/30 dark:to-purple-950/20"
                    : "border-blue-200 bg-gradient-to-r from-blue-50/80 to-cyan-50/50 dark:border-blue-800/40 dark:from-blue-950/30 dark:to-cyan-950/20"
                )}>
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isNormal 
                        ? "bg-gradient-to-br from-pink-500 to-purple-500" 
                        : "bg-gradient-to-br from-blue-500 to-cyan-500"
                    )}>
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">
                        Sugestões do Modo {oppositeLabel}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {isNormal 
                          ? "Ideias mais criativas e ousadas do modo Ultra que podem agregar valor ao seu planejamento."
                          : "Sugestões do modo Normal para equilibrar seu plano com abordagens mais tradicionais."
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
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
                    <div className="text-center py-16">
                      <Lightbulb className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhuma sugestão disponível
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        As sugestões são baseadas no plano {oppositeLabel}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="p-4 border-t shrink-0 bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="gap-2 h-9"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isRegenerating && "animate-spin")} />
              <span className="hidden sm:inline">Gerar Novamente</span>
              <span className="sm:hidden">Regenerar</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-9"
              >
                Cancelar
              </Button>
              
              <Button
                onClick={handleConfirm}
                disabled={totalSelected === 0}
                size="sm"
                className={cn(
                  "gap-2 h-9 min-w-[160px]",
                  totalSelected > 0 && !isNormal && "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                )}
              >
                <Check className="w-4 h-4" />
                Confirmar ({totalSelected})
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
