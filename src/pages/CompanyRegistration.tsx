import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { StepNavigation } from "@/components/StepNavigation";

const CompanyRegistration = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    cnpj_cpf: "",
    sector: "",
    size: "",
    products_services: "",
    email: "",
    phone: "",
    selected_month: "",
  });

  const sectors = [
    "Serviços",
    "Comércio",
    "Indústria",
    "Saúde",
    "Educação",
    "Tecnologia",
    "Outros",
  ];

  const sizes = ["Micro", "Pequena", "Média", "Grande"];

  const months = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isFormValid = () => {
    return Object.values(formData).every((value) => value.trim() !== "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("companies")
        .insert([formData])
        .select()
        .single();

      if (error) throw error;

      toast.success("Empresa cadastrada com sucesso!");
      navigate(`/strategy?companyId=${data.id}`);
    } catch (error) {
      console.error("Error saving company:", error);
      toast.error("Erro ao cadastrar empresa. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <StepNavigation />
      <div className="flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-[var(--shadow-elevated)]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl">Cadastro da Empresa</CardTitle>
              <CardDescription>
                Preencha as informações essenciais para começar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Empresa *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Sua Empresa Ltda"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj_cpf">CNPJ ou CPF *</Label>
                <Input
                  id="cnpj_cpf"
                  value={formData.cnpj_cpf}
                  onChange={(e) => handleChange("cnpj_cpf", e.target.value)}
                  placeholder="00.000.000/0000-00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sector">Setor de Atuação *</Label>
                <Select onValueChange={(value) => handleChange("sector", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o setor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map((sector) => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="size">Tamanho da Empresa *</Label>
                <Select onValueChange={(value) => handleChange("size", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tamanho" />
                  </SelectTrigger>
                  <SelectContent>
                    {sizes.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="products_services">Produtos ou Serviços Oferecidos *</Label>
                <Input
                  id="products_services"
                  value={formData.products_services}
                  onChange={(e) => handleChange("products_services", e.target.value)}
                  placeholder="Descreva brevemente seus produtos ou serviços"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail Corporativo *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="contato@empresa.com.br"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone Comercial *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="(00) 0000-0000"
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="selected_month">Mês do Cronograma *</Label>
                <Select onValueChange={(value) => handleChange("selected_month", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!isFormValid()}
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

export default CompanyRegistration;