import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { cn } from "@/lib/utils";
import { ArrowLeft, Save, Download, FileText, Pencil, CheckCircle, X, Trash2, Calendar } from "lucide-react";
import { ButtonColorful } from "@/components/ui/button-colorful";
import { toast as sonnerToast } from "sonner";
interface MarketingPlan {
  id: string;
  plan_content: string | null;
  company_id: string;
  strategy_id: string;
  created_at: string;
  approved: boolean;
  periodo_titulo?: string | null;
  periodo_data_inicio?: string | null;
  periodo_data_fim?: string | null;
  tenant_companies?: {
    name: string;
  };
}
interface PlanSection {
  id: string;
  title: string;
  content: string;
}
export default function Plans() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<MarketingPlan | null>(null);
  const [plans, setPlans] = useState<MarketingPlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [sections, setSections] = useState<PlanSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const planId = searchParams.get("planId");

  // Verificar se há cliente selecionado
  useEffect(() => {
    if (!selectedClient) {
      sonnerToast.error('Nenhum cliente selecionado');
      navigate('/home');
    }
  }, [selectedClient, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedClient || !tenantId) return;

      try {
        if (planId) {
          // Fetch specific plan - verificando se pertence ao cliente selecionado
          const { data, error } = await supabase
            .from("marketing_plans")
            .select("*, tenant_companies(name)")
            .eq("id", planId)
            .eq("company_id", selectedClient.id)
            .eq("tenant_id", tenantId)
            .maybeSingle();

          if (error) throw error;
          
          if (!data) {
            sonnerToast.error('Plano não encontrado para este cliente');
            navigate('/client-hub');
            return;
          }

          setPlan(data);
          if (data?.plan_content) {
            setEditedContent(data.plan_content);
          }
        } else {
          // Fetch all plans for the selected client only
          const { data, error } = await supabase
            .from("marketing_plans")
            .select("*, tenant_companies(name)")
            .eq("company_id", selectedClient.id)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });

          if (error) throw error;
          setPlans(data || []);
        }
      } catch (error) {
        console.error("Error fetching plans:", error);
        toast({
          title: "Erro ao carregar planos",
          description: "Não foi possível carregar os planos.",
          variant: "destructive"
        });
      } finally {
        setTimeout(() => setLoading(false), 300);
      }
    };

    fetchData();
  }, [planId, tenantId, selectedClient, toast, navigate]);
  useEffect(() => {
    if (!plan?.plan_content) {
      setSections([]);
      setSelectedSectionId(null);
      return;
    }
    const parsed = parsePlanSections(plan.plan_content);
    setSections(parsed);
    if (parsed.length > 0) {
      setSelectedSectionId(parsed[0].id);
    }
  }, [plan?.plan_content]);

  // Auto-save effect
  const performAutoSave = useCallback(async (content: string) => {
    if (!plan?.id || !content) return;
    setAutoSaving(true);
    try {
      const {
        error
      } = await supabase.from("marketing_plans").update({
        plan_content: content
      }).eq("id", plan.id);
      if (error) throw error;
      setLastSaved(new Date());
    } catch (error) {
      console.error("Error auto-saving:", error);
    } finally {
      setAutoSaving(false);
    }
  }, [plan?.id]);
  useEffect(() => {
    if (!isEditing || !editedContent || editedContent === plan?.plan_content) return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      performAutoSave(editedContent);
    }, 10000); // 10 seconds

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [editedContent, isEditing, plan?.plan_content, performAutoSave]);
  const handleSaveEdit = async () => {
    if (!plan || !editedContent || !editingSectionId) return;
    setSaving(true);
    try {
      // Update the specific section in the full plan content
      const updatedSections = sections.map(section => 
        section.id === editingSectionId 
          ? { ...section, content: editedContent }
          : section
      );
      
      // Reconstruct the full plan content
      const updatedPlanContent = updatedSections.map(s => s.content).join('\n\n');
      
      const {
        error
      } = await supabase.from("marketing_plans").update({
        plan_content: updatedPlanContent
      }).eq("id", plan.id);
      if (error) throw error;
      setPlan({
        ...plan,
        plan_content: updatedPlanContent
      });
      setIsEditing(false);
      setEditingSectionId(null);
      setLastSaved(new Date());
      toast({
        title: "Alterações salvas!",
        description: "A seção foi atualizada com sucesso."
      });
    } catch (error) {
      console.error("Error saving edit:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  const handleApprove = async () => {
    if (!plan) return;
    setSaving(true);
    setGeneratingCards(true);
    try {
      // Aprovar o plano
      const {
        error: approveError
      } = await supabase.from("marketing_plans").update({
        approved: true,
        approved_at: new Date().toISOString()
      }).eq("id", plan.id);
      if (approveError) throw approveError;
      setPlan({
        ...plan,
        approved: true
      });
      toast({
        title: "Plano aprovado!",
        description: "Gerando tarefas automaticamente..."
      });

      // Gerar cards automaticamente
      const {
        data: cardsData,
        error: cardsError
      } = await supabase.functions.invoke('generate-kanban-tasks', {
        body: {
          planId: plan.id
        }
      });
      if (cardsError) {
        console.error('Error generating cards:', cardsError);
        toast({
          title: "Plano aprovado, mas...",
          description: "Erro ao gerar tarefas automaticamente. Você pode tentar novamente.",
          variant: "destructive"
        });
    } else if (cardsData?.success) {
      toast({
        title: "Sucesso!",
        description: `Plano aprovado e ${cardsData.cardsCreated} tarefas geradas!`
      });
      
      // Redirecionar para o cronograma
      setTimeout(() => {
        navigate(`/schedule?planId=${plan.id}`);
      }, 1500);
    }
    } catch (error) {
      console.error("Error approving plan:", error);
      toast({
        title: "Erro ao aprovar",
        description: "Não foi possível aprovar o plano.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
      setGeneratingCards(false);
    }
  };
  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    setDeleting(true);
    try {
      const {
        error
      } = await supabase.from("marketing_plans").delete().eq("id", planToDelete);
      if (error) throw error;
      toast({
        title: "Plano excluído!",
        description: "O plano foi removido com sucesso."
      });

      // Update the plans list
      setPlans(plans.filter(p => p.id !== planToDelete));
      setPlanToDelete(null);
    } catch (error) {
      console.error("Error deleting plan:", error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o plano.",
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  };
  const handleExportPDF = async () => {
    if (!plan) return;
    setExporting(true);
    try {
      // Create a simple HTML string with the plan content
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Plano Estratégico</title>
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.8;
                color: #2c3e50;
                max-width: 800px;
                margin: 40px auto;
                padding: 40px;
              }
              h1 {
                color: #1976d2;
                font-size: 32px;
                margin-bottom: 20px;
                border-bottom: 3px solid #1976d2;
                padding-bottom: 10px;
              }
              h2 {
                color: #2196f3;
                font-size: 24px;
                margin-top: 32px;
                margin-bottom: 16px;
                font-weight: 600;
              }
              h3 {
                color: #42a5f5;
                font-size: 18px;
                margin-top: 24px;
                margin-bottom: 12px;
                font-weight: 500;
              }
              p {
                margin-bottom: 16px;
                text-align: justify;
              }
              ul, ol {
                margin-bottom: 16px;
                padding-left: 24px;
              }
              li {
                margin-bottom: 8px;
              }
              strong {
                color: #1976d2;
              }
            </style>
          </head>
          <body>
            <h1>Plano Estratégico: ${(plan.tenant_companies as any)?.fantasy_name || plan.tenant_companies?.name || 'Cliente'}</h1>
            ${formatContent(plan.plan_content || '')}
          </body>
        </html>
      `;

      // Create a blob and download
      const blob = new Blob([htmlContent], {
        type: 'text/html'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const clientName = (plan.tenant_companies as any)?.fantasy_name || plan.tenant_companies?.name || 'Cliente';
      const sanitizedName = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      link.download = `plano-estrategico-${sanitizedName}-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Plano exportado!",
        description: "O arquivo HTML foi baixado. Você pode abri-lo e imprimir como PDF."
      });
    } catch (error) {
      console.error("Error exporting plan:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar o plano.",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };
  const formatContent = (content: string) => {
    // O conteúdo já vem formatado em HTML do banco
    return content || "";
  };
  const parsePlanSections = (content: string): PlanSection[] => {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    // Find all H2 elements (section titles)
    const h2Elements = tempDiv.querySelectorAll('h2');
    if (h2Elements.length === 0) return [];
    
    const sections: PlanSection[] = [];
    
    h2Elements.forEach((h2, index) => {
      const sectionTitle = h2.textContent?.trim() || '';
      const sectionId = `section-${index}`;
      
      // Get content between this H2 and the next H2
      let sectionContent = '';
      let currentNode = h2.nextSibling;
      const nextH2 = h2Elements[index + 1];
      
      while (currentNode && currentNode !== nextH2) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          sectionContent += (currentNode as Element).outerHTML;
        } else if (currentNode.nodeType === Node.TEXT_NODE) {
          sectionContent += currentNode.textContent;
        }
        currentNode = currentNode.nextSibling;
      }
      
      sections.push({
        id: sectionId,
        title: sectionTitle,
        content: `<h2>${sectionTitle}</h2>${sectionContent.trim()}`
      });
    });
    
    return sections;
  };
  const formatPeriod = (plan: MarketingPlan) => {
    if (!plan.periodo_titulo) return "";
    const startDate = plan.periodo_data_inicio ? new Date(plan.periodo_data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : "";
    const endDate = plan.periodo_data_fim ? new Date(plan.periodo_data_fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : "";
    return `${plan.periodo_titulo} (${startDate} - ${endDate})`;
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Header Skeleton */}
          <div className="mb-6 sm:mb-8 space-y-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-muted rounded-md animate-pulse" />
              <div className="space-y-2">
                <div className="h-8 w-64 bg-muted rounded animate-pulse" />
                <div className="h-4 w-96 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>

          {/* Content Skeleton */}
          <div className="grid lg:grid-cols-[280px_1fr] gap-6">
            {/* Left Navigation Skeleton */}
            <div className="space-y-2">
              <div className="h-6 w-32 bg-muted rounded animate-pulse mb-4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 w-full bg-muted rounded-lg animate-pulse" />
              ))}
            </div>

            {/* Right Content Skeleton */}
            <Card className="p-8 space-y-6">
              <div className="flex justify-between items-center mb-6">
                <div className="h-6 w-48 bg-muted rounded animate-pulse" />
                <div className="flex gap-3">
                  <div className="h-10 w-28 bg-muted rounded-md animate-pulse" />
                  <div className="h-10 w-32 bg-muted rounded-md animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="h-8 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-4 w-full bg-muted rounded animate-pulse" />
                <div className="h-4 w-full bg-muted rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
                <div className="h-4 w-full bg-muted rounded animate-pulse" />
                <div className="h-4 w-4/5 bg-muted rounded animate-pulse" />
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }
  // If no planId, show list of all plans
  if (!planId) {
    return <div className="min-h-screen bg-background">
        {/* Header Fixo */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="container mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/client-hub")}
                  className="hover:bg-accent"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-3xl font-bold text-foreground">
                  Planos Estratégicos
                </h1>
              </div>
            </div>
          </div>
        </div>

        {/* Container Principal */}
        <div className="container mx-auto px-6 py-8">

          {plans.length === 0 ? <Card className="p-12 text-center">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                <FileText className="w-12 h-12 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                Nenhum plano encontrado
              </h2>
              <p className="text-muted-foreground mb-6">
                Gere um plano na etapa anterior para visualizá-lo aqui.
              </p>
              <Button size="lg" onClick={() => navigate("/client-guide")} className="gap-2">
                Gerar Plano
              </Button>
            </Card> : <div className="grid gap-4">
              {plans.map(p => <Card key={p.id} className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/plans?planId=${p.id}`)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-foreground">
                          {(p.tenant_companies as any)?.fantasy_name || p.tenant_companies?.name || "Cliente"} - {new Date(p.created_at).toLocaleDateString('pt-BR', {
                      month: 'long',
                      year: 'numeric'
                    })}
                        </h3>
                        {p.approved && <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                            Aprovado
                          </span>}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {p.periodo_titulo && (
                          <Badge variant="outline" className="text-xs px-3 py-1 rounded-full">
                            {formatPeriod(p)}
                          </Badge>
                        )}
                        <span>Criado em {new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.approved && <Button variant="outline" size="sm" onClick={e => {
                  e.stopPropagation();
                  navigate(`/schedule?planId=${p.id}`);
                }} className="gap-2">
                          <Calendar className="w-4 h-4" />
                          Ver Cronograma
                        </Button>}
                      <Button variant="ghost" size="icon" onClick={e => {
                  e.stopPropagation();
                  setPlanToDelete(p.id);
                }} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                </Card>)}
            </div>}
          
          {/* Delete Confirmation Dialog */}
          <AlertDialog open={!!planToDelete} onOpenChange={open => !open && setPlanToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeletePlan} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Excluindo..." : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>;
  }

  // If planId exists but plan not found or no content
  if (!plan || !plan.plan_content) {
    return <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-12 h-12 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              Plano não encontrado
            </h2>
            <p className="text-muted-foreground">
              Este plano não existe ou foi removido.
            </p>
          </div>
          <Button size="lg" onClick={() => navigate("/client-guide")} className="gap-2">Ver Perguntas Guias</Button>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      {/* Header Fixo */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/client-hub")}
                className="hover:bg-accent"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-3xl font-bold text-foreground">
                Planejamento
              </h1>
            </div>
            <div className="flex gap-3">
              {!isEditing && (
                <>
                  <Button 
                    variant="outline" 
                    onClick={handleExportPDF} 
                    disabled={exporting}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {exporting ? "Exportando..." : "Exportar"}
                  </Button>
                  
                  {plan.approved ? (
                    <ButtonColorful 
                      label="Ver Cronograma"
                      icon={Calendar}
                      onClick={() => navigate(`/schedule?planId=${plan.id}`)}
                    />
                  ) : (
                    <Button 
                      onClick={handleApprove} 
                      disabled={saving || generatingCards}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {generatingCards ? "Gerando cronograma..." : saving ? "Aprovando..." : "Aprovar Plano"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="bg-card rounded-lg border shadow-sm p-8 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
                {/* Left Column - Navigation */}
                <aside className="space-y-4">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Navegação
                  </h2>

                  <nav className="space-y-1">
                    {(sections.length ? sections : [{
                  id: "full-content",
                  title: "Conteúdo completo do plano",
                  content: plan.plan_content || ""
                }]).map(section => <button key={section.id} type="button" onClick={() => setSelectedSectionId(section.id)} className={cn("w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors", selectedSectionId === section.id || !selectedSectionId && sections[0]?.id === section.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                        {section.title}
                      </button>)}
                  </nav>
                </aside>

                {/* Right Column - Content */}
                <section className="flex flex-col min-h-[420px]">
                  {/* Header with period badge */}
                  <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      {plan.periodo_titulo && (
                        <Badge variant="outline" className="text-xs px-3 py-1 rounded-full">
                          Período: {formatPeriod(plan)}
                        </Badge>
                      )}
                    </div>
                      
                    <div className="flex items-center gap-2">
                      {!isEditing ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            const currentSection = sections.find(s => s.id === selectedSectionId);
                            if (currentSection) {
                              setEditedContent(currentSection.content);
                              setEditingSectionId(currentSection.id);
                              setIsEditing(true);
                            }
                          }} 
                          className="gap-2 hover:bg-muted"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="hidden sm:inline">Editar Seção</span>
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              setIsEditing(false);
                              setEditingSectionId(null);
                              setEditedContent("");
                            }} 
                            className="gap-2 hover:bg-muted"
                          >
                            <X className="w-4 h-4" />
                            <span className="hidden sm:inline">Cancelar</span>
                          </Button>

                          <Button 
                            size="sm" 
                            onClick={handleSaveEdit} 
                            disabled={saving} 
                            className="gap-2"
                          >
                            <Save className="w-4 h-4" />
                            <span className="hidden sm:inline">
                              {saving ? "Salvando..." : "Salvar"}
                            </span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </header>

                  {/* Content Container */}
                  {isEditing ? (
                    <div className="flex-1">
                      <div className="space-y-4">
                        <div className="text-center space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Editando: {sections.find(s => s.id === editingSectionId)?.title}
                          </p>
                          <div className="flex items-center justify-center gap-2 text-sm">
                            {autoSaving ? (
                              <span className="text-muted-foreground flex items-center gap-2">
                                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                                Salvando...
                              </span>
                            ) : lastSaved ? (
                              <span className="text-muted-foreground flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-primary" />
                                Salvo às {lastSaved.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        
                        <RichTextEditor content={editedContent} onChange={setEditedContent} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 border border-border rounded-lg bg-background overflow-hidden">
                      <ScrollArea className="h-[420px]">
                        <div className="p-6 sm:p-8">
                          <div 
                            className="
                              [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-foreground
                              [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-foreground
                              [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-foreground
                              [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-3 [&_ul]:space-y-1
                              [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-3 [&_ol]:space-y-1
                              [&_li]:mb-1 [&_li]:text-foreground
                              [&_strong]:font-semibold
                              [&_em]:italic
                              [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-3
                              [&_hr]:my-6 [&_hr]:border-t [&_hr]:border-border
                            " 
                            dangerouslySetInnerHTML={{
                              __html: formatContent((sections.find(s => s.id === selectedSectionId)?.content || sections[0]?.content || plan.plan_content || "") as string)
                            }} 
                          />
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </section>
          </div>
        </div>
      </div>
    </div>;
}