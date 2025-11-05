import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Target, ArrowLeft, Sparkles } from "lucide-react";
import { ConfirmationModal } from "@/components/ConfirmationModal";

const Strategy = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("companyId");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  
  const [formData, setFormData] = useState({
    strategy_text: "",
    target_audience: "",
    priority_product: "",
    special_campaign: "",
    main_objective: "",
  });

  useEffect(() => {
    if (!companyId) {
      toast.error("ID da empresa não encontrado");
      navigate("/");
      return;
    }

    const fetchCompany = async () => {
      const { data, error } = await supabase
        .from("tenant_companies")
        .select("name, selected_month, products_services, sector")
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

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isFormValid = () => {
    return formData.strategy_text.trim() !== "" && 
           formData.target_audience.trim() !== "" &&
           formData.main_objective.trim() !== "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmSubmit = async () => {
    setLoading(true);

    try {
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

      const fullStrategyText = `
Estratégia Geral: ${formData.strategy_text}

Público-alvo: ${formData.target_audience}
Produto/Serviço Prioritário: ${formData.priority_product || "Não especificado"}
Campanha Especial: ${formData.special_campaign || "Nenhuma"}
Objetivo Principal: ${formData.main_objective}
      `.trim();

      const { error } = await supabase
        .from("strategies")
        .insert([
          {
            company_id: companyId,
            strategy_text: fullStrategyText,
            tenant_id: profile.tenant_id
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setShowConfirmModal(false);
      toast.success("✅ Estratégia salva com sucesso!");
      
      setTimeout(() => {
        navigate(`/plan?companyId=${companyId}`);
      }, 1000);
    } catch (error) {
      console.error("Error saving strategy:", error);
      toast.error("Erro ao salvar estratégia. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
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
                  <Target className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Definir Estratégias</CardTitle>
                  <CardDescription>
                    {companyName && `${companyName} - `}
                    Informe a estratégia e objetivos para gerar um plano personalizado
                  </CardDescription>
                </div>
              </div>
              
              <div className="flex items-start gap-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Com base nas informações que você fornecer, nossa IA gerará perguntas adicionais e 
                  personalizadas para criar o cronograma mensal ideal para este cliente.
                </p>
              </div>
            </CardHeader>
            
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="strategy" className="text-base">
                    Qual é a estratégia principal para este período? *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Descreva, em poucas palavras, os principais objetivos e ações pretendidas.
                  </p>
                  <Textarea
                    id="strategy"
                    value={formData.strategy_text}
                    onChange={(e) => handleChange("strategy_text", e.target.value)}
                    placeholder="Ex: Fortalecer a presença online através de conteúdo nas redes sociais, captar novos leads com campanhas segmentadas e aumentar o engajamento com a base atual."
                    className="min-h-[120px] resize-none"
                    required
                  />
                </div>

                <div className="space-y-6 p-6 bg-accent/30 rounded-lg border border-border">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Perguntas Contextualizadas
                  </h3>

                  <div className="space-y-3">
                    <Label htmlFor="target_audience" className="text-base">
                      Qual é o público-alvo principal? *
                    </Label>
                    <Input
                      id="target_audience"
                      value={formData.target_audience}
                      onChange={(e) => handleChange("target_audience", e.target.value)}
                      placeholder="Ex: Empresários de pequeno porte, mulheres 25-40 anos..."
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="priority_product" className="text-base">
                      Qual produto ou serviço é prioridade este mês?
                    </Label>
                    <Input
                      id="priority_product"
                      value={formData.priority_product}
                      onChange={(e) => handleChange("priority_product", e.target.value)}
                      placeholder="Ex: Consultoria de marketing digital, produto X..."
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="special_campaign" className="text-base">
                      Há alguma campanha especial em andamento?
                    </Label>
                    <Input
                      id="special_campaign"
                      value={formData.special_campaign}
                      onChange={(e) => handleChange("special_campaign", e.target.value)}
                      placeholder="Ex: Black Friday, lançamento de produto, promoção sazonal..."
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="main_objective" className="text-base">
                      Qual o principal objetivo deste mês? *
                    </Label>
                    <Select
                      value={formData.main_objective}
                      onValueChange={(value) => handleChange("main_objective", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o objetivo principal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vendas">Aumentar Vendas</SelectItem>
                        <SelectItem value="engajamento">Aumentar Engajamento</SelectItem>
                        <SelectItem value="reconhecimento">Reconhecimento de Marca</SelectItem>
                        <SelectItem value="leads">Captação de Leads</SelectItem>
                        <SelectItem value="fidelizacao">Fidelização de Clientes</SelectItem>
                        <SelectItem value="trafego">Aumentar Tráfego</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={!isFormValid()}
                  className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                >
                  Salvar Estratégia
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <ConfirmationModal
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        title="Confirmar Estratégia"
        description="Deseja salvar esta estratégia e gerar o plano mensal?"
        onConfirm={confirmSubmit}
        loading={loading}
      />
    </div>
  );
};

export default Strategy;
