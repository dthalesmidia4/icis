import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarDays, Clock, Zap } from "lucide-react";
import BackButton from "@/components/BackButton";

interface CompanyOption {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
  tenant_id: string;
}

const CronogramaGlobal = () => {
  const navigate = useNavigate();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { selectedClient, setSelectedClient } = useSelectedClient();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(selectedClient?.id || "");

  useEffect(() => {
    if (tenantLoading || !tenantId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tenant_companies")
        .select("id,name,fantasy_name,cnpj_cpf,email,tenant_id")
        .eq("tenant_id", tenantId)
        .order("fantasy_name");
      if (!error && data) setCompanies(data as CompanyOption[]);
      setLoading(false);
    })();
  }, [tenantId, tenantLoading]);

  const currentCompany = useMemo(
    () => companies.find((c) => c.id === selectedId) || null,
    [companies, selectedId],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const c = companies.find((x) => x.id === id);
    if (c) {
      setSelectedClient({
        id: c.id,
        name: c.name,
        fantasy_name: c.fantasy_name,
        cnpj_cpf: c.cnpj_cpf,
        email: c.email,
        tenant_id: c.tenant_id,
      });
    }
  };

  const goTo = (mode: "comum" | "ultra") => {
    if (!currentCompany) return;
    const url =
      mode === "ultra"
        ? "/plan-period?tab=history&view=latest&mode=ultra"
        : "/plan-period?tab=history&view=latest";
    navigate(url);
  };

  return (
    <div className="container max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackButton to="/home" />

      <div className="flex flex-col items-center gap-2 mb-8 text-center">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cronograma Global</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecione uma empresa para visualizar o cronograma atual.
        </p>
      </div>

      <div className="max-w-lg mx-auto mb-8">
        <label className="block text-sm font-medium text-foreground mb-2">
          Selecionar empresa
        </label>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando empresas...
          </div>
        ) : (
          <Select value={selectedId} onValueChange={handleSelect}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Escolha uma empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fantasy_name || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!currentCompany ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">
            Selecione uma empresa para visualizar o cronograma.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl mx-auto">
          <Card
            className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border-2 hover:border-primary/50 active:scale-[0.98]"
            onClick={() => goTo("comum")}
          >
            <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
            <div className="relative p-5 flex flex-col items-center justify-center text-center min-h-[140px]">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Clock className="w-5 h-5 text-primary-foreground" />
              </div>
              <h3 className="text-base font-bold text-primary">Demanda Comum</h3>
            </div>
          </Card>

          <Card
            className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border-2 hover:border-primary/50 active:scale-[0.98]"
            onClick={() => goTo("ultra")}
          >
            <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
            <div className="relative p-5 flex flex-col items-center justify-center text-center min-h-[140px]">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <h3 className="text-base font-bold text-primary">Demanda Ultra</h3>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CronogramaGlobal;
