import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Building2, Loader2 } from "lucide-react";
import BackButton from "@/components/BackButton";

const ClientRegistrations = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ['tenant-clients-registrations', tenantId, searchTerm],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase
        .from('tenant_companies')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,fantasy_name.ilike.%${searchTerm}%,cnpj_cpf.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId
  });

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-12 text-center relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/home" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
            Cadastros de Clientes
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Visualize e edite os dados cadastrais dos seus clientes
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, fantasia ou CNPJ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Client Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !clients || clients.length === 0 ? (
          <div className="text-center py-12 sm:py-20 px-4">
            <Building2 className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
            <p className="text-base sm:text-lg font-medium mb-2">Nenhum cliente encontrado</p>
            <p className="text-sm text-muted-foreground">
              Cadastre clientes para visualizar seus dados aqui
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {clients.map((client) => (
              <Card
                key={client.id}
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => navigate(`/clientes/${client.id}`)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-pink-600 opacity-5 group-hover:opacity-10 transition-opacity" />

                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  {client.logo_url ? (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 bg-muted flex items-center justify-center">
                      <img
                        src={client.logo_url}
                        alt={`Logo de ${client.fantasy_name || client.name}`}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                    </div>
                  )}

                  <h3 className="text-base sm:text-xl font-bold transition-colors text-pink-600 dark:text-pink-400 line-clamp-2">
                    {client.fantasy_name || client.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{client.cnpj_cpf}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientRegistrations;
