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
} from "lucide-react";
import { toast } from "sonner";

interface AttachmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  onDelete?: () => void;
}

type FileType = "image" | "video" | "audio" | "pdf" | "unsupported";

const getFileType = (fileName: string): FileType => {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  
  const imageExtensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"];
  const videoExtensions = ["mp4", "mov", "avi", "webm", "mkv"];
  const audioExtensions = ["mp3", "wav", "ogg", "m4a", "flac"];
  const pdfExtensions = ["pdf"];

  if (imageExtensions.includes(extension)) return "image";
  if (videoExtensions.includes(extension)) return "video";
  if (audioExtensions.includes(extension)) return "audio";
  if (pdfExtensions.includes(extension)) return "pdf";
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

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  onDelete,
}) => {
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileType = getFileType(fileName);
  const FileIcon = getFileIcon(fileType);

  // Reset zoom when modal opens
  useEffect(() => {
    if (isOpen) {
      setZoom(100);
      setIsFullscreen(false);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Download iniciado");
    } catch (error) {
      toast.error("Erro ao baixar arquivo");
    }
  }, [fileUrl, fileName]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(fileUrl, "_blank");
  }, [fileUrl]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fileUrl);
      setCopied(true);
      toast.success("URL copiada");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar URL");
    }
  }, [fileUrl]);

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
              src={fileUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={zoomStyle}
            />
          </div>
        );

      case "video":
        return (
          <div className="flex items-center justify-center w-full h-full p-4">
            <video
              src={fileUrl}
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
            <p className="text-foreground font-medium text-lg">{fileName}</p>
            <audio src={fileUrl} controls className="w-full max-w-md">
              Seu navegador não suporta a reprodução de áudio.
            </audio>
          </div>
        );

      case "pdf":
        return (
          <div className="w-full h-full overflow-auto">
            <iframe
              src={`${fileUrl}#view=FitH`}
              className="w-full h-full border-0"
              title={fileName}
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top left",
                width: `${10000 / zoom}%`,
                height: `${10000 / zoom}%`,
              }}
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
              <p className="text-foreground font-medium text-lg">{fileName}</p>
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
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={`p-0 gap-0 bg-background border-border overflow-hidden ${
            isFullscreen
              ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none translate-x-0 translate-y-0 left-0 top-0"
              : "max-w-5xl w-[95vw] h-[90vh]"
          }`}
          style={isFullscreen ? { transform: "none" } : undefined}
        >
          {/* Header with close button and file name */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <FileIcon className="w-5 h-5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">
                {fileName}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="shrink-0"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Preview area */}
          <div className="flex-1 min-h-0 bg-muted/30 overflow-hidden">
            {renderPreview()}
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
              Tem certeza que deseja excluir "{fileName}"? Esta ação não pode ser desfeita.
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
    </>
  );
};
