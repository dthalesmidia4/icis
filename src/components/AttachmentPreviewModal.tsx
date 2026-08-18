import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Download,
  ExternalLink,
  Copy,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  Trash2,
  X,
  FileText,
  FileAudio,
  FileVideo,
  File,
  Image as ImageIcon,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

export interface AttachmentPreviewItem {
  url: string;
  name: string;
}

interface AttachmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  onDelete?: () => void;
  /** Opcional: viewer de múltiplos arquivos (ex.: slides de um carrossel). */
  items?: AttachmentPreviewItem[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Selo neutro exibido no header (ex.: "Referência" no Feed Simulado). */
  badgeLabel?: string;
}



type FileType = "image" | "video" | "audio" | "pdf" | "unsupported";

const getFileType = (fileName: string, fileUrl?: string): FileType => {
  const imageExtensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"];
  const videoExtensions = ["mp4", "mov", "avi", "webm", "mkv"];
  const audioExtensions = ["mp3", "wav", "ogg", "m4a", "flac"];
  const pdfExtensions = ["pdf"];

  const checkExtension = (ext: string): FileType => {
    if (imageExtensions.includes(ext)) return "image";
    if (videoExtensions.includes(ext)) return "video";
    if (audioExtensions.includes(ext)) return "audio";
    if (pdfExtensions.includes(ext)) return "pdf";
    return "unsupported";
  };

  // Try from file name first
  const nameExt = fileName.split(".").pop()?.toLowerCase() || "";
  const fromName = checkExtension(nameExt);
  if (fromName !== "unsupported") return fromName;

  // Fallback: try from URL (strip query params)
  if (fileUrl) {
    const urlPath = fileUrl.split("?")[0];
    const urlExt = urlPath.split(".").pop()?.toLowerCase() || "";
    return checkExtension(urlExt);
  }

  return "unsupported";
};

const getFileIcon = (fileType: FileType) => {
  switch (fileType) {
    case "image":
      return ImageIcon;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "pdf":
      return FileText;
    default:
      return File;
  }
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
};

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  onDelete,
  items,
  initialIndex = 0,
  onIndexChange,
}) => {
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasItems = Array.isArray(items) && items.length > 0;
  const clamp = useCallback(
    (i: number) => (hasItems ? Math.max(0, Math.min(i, items!.length - 1)) : 0),
    [hasItems, items],
  );
  const [currentIndex, setCurrentIndex] = useState(() => clamp(initialIndex));

  // Sincroniza índice ao (re)abrir ou quando a lista/índice inicial muda.
  useEffect(() => {
    if (isOpen) setCurrentIndex(clamp(initialIndex));
  }, [isOpen, initialIndex, clamp]);

  const activeUrl = hasItems ? items![currentIndex]?.url ?? fileUrl : fileUrl;
  const activeName = hasItems ? items![currentIndex]?.name ?? fileName : fileName;
  const total = hasItems ? items!.length : 1;
  const canPrev = hasItems && currentIndex > 0;
  const canNext = hasItems && currentIndex < total - 1;

  const goTo = useCallback(
    (next: number) => {
      const idx = clamp(next);
      setCurrentIndex(idx);
      setZoom(100);
      onIndexChange?.(idx);
    },
    [clamp, onIndexChange],
  );

  const fileType = getFileType(activeName, activeUrl);
  const FileIcon = getFileIcon(fileType);

  // Reset zoom when modal opens
  useEffect(() => {
    if (isOpen) {
      setZoom(100);
      setIsFullscreen(false);
    }
  }, [isOpen]);

  // Teclado: ESC fecha, setas navegam entre itens (quando houver mais de um).
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isTypingTarget(e.target)) return;
      if (total <= 1) return;
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        goTo(currentIndex - 1);
      } else if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        goTo(currentIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFullscreen, onClose, total, canPrev, canNext, currentIndex, goTo]);


  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(activeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = activeName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Download iniciado");
    } catch (error) {
      toast.error("Erro ao baixar arquivo");
    }
  }, [activeUrl, activeName]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(activeUrl, "_blank");
  }, [activeUrl]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      toast.success("URL copiada");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar URL");
    }
  }, [activeUrl]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 25, 300));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 25, 25));
  }, []);

  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(() => {
    onDelete?.();
    setShowDeleteConfirm(false);
    onClose();
  }, [onDelete, onClose]);

  const renderPreview = () => {
    const zoomStyle = {
      transform: `scale(${zoom / 100})`,
      transformOrigin: "center center",
    };

    switch (fileType) {
      case "image":
        return (
          <div className="flex items-center justify-center w-full h-full overflow-auto p-4">
            <img
              src={activeUrl}
              alt={activeName}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={zoomStyle}
            />
          </div>
        );

      case "video":
        return (
          <div className="flex items-center justify-center w-full h-full p-4">
            <video
              src={activeUrl}
              controls
              className="max-w-full max-h-full rounded-lg"
              style={{ maxHeight: "calc(100% - 2rem)" }}
            >
              Seu navegador não suporta a reprodução de vídeo.
            </video>
          </div>
        );

      case "audio":
        return (
          <div className="flex flex-col items-center justify-center w-full h-full p-8 gap-6">
            <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center">
              <FileAudio className="w-16 h-16 text-primary" />
            </div>
            <p className="text-foreground font-medium text-lg">{activeName}</p>
            <audio src={activeUrl} controls className="w-full max-w-md">
              Seu navegador não suporta a reprodução de áudio.
            </audio>
          </div>
        );

      case "pdf":
        return (
          <div className="w-full h-full overflow-auto">
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(activeUrl)}&embedded=true`}
              className="w-full h-full border-0"
              title={activeName}
            />
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center w-full h-full p-8 gap-6">
            <div className="w-32 h-32 rounded-2xl bg-muted flex items-center justify-center">
              <FileIcon className="w-16 h-16 text-muted-foreground" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-foreground font-medium text-lg">{activeName}</p>
              <p className="text-muted-foreground text-sm">
                Pré-visualização não disponível para este tipo de arquivo
              </p>
            </div>
          </div>
        );
    }
  };

  const showZoomControls = fileType === "image" || fileType === "pdf";

  return (
    <div className="relative z-[70]">
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          aria-describedby={undefined}
          className={`p-0 gap-0 bg-background border-border overflow-hidden [&>button]:hidden transform-gpu z-[70] ${
            isFullscreen
              ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none translate-x-0 translate-y-0 left-0 top-0"
              : "max-w-5xl w-[95vw] h-[90vh]"
          }`}
          style={{
            ...(isFullscreen ? { transform: "none" } : {}),
            isolation: 'isolate',
            contain: 'layout style',
          }}
        >
          {/* Header with close button and file name */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <FileIcon className="w-5 h-5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">
                {activeName}
              </span>
              {total > 1 && (
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {currentIndex + 1} / {total}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="shrink-0"
              aria-label="Fechar visualização"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Preview area */}
          <div className="relative flex-1 min-h-0 bg-muted/30 overflow-hidden">
            {renderPreview()}

            {total > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Arquivo anterior"
                  disabled={!canPrev}
                  onClick={() => goTo(currentIndex - 1)}
                  className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-lg backdrop-blur transition hover:bg-background disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Próximo arquivo"
                  disabled={!canNext}
                  onClick={() => goTo(currentIndex + 1)}
                  className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-lg backdrop-blur transition hover:bg-background disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>


          {/* Action bar */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card shrink-0">
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleDownload}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Baixar</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleOpenInNewTab}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Abrir em nova aba</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleCopyUrl}>
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copiar URL</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleToggleFullscreen}>
                      {isFullscreen ? (
                        <Minimize className="w-4 h-4" />
                      ) : (
                        <Maximize className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Zoom controls */}
            {showZoomControls && (
              <div className="flex items-center gap-1">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleZoomOut}
                        disabled={zoom <= 25}
                      >
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Diminuir zoom</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <span className="text-sm text-muted-foreground w-14 text-center">
                  {zoom}%
                </span>

                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleZoomIn}
                        disabled={zoom >= 300}
                      >
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Aumentar zoom</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            {/* Delete button */}
            {onDelete && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Excluir</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{activeName}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
