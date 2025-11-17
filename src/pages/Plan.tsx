import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, CheckCircle, Loader2, ArrowLeft, Sparkles, RotateCcw } from "lucide-react";
import { ConfirmationModal } from "@/components/ConfirmationModal";

const Plan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("planId");
  const companyId = searchParams.get("companyId");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [companyData, setCompanyData] = useState<any>(null);
  const [planContent, setPlanContent] = useState<string>("");
  const [showApproveModal, setShowApproveModal] = useState(false);

  useEffect(() => {
    if (!planId && !companyId) {
      toast.error("Informações do plano não encontradas");
      navigate("/");
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
            .maybeSingle();

          if (planError) throw planError;
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
          // Buscar empresa e plano mais recente
          const { data: companyData, error: companyError } = await supabase
            .from("tenant_companies")
            .select("*")
            .eq("id", companyId)
            .maybeSingle();

          if (companyError) throw companyError;
          company = companyData;

          if (company) {
            const { data: planData, error: planError } = await supabase
              .from("marketing_plans")
              .select("*")
              .eq("company_id", companyId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (planError && planError.code !== 'PGRST116') throw planError;
            plan = planData;
          }
        }

        if (!company) {
          toast.error("Dados da empresa não encontrados");
          navigate("/");
          return;
        }

        setCompanyData(company);

        if (plan && plan.plan_content) {
          setPlanContent(plan.plan_content);
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
  }, [planId, companyId, navigate]);

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
      toast.success("✅ Plano aprovado com sucesso! Você pode agora gerenciar as tarefas no quadro Kanban.");
      
      setTimeout(() => {
        navigate(`/schedule?planId=${planId}`);
      }, 1500);
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

          <Card className="shadow-[var(--shadow-elevated)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                  <Calendar className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl">Plano de Marketing</CardTitle>
                  <CardDescription>
                    {companyData?.name && `Plano para ${companyData.name}`}
                  </CardDescription>
                </div>
              </div>
              
              {planContent && (
                <div className="flex items-start gap-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Plano gerado automaticamente com base na sua estratégia e respostas. Revise e edite conforme necessário.
                  </p>
                </div>
              )}
            </CardHeader>
            
            {planContent && (
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="whitespace-pre-wrap bg-accent/30 p-6 rounded-lg border">
                    {planContent}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {!planContent && (
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="py-16">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="p-4 bg-muted rounded-full">
                    <Calendar className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Nenhum plano gerado ainda</h3>
                    <p className="text-muted-foreground max-w-md">
                      Responda as perguntas guias para gerar um plano de marketing personalizado.
                    </p>
                  </div>
                  <Button onClick={() => navigate('/generate-questions')} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Ir para Perguntas Guias
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {planContent && (
            <div className="flex gap-4 justify-end flex-wrap">
              <Button variant="outline" size="lg">
                <RotateCcw className="h-5 w-5 mr-2" />
                Gerar Novas Sugestões
              </Button>
              <Button
                onClick={() => setShowApproveModal(true)}
                size="lg"
                className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Aprovar Plano
              </Button>
            </div>
          )}
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
