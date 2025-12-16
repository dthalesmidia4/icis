import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, FileText, Link as LinkIcon, Trash2, Target, ClipboardList, 
  Layers, Paperclip, Upload, X, Image, File, Loader2, LayoutGrid 
} from "lucide-react";

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

const extractMetadata = (card: KanbanCardData) => {
  const text = `${card.file_location || ''} ${card.description || ''}`.toLowerCase();
  const platforms: string[] = [];
  
  if (text.includes('instagram')) platforms.push('Instagram');
  if (text.includes('facebook')) platforms.push('Facebook');
  if (text.includes('linkedin')) platforms.push('LinkedIn');
  if (text.includes('youtube')) platforms.push('YouTube');
  if (text.includes('tiktok')) platforms.push('TikTok');
  if (text.includes('twitter') || text.includes('x.com')) platforms.push('Twitter/X');
  if (text.includes('whatsapp')) platforms.push('WhatsApp');
  
  return { platforms };
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

  const handleFieldSave = async (field: string, value: string) => {
    await onSave(field, value);
    setEditingField(null);
  };

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-5xl max-h-[90vh] p-0 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-4 h-[90vh]">
          {/* Left Column - Main Content (Scrollable) */}
          <ScrollArea className="lg:col-span-3 h-full">
            <div className="p-5 sm:p-7 space-y-4">
              {/* Header with Title */}
              <DialogHeader className="pb-4 border-b border-border">
                {editingField === 'title' ? (
                  <Input
                    autoFocus
                    value={card.title || ""}
                    onChange={(e) => onCardChange({ ...card, title: e.target.value })}
                    onBlur={() => handleFieldSave('title', card.title || '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleFieldSave('title', card.title || '');
                      }
                    }}
                    className="text-xl font-bold"
                  />
                ) : (
                  <DialogTitle 
                    className="text-xl font-bold cursor-pointer rounded-lg p-3 -m-3 transition-all duration-200 hover:bg-muted/50"
                    onClick={() => setEditingField('title')}
                  >
                    {card.title}
                  </DialogTitle>
                )}
              </DialogHeader>

              {/* Section Cards Container */}
              <div className="space-y-4">
                {/* Card: Objetivo */}
                <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Objetivo</h3>
                    {saving && savingField === 'objetivo' && (
                      <span className="text-xs text-muted-foreground ml-auto">Salvando...</span>
                    )}
                  </div>
                  {editingField === 'objetivo' ? (
                    <Textarea
                      autoFocus
                      value={card.objetivo || ""}
                      onChange={(e) => onCardChange({ ...card, objetivo: e.target.value })}
                      onBlur={() => handleFieldSave('objetivo', card.objetivo || '')}
                      className="min-h-[80px] text-sm leading-relaxed"
                      rows={3}
                    />
                  ) : (
                    <div 
                      className="cursor-pointer transition-all duration-200 hover:bg-muted/30 rounded-lg p-3 -m-1"
                      onClick={() => setEditingField('objetivo')}
                    >
                      {card.objetivo ? (
                        <p className="text-sm text-foreground leading-relaxed">{card.objetivo}</p>
                      ) : (
                        <span className="text-muted-foreground/60 text-sm italic">Clique para adicionar objetivo</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card: Copy / Texto da Peça */}
                <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-secondary/50 rounded-lg">
                      <FileText className="h-4 w-4 text-secondary-foreground" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Copy / Texto da Peça</h3>
                    {saving && savingField === 'description' && (
                      <span className="text-xs text-muted-foreground ml-auto">Salvando...</span>
                    )}
                  </div>
                  {editingField === 'description' ? (
                    <Textarea
                      autoFocus
                      value={card.description || ""}
                      onChange={(e) => onCardChange({ ...card, description: e.target.value })}
                      onBlur={() => handleFieldSave('description', card.description || '')}
                      className="min-h-[200px] font-mono text-sm leading-relaxed"
                      rows={10}
                    />
                  ) : (
                    <div 
                      className="cursor-pointer transition-all duration-200 hover:bg-muted/30 rounded-lg"
                      onClick={() => setEditingField('description')}
                    >
                      {card.description ? (
                        <div className="space-y-3">
                          {(() => {
                            const lines = card.description.split('\n');
                            const elements: JSX.Element[] = [];
                            let currentSection: string | null = null;
                            let currentItems: string[] = [];

                            const flushItems = (key: string) => {
                              if (currentItems.length > 0) {
                                elements.push(
                                  <div key={key} className="bg-muted/40 rounded-lg p-4 border border-border/50">
                                    {currentSection && (
                                      <div className="flex items-center gap-2 mb-2">
                                        <Layers className="h-3.5 w-3.5 text-primary" />
                                        <span className="text-xs font-semibold text-primary uppercase tracking-wide">{currentSection}</span>
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      {currentItems.map((item, i) => (
                                        <p key={i} className="text-sm text-foreground leading-relaxed">{item}</p>
                                      ))}
                                    </div>
                                  </div>
                                );
                                currentItems = [];
                              }
                            };

                            lines.forEach((line, idx) => {
                              const trimmed = line.trim();
                              if (!trimmed) return;

                              // Check for section headers (SLIDE X, CARD X, etc.)
                              const sectionMatch = trimmed.match(/^(SLIDE|CARD|CENA|FRAME|PARTE)\s*\d+\s*[—–\-:]/i);
                              if (sectionMatch) {
                                flushItems(`section-${idx}`);
                                currentSection = trimmed.split(/[—–\-:]/)[0].trim();
                                const content = trimmed.split(/[—–\-:]/)[1]?.trim();
                                if (content) currentItems.push(content);
                              } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
                                currentItems.push(trimmed.replace(/^[-•]\s*/, ''));
                              } else {
                                currentItems.push(trimmed);
                              }
                            });

                            flushItems('final');

                            return elements.length > 0 ? elements : (
                              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{card.description}</p>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60 text-sm italic p-3">Clique para adicionar texto</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card: Instruções Técnicas */}
                <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-accent/50 rounded-lg">
                      <ClipboardList className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Instruções Técnicas</h3>
                    {saving && savingField === 'instrucoes' && (
                      <span className="text-xs text-muted-foreground ml-auto">Salvando...</span>
                    )}
                  </div>
                  {editingField === 'instrucoes' ? (
                    <Textarea
                      autoFocus
                      value={card.instrucoes || ""}
                      onChange={(e) => onCardChange({ ...card, instrucoes: e.target.value })}
                      onBlur={() => handleFieldSave('instrucoes', card.instrucoes || '')}
                      className="min-h-[100px] text-sm leading-relaxed"
                      rows={4}
                    />
                  ) : (
                    <div 
                      className="cursor-pointer transition-all duration-200 hover:bg-muted/30 rounded-lg p-3 -m-1"
                      onClick={() => setEditingField('instrucoes')}
                    >
                      {card.instrucoes ? (
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{card.instrucoes}</p>
                      ) : (
                        <span className="text-muted-foreground/60 text-sm italic">Clique para adicionar instruções</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Right Column - Metadata Sidebar */}
          <div className="lg:col-span-1 bg-muted/20 border-l border-border p-4 space-y-4 overflow-y-auto">
            {/* Status Card */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
              </div>
              {editingField === 'status' ? (
                <Select
                  value={card.status}
                  onValueChange={(value) => {
                    onCardChange({ ...card, status: value });
                    handleFieldSave('status', value);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">A Fazer</SelectItem>
                    <SelectItem value="in_progress">Em Andamento</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge 
                  variant={card.status === "completed" ? "default" : card.status === "in_progress" ? "secondary" : "outline"}
                  className="cursor-pointer transition-all duration-200 hover:opacity-80"
                  onClick={() => setEditingField('status')}
                >
                  {card.status === "completed"
                    ? "✓ Concluído"
                    : card.status === "in_progress"
                    ? "⏳ Em Andamento"
                    : "○ A Fazer"}
                </Badge>
              )}
            </div>

            {/* Date Card */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entrega</span>
              </div>
              {editingField === 'delivery_date' ? (
                <Input
                  type="date"
                  autoFocus
                  value={card.delivery_date || ""}
                  onChange={(e) => onCardChange({ ...card, delivery_date: e.target.value })}
                  onBlur={() => handleFieldSave('delivery_date', card.delivery_date || '')}
                  className="h-9"
                />
              ) : (
                <div 
                  className="cursor-pointer transition-all duration-200 hover:bg-muted/50 rounded-lg p-2 -m-1"
                  onClick={() => setEditingField('delivery_date')}
                >
                  {card.delivery_date ? (
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">
                        {new Date(card.delivery_date + 'T00:00:00').toLocaleDateString("pt-BR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {new Date(card.delivery_date + 'T00:00:00').toLocaleDateString("pt-BR", {
                          weekday: "long",
                        })}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Definir data</span>
                  )}
                </div>
              )}
            </div>

            {/* Format Card */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Formato</span>
              </div>
              {editingField === 'file_location' ? (
                <Input
                  autoFocus
                  value={card.file_location || ""}
                  onChange={(e) => onCardChange({ ...card, file_location: e.target.value })}
                  onBlur={() => handleFieldSave('file_location', card.file_location || '')}
                  placeholder="Ex: Carrossel, Reels..."
                  className="h-9"
                />
              ) : (
                <div 
                  className="cursor-pointer transition-all duration-200 hover:bg-muted/50 rounded-lg p-2 -m-1"
                  onClick={() => setEditingField('file_location')}
                >
                  <p className="text-sm font-medium text-foreground">
                    {card.file_location || "Definir formato"}
                  </p>
                </div>
              )}
            </div>

            {/* Attachments Card */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Anexos</span>
                </div>
                {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

              {/* Uploaded Files */}
              {card.attachments && card.attachments.length > 0 && (
                <div className="space-y-2 mb-3">
                  {card.attachments.map((attachment, idx) => (
                    <div key={idx} className="group relative bg-muted/30 rounded-lg overflow-hidden">
                      {isImageFile(attachment.type) ? (
                        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                          <img 
                            src={attachment.url} 
                            alt={attachment.name}
                            className="w-full h-20 object-cover transition-transform hover:scale-105"
                          />
                        </a>
                      ) : (
                        <a 
                          href={attachment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 hover:bg-muted/50 transition-colors"
                        >
                          <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{attachment.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                          </div>
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveAttachment(attachment.url);
                        }}
                        className="absolute top-1 right-1 p-1 bg-destructive/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                      >
                        <X className="h-3 w-3 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Button */}
              <label className="flex items-center justify-center gap-2 w-full py-2 px-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={onFileUpload}
                  className="sr-only"
                  disabled={uploading}
                />
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Enviando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Anexar arquivos</span>
                  </>
                )}
              </label>
            </div>

            {/* Channel Tags */}
            {extractMetadata(card).platforms.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Canal</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {extractMetadata(card).platforms.map((platform) => (
                    <Badge key={platform} variant="outline" className="text-xs px-2 py-0.5">
                      {platform}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground space-y-1 px-1 pt-2">
              <p>Criado: {card.created_at ? new Date(card.created_at).toLocaleDateString("pt-BR") : "-"}</p>
              <p>Atualizado: {card.updated_at ? new Date(card.updated_at).toLocaleDateString("pt-BR") : "-"}</p>
            </div>

            {/* Delete Button */}
            <div className="pt-2 mt-auto">
              <Button
                variant="outline"
                size="sm"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { KanbanCardData, Attachment };
