import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Image, LayoutGrid, Video, Film, Calendar, Loader2, Users, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import JSZip from "jszip";
interface GeneratedContent {
  id: string;
  content_type: string;
  title: string | null;
  prompt: string | null;
  image_urls: string[];
  metadata: Record<string, any>;
  created_at: string;
  client_id: string;
  client_name?: string;
}

interface ClientOption {
  id: string;
  name: string;
  fantasy_name: string | null;
}

const contentTypeConfig: Record<string, { label: string; icon: typeof Image; color: string }> = {
  post: { label: "Post Estático", icon: Image, color: "bg-blue-500" },
  carousel: { label: "Carrossel", icon: LayoutGrid, color: "bg-purple-500" },
  video_storyboard: { label: "Storyboard", icon: Film, color: "bg-amber-500" },
  video_scene: { label: "Cena de Vídeo", icon: Video, color: "bg-pink-500" },
  video: { label: "Vídeo", icon: Video, color: "bg-pink-500" },
};

const isVideoUrl = (url: string) => {
  return url.match(/\.(mp4|webm|mov|avi)(\?|$)/i) || url.includes("video-scenes/");
};

const ContentHistory = () => {
  const navigate = useNavigate();
  const { selectedClient, setSelectedClient } = useSelectedClient();
  const { tenantId } = useTenant();
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [filterClientId, setFilterClientId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<GeneratedContent | null>(null);

  const handleOpenInGenerator = async (content: GeneratedContent) => {
    // Ensure the correct client is selected
    const client = clients.find(c => c.id === content.client_id);
    if (!client) {
      toast.error("Cliente não encontrado.");
      return;
    }

    // Fetch full client data for context
    const { data: fullClient } = await supabase
      .from("tenant_companies")
      .select("id, name, fantasy_name, cnpj_cpf, email, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, mascot_url, tenant_id")
      .eq("id", content.client_id)
      .single();

    if (fullClient) {
      setSelectedClient(fullClient as any);
    }

    setPreviewOpen(false);

    // Map content_type to the modal to open
    let openModal: string;
    if (content.content_type === "post") {
      openModal = "post";
    } else if (content.content_type === "carousel") {
      openModal = "carousel";
    } else if (content.content_type === "video_storyboard" || content.content_type === "video_scene" || content.content_type === "video") {
      openModal = "video";
    } else {
      openModal = "post";
    }

    navigate("/client-hub", {
      state: {
        openContentFromHistory: {
          type: openModal,
          prompt: content.prompt || "",
          title: content.title || "",
          metadata: content.metadata,
          image_urls: content.image_urls,
          content_type: content.content_type,
        },
      },
    });
  };
  // Load clients for filter
  useEffect(() => {
    if (!tenantId) return;
    const fetchClients = async () => {
      const { data } = await supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (data) setClients(data);
    };
    fetchClients();
  }, [tenantId]);

  // If coming from ClientHub with a selected client, pre-filter
  useEffect(() => {
    if (selectedClient?.id) {
      setFilterClientId(selectedClient.id);
    }
  }, [selectedClient?.id]);

  // Fetch contents
  useEffect(() => {
    if (!tenantId) return;
    const fetchContents = async () => {
      setLoading(true);
      let query = supabase
        .from("generated_contents")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (filterClientId !== "all") {
        query = query.eq("client_id", filterClientId);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching contents:", error);
        toast.error("Erro ao carregar histórico");
      } else {
        const mapped = (data || []).map((d: any) => ({
          ...d,
          image_urls: Array.isArray(d.image_urls) ? d.image_urls : [],
        }));
        // Enrich with client name
        setContents(mapped.map((c: any) => {
          const client = clients.find(cl => cl.id === c.client_id);
          return { ...c, client_name: client ? (client.fantasy_name || client.name) : undefined };
        }));
      }
      setLoading(false);
    };
    fetchContents();
  }, [tenantId, filterClientId, clients]);

  const handleDownload = async (url: string, index: number) => {
    const ext = isVideoUrl(url) ? "mp4" : "png";
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `conteudo-${Date.now()}-${index}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // fallback
      const link = document.createElement("a");
      link.href = url;
      link.download = `conteudo-${Date.now()}-${index}.${ext}`;
      link.target = "_blank";
      link.click();
    }
  };

  const handleDownloadAll = async (content: GeneratedContent) => {
    if (!content.image_urls.length) return;
    const toastId = toast.loading(`Compactando ${content.image_urls.length} mídias...`);
    try {
      const zip = new JSZip();
      await Promise.all(content.image_urls.map(async (url, i) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const ext = isVideoUrl(url) ? "mp4" : "png";
          const label = content.image_urls.length > 1 ? `slide-${i + 1}` : `midia-${i + 1}`;
          zip.file(`${label}.${ext}`, blob);
        } catch (e) {
          console.error("Falha ao baixar", url, e);
        }
      }));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(zipBlob);
      const safeTitle = (content.title || "conteudo").replace(/[^\w\-]+/g, "_").slice(0, 50);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${safeTitle}-${content.id.slice(0, 8)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success("Download concluído!", { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao baixar mídias.", { id: toastId });
    }
  };

  const getAspectRatio = (contentType: string) => {
    if (contentType === 'video' || contentType === 'video_scene' || contentType === 'video_storyboard') {
      return 'aspect-video';
    }
    return 'aspect-[4/5]';
  };

  const MediaThumb = ({ content }: { content: GeneratedContent }) => {
    const config = contentTypeConfig[content.content_type] || contentTypeConfig.post;
    const IconComp = config.icon;
    const urls = content.image_urls;
    const [idx, setIdx] = useState(0);
    const total = urls.length;
    const currentUrl = urls[idx];
    const aspectClass = getAspectRatio(content.content_type);

    const next = (e: React.MouseEvent) => { e.stopPropagation(); setIdx((idx + 1) % total); };
    const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIdx((idx - 1 + total) % total); };

    if (!currentUrl) {
      return (
        <div className={`overflow-hidden bg-muted/50 flex items-center justify-center ${aspectClass}`}>
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
            <IconComp className="w-12 h-12" />
            <span className="text-xs">Sem mídia</span>
          </div>
        </div>
      );
    }

    return (
      <div className={`overflow-hidden bg-muted relative group/thumb ${aspectClass}`}>
        {isVideoUrl(currentUrl) ? (
          <>
            <video
              src={currentUrl}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              controls
              onClick={(e) => e.stopPropagation()}
            />
          </>
        ) : (
          <img
            src={currentUrl}
            alt={content.title || "Conteúdo gerado"}
            className="w-full h-full object-cover transition-transform duration-300"
          />
        )}

        {total > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              aria-label="Próximo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
              {idx + 1} / {total}
            </div>
          </>
        )}
      </div>
    );
  };


  const renderPreviewMedia = (url: string, idx: number) => {
    if (isVideoUrl(url)) {
      return (
        <div key={idx} className="rounded-xl overflow-hidden border shadow-sm">
          <div className="flex items-center justify-center bg-muted/40">
            <video src={url} controls className="max-w-full max-h-[65vh] object-contain" preload="metadata" />
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Vídeo {idx + 1}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDownload(url, idx)}>
              <Download className="w-3 h-3 mr-1" />Baixar
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div key={idx} className="rounded-xl overflow-hidden border shadow-sm">
        <div className="flex items-center justify-center bg-muted/40">
          <img src={url} alt={`Imagem ${idx + 1}`} className="max-w-full max-h-[65vh] object-contain" />
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
          <span className="text-xs font-medium text-muted-foreground">
            {(previewContent?.image_urls?.length || 0) > 1 ? `Slide ${idx + 1}` : "Imagem"}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDownload(url, idx)}>
            <Download className="w-3 h-3 mr-1" />Baixar
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="mb-8 sm:mb-12 relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/home" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Histórico de Criações</h1>
            <p className="text-sm text-muted-foreground">Todas as mídias geradas por IA</p>
          </div>
        </div>

        {/* Client Filter - hidden when entered via a specific client context */}
        {!selectedClient?.id && (
          <div className="mb-6 flex items-center gap-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <Select value={filterClientId} onValueChange={setFilterClientId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filtrar por cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.fantasy_name || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {selectedClient?.id && (
          <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            Exibindo apenas conteúdos de <span className="font-semibold text-foreground">{selectedClient.fantasy_name || selectedClient.name}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando histórico...</p>
          </div>
        ) : contents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Image className="w-16 h-16 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum conteúdo gerado ainda</p>
            <p className="text-sm text-muted-foreground">Crie seu primeiro conteúdo avulso no Hub do Cliente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {contents.map((content) => {
              const config = contentTypeConfig[content.content_type] || contentTypeConfig.post;
              const IconComp = config.icon;
              return (
                <Card
                  key={content.id}
                  className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border hover:border-primary/50"
                >
                  <div className="cursor-pointer" onClick={() => { setPreviewContent(content); setPreviewOpen(true); }}>
                    <MediaThumb content={content} />
                  </div>
                  <div className="p-4 space-y-2 cursor-pointer" onClick={() => { setPreviewContent(content); setPreviewOpen(true); }}>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        <IconComp className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                      {content.image_urls.length > 1 && (
                        <span className="text-xs text-muted-foreground">{content.image_urls.length} mídias</span>
                      )}
                    </div>
                    {content.title && (
                      <p className="text-sm font-medium line-clamp-2">{content.title}</p>
                    )}
                    {content.client_name && filterClientId === "all" && (
                      <p className="text-xs text-muted-foreground truncate">{content.client_name}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(content.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                  {content.image_urls.length > 0 && (
                    <div className="px-4 pb-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => { e.stopPropagation(); handleDownloadAll(content); }}
                      >
                        <Download className="w-3.5 h-3.5 mr-2" />
                        Baixar {content.image_urls.length > 1 ? `Todas (${content.image_urls.length})` : "Mídia"}
                      </Button>
                    </div>
                  )}
                </Card>

              );
            })}
          </div>
        )}

        {/* Preview Modal */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[95vh] !flex !flex-col overflow-hidden">
            <DialogDescription className="sr-only">Visualização do conteúdo gerado</DialogDescription>
            {previewContent && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold">{previewContent.title || "Conteúdo Gerado"}</h2>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(previewContent.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
                      {previewContent.client_name && ` · ${previewContent.client_name}`}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {contentTypeConfig[previewContent.content_type]?.label || previewContent.content_type}
                  </Badge>
                </div>
                {previewContent.prompt && (
                  <p className="text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3">
                    <span className="font-medium">Prompt:</span> {previewContent.prompt}
                  </p>
                )}
                {previewContent.image_urls.length > 0 ? (
                  <div className="flex-1 overflow-y-auto space-y-4">
                    {previewContent.image_urls.map((url, idx) => renderPreviewMedia(url, idx))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center text-muted-foreground">
                      <Film className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">Este storyboard não possui mídias anexadas.</p>
                      <p className="text-xs mt-1">Gere as cenas de vídeo no Hub do Cliente.</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => previewContent && handleOpenInGenerator(previewContent)}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir no Gerador
                  </Button>
                  {previewContent.image_urls.length > 1 && (
                    <Button variant="outline" className="flex-1" onClick={() => handleDownloadAll(previewContent)}>
                      <Download className="w-4 h-4 mr-2" />Baixar Todas ({previewContent.image_urls.length})
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ContentHistory;
