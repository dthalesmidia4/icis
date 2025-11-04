import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { StepNavigation } from "@/components/StepNavigation";

const Strategy = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("companyId");
  const [strategyText, setStrategyText] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!companyId) {
      toast.error("ID da empresa não encontrado");
      navigate("/");
      return;
    }

    const fetchCompany = async () => {
      const { data, error } = await supabase
        .from("tenant_companies")
        .select("name, selected_month")
        .eq("id", companyId)
        .maybeSingle();

      if (error) {
        toast.error("Erro ao carregar dados da empresa");
        navigate("/");
        return;
      }

      if (data) {
        setCompanyName(data.name);
      }
    };

    fetchCompany();
  }, [companyId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!strategyText.trim()) {
      toast.error("Por favor, descreva a estratégia da empresa");
      return;
    }

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

      const { error } = await supabase
        .from("strategies")
        .insert([
          {
            company_id: companyId,
            strategy_text: strategyText,
            tenant_id: profile.tenant_id
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success("Estratégia salva com sucesso!");
      navigate(`/plan?companyId=${companyId}`);
    } catch (error) {
      console.error("Error saving strategy:", error);
      toast.error("Erro ao salvar estratégia. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <StepNavigation />
      <div className="flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl shadow-[var(--shadow-elevated)]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
              <Target className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl">Estratégia da Empresa</CardTitle>
              <CardDescription>
                {companyName && `${companyName} - `}
                Descreva a estratégia principal para este mês
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="strategy" className="text-base">
                Qual é a estratégia principal da sua empresa neste mês? *
              </Label>
              <p className="text-sm text-muted-foreground">
                Descreva, em poucas palavras, os principais objetivos e ações que sua empresa
                pretende realizar neste período.
              </p>
              <Textarea
                id="strategy"
                value={strategyText}
                onChange={(e) => setStrategyText(e.target.value)}
                placeholder="Ex: Fortalecer a presença online através de conteúdo nas redes sociais, captar novos leads com campanhas segmentadas e aumentar o engajamento com a base atual."
                className="min-h-[200px] resize-none"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={!strategyText.trim()}
              className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
            >
              Continuar
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default Strategy;