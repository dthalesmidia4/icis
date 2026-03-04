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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Download, Image, LayoutGrid, Video, Eye, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface GeneratedContent {
  id: string;
  content_type: string;
  title: string | null;
  prompt: string | null;
  image_urls: string[];
  metadata: Record<string, any>;
  created_at: string;
}

const contentTypeConfig: Record<string, { label: string; icon: typeof Image; color: string }> = {
  post: { label: "Post Estático", icon: Image, color: "bg-blue-500" },
  carousel: { label: "Carrossel", icon: LayoutGrid, color: "bg-purple-500" },
  video: { label: "Vídeo", icon: Video, color: "bg-pink-500" },
};

const ContentHistory = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<GeneratedContent | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate("/home");
    }
  }, [isInitialized, selectedClient, navigate]);

  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchContents = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("generated_contents")
        .select("*")
        .eq("client_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching contents:", error);
        toast.error("Erro ao carregar histórico");
      } else {
        setContents((data || []).map((d: any) => ({ ...d, image_urls: Array.isArray(d.image_urls) ? d.image_urls : [] })));
      }
      setLoading(false);
    };
    fetchContents();
  }, [selectedClient?.id, tenantId]);

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const handleDownload = (url: string, index: number) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `conteudo-${Date.now()}-${index}.png`;
    link.click();
  };

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="mb-8 sm:mb-12 relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/client-hub" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Histórico de Criações</h1>
            <p className="text-sm text-muted-foreground">{displayName}</p>
          </div>
        </div>

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
              const firstImage = content.image_urls[0];
              return (
                <Card
                  key={content.id}
                  className="group overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border hover:border-primary/50"
                  onClick={() => { setPreviewContent(content); setPreviewOpen(true); }}
                >
                  {firstImage ? (
                    <div className="aspect-square overflow-hidden bg-muted">
                      <img src={firstImage} alt={content.title || "Conteúdo gerado"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  ) : (
                    <div className="aspect-square flex items-center justify-center bg-muted">
                      <IconComp className="w-16 h-16 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        <IconComp className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                      {content.image_urls.length > 1 && (
                        <span className="text-xs text-muted-foreground">{content.image_urls.length} imagens</span>
                      )}
                    </div>
                    {content.title && (
                      <p className="text-sm font-medium line-clamp-2">{content.title}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(content.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Preview Modal */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[95vh] !flex !flex-col overflow-hidden">
            {previewContent && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold">{previewContent.title || "Conteúdo Gerado"}</h2>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(previewContent.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
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
                <div className="flex-1 overflow-y-auto space-y-4">
                  {previewContent.image_urls.map((url, idx) => (
                    <div key={idx} className="rounded-xl overflow-hidden border shadow-sm">
                      <img src={url} alt={`Imagem ${idx + 1}`} className="w-full" />
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                        <span className="text-xs font-medium text-muted-foreground">
                          {previewContent.image_urls.length > 1 ? `Slide ${idx + 1}` : "Imagem"}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDownload(url, idx)}>
                          <Download className="w-3 h-3 mr-1" />Baixar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {previewContent.image_urls.length > 1 && (
                  <Button variant="outline" className="mt-4 w-full" onClick={() => previewContent.image_urls.forEach((url, i) => handleDownload(url, i))}>
                    <Download className="w-4 h-4 mr-2" />Baixar Todas ({previewContent.image_urls.length} imagens)
                  </Button>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ContentHistory;
