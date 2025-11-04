import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Edit, CheckCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StepNavigation } from "@/components/StepNavigation";

interface PlanItem {
  week: string;
  day: string;
  contentType: string;
  channel: string;
  description: string;
}

const Plan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("companyId");
  const [loading, setLoading] = useState(true);
  const [companyData, setCompanyData] = useState<any>(null);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  useEffect(() => {
    if (!companyId) {
      toast.error("ID da empresa não encontrado");
      navigate("/");
      return;
    }

    const fetchData = async () => {
      try {
        const { data: company, error: companyError } = await supabase
          .from("tenant_companies")
          .select("*")
          .eq("id", companyId)
          .maybeSingle();

        if (companyError) throw companyError;

        const { data: strategy, error: strategyError } = await supabase
          .from("strategies")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle();

        if (strategyError) throw strategyError;

        if (company && strategy) {
          setCompanyData({ ...company, strategy: strategy.strategy_text });
        }

        // Generate mock plan (will be replaced with AI generation later)
        const mockPlan: PlanItem[] = [
          {
            week: "Semana 1",
            day: "Segunda-feira",
            contentType: "Post",
            channel: "Instagram",
            description: "Apresentação da empresa e sua proposta de valor",
          },
          {
            week: "Semana 1",
            day: "Quarta-feira",
            contentType: "Vídeo",
            channel: "YouTube",
            description: "Tutorial sobre o principal produto/serviço",
          },
          {
            week: "Semana 2",
            day: "Segunda-feira",
            contentType: "E-mail",
            channel: "Newsletter",
            description: "Compartilhar cases de sucesso e depoimentos",
          },
          {
            week: "Semana 2",
            day: "Sexta-feira",
            contentType: "Post",
            channel: "LinkedIn",
            description: "Conteúdo educativo sobre tendências do setor",
          },
          {
            week: "Semana 3",
            day: "Terça-feira",
            contentType: "Anúncio",
            channel: "Facebook Ads",
            description: "Campanha de captação de leads com oferta especial",
          },
          {
            week: "Semana 3",
            day: "Quinta-feira",
            contentType: "Post",
            channel: "Instagram",
            description: "Bastidores da empresa e cultura organizacional",
          },
          {
            week: "Semana 4",
            day: "Segunda-feira",
            contentType: "Blog",
            channel: "Site",
            description: "Artigo completo sobre solução de um problema comum",
          },
        ];

        setPlanItems(mockPlan);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Erro ao carregar dados");
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, navigate]);

  const handleApprovePlan = async () => {
    try {
      // Get tenant_id from user's profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.tenant_id) {
        toast.error("Tenant não encontrado");
        return;
      }

      const { data, error } = await supabase
        .from("marketing_plans")
        .insert([
          {
            company_id: companyId,
            plan_data: { items: planItems } as any,
            approved: true,
            approved_at: new Date().toISOString(),
            tenant_id: profile.tenant_id
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success("Plano aprovado com sucesso!");
      navigate(`/cards?planId=${data.id}`);
    } catch (error) {
      console.error("Error approving plan:", error);
      toast.error("Erro ao aprovar plano. Tente novamente.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">A IA está montando o seu plano mensal personalizado...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <StepNavigation />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
        <Card className="shadow-[var(--shadow-elevated)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                <Calendar className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-2xl">Plano Mensal Gerado</CardTitle>
                <CardDescription>
                  Plano criado com base na sua estratégia de {companyData?.selected_month}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4">
          {planItems.map((item, index) => (
            <Card key={index} className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-accent">
                        {item.week}
                      </Badge>
                      <Badge variant="outline">{item.day}</Badge>
                      <Badge className="bg-primary">{item.contentType}</Badge>
                      <Badge className="bg-secondary">{item.channel}</Badge>
                    </div>
                    <p className="text-foreground font-medium">{item.description}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0">
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-4 justify-end">
          <Button variant="outline" size="lg">
            Gerar Novo Plano
          </Button>
          <Button
            onClick={handleApprovePlan}
            size="lg"
            className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Aprovar Plano
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Plan;