import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CalendarIcon, Clock, Target, FileText, MessageSquare,
  Paperclip, Upload, X, File, Loader2, Trash2, CheckCircle2,
  Circle, AlertTriangle, Check, Pause
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";

interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

interface KanbanCardData {
  id: string;
  title: string;
  status: string;
  column_name: string | null;
  delivery_date: string;
  file_location: string | null;
  objetivo: string | null;
  description: string | null;
  instrucoes: string | null;
  observations: string | null;
  period_plan_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[] | null;
}

interface TaskCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: KanbanCardData | null;
  onCardChange: (card: KanbanCardData) => void;
  onSave: (field: string, value: string) => Promise<void>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onRemoveAttachment: (url: string) => Promise<void>;
  onDelete: () => void;
  saving?: boolean;
  savingField?: string | null;
  uploading?: boolean;
}

const isImageFile = (type: string) => type.startsWith('image/');

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ClickUp-inspired Status configuration with groups
const STATUS_GROUPS = [
  {
    label: "Não iniciado",
    statuses: [
      { 
        value: "nao_iniciado", 
        label: "NÃO INICIADO", 
        color: "hsl(0 0% 45%)", 
        bgColor: "bg-[hsl(0,0%,45%)]/10",
        textColor: "text-[hsl(0,0%,45%)]",
        borderColor: "border-[hsl(0,0%,45%)]/30"
      },
    ]
  },
  {
    label: "Ativo",
    statuses: [
      { 
        value: "mapeamento", 
        label: "MAPEAMENTO DE PROCESSOS", 
        color: "hsl(270 60% 55%)", 
        bgColor: "bg-[hsl(270,60%,55%)]/10",
        textColor: "text-[hsl(270,60%,55%)]",
        borderColor: "border-[hsl(270,60%,55%)]/30"
      },
      { 
        value: "desenvolvimento", 
        label: "DESENVOLVIMENTO", 
        color: "hsl(25 95% 55%)", 
        bgColor: "bg-[hsl(25,95%,55%)]/10",
        textColor: "text-[hsl(25,95%,55%)]",
        borderColor: "border-[hsl(25,95%,55%)]/30"
      },
      { 
        value: "implantacao", 
        label: "IMPLANTAÇÃO", 
        color: "hsl(210 80% 55%)", 
        bgColor: "bg-[hsl(210,80%,55%)]/10",
        textColor: "text-[hsl(210,80%,55%)]",
        borderColor: "border-[hsl(210,80%,55%)]/30"
      },
      { 
        value: "otimizacao", 
        label: "OTIMIZAÇÃO", 
        color: "hsl(175 70% 40%)", 
        bgColor: "bg-[hsl(175,70%,40%)]/10",
        textColor: "text-[hsl(175,70%,40%)]",
        borderColor: "border-[hsl(175,70%,40%)]/30"
      },
    ]
  },
  {
    label: "Pausado",
    statuses: [
      { 
        value: "desenvolvimento_pausado", 
        label: "DESENVOLVIMENTO PAUSADO", 
        color: "hsl(280 40% 70%)", 
        bgColor: "bg-[hsl(280,40%,70%)]/10",
        textColor: "text-[hsl(280,40%,70%)]",
        borderColor: "border-[hsl(280,40%,70%)]/30"
      },
      { 
        value: "implantacao_pausada", 
        label: "IMPLANTAÇÃO PAUSADA", 
        color: "hsl(210 50% 70%)", 
        bgColor: "bg-[hsl(210,50%,70%)]/10",
        textColor: "text-[hsl(210,50%,70%)]",
        borderColor: "border-[hsl(210,50%,70%)]/30"
      },
    ]
  },
  {
    label: "Concluído",
    statuses: [
      { 
        value: "concluido", 
        label: "CONCLUÍDO", 
        color: "hsl(142 70% 45%)", 
        bgColor: "bg-[hsl(142,70%,45%)]/10",
        textColor: "text-[hsl(142,70%,45%)]",
        borderColor: "border-[hsl(142,70%,45%)]/30"
      },
    ]
  },
];

// Flatten for easy lookup
const ALL_STATUSES = STATUS_GROUPS.flatMap(g => g.statuses);

const getStatusConfig = (statusValue: string) => {
  return ALL_STATUSES.find(s => s.value === statusValue) || ALL_STATUSES[0];
};

// Legacy status mapping for backwards compatibility
const LEGACY_STATUS_MAP: Record<string, string> = {
  unassigned: "nao_iniciado",
  in_progress: "desenvolvimento",
  completed: "concluido",
};

export default function TaskCard({
  open,
  onOpenChange,
  card,
  onCardChange,
  onSave,
  onFileUpload,
  onRemoveAttachment,
  onDelete,
  saving = false,
  savingField = null,
  uploading = false,
}: TaskCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [deliveryDateOpen, setDeliveryDateOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  const handleFieldSave = async (field: string, value: string) => {
    await onSave(field, value);
    setEditingField(null);
  };

  const handleDateSelect = async (date: Date | undefined) => {
    if (date && card) {
      const dateStr = format(date, "yyyy-MM-dd");
      onCardChange({ ...card, delivery_date: dateStr });
      await onSave('delivery_date', dateStr);
      setDeliveryDateOpen(false);
    }
  };

  // Normalize legacy status values
  const normalizedStatus = LEGACY_STATUS_MAP[card?.status || ''] || card?.status || 'nao_iniciado';

  // Calculate if deadline is overdue
  const isOverdue = card?.delivery_date && new Date(card.delivery_date + 'T23:59:59') < new Date() && normalizedStatus !== 'concluido';

  if (!card) return null;

  const statusConfig = getStatusConfig(normalizedStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-4xl h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* ===== HEADER OPERACIONAL (Fixo, compacto) ===== */}
        <div className="border-b border-border bg-card px-6 py-4 shrink-0">
          {/* Title */}
          <DialogHeader className="mb-4">
            {editingField === 'title' ? (
              <Input
                autoFocus
                value={card.title || ""}
                onChange={(e) => onCardChange({ ...card, title: e.target.value })}
                onBlur={() => handleFieldSave('title', card.title || '')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFieldSave('title', card.title || '');
                }}
                className="text-lg font-semibold border-primary"
              />
            ) : (
              <DialogTitle 
                className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors pr-8"
                onClick={() => setEditingField('title')}
              >
                {card.title}
              </DialogTitle>
            )}
          </DialogHeader>

          {/* Control Fields Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status - ClickUp inspired */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
              <Select
                value={normalizedStatus}
                onValueChange={(value) => {
                  onCardChange({ ...card, status: value });
                  handleFieldSave('status', value);
                }}
              >
                <SelectTrigger 
                  className={cn(
                    "h-9 w-auto min-w-[180px] gap-2 border font-medium text-xs",
                    statusConfig.bgColor,
                    statusConfig.textColor,
                    statusConfig.borderColor
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span 
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: statusConfig.color }}
                    />
                    <span className="truncate">{statusConfig.label}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className="min-w-[220px] max-h-[320px]">
                  <ScrollArea className="max-h-[300px]">
                    {STATUS_GROUPS.map((group, groupIdx) => (
                      <div key={group.label}>
                        {groupIdx > 0 && <Separator className="my-1" />}
                        <div className="px-2 py-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.label}
                          </span>
                        </div>
                        {group.statuses.map((status) => (
                          <SelectItem 
                            key={status.value} 
                            value={status.value}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span 
                                className={cn(
                                  "h-3 w-3 rounded-full flex-shrink-0 flex items-center justify-center",
                                  status.value === 'concluido' && "ring-1 ring-inset ring-white/30"
                                )}
                                style={{ backgroundColor: status.color }}
                              >
                                {status.value === 'concluido' && (
                                  <Check className="h-2 w-2 text-white" />
                                )}
                              </span>
                              <span className="text-xs font-medium">{status.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Prazo de Entrega (Deadline) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Prazo de Entrega</span>
              <Popover open={deliveryDateOpen} onOpenChange={setDeliveryDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 gap-2 font-normal",
                      isOverdue && "border-destructive/50 text-destructive bg-destructive/5"
                    )}
                  >
                    {isOverdue && <AlertTriangle className="h-3.5 w-3.5" />}
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {card.delivery_date ? (
                      format(new Date(card.delivery_date + 'T00:00:00'), "dd MMM yyyy", { locale: ptBR })
                    ) : (
                      <span className="text-muted-foreground">Definir prazo</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={card.delivery_date ? new Date(card.delivery_date + 'T00:00:00') : undefined}
                    onSelect={handleDateSelect}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Tempo de Atividade (placeholder) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tempo</span>
              <Badge variant="outline" className="h-8 gap-1.5 font-normal text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                --:--
              </Badge>
            </div>

            {/* Delete button - far right */}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ===== BODY (Conteúdo de execução, scrollable) ===== */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-6">
            
            {/* Objetivo */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-primary/10 rounded-md">
                  <Target className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Objetivo</h3>
                {saving && savingField === 'objetivo' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                )}
              </div>
              {editingField === 'objetivo' ? (
                <Textarea
                  autoFocus
                  value={card.objetivo || ""}
                  onChange={(e) => onCardChange({ ...card, objetivo: e.target.value })}
                  onBlur={() => handleFieldSave('objetivo', card.objetivo || '')}
                  placeholder="Qual é a finalidade estratégica deste material?"
                  className="min-h-[60px] text-sm resize-none"
                  rows={2}
                />
              ) : (
                <div 
                  className="cursor-pointer rounded-lg border border-transparent hover:border-border hover:bg-muted/30 p-3 -m-1 transition-all"
                  onClick={() => setEditingField('objetivo')}
                >
                  {card.objetivo ? (
                    <p className="text-sm text-foreground leading-relaxed">{card.objetivo}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 italic">Clique para definir o objetivo...</p>
                  )}
                </div>
              )}
            </section>

            {/* Atividade */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-secondary/50 rounded-md">
                  <FileText className="h-4 w-4 text-secondary-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Atividade</h3>
                {saving && savingField === 'description' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                )}
              </div>
              {editingField === 'description' ? (
                <Textarea
                  autoFocus
                  value={card.description || ""}
                  onChange={(e) => onCardChange({ ...card, description: e.target.value })}
                  onBlur={() => handleFieldSave('description', card.description || '')}
                  placeholder="Copy, roteiros, frames, instruções de produção..."
                  className="min-h-[200px] font-mono text-sm resize-none"
                  rows={10}
                />
              ) : (
                <div 
                  className="cursor-pointer rounded-lg border border-transparent hover:border-border hover:bg-muted/30 transition-all"
                  onClick={() => setEditingField('description')}
                >
                  {card.description ? (
                    <div className="bg-muted/20 rounded-lg border border-border/50 p-4">
                      <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                        {card.description}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 italic p-3">
                      Clique para adicionar copy, roteiros, frames...
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Observações */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-accent/50 rounded-md">
                  <MessageSquare className="h-4 w-4 text-accent-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Observações</h3>
                {saving && savingField === 'observations' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                )}
              </div>
              {editingField === 'observations' ? (
                <Textarea
                  autoFocus
                  value={card.observations || ""}
                  onChange={(e) => onCardChange({ ...card, observations: e.target.value })}
                  onBlur={() => handleFieldSave('observations', card.observations || '')}
                  placeholder="Feedbacks, ajustes, observações internas..."
                  className="min-h-[80px] text-sm resize-none"
                  rows={3}
                />
              ) : (
                <div 
                  className="cursor-pointer rounded-lg border border-transparent hover:border-border hover:bg-muted/30 p-3 -m-1 transition-all"
                  onClick={() => setEditingField('observations')}
                >
                  {card.observations ? (
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{card.observations}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 italic">Clique para adicionar observações...</p>
                  )}
                </div>
              )}
            </section>

            {/* Anexos */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-muted rounded-md">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Anexos</h3>
                {uploading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                )}
              </div>

              {/* Attachments Grid */}
              {card.attachments && card.attachments.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                  {card.attachments.map((attachment, idx) => (
                    <div 
                      key={idx} 
                      className="group relative bg-muted/30 rounded-lg border border-border/50 overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => setPreviewAttachment(attachment)}
                    >
                      {isImageFile(attachment.type) ? (
                        <div className="block">
                          <div className="aspect-square">
                            <img 
                              src={attachment.url} 
                              alt={attachment.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          </div>
                          <div className="p-2 bg-background/80 backdrop-blur-sm">
                            <p className="text-xs font-medium truncate">{attachment.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 aspect-square hover:bg-muted/50 transition-colors">
                          <File className="h-10 w-10 text-muted-foreground mb-2" />
                          <p className="text-xs font-medium text-center truncate w-full">{attachment.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveAttachment(attachment.url);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-destructive/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive shadow-lg"
                      >
                        <X className="h-3 w-3 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Area */}
              <label className="flex flex-col items-center justify-center gap-2 w-full py-6 px-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mov,.avi"
                  onChange={onFileUpload}
                  className="sr-only"
                  disabled={uploading}
                />
                {uploading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Enviando arquivos...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Clique ou arraste arquivos para anexar
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                      Imagens, PDFs, documentos, vídeos
                    </span>
                  </>
                )}
              </label>
            </section>

            {/* Timestamps */}
            <div className="flex items-center gap-4 pt-4 border-t border-border text-xs text-muted-foreground">
              <span>Criado: {card.created_at ? format(new Date(card.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}</span>
              <span>Atualizado: {card.updated_at ? format(new Date(card.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}</span>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal
        isOpen={!!previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        fileUrl={previewAttachment?.url || ""}
        fileName={previewAttachment?.name || ""}
        onDelete={previewAttachment ? () => {
          onRemoveAttachment(previewAttachment.url);
          setPreviewAttachment(null);
        } : undefined}
      />
    </Dialog>
  );
}

export type { KanbanCardData, Attachment };
