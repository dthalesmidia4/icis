import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";

interface PlanSection {
  title: string;
  content: string;
  id: string;
}

const Plan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedClient } = useSelectedClient();
  const { tenantId } = useTenant();
  const planId = searchParams.get("planId");
  const companyId = searchParams.get("companyId");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [companyData, setCompanyData] = useState<any>(null);
  const [planContent, setPlanContent] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [sections, setSections] = useState<PlanSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [showApproveModal, setShowApproveModal] = useState(false);

  // Verificar se há cliente selecionado
  useEffect(() => {
    if (!selectedClient) {
      toast.error('Nenhum cliente selecionado');
      navigate('/home');
    }
  }, [selectedClient, navigate]);

  useEffect(() => {
    if (!selectedClient || !tenantId) return;

    if (!planId && !companyId) {
      toast.error("Informações do plano não encontradas");
      navigate("/client-hub");
      return;
    }

    const fetchData = async () => {
      try {
        let plan = null;
        let company = null;

        // Buscar plano por ID se disponível
        if (planId) {
          const { data: planData, error: planError } = await supabase
            .from("marketing_plans")
            .select("*")
            .eq("id", planId)
            .eq("company_id", selectedClient.id)
            .eq("tenant_id", tenantId)
            .maybeSingle();

          if (planError) throw planError;
          
          if (!planData) {
            toast.error("Plano não encontrado para este cliente");
            navigate("/client-hub");
            return;
          }

          plan = planData;

          if (plan) {
            // Buscar dados da empresa do plano
            const { data: companyData, error: companyError } = await supabase
              .from("tenant_companies")
              .select("*")
              .eq("id", plan.company_id)
              .maybeSingle();

            if (companyError) throw companyError;
            company = companyData;
          }
        } else if (companyId) {
          // Verificar se o companyId corresponde ao cliente selecionado
          if (companyId !== selectedClient.id) {
            toast.error("Cliente não corresponde ao selecionado");
            navigate("/client-hub");
            return;
          }

          // Buscar empresa e plano mais recente
          const { data: companyData, error: companyError } = await supabase
            .from("tenant_companies")
            .select("*")
            .eq("id", companyId)
            .eq("tenant_id", tenantId)
            .maybeSingle();

          if (companyError) throw companyError;
          company = companyData;

          if (company) {
            const { data: planData, error: planError } = await supabase
              .from("marketing_plans")
              .select("*")
              .eq("company_id", companyId)
              .eq("tenant_id", tenantId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (planError && planError.code !== 'PGRST116') throw planError;
            plan = planData;
          }
        }

        if (!company) {
          toast.error("Dados da empresa não encontrados");
          navigate("/client-hub");
          return;
        }

        setCompanyData(company);

        if (plan && plan.plan_content) {
          setPlanContent(plan.plan_content);
          setSelectedMonth(plan.selected_month || "");
          
          // Parse sections from plan content
          const parsedSections = parsePlanSections(plan.plan_content);
          setSections(parsedSections);
          if (parsedSections.length > 0) {
            setSelectedSection(parsedSections[0].id);
          }
        } else {
          // Nenhum plano gerado ainda - mostrar estado vazio
          setPlanContent("");
        }

        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar dados do plano");
        setLoading(false);
      }
    };

    fetchData();
  }, [planId, companyId, navigate, selectedClient, tenantId]);

  const parsePlanSections = (content: string): PlanSection[] => {
    // Split content by numbered sections (e.g., "1.", "2.", "3.")
    const sectionRegex = /(\d+\.\s+[^\n]+)/g;
    const matches = content.match(sectionRegex);
    
    if (!matches) return [];

    const sections: PlanSection[] = [];
    
    matches.forEach((match, index) => {
      const sectionTitle = match.trim();
      const sectionId = `section-${index}`;
      
      // Find content between this section and the next
      const currentIndex = content.indexOf(match);
      const nextMatch = matches[index + 1];
      const nextIndex = nextMatch ? content.indexOf(nextMatch) : content.length;
      
      const sectionContent = content.substring(currentIndex, nextIndex).trim();
      
      sections.push({
        title: sectionTitle,
        content: sectionContent,
        id: sectionId
      });
    });
    
    return sections;
  };

  const formatMonth = (month: string) => {
    if (!month) return "";
    
    const [year, monthNum] = month.split("-");
    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    
    return `${monthNames[parseInt(monthNum) - 1]}/${year}`;
  };

  const handleApprovePlan = async () => {
    if (!planId) {
      toast.error("ID do plano não encontrado");
      return;
    }

    setApproving(true);

    try {
      // Atualizar o plano existente para marcá-lo como aprovado
      const { error } = await supabase
        .from("marketing_plans")
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq('id', planId);

      if (error) throw error;

      setShowApproveModal(false);
      toast.success("✅ Plano aprovado! Gerando tarefas do cronograma...");

      // Gerar tarefas do Kanban
      const { data: generateData, error: generateError } = await supabase.functions.invoke(
        "generate-kanban-tasks",
        { body: { planId } }
      );

      if (generateError) {
        console.error("Error generating tasks:", generateError);
        toast.error("Erro ao gerar tarefas do cronograma. Tente novamente.");
        return;
      }

      toast.success("Tarefas geradas com sucesso!");
      
      setTimeout(() => {
        navigate(`/schedule?planId=${planId}`);
      }, 1000);
    } catch (error) {
      console.error("Error approving plan:", error);
      toast.error("Erro ao aprovar plano. Tente novamente.");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Gerando seu plano personalizado...</p>
            <p className="text-sm text-muted-foreground">A IA está analisando sua estratégia e criando um cronograma ideal</p>
          </div>
        </div>
      </div>
    );
  }

  if (!planContent) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Hub
            </Button>

            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="py-16">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="p-4 bg-muted rounded-full">
                    <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Nenhum plano gerado ainda</h3>
                    <p className="text-muted-foreground max-w-md">
                      Responda as perguntas guias para gerar um plano de marketing personalizado.
                    </p>
                  </div>
                  <Button onClick={() => navigate('/client-guide')} className="gap-2">
                    Ir para Perguntas Guias
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const selectedSectionData = sections.find(s => s.id === selectedSection);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Hub
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Left Column - Navigation */}
            <div className="lg:sticky lg:top-6 lg:self-start">
              <Card className="shadow-[var(--shadow-card)]">
                <div className="p-4 border-b">
                  <h2 className="font-semibold text-lg">Planejamento</h2>
                </div>
                <ScrollArea className="h-[calc(100vh-12rem)]">
                  <div className="p-2">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setSelectedSection(section.id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors mb-1",
                          selectedSection === section.id
                            ? "bg-primary text-primary-foreground font-medium"
                            : "hover:bg-accent text-foreground"
                        )}
                      >
                        {section.title}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            </div>

            {/* Right Column - Content */}
            <div className="space-y-6">
              <Card className="shadow-[var(--shadow-card)]">
                {/* Header */}
                <div className="p-6 border-b">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold">{companyData?.name}</h1>
                    {selectedMonth && (
                      <Badge variant="secondary" className="text-xs">
                        Mês de Referência: {formatMonth(selectedMonth)}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Content Area */}
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-16rem)]">
                    <div className="p-8">
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <div className="whitespace-pre-wrap">
                          {selectedSectionData?.content}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </CardContent>

                {/* Footer with Approve Button */}
                <div className="p-6 border-t bg-muted/30">
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setShowApproveModal(true)}
                      size="lg"
                      className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Aprovar Plano
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
      
      <ConfirmationModal
        open={showApproveModal}
        onOpenChange={setShowApproveModal}
        title="Aprovar Plano Mensal"
        description="Ao aprovar, o plano será finalizado e os cards serão gerados no quadro Kanban. Tem certeza?"
        onConfirm={handleApprovePlan}
        loading={approving}
      />
    </div>
  );
};

export default Plan;
