import { useNavigate, useLocation } from "react-router-dom";
import JSZip from "jszip";
import { Card } from "@/components/ui/card";
import { FileText, Lightbulb, CalendarDays, ClipboardList, History, Clock, Zap, CheckSquare, Image, LayoutGrid, Video, PenTool, Bot, PenLine, Palette, Clapperboard, Sparkles, User, Plus, Trash2, Loader2, Download, ThumbsDown, ChevronDown, Upload, Play, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useHubPermissions, type ClientHubButtonId } from "@/hooks/useHubPermissions";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { useTenant } from "@/contexts/TenantContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import VisualIdentityModal from "@/components/VisualIdentityModal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ClientHub = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const { canAccess: canAccessButton } = useHubPermissions();
  const { role } = useAgencyRole();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [productionModalOpen, setProductionModalOpen] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState<string | null>(null);
  const [pendingCardsCount, setPendingCardsCount] = useState(0);
  const [rejectedCardsCount, setRejectedCardsCount] = useState(0);
  const [visualIdentityModalOpen, setVisualIdentityModalOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoIdea, setVideoIdea] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [videoAspectRatio, setVideoAspectRatio] = useState('9:16');
  const [videoStep, setVideoStep] = useState<1 | 2>(1);
  const [videoScenes, setVideoScenes] = useState<Array<{ scene_description: string; mascot_speech: string; frame0_url?: string; video_url?: string; generating?: boolean }>>([]);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [uploadingFrame, setUploadingFrame] = useState<number | null>(null);
  const [videoPreviewIndex, setVideoPreviewIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; primary_color: string | null; secondary_color: string | null }>>([]);
  const [aiPostModalOpen, setAiPostModalOpen] = useState(false);
  const [postIdea, setPostIdea] = useState('');
  const [selectedMascotIds, setSelectedMascotIds] = useState<string[]>([]);
  const [mascotImages, setMascotImages] = useState<Array<{ id: string; image_url: string; file_name: string | null }>>([]);
  const [aiCarouselModalOpen, setAiCarouselModalOpen] = useState(false);
  const [carouselIdea, setCarouselIdea] = useState('');
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [carouselStep, setCarouselStep] = useState<1 | 2>(1);
  const [carouselSlides, setCarouselSlides] = useState<Array<{ text: string; label: string }>>([]);
  const [generatingCarousel, setGeneratingCarousel] = useState(false);
  const [carouselAspectRatio, setCarouselAspectRatio] = useState('1:1');
  const [carouselAiModel, setCarouselAiModel] = useState<'nanobanana3' | 'nanobanana25' | 'gpt2'>('gpt2');
  const [staticAiModel, setStaticAiModel] = useState<'nanobanana3' | 'nanobanana25' | 'gpt2'>('gpt2');
  const [staticAspectRatio, setStaticAspectRatio] = useState('1:1');
  const [generatingCarouselImages, setGeneratingCarouselImages] = useState(false);
  const [carouselGeneratedImages, setCarouselGeneratedImages] = useState<Array<{ slideIndex: number; imageUrl: string }>>([]);
  const [carouselImageProgress, setCarouselImageProgress] = useState('');
  const [manualCarouselOpen, setManualCarouselOpen] = useState(false);
  const [manualSlides, setManualSlides] = useState<Array<{ text: string; label: string }>>([
    { text: '', label: 'Gancho (Atração)' },
    { text: '', label: 'Conteúdo' },
    { text: '', label: 'Chamada para Ação (CTA)' },
  ]);
  const [manualPostOpen, setManualPostOpen] = useState(false);
  const [manualPostText, setManualPostText] = useState('');
  const [generatingPost, setGeneratingPost] = useState(false);
  const [generatedPostImage, setGeneratedPostImage] = useState<string | null>(null);
  const [generatingManualPost, setGeneratingManualPost] = useState(false);
  const [generatedManualPostImage, setGeneratedManualPostImage] = useState<string | null>(null);
  const [contentHubModalOpen, setContentHubModalOpen] = useState(false);
  const [contentRequirementsModalOpen, setContentRequirementsModalOpen] = useState(false);
  const [planPeriodModalOpen, setPlanPeriodModalOpen] = useState(false);
  const [contentRequirements, setContentRequirements] = useState('');
  const [savingRequirements, setSavingRequirements] = useState(false);
  const [demandaPlanejadaModalOpen, setDemandaPlanejadaModalOpen] = useState(false);
  const [solicitacaoCliente, setSolicitacaoCliente] = useState('');

  const handleContinuarDemandaPlanejada = () => {
    if (!solicitacaoCliente.trim()) {
      toast.error('Descreva o que o cliente solicitou antes de continuar.');
      return;
    }
    // Próxima etapa será conectada futuramente
  };

  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchPresets = async () => {
      const { data } = await supabase
        .from('visual_identity_presets')
        .select('id, name, primary_color, secondary_color')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (data) {
        setPresets(data);
        if (data.length > 0) {
          setSelectedPresetId((current) => current ?? data[0].id);
        }
      }
    };
    fetchPresets();
  }, [selectedClient?.id, tenantId]);

  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchMascots = async () => {
      const { data } = await supabase
        .from('company_mascot_images')
        .select('id, image_url, file_name')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('position', { ascending: true });
      if (data) setMascotImages(data);
    };
    fetchMascots();
  }, [selectedClient?.id, tenantId]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);

  useEffect(() => {
    if (!selectedClient?.id || !tenantId) return;
    const fetchRequirements = async () => {
      const { data } = await supabase
        .from('tenant_companies')
        .select('content_requirements')
        .eq('id', selectedClient.id)
        .single();
      if (data) setContentRequirements((data as any).content_requirements || '');
    };
    fetchRequirements();
  }, [selectedClient?.id, tenantId]);

  useEffect(() => {
    if (!selectedClient || !tenantId) return;
    const fetchCount = async () => {
      try {
        const { data: periods } = await supabase
          .from('period_plans')
          .select('id, default_plan, ultra_plan')
          .eq('company_id', selectedClient.id)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!periods) return;
        for (const p of periods) {
          const dp = Array.isArray(p.default_plan) ? p.default_plan : [];
          const up = Array.isArray(p.ultra_plan) ? p.ultra_plan : [];
          const totalCards = dp.length + up.length;
          if (totalCards > 0) {
            const { data: existingDemands } = await supabase
              .from('demands')
              .select('title')
              .eq('period_plan_id', p.id)
              .eq('client_id', selectedClient.id);
            const approvedTitles = new Set((existingDemands || []).map(d => d.title));
            const allItems = [...dp, ...up] as any[];
            const pending = allItems.filter(item => {
              const title = item.titulo || item.title || '';
              return !approvedTitles.has(title);
            });
            setPendingCardsCount(pending.length);
            return;
          }
        }
        setPendingCardsCount(0);
      } catch {
        // silently fail
      }
    };
    fetchCount();
  }, [selectedClient, tenantId]);

  useEffect(() => {
    if (!selectedClient || !tenantId) return;
    const fetchRejectedCount = async () => {
      try {
        const { data: periods } = await supabase
          .from('period_plans')
          .select('rejected_plan')
          .eq('company_id', selectedClient.id)
          .eq('tenant_id', tenantId);
        if (!periods) return;
        let total = 0;
        for (const p of periods) {
          const rp = Array.isArray(p.rejected_plan) ? p.rejected_plan : [];
          total += rp.length;
        }
        setRejectedCardsCount(total);
      } catch {
        // silently fail
      }
    };
    fetchRejectedCount();
  }, [selectedClient, tenantId]);

  // Handle opening content from history navigation state
  useEffect(() => {
    const state = location.state as { openContentFromHistory?: { type: string; prompt: string; title: string; metadata?: any; image_urls?: string[]; content_type?: string } } | null;
    if (!state?.openContentFromHistory || !isInitialized || !selectedClient) return;

    const { type, prompt, metadata, image_urls, content_type } = state.openContentFromHistory;

    // Clear the state so it doesn't re-trigger
    window.history.replaceState({}, document.title);

    // Small delay to let component mount fully
    setTimeout(() => {
      if (type === "post") {
        setPostIdea(prompt || "");
        setAiPostModalOpen(true);
        if (image_urls?.length) {
          setGeneratedPostImage(image_urls[0]);
        }
      } else if (type === "carousel") {
        setCarouselIdea(prompt || "");
        setAiCarouselModalOpen(true);
        if (image_urls?.length) {
          setCarouselGeneratedImages(image_urls.map((url, i) => ({ slideIndex: i, imageUrl: url })));
          setCarouselStep(2);
          // Reconstruct slides from metadata if available
          if (metadata?.slides && Array.isArray(metadata.slides)) {
            setCarouselSlides(metadata.slides);
          } else {
            setCarouselSlides(image_urls.map((_, i) => ({ text: '', label: `Slide ${i + 1}` })));
          }
        }
      } else if (type === "video") {
        setVideoIdea(prompt || "");
        setVideoModalOpen(true);
        // If it's a storyboard with metadata scenes, restore them
        if (metadata?.scenes && Array.isArray(metadata.scenes)) {
          setVideoScenes(metadata.scenes.map((s: any) => ({
            scene_description: s.scene_description || '',
            mascot_speech: s.mascot_speech || '',
            frame0_url: s.frame0_url || undefined,
            video_url: s.video_url || undefined,
            generating: false,
          })));
          setVideoStep(2);
        } else if (content_type === "video_scene" && image_urls?.length) {
          // Single scene - go to step 2 with the video
          setVideoScenes([{
            scene_description: prompt || '',
            mascot_speech: '',
            video_url: image_urls[0],
            generating: false,
          }]);
          setVideoStep(2);
        }
      }
    }, 100);
  }, [location.state, isInitialized, selectedClient]);

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const saveGeneratedContent = async (contentType: string, title: string, prompt: string, imageUrls: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('generated_contents').insert({
        tenant_id: tenantId!,
        client_id: selectedClient!.id,
        content_type: contentType,
        title,
        prompt,
        image_urls: imageUrls as any,
        created_by: user?.id || null,
      });
      if (error) {
        console.error('Error saving generated content to DB:', error);
      } else {
        console.log('Generated content saved successfully:', contentType, imageUrls.length, 'images');
      }
    } catch (err) { console.error('Error saving generated content:', err); }
  };

  const handleGeneratePost = async (idea: string, isManual: boolean = false) => {
    const setGenerating = isManual ? setGeneratingManualPost : setGeneratingPost;
    const setImage = isManual ? setGeneratedManualPostImage : setGeneratedPostImage;
    setGenerating(true);
    setImage(null);
    try {
      const selectedMascotUrls = mascotImages
        .filter(m => selectedMascotIds.includes(m.id))
        .map(m => m.image_url);
      const { data, error } = await supabase.functions.invoke('generate-standalone-post', {
        body: { idea, presetId: selectedPresetId, mascotImageUrls: selectedMascotUrls, clientId: selectedClient.id, tenantId, aiModel: staticAiModel, aspectRatio: staticAspectRatio },
      });
      if (error) { console.error('Edge function error:', error); toast.error('Erro ao gerar o post. Tente novamente.'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.imageUrl) {
        setImage(data.imageUrl);
        toast.success('Post gerado com sucesso!');
        await saveGeneratedContent('post', isManual ? 'Post Manual' : 'Post com IA', idea, [data.imageUrl]);
      } else { toast.error('Nenhuma imagem retornada.'); }
    } catch (err) { console.error('Generate post error:', err); toast.error('Erro inesperado ao gerar o post.'); }
    finally { setGenerating(false); }
  };

  const handleGenerateCarouselContent = async () => {
    if (!carouselIdea.trim() || !slideCount) return;
    setGeneratingCarousel(true);
    try {
      const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
      const { data, error } = await supabase.functions.invoke('generate-carousel-content', {
        body: { idea: carouselIdea, slideCount, presetId: selectedPresetId, mascotImageUrls: selectedMascotUrls, clientId: selectedClient.id, tenantId },
      });
      if (error) { console.error('Edge function error:', error); toast.error('Erro ao gerar conteúdo do carrossel. Tente novamente.'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.slides && Array.isArray(data.slides)) { setCarouselSlides(data.slides); setCarouselStep(2); toast.success('Conteúdo gerado! Revise e edite os slides.'); }
      else { toast.error('Nenhum conteúdo retornado.'); }
    } catch (err) { console.error('Generate carousel error:', err); toast.error('Erro inesperado ao gerar o carrossel.'); }
    finally { setGeneratingCarousel(false); }
  };

  const handleGenerateCarouselImages = async () => {
    setGeneratingCarouselImages(true);
    setCarouselGeneratedImages([]);
    setCarouselImageProgress('Preparando geração...');
    try {
      const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
      const allImages: Array<{ slideIndex: number; imageUrl: string }> = [];
      const BATCH_SIZE = 2;
      const totalSlides = carouselSlides.length;

      for (let batchStart = 0; batchStart < totalSlides; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSlides);
        const batchSlides = carouselSlides.slice(batchStart, batchEnd);
        setCarouselImageProgress(`Gerando slides ${batchStart + 1}-${batchEnd} de ${totalSlides}...`);

        const { data, error } = await supabase.functions.invoke('generate-carousel-images', {
          body: {
            slides: batchSlides,
            allSlides: carouselSlides,
            batchOffset: batchStart,
            aspectRatio: carouselAspectRatio,
            aiModel: carouselAiModel,
            presetId: selectedPresetId,
            mascotImageUrls: selectedMascotUrls,
            clientId: selectedClient.id,
            tenantId,
          },
        });

        if (error) { console.error('Edge function error (batch):', error); toast.error(`Erro ao gerar slides ${batchStart + 1}-${batchEnd}.`); continue; }
        if (data?.error) { toast.error(data.error); if (data.partialImages?.length > 0) allImages.push(...data.partialImages); continue; }
        if (data?.images && Array.isArray(data.images)) {
          // Adjust slide indices to global positions
          const adjustedImages = data.images.map((img: any) => ({
            slideIndex: img.slideIndex + batchStart,
            imageUrl: img.imageUrl,
          }));
          allImages.push(...adjustedImages);
          setCarouselGeneratedImages([...allImages]);
        }
      }

      if (allImages.length === 0) {
        toast.error('Nenhuma imagem foi gerada. Tente novamente.');
      } else {
        toast.success(`${allImages.length}/${totalSlides} imagens geradas com sucesso!`);
        const urls = allImages.map(img => img.imageUrl).filter(Boolean);
        if (urls.length > 0) await saveGeneratedContent('carousel', 'Carrossel com IA', carouselIdea, urls);
      }
    } catch (err) { console.error('Generate carousel images error:', err); toast.error('Erro inesperado ao gerar imagens.'); }
    finally { setGeneratingCarouselImages(false); setCarouselImageProgress(''); }
  };

  const handleGenerateStoryboard = async () => {
    if (!videoIdea.trim()) return;
    setGeneratingStoryboard(true);
    try {
      const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
      const { data, error } = await supabase.functions.invoke('generate-video-storyboard', {
        body: { idea: videoIdea, sceneCount, presetId: selectedPresetId, mascotImageUrls: selectedMascotUrls, clientId: selectedClient.id, tenantId },
      });
      if (error) { console.error('Edge function error:', error); toast.error('Erro ao gerar storyboard. Tente novamente.'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.scenes && Array.isArray(data.scenes)) {
        setVideoScenes(data.scenes.map((s: any) => ({ ...s, frame0_url: undefined, video_url: undefined, generating: false })));
        setVideoStep(2);
        toast.success('Storyboard gerado! Insira os frames e gere as cenas.');
        await saveGeneratedContent('video_storyboard', 'Storyboard de Vídeo', videoIdea, []);
      } else { toast.error('Nenhuma cena retornada.'); }
    } catch (err) { console.error('Generate storyboard error:', err); toast.error('Erro inesperado ao gerar o storyboard.'); }
    finally { setGeneratingStoryboard(false); }
  };

  const handleFrameUpload = async (sceneIndex: number, file: File) => {
    setUploadingFrame(sceneIndex);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `video-frames/${selectedClient.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('card-attachments').upload(filePath, file, { contentType: file.type, upsert: true });
      if (uploadError) { toast.error('Erro ao fazer upload da imagem.'); return; }
      const { data: publicUrlData } = supabase.storage.from('card-attachments').getPublicUrl(filePath);
      setVideoScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, frame0_url: publicUrlData.publicUrl } : s));
      toast.success(`Frame 0 da Cena ${sceneIndex + 1} carregado!`);
    } catch (err) { console.error('Frame upload error:', err); toast.error('Erro ao fazer upload.'); }
    finally { setUploadingFrame(null); }
  };

  const handleGenerateScene = async (sceneIndex: number) => {
    const scene = videoScenes[sceneIndex];
    if (!scene.scene_description.trim()) { toast.error('Descrição da cena é obrigatória.'); return; }
    
    setVideoScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, generating: true } : s));
    try {
      const { data, error } = await supabase.functions.invoke('generate-video-scene', {
        body: {
          sceneDescription: scene.scene_description,
          mascotSpeech: scene.mascot_speech || null,
          frameUrl: scene.frame0_url || null,
          clientId: selectedClient.id,
          tenantId,
          sceneIndex,
          aspectRatio: videoAspectRatio,
        },
      });
      if (error) { console.error('Edge function error:', error); toast.error(`Erro ao gerar Cena ${sceneIndex + 1}.`); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.videoUrl) {
        setVideoScenes(prev => {
          const updated = prev.map((s, i) => i === sceneIndex ? { ...s, video_url: data.videoUrl } : s);
          // Auto-navigate to the newly generated scene in the preview carousel
          const generatedScenes = updated.filter(s => s.video_url || s.generating);
          const newIndex = generatedScenes.findIndex((_, gi) => {
            let count = -1;
            for (let j = 0; j < updated.length; j++) {
              if (updated[j].video_url || updated[j].generating) count++;
              if (j === sceneIndex) return count === gi;
            }
            return false;
          });
          if (newIndex >= 0) setVideoPreviewIndex(newIndex);
          return updated;
        });
        toast.success(`Cena ${sceneIndex + 1} gerada com sucesso!`);
        await saveGeneratedContent('video_scene', `Cena ${sceneIndex + 1} - Vídeo`, scene.scene_description, [data.videoUrl]);
      } else { toast.error('Nenhum vídeo retornado.'); }
    } catch (err) { console.error('Generate scene error:', err); toast.error('Erro inesperado ao gerar a cena.'); }
    finally { setVideoScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, generating: false } : s)); }
  };

  const handleSaveContentRequirements = async () => {
    if (!selectedClient?.id) return;
    setSavingRequirements(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .update({ content_requirements: contentRequirements } as any)
        .eq('id', selectedClient.id);
      if (error) throw error;
      toast.success('Exigências de conteúdo salvas!');
      setContentRequirementsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar exigências.');
    } finally {
      setSavingRequirements(false);
    }
  };


  const isAdmin = role === 'agency_admin' || role === 'super_admin' || role === 'agency_manager';

  const allActionCards = [
    { id: 'client_cadastro' as ClientHubButtonId, title: "Cadastro", icon: ClipboardList, action: () => navigate(`/clientes/${selectedClient.id}`) },
    { id: 'client_anamnese' as ClientHubButtonId, title: "Anamnese", icon: FileText, action: () => navigate("/client-guide") },
    { id: 'client_estrategia' as ClientHubButtonId, title: "Estratégia", icon: Lightbulb, action: () => navigate("/strategies") },
    { id: 'client_planejar_periodo' as ClientHubButtonId, title: "Planejar Período", icon: CalendarDays, action: () => setPlanPeriodModalOpen(true) },
    { id: 'client_aprovar_producao' as ClientHubButtonId, title: "Aprovar Produção de Demandas", icon: CheckSquare, action: () => navigate("/approve-cards"), badge: pendingCardsCount > 0 ? pendingCardsCount : undefined },
    { id: 'client_demandas_reprovadas' as ClientHubButtonId, title: "Demandas Reprovadas", icon: ThumbsDown, action: () => navigate("/rejected-cards"), badge: rejectedCardsCount > 0 ? rejectedCardsCount : undefined },
    { id: 'client_cronograma_atual' as ClientHubButtonId, title: "Cronograma Atual", icon: Clock, action: () => setScheduleModalOpen(true) },
    { id: 'client_historico' as ClientHubButtonId, title: "Histórico de Períodos", icon: History, action: () => navigate("/plan-period?tab=history") },
    { id: 'client_identidade_visual' as ClientHubButtonId, title: "Identidade Visual", icon: Palette, action: () => setVisualIdentityModalOpen(true) },
    { id: 'client_conteudo_avulso' as ClientHubButtonId, title: "Conteúdo Avulso", icon: PenTool, action: () => setContentHubModalOpen(true) },
    { id: 'client_conteudo_avulso_backup' as ClientHubButtonId, title: "Conteúdo Avulso (Backup)", icon: PenTool, action: () => setContentHubModalOpen(true) },
  ];

  // Admins see all buttons; others are filtered by permissions
  const actionCards = isAdmin
    ? allActionCards
    : allActionCards.filter(card => canAccessButton(card.id));

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="mb-8 sm:mb-12 text-center relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/home" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
            {displayName}
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground mb-3 sm:mb-4">Hub do Cliente</p>
          <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-primary/10 rounded-full">
            <div className="w-2 h-2 sm:w-3 sm:h-3 bg-primary rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm font-medium text-primary">Cliente Ativo</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {actionCards.map((card, index) => (
            <Card key={index} className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" onClick={card.action}>
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
              {'badge' in card && card.badge && (
                <div className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">{card.badge}</div>
              )}
              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                </div>
                <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">{card.title}</h3>
              </div>
            </Card>
          ))}
        </div>

        {/* Modal Hub Conteúdo Avulso - Criar ou Histórico */}
        <Dialog open={contentHubModalOpen} onOpenChange={setContentHubModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Conteúdo Avulso</DialogTitle>
              <p className="text-sm text-muted-foreground">O que deseja fazer?</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setContentHubModalOpen(false); setContentModalOpen(true); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Criar</h3>
                  <p className="text-xs text-muted-foreground mt-2">Criar novo conteúdo avulso</p>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setContentHubModalOpen(false); navigate('/content-history'); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <History className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Histórico de Criações</h3>
                  <p className="text-xs text-muted-foreground mt-2">Ver conteúdos já gerados</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Conteúdo Avulso */}
        <Dialog open={contentModalOpen} onOpenChange={setContentModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setContentModalOpen(false); setContentHubModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-xl">O que você vai criar hoje?</DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">Escolha o formato do conteúdo avulso para {displayName}.</p>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 py-4">
              {[
                { title: "Post Estático", icon: Image, description: "Uma única imagem impactante. Ideal para frases, avisos rápidos ou lembretes." },
                { title: "Carrossel", icon: LayoutGrid, description: "Uma sequência narrativa. Ideal para tutoriais, listas e storytelling." },
                { title: "Vídeo", icon: Video, description: "Vídeos realistas de alta qualidade gerados por IA." },
               ].map((item, idx) => (
                <Card
                  key={idx}
                  className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                  onClick={() => {
                    setContentModalOpen(false);
                    if (item.title === "Vídeo") {
                      setContentModalOpen(false);
                      setVideoModalOpen(true);
                    } else {
                      setSelectedContentType(item.title);
                      setProductionModalOpen(true);
                    }
                  }}
                >
                  <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="relative p-4 sm:p-6 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <item.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                    </div>
                    <h3 className="text-base sm:text-lg font-bold transition-colors text-primary">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Tipo de Produção */}
        <Dialog open={productionModalOpen} onOpenChange={(open) => { setProductionModalOpen(open); if (!open) setSelectedContentType(null); }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setProductionModalOpen(false); setContentModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-xl">{selectedContentType}</DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">Escolha como deseja criar o conteúdo.</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => {
                  setProductionModalOpen(false);
                  if (selectedContentType === "Post Estático") {
                    setManualPostOpen(true);
                  } else if (selectedContentType === "Carrossel") {
                    setManualCarouselOpen(true);
                  }
                }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <PenLine className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Criar Manualmente</h3>
                  <p className="text-xs text-muted-foreground mt-2">Você escreve o conteúdo</p>
                </div>
              </Card>
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => {
                  setProductionModalOpen(false);
                  if (selectedContentType === "Post Estático") {
                    setAiPostModalOpen(true);
                  } else if (selectedContentType === "Carrossel") {
                    setAiCarouselModalOpen(true);
                  }
                }}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Gerar com IA</h3>
                  <p className="text-xs text-muted-foreground mt-2">A IA cria o conteúdo</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Gerar Post Estático com IA */}
        <Dialog open={aiPostModalOpen} onOpenChange={(open) => { setAiPostModalOpen(open); if (!open) { setPostIdea(''); setSelectedPresetId(presets[0]?.id ?? null); setSelectedMascotIds([]); setGeneratedPostImage(null); setStaticAiModel('gpt2'); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${generatedPostImage ? 'sm:max-w-5xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[90vh]'}`}>
            <DialogHeader>
             <div className="flex items-center gap-2">
                <button onClick={() => { setAiPostModalOpen(false); setPostIdea(''); setSelectedPresetId(null); setSelectedMascotIds([]); setGeneratedPostImage(null); setSelectedContentType("Post Estático"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />Gerar Post com IA
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className={`flex-1 min-h-0 ${generatedPostImage ? 'flex gap-6' : 'overflow-y-auto'}`}>
              <div className={`space-y-4 py-1 ${generatedPostImage ? 'w-[40%] flex-shrink-0 overflow-y-auto' : 'w-full'}`}>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Ideia do Post</Label>
                  <Textarea placeholder="Ex: 'Crie um post de natal com tom acolhedor...'" value={postIdea}
                    onChange={(e) => setPostIdea(e.target.value)} className="min-h-[100px] resize-none" disabled={generatingPost} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Predefinição Visual</Label>
                    {presets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((preset) => (
                          <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingPost}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                            <div className="flex gap-0.5">
                              {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                              {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                            </div>
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mascote</Label>
                    {mascotImages.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {mascotImages.map((mascot) => {
                          const isSelected = selectedMascotIds.includes(mascot.id);
                          return (
                            <button key={mascot.id} disabled={generatingPost} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                              className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                              <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                              {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Modelo de IA</Label>
                      <Select value={staticAiModel} onValueChange={(v) => setStaticAiModel(v as 'nanobanana3' | 'nanobanana25' | 'gpt2')} disabled={generatingPost}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nanobanana3">Nanobanana 3 (Pro)</SelectItem>
                          <SelectItem value="nanobanana25">Nanobanana 2.5 (Flash)</SelectItem>
                          <SelectItem value="gpt2">GPT Image 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Proporção</Label>
                      <Select value={staticAspectRatio} onValueChange={setStaticAspectRatio} disabled={generatingPost}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1:1">1:1 (Quadrado)</SelectItem>
                          <SelectItem value="9:16">9:16 (Stories/Reels)</SelectItem>
                          <SelectItem value="16:9">16:9 (Paisagem)</SelectItem>
                          <SelectItem value="4:5">4:5 (Feed)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {generatedPostImage && (
                <div className="w-[60%] flex-shrink-0 flex flex-col py-1">
                  <Label className="text-sm font-medium mb-2">Resultado</Label>
                  <div className="flex-1 min-h-0 flex items-center justify-center rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg bg-black/5">
                    <img src={generatedPostImage} alt="Post gerado pela IA" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}
            </div>

            <div className={`flex gap-3 mt-1 ${generatedPostImage ? '' : 'flex-col'}`}>
              {generatedPostImage && (
                <Button variant="outline" className="h-11 text-sm font-semibold flex-1" onClick={() => {
                  const link = document.createElement('a'); link.href = generatedPostImage; link.download = `post-${selectedClient?.name || 'gerado'}-${Date.now()}.png`; link.click();
                }}>
                  <Download className="w-4 h-4 mr-2" />Baixar Imagem
                </Button>
              )}
              <Button className={`h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 ${generatedPostImage ? 'flex-1' : 'w-full'}`} disabled={!postIdea.trim() || generatingPost} onClick={() => handleGeneratePost(postIdea)}>
                {generatingPost ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>) : (<><Sparkles className="w-4 h-4 mr-2" />{generatedPostImage ? 'Gerar Novamente' : 'Gerar Post'}</>)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Post Estático Manual */}
        <Dialog open={manualPostOpen} onOpenChange={(open) => { setManualPostOpen(open); if (!open) { setManualPostText(''); setSelectedPresetId(null); setSelectedMascotIds([]); setGeneratedManualPostImage(null); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${generatedManualPostImage ? 'sm:max-w-5xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[90vh]'}`}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setManualPostOpen(false); setManualPostText(''); setSelectedPresetId(null); setSelectedMascotIds([]); setGeneratedManualPostImage(null); setSelectedContentType("Post Estático"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <PenLine className="w-5 h-5 text-primary" />Editor de Post
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className={`flex-1 min-h-0 ${generatedManualPostImage ? 'flex gap-6' : 'overflow-y-auto'}`}>
              <div className={`space-y-4 py-1 ${generatedManualPostImage ? 'w-[40%] flex-shrink-0 overflow-y-auto' : 'w-full'}`}>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Texto do Post</Label>
                  <Textarea placeholder="Escreva o texto que aparecerá no post..." value={manualPostText}
                    onChange={(e) => setManualPostText(e.target.value)} className="min-h-[100px] resize-none" disabled={generatingManualPost} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Predefinição Visual</Label>
                    {presets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((preset) => (
                          <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingManualPost}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                            <div className="flex gap-0.5">
                              {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                              {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                            </div>
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mascote</Label>
                    {mascotImages.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {mascotImages.map((mascot) => {
                          const isSelected = selectedMascotIds.includes(mascot.id);
                          return (
                            <button key={mascot.id} disabled={generatingManualPost} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                              className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                              <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                              {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {generatedManualPostImage && (
                <div className="w-[60%] flex-shrink-0 flex flex-col py-1">
                  <Label className="text-sm font-medium mb-2">Resultado</Label>
                  <div className="flex-1 min-h-0 flex items-center justify-center rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg bg-black/5">
                    <img src={generatedManualPostImage} alt="Post gerado" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}
            </div>

            <div className={`flex gap-3 mt-1 ${generatedManualPostImage ? '' : 'flex-col'}`}>
              {generatedManualPostImage && (
                <Button variant="outline" className="h-11 text-sm font-semibold flex-1" onClick={() => {
                  const link = document.createElement('a'); link.href = generatedManualPostImage; link.download = `post-${selectedClient?.name || 'gerado'}-${Date.now()}.png`; link.click();
                }}>
                  <Download className="w-4 h-4 mr-2" />Baixar Imagem
                </Button>
              )}
              <Button className={`h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 ${generatedManualPostImage ? 'flex-1' : 'w-full'}`} disabled={!manualPostText.trim() || generatingManualPost} onClick={() => handleGeneratePost(manualPostText, true)}>
                {generatingManualPost ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>) : (<><Clapperboard className="w-4 h-4 mr-2" />{generatedManualPostImage ? 'Gerar Novamente' : 'Gerar Post'}</>)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Carrossel Manual */}
        <Dialog open={manualCarouselOpen} onOpenChange={(open) => { setManualCarouselOpen(open); if (!open) { setSelectedPresetId(null); setSelectedMascotIds([]); } }}>
          <DialogContent className="sm:max-w-2xl !flex !flex-col overflow-hidden max-h-[90vh]">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setManualCarouselOpen(false); setSelectedPresetId(null); setSelectedMascotIds([]); setSelectedContentType("Carrossel"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-primary" />Editor de Carrossel
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 py-1">
              {manualSlides.map((slide, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">Slide {idx + 1}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{slide.label}</span>
                    </div>
                    {manualSlides.length > 1 && (
                      <button onClick={() => setManualSlides(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <Textarea placeholder={`Texto do slide ${idx + 1}...`} value={slide.text}
                    onChange={(e) => { setManualSlides(prev => prev.map((s, i) => i === idx ? { ...s, text: e.target.value } : s)); }}
                    className="min-h-[60px] resize-none" />
                </div>
              ))}

              {manualSlides.length < 10 && (
                <button onClick={() => setManualSlides(prev => [...prev, { text: '', label: 'Conteúdo' }])}
                  className="w-full py-2.5 rounded-lg border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-primary text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  <Plus className="w-4 h-4" />Adicionar Slide
                </button>
              )}

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Predefinição Visual</Label>
                  {presets.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {presets.map((preset) => (
                        <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                          <div className="flex gap-0.5">
                            {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                            {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                          </div>
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Mascote</Label>
                  {mascotImages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {mascotImages.map((mascot) => {
                        const isSelected = selectedMascotIds.includes(mascot.id);
                        return (
                          <button key={mascot.id} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                            className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                            <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                            {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 mt-1" disabled={manualSlides.every(s => !s.text.trim()) || generatingCarouselImages}
              onClick={async () => {
                const validSlides = manualSlides.filter(s => s.text.trim());
                if (validSlides.length === 0) return;
                setCarouselSlides(validSlides);
                setManualCarouselOpen(false);
                setCarouselGeneratedImages([]);
                setGeneratingCarouselImages(true);
                setCarouselImageProgress(`Gerando ${validSlides.length} imagens... Isso pode levar alguns minutos.`);
                setAiCarouselModalOpen(true);
                setCarouselStep(2);
                try {
                  const selectedMascotUrls = mascotImages.filter(m => selectedMascotIds.includes(m.id)).map(m => m.image_url);
                  const allImages: Array<{ slideIndex: number; imageUrl: string }> = [];
                  const BATCH_SIZE = 2;
                  const totalSlides = validSlides.length;

                  for (let batchStart = 0; batchStart < totalSlides; batchStart += BATCH_SIZE) {
                    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSlides);
                    const batchSlides = validSlides.slice(batchStart, batchEnd);
                    setCarouselImageProgress(`Gerando slides ${batchStart + 1}-${batchEnd} de ${totalSlides}...`);

                    const { data, error } = await supabase.functions.invoke('generate-carousel-images', {
                      body: {
                        slides: batchSlides,
                        allSlides: validSlides,
                        batchOffset: batchStart,
                        aspectRatio: '1:1',
                        aiModel: 'gpt2',
                        presetId: selectedPresetId,
                        mascotImageUrls: selectedMascotUrls,
                        clientId: selectedClient.id,
                        tenantId,
                      },
                    });
                    if (error) { console.error('Edge function error (batch):', error); toast.error(`Erro ao gerar slides ${batchStart + 1}-${batchEnd}.`); continue; }
                    if (data?.error) { toast.error(data.error); if (data.partialImages?.length > 0) allImages.push(...data.partialImages.map((img: any) => ({ slideIndex: img.slideIndex + batchStart, imageUrl: img.imageUrl }))); continue; }
                    if (data?.images && Array.isArray(data.images)) {
                      const adjustedImages = data.images.map((img: any) => ({
                        slideIndex: img.slideIndex + batchStart,
                        imageUrl: img.imageUrl,
                      }));
                      allImages.push(...adjustedImages);
                      setCarouselGeneratedImages([...allImages]);
                    }
                  }

                  if (allImages.length === 0) {
                    toast.error('Nenhuma imagem foi gerada. Tente novamente.');
                  } else {
                    toast.success(`${allImages.length}/${totalSlides} imagens geradas com sucesso!`);
                    const urls = allImages.map(img => img.imageUrl).filter(Boolean);
                    if (urls.length > 0) await saveGeneratedContent('carousel', 'Carrossel Manual', 'Manual', urls);
                  }
                } catch (err) { console.error('Generate carousel images error:', err); toast.error('Erro inesperado ao gerar imagens.'); }
                finally { setGeneratingCarouselImages(false); setCarouselImageProgress(''); }
              }}>
              {generatingCarouselImages ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>) : (<><Clapperboard className="w-4 h-4 mr-2" />Gerar Imagens do Carrossel</>)}
            </Button>
          </DialogContent>
        </Dialog>

        {/* Modal Gerar Carrossel com IA - Two Steps */}
        <Dialog open={aiCarouselModalOpen} onOpenChange={(open) => { setAiCarouselModalOpen(open); if (!open) { setCarouselIdea(''); setSelectedPresetId(presets[0]?.id ?? null); setSelectedMascotIds([]); setSlideCount(null); setCarouselStep(1); setCarouselSlides([]); setCarouselAspectRatio('1:1'); setCarouselAiModel('gpt2'); setCarouselGeneratedImages([]); setGeneratingCarouselImages(false); setCarouselImageProgress(''); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${carouselGeneratedImages.length > 0 || generatingCarouselImages ? 'sm:max-w-6xl max-h-[95vh]' : carouselStep === 2 ? 'sm:max-w-4xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[85vh]'}`}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setAiCarouselModalOpen(false); setCarouselIdea(''); setSelectedPresetId(null); setSelectedMascotIds([]); setSlideCount(null); setCarouselStep(1); setCarouselSlides([]); setCarouselGeneratedImages([]); setSelectedContentType("Carrossel"); setProductionModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {carouselStep === 1 ? 'Gerar Carrossel com IA' : 'Editar Slides do Carrossel'}
                </DialogTitle>
              </div>
            </DialogHeader>

            {carouselStep === 1 ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Sua Ideia para o Carrossel</Label>
                    <Textarea placeholder="Ex: 'Crie um carrossel sobre 5 dicas de produtividade...'" value={carouselIdea}
                      onChange={(e) => setCarouselIdea(e.target.value)} className="min-h-[100px] resize-none" disabled={generatingCarousel} />
                  </div>

                  <div className={`space-y-1.5 rounded-lg border-2 p-3 transition-colors ${slideCount ? 'border-primary/50' : 'border-primary/80 bg-primary/5'}`}>
                    <Label className="text-sm font-medium">Quantidade de slides <span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <button key={n} onClick={() => setSlideCount(n)} disabled={generatingCarousel}
                          className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${slideCount === n ? 'bg-primary text-primary-foreground shadow-lg scale-110' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    {!slideCount && <p className="text-xs text-primary">● Selecione para habilitar a geração.</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Predefinição Visual</Label>
                      {presets.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {presets.map((preset) => (
                            <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingCarousel}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                              <div className="flex gap-0.5">
                                {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                                {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                              </div>
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Mascote</Label>
                      {mascotImages.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {mascotImages.map((mascot) => {
                            const isSelected = selectedMascotIds.includes(mascot.id);
                            return (
                              <button key={mascot.id} disabled={generatingCarousel} onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                                className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                                <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                                {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Button className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 mt-1" disabled={!carouselIdea.trim() || !slideCount || generatingCarousel} onClick={handleGenerateCarouselContent}>
                  {generatingCarousel ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando conteúdo...</>) : (<><Sparkles className="w-4 h-4 mr-2" />Gerar Carrossel</>)}
                </Button>
              </>
            ) : (
              <>
                <div className={`flex-1 min-h-0 ${carouselGeneratedImages.length > 0 || generatingCarouselImages ? 'flex gap-6' : 'overflow-y-auto'}`}>
                  <div className={`space-y-4 py-2 ${carouselGeneratedImages.length > 0 || generatingCarouselImages ? 'w-[40%] flex-shrink-0 overflow-y-auto' : 'w-full'}`}>
                    {carouselSlides.map((slide, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">Slide {idx + 1}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{slide.label}</span>
                        </div>
                        <Textarea placeholder={`Texto do slide ${idx + 1}...`} value={slide.text}
                          onChange={(e) => { setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, text: e.target.value } : s)); }}
                          className="min-h-[80px] resize-none" disabled={generatingCarouselImages} />
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Proporção</Label>
                        <Select value={carouselAspectRatio} onValueChange={setCarouselAspectRatio} disabled={generatingCarouselImages}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1:1">1:1 (Quadrado)</SelectItem>
                            <SelectItem value="9:16">9:16 (Stories/Reels)</SelectItem>
                            <SelectItem value="16:9">16:9 (Paisagem)</SelectItem>
                            <SelectItem value="4:5">4:5 (Feed Instagram)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Modelo de IA</Label>
                        <Select value={carouselAiModel} onValueChange={(v) => setCarouselAiModel(v as 'nanobanana3' | 'nanobanana25' | 'gpt2')} disabled={generatingCarouselImages}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nanobanana3">Nanobanana 3 (Pro)</SelectItem>
                            <SelectItem value="nanobanana25">Nanobanana 2.5 (Flash)</SelectItem>
                            <SelectItem value="gpt2">GPT Image 2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  {(carouselGeneratedImages.length > 0 || generatingCarouselImages) && (
                    <div className="w-[60%] flex-shrink-0 flex flex-col py-2 overflow-y-auto">
                      <Label className="text-sm font-medium mb-3">Imagens Geradas</Label>
                      {generatingCarouselImages && (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                          <Loader2 className="w-10 h-10 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground text-center">{carouselImageProgress}</p>
                        </div>
                      )}
                      <div className="space-y-4">
                        {carouselGeneratedImages.map((img, idx) => (
                          <div key={idx} className="rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <span className="text-xs font-bold text-primary">Slide {img.slideIndex + 1}</span>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                                const link = document.createElement('a'); link.href = img.imageUrl; link.download = `carousel-slide-${img.slideIndex + 1}-${Date.now()}.png`; link.click();
                              }}>
                                <Download className="w-3.5 h-3.5 mr-1" />Baixar
                              </Button>
                            </div>
                            <img src={img.imageUrl} alt={`Slide ${img.slideIndex + 1}`} className="w-full object-contain bg-black/5" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="h-12 text-base font-semibold flex-1" onClick={() => { setCarouselStep(1); setCarouselGeneratedImages([]); }} disabled={generatingCarouselImages}>
                    Voltar
                  </Button>
                  {carouselGeneratedImages.length > 0 && (
                    <Button variant="outline" className="h-12 text-base font-semibold flex-1" onClick={() => {
                      carouselGeneratedImages.forEach((img) => {
                        const link = document.createElement('a'); link.href = img.imageUrl; link.download = `carousel-slide-${img.slideIndex + 1}-${Date.now()}.png`; link.click();
                      });
                    }}>
                      <Download className="w-5 h-5 mr-2" />Baixar Todas
                    </Button>
                  )}
                  <Button className="h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/70 flex-1"
                    disabled={carouselSlides.every(s => !s.text.trim()) || generatingCarouselImages} onClick={handleGenerateCarouselImages}>
                    {generatingCarouselImages ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Gerando...</>) : (<><Sparkles className="w-5 h-5 mr-2" />{carouselGeneratedImages.length > 0 ? 'Gerar Novamente' : 'Gerar Imagens'}</>)}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Cronograma Atual</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setScheduleModalOpen(false); navigate("/plan-period?tab=history&view=latest"); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Demanda Comum</h3>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setScheduleModalOpen(false); navigate("/plan-period?tab=history&view=latest&mode=ultra"); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Demanda Ultra</h3>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        <VisualIdentityModal open={visualIdentityModalOpen} onOpenChange={setVisualIdentityModalOpen} companyId={selectedClient?.id || ''} companyName={selectedClient?.fantasy_name || selectedClient?.name || ''} tenantId={tenantId || ''} />

        {/* Modal Vídeo - Storyboard */}
        <Dialog open={videoModalOpen} onOpenChange={(open) => { setVideoModalOpen(open); if (!open) { setVideoIdea(''); setSceneCount(3); setSelectedPresetId(null); setVideoAspectRatio('9:16'); setSelectedMascotIds([]); setVideoStep(1); setVideoScenes([]); setVideoPreviewIndex(0); } }}>
          <DialogContent className={`!flex !flex-col overflow-hidden ${videoStep === 2 ? 'sm:max-w-4xl max-h-[95vh]' : 'sm:max-w-2xl max-h-[85vh]'}`}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setVideoModalOpen(false); setVideoIdea(''); setSceneCount(3); setSelectedPresetId(null); setVideoAspectRatio('9:16'); setSelectedMascotIds([]); setVideoStep(1); setVideoScenes([]); setVideoPreviewIndex(0); setContentModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Clapperboard className="w-5 h-5 text-primary" />
                  {videoStep === 1 ? 'Criar Storyboard de Vídeo' : 'Editar Cenas do Storyboard'}
                </DialogTitle>
              </div>
            </DialogHeader>

            {videoStep === 1 ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Ideia do Vídeo</Label>
                    <Textarea placeholder="Ex: Um comercial cinematográfico de um café robótico cyberpunk..." value={videoIdea} onChange={(e) => setVideoIdea(e.target.value)} className="min-h-[90px] resize-none" disabled={generatingStoryboard} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Cenas</Label>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setSceneCount(n)} disabled={generatingStoryboard}
                            className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${sceneCount === n ? 'bg-primary text-primary-foreground shadow-lg scale-110' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Formato</Label>
                      <div className="flex gap-1.5">
                        {['9:16', '16:9', '1:1', '4:5'].map((ratio) => (
                          <button key={ratio} onClick={() => setVideoAspectRatio(ratio)} disabled={generatingStoryboard}
                            className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${videoAspectRatio === ratio ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Predefinição Visual</Label>
                      {presets.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhuma predefinição salva.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {presets.map((preset) => (
                            <button key={preset.id} onClick={() => setSelectedPresetId(selectedPresetId === preset.id ? null : preset.id)} disabled={generatingStoryboard}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedPresetId === preset.id ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40 text-foreground'}`}>
                              <div className="flex gap-0.5">
                                {preset.primary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.primary_color }} />}
                                {preset.secondary_color && <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: preset.secondary_color }} />}
                              </div>
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Mascote</Label>
                      {mascotImages.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhum mascote cadastrado.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {mascotImages.map((mascot) => {
                            const isSelected = selectedMascotIds.includes(mascot.id);
                            return (
                              <button key={mascot.id} disabled={generatingStoryboard}
                                onClick={() => setSelectedMascotIds(prev => isSelected ? prev.filter(id => id !== mascot.id) : [...prev, mascot.id])}
                                className={`relative w-14 h-14 rounded-lg border-2 overflow-hidden transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                                <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                                {isSelected && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Button className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 mt-1" disabled={!videoIdea.trim() || generatingStoryboard} onClick={handleGenerateStoryboard}>
                  {generatingStoryboard ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando storyboard...</>) : (<><Clapperboard className="w-4 h-4 mr-2" />Gerar Storyboard</>)}
                </Button>
              </>
            ) : (
              <>
                <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
                  {/* Left side - scene inputs */}
                  <div className={`flex-shrink-0 overflow-y-auto space-y-4 py-2 ${videoScenes.some(s => s.video_url) ? 'w-[45%]' : 'w-full'}`}>
                    {videoScenes.map((scene, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">Cena {idx + 1}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            {idx === 0 ? 'Abertura' : idx === videoScenes.length - 1 ? 'Encerramento (CTA)' : 'Desenvolvimento'}
                          </span>
                          {scene.generating && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary ml-auto" />}
                        </div>

                        {/* Mascot images as Frame 0 options */}
                        {mascotImages.length > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">Usar Mascote como Frame 0</Label>
                            <div className="flex flex-wrap gap-2">
                              {mascotImages.map((mascot) => (
                                <button key={mascot.id} onClick={() => {
                                  setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, frame0_url: mascot.image_url } : s));
                                  toast.success(`Mascote aplicado como Frame 0 da Cena ${idx + 1}`);
                                }}
                                  className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${scene.frame0_url === mascot.image_url ? 'border-primary ring-1 ring-primary/30 scale-105' : 'border-border hover:border-primary/40'}`}>
                                  <img src={mascot.image_url} alt={mascot.file_name || 'Mascote'} className="w-full h-full object-cover" />
                                  {scene.frame0_url === mascot.image_url && (<div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="w-4 h-4 text-primary" /></div>)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Frame 0 upload */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Frame 0 (Imagem Inicial)</Label>
                          {scene.frame0_url ? (
                            <div className="relative rounded-lg overflow-hidden border border-primary/30">
                              <img src={scene.frame0_url} alt={`Frame 0 - Cena ${idx + 1}`} className="w-full h-28 object-cover" />
                              <button
                                className="absolute top-1.5 right-1.5 bg-destructive text-destructive-foreground rounded-full p-1 hover:scale-110 transition-transform"
                                onClick={() => setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, frame0_url: undefined } : s))}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className={`flex flex-col items-center justify-center w-full h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/30 ${uploadingFrame === idx ? 'opacity-50 pointer-events-none' : ''}`}>
                              {uploadingFrame === idx ? (
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                              ) : (
                                <>
                                  <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                                  <span className="text-xs text-muted-foreground">Clique para inserir o frame</span>
                                </>
                              )}
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFrameUpload(idx, file);
                                e.target.value = '';
                              }} />
                            </label>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Descrição da Cena (EN)</Label>
                          <Textarea placeholder="Scene description in English..." value={scene.scene_description}
                            onChange={(e) => setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, scene_description: e.target.value } : s))}
                            className="min-h-[70px] resize-none text-sm" disabled={scene.generating} />
                        </div>
                        {scene.mascot_speech && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">Fala do Mascote (PT-BR)</Label>
                            <Textarea placeholder="O mascote diz: ..." value={scene.mascot_speech}
                              onChange={(e) => setVideoScenes(prev => prev.map((s, i) => i === idx ? { ...s, mascot_speech: e.target.value } : s))}
                              className="min-h-[50px] resize-none text-sm" disabled={scene.generating} />
                          </div>
                        )}

                        <Button
                          className="w-full h-9 text-xs font-semibold bg-gradient-to-r from-primary to-primary/70"
                          disabled={!scene.scene_description.trim() || scene.generating}
                          onClick={() => handleGenerateScene(idx)}
                        >
                          {scene.generating ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Gerando cena...</>
                          ) : scene.video_url ? (
                            <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Gerar Novamente</>
                          ) : (
                            <><Play className="w-3.5 h-3.5 mr-1.5" />Gerar Cena</>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Right side - generated videos carousel */}
                  {videoScenes.some(s => s.video_url || s.generating) && (() => {
                    const generatedScenes = videoScenes.map((s, idx) => ({ ...s, originalIndex: idx })).filter(s => s.video_url || s.generating);
                    const currentPreviewIndex = Math.min(videoPreviewIndex, generatedScenes.length - 1);
                    const currentScene = generatedScenes[currentPreviewIndex];
                    return (
                      <div className="w-[55%] flex-shrink-0 flex flex-col py-2">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-sm font-medium">Vídeos Gerados ({generatedScenes.length})</Label>
                          <span className="text-xs text-muted-foreground">{currentPreviewIndex + 1} / {generatedScenes.length}</span>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col">
                          <div className="rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg flex-1 min-h-0 flex flex-col">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <span className="text-xs font-bold text-primary">Cena {currentScene.originalIndex + 1}</span>
                              {currentScene.video_url && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                                  const link = document.createElement('a'); link.href = currentScene.video_url!; link.download = `scene-${currentScene.originalIndex + 1}-${Date.now()}.mp4`; link.click();
                                }}>
                                  <Download className="w-3.5 h-3.5 mr-1" />Baixar
                                </Button>
                              )}
                            </div>
                            {currentScene.generating ? (
                              <div className="flex flex-col items-center justify-center py-12 gap-3 bg-black/5 flex-1">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="text-xs text-muted-foreground">Gerando vídeo... Isso pode levar alguns minutos.</p>
                              </div>
                            ) : currentScene.video_url ? (
                              <video key={currentScene.video_url} src={currentScene.video_url} controls className="w-full bg-black/5 flex-1 min-h-0 object-contain" />
                            ) : null}
                          </div>
                          {/* Navigation arrows */}
                          {generatedScenes.length > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-3">
                              <button
                                className="w-9 h-9 rounded-full bg-muted hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-30"
                                disabled={currentPreviewIndex === 0}
                                onClick={() => setVideoPreviewIndex(prev => Math.max(0, prev - 1))}
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>
                              <div className="flex gap-1.5">
                                {generatedScenes.map((_, i) => (
                                  <button key={i} onClick={() => setVideoPreviewIndex(i)}
                                    className={`w-2 h-2 rounded-full transition-all ${i === currentPreviewIndex ? 'bg-primary scale-125' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'}`} />
                                ))}
                              </div>
                              <button
                                className="w-9 h-9 rounded-full bg-muted hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-30"
                                disabled={currentPreviewIndex === generatedScenes.length - 1}
                                onClick={() => setVideoPreviewIndex(prev => Math.min(generatedScenes.length - 1, prev + 1))}
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="h-11 text-sm font-semibold flex-1" onClick={() => { setVideoStep(1); setVideoScenes([]); setVideoPreviewIndex(0); }}>
                    Voltar
                  </Button>
                  {videoScenes.some(s => s.video_url) && (
                    <Button variant="outline" className="h-11 text-sm font-semibold flex-1" onClick={async () => {
                      try {
                        toast.info('Preparando ZIP com todas as cenas...');
                        const zip = new JSZip();
                        const scenesWithVideo = videoScenes.filter(s => s.video_url);
                        await Promise.all(scenesWithVideo.map(async (s, idx) => {
                          const response = await fetch(s.video_url!);
                          const blob = await response.blob();
                          zip.file(`cena-${idx + 1}.mp4`, blob);
                        }));
                        const zipBlob = await zip.generateAsync({ type: 'blob' });
                        const url = URL.createObjectURL(zipBlob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `videos-${selectedClient?.name || 'cliente'}-${Date.now()}.zip`;
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success('ZIP baixado com sucesso!');
                      } catch (err) {
                        console.error(err);
                        toast.error('Erro ao gerar ZIP');
                      }
                    }}>
                      <Download className="w-4 h-4 mr-2" />Baixar Todos
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal Planejar Período - Hub com 2 opções */}
        <Dialog open={planPeriodModalOpen} onOpenChange={setPlanPeriodModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Planejar Período</DialogTitle>
              <p className="text-sm text-muted-foreground">O que deseja fazer?</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setPlanPeriodModalOpen(false); navigate("/plan-period"); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Planejar Período</h3>
                  <p className="text-xs text-muted-foreground mt-2">Criar ou gerenciar períodos de conteúdo</p>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => { setPlanPeriodModalOpen(false); setContentRequirementsModalOpen(true); }}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <ScrollText className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">Exigências de Conteúdo</h3>
                  <p className="text-xs text-muted-foreground mt-2">Definir regras e tom dos conteúdos</p>
                </div>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Exigências de Conteúdo */}
        <Dialog open={contentRequirementsModalOpen} onOpenChange={setContentRequirementsModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => { setContentRequirementsModalOpen(false); setPlanPeriodModalOpen(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <ScrollText className="w-5 h-5" />
                  Exigências de Conteúdo
                </DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Defina as exigências e regras de como os conteúdos devem ser gerados para {displayName}. Essas instruções serão seguidas pela IA em todas as gerações.
              </p>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                placeholder="Ex: Posts devem ser super explicativos, com linguagem acessível e detalhamento técnico dos veículos. Não usar gírias. Sempre incluir chamada para ação com link..."
                value={contentRequirements}
                onChange={(e) => setContentRequirements(e.target.value)}
                className="min-h-[200px]"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setContentRequirementsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveContentRequirements} disabled={savingRequirements}>
                  {savingRequirements ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ClientHub;
