import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, BookOpen, MapPin, User, ChevronLeft, Check, FilePlus2, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/contexts/AgencyContext";
import { useHubPermissions } from "@/hooks/useHubPermissions";
import { Card } from "@/components/ui/card";

import { useAgencyRole } from "@/hooks/useAgencyRole";
import { getFilteredNavigationItems } from "@/lib/constants/navigation";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { ClientSelectionModal } from "@/components/ClientSelectionModal";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agencyId } = useAgency();
  const { tenantId } = useTenant();
  const { canAccess, loading: permissionsLoading } = useHubPermissions();
  const { role, isLoading: roleLoading } = useAgencyRole();
  const { setSelectedClient } = useSelectedClient();
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientOptionsModalOpen, setClientOptionsModalOpen] = useState(false);
  const [extrasModalOpen, setExtrasModalOpen] = useState(false);


  // Rejected by client flow state
  const [rejectedByClientStep, setRejectedByClientStep] = useState<0 | 1 | 2>(0);
  const [rejectedByClientSearch, setRejectedByClientSearch] = useState('');
  const [rejectedByClientClients, setRejectedByClientClients] = useState<Array<{ id: string; name: string; fantasy_name: string | null; logo_url: string | null }>>([]);
  const [rejectedByClientSelectedClient, setRejectedByClientSelectedClient] = useState<{ id: string; name: string; fantasy_name: string | null } | null>(null);
  const [rejectedByClientDemands, setRejectedByClientDemands] = useState<Array<{ id: string; title: string; demand_type: string | null; channel: string | null; publish_date: string | null }>>([]);
  const [rejectedByClientSelectedDemandId, setRejectedByClientSelectedDemandId] = useState<string | null>(null);
  const [rejectedByClientLoading, setRejectedByClientLoading] = useState(false);

  const extrasOptions = [
    { title: "Leitura", icon: BookOpen, route: "/leitura" },
    { title: "Visitas Estratégicas", icon: MapPin, route: "" },
  ];

  const isAdmin = role === 'super_admin' || role === 'agency_admin' || role === 'agency_manager';
  const isAdminOnly = role === 'super_admin' || role === 'agency_admin';

  const getUserFirstName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(' ')[0];
    }
    return 'Usuário';
  };

  const actionCards = getFilteredNavigationItems({
    agencyId,
    isAdmin,
    isAdminOnly,
    canAccess,
  }).filter((c) => c.id !== 'schedule');


  const handleCardClick = (card: typeof actionCards[0]) => {
    if (card.opensClientModal) {
      setClientOptionsModalOpen(true);
    } else if (card.opensRejectedByClientModal) {
      openRejectedByClientFlow();
    } else {
      navigate(card.route);
    }
  };

  const handleClientSelected = (client: any) => {
    setSelectedClient({
      id: client.id,
      name: client.name,
      fantasy_name: client.fantasy_name || null,
      cnpj_cpf: client.cnpj_cpf,
      email: client.email,
    });
    setClientModalOpen(false);
    toast.success(`Cliente ${client.fantasy_name || client.name} selecionado`);
    navigate('/client-hub');
  };

  // --- Rejected by client flow ---
  const openRejectedByClientFlow = useCallback(async () => {
    setRejectedByClientStep(1);
    setRejectedByClientSearch('');
    setRejectedByClientSelectedClient(null);
    setRejectedByClientSelectedDemandId(null);
    setRejectedByClientLoading(true);
    try {
      const { data } = await supabase
        .from('tenant_companies')
        .select('id, name, fantasy_name, logo_url')
        .eq('tenant_id', tenantId!)
        .order('fantasy_name', { ascending: true, nullsFirst: false });
      setRejectedByClientClients(data || []);
    } finally {
      setRejectedByClientLoading(false);
    }
  }, [tenantId]);

  const handleRejectedByClientSelectClient = useCallback(async (client: { id: string; name: string; fantasy_name: string | null }) => {
    setRejectedByClientSelectedClient(client);
    setRejectedByClientStep(2);
    setRejectedByClientLoading(true);
    setRejectedByClientSelectedDemandId(null);
    try {
      const { data: periods } = await supabase
        .from('period_plans')
        .select('id')
        .eq('company_id', client.id)
        .eq('tenant_id', tenantId!)
        .eq('operational_status', 'em_andamento');
      const periodIds = (periods || []).map(p => p.id);
      if (periodIds.length === 0) {
        setRejectedByClientDemands([]);
        setRejectedByClientLoading(false);
        return;
      }
      const { data: demands } = await supabase
        .from('demands')
        .select('id, title, demand_type, channel, publish_date')
        .eq('client_id', client.id)
        .eq('tenant_id', tenantId!)
        .is('archived_at', null)
        .in('period_plan_id', periodIds)
        .order('created_at', { ascending: false });
      setRejectedByClientDemands(demands || []);
    } finally {
      setRejectedByClientLoading(false);
    }
  }, [tenantId]);

  if (permissionsLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="mb-8 sm:mb-12 text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
            Olá, {getUserFirstName()}! 👋
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Gerencie seus clientes e conteúdos
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
          {actionCards.map((card, index) => (
            <Card 
              key={index} 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98] w-full sm:w-[240px]" 
              onClick={() => handleCardClick(card)}
            >
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
              
              <div className="relative p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[110px] sm:min-h-[130px]">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                </div>
                
                <h3 className="text-sm sm:text-base font-bold transition-colors text-primary">
                  {card.title}
                </h3>

              </div>
            </Card>
          ))}

        </div>


        {actionCards.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum módulo disponível. Entre em contato com o administrador.</p>
          </div>
        )}
      </div>


      <ClientSelectionModal
        open={clientModalOpen}
        onOpenChange={setClientModalOpen}
        onClientSelected={handleClientSelected}
      />

      {/* Modal Clientes - opções intermediárias */}
      <Dialog open={clientOptionsModalOpen} onOpenChange={setClientOptionsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clientes</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Card
              className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-2 hover:border-primary/50 active:scale-[0.98]"
              onClick={() => {
                setClientOptionsModalOpen(false);
                navigate('/registration');
              }}
            >
              <div className="p-6 flex flex-col items-center justify-center text-center min-h-[140px]">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                  <FilePlus2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="text-sm font-bold text-primary mb-1">Cadastrar Novo Cliente</h3>
                <p className="text-xs text-muted-foreground">Adicionar uma nova empresa ao sistema</p>
              </div>
            </Card>
            <Card
              className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-2 hover:border-primary/50 active:scale-[0.98]"
              onClick={() => {
                setClientOptionsModalOpen(false);
                setClientModalOpen(true);
              }}
            >
              <div className="p-6 flex flex-col items-center justify-center text-center min-h-[140px]">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                  <Search className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="text-sm font-bold text-primary mb-1">Procurar Cliente</h3>
                <p className="text-xs text-muted-foreground">Pesquisar e gerenciar clientes cadastrados</p>
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>


      {/* Modal Atividades Extras */}
      <Dialog open={extrasModalOpen} onOpenChange={setExtrasModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atividades Extras</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {extrasOptions.map((option, index) => (
              <Card
                key={index}
                className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => {
                  setExtrasModalOpen(false);
                  if (option.route) navigate(option.route);
                }}
              >
                <div className="p-6 flex flex-col items-center justify-center text-center min-h-[120px]">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <option.icon className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-sm font-bold text-primary">{option.title}</h3>
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Demanda Reprovada pelo Cliente - Step 1: Select Client */}
      <Dialog open={rejectedByClientStep === 1} onOpenChange={(open) => { if (!open) setRejectedByClientStep(0); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-3xl sm:text-4xl font-bold text-center py-4">Qual cliente reprovou a demanda?</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={rejectedByClientSearch}
              onChange={(e) => setRejectedByClientSearch(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 mb-4"
            />
            {rejectedByClientLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {rejectedByClientClients
                  .filter(c => {
                    const s = rejectedByClientSearch.toLowerCase();
                    return !s || (c.fantasy_name || c.name).toLowerCase().includes(s);
                  })
                  .map(client => (
                    <div
                      key={client.id}
                      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleRejectedByClientSelectClient(client)}
                    >
                      {client.logo_url ? (
                        <img src={client.logo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><User className="w-5 h-5 text-muted-foreground" /></div>
                      )}
                      <span className="font-medium">{client.fantasy_name || client.name}</span>
                    </div>
                  ))}
                {rejectedByClientClients.filter(c => {
                  const s = rejectedByClientSearch.toLowerCase();
                  return !s || (c.fantasy_name || c.name).toLowerCase().includes(s);
                }).length === 0 && !rejectedByClientLoading && (
                  <p className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Demanda Reprovada pelo Cliente - Step 2: Select Demand */}
      <Dialog open={rejectedByClientStep === 2} onOpenChange={(open) => { if (!open) setRejectedByClientStep(0); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <button onClick={() => setRejectedByClientStep(1)} className="p-1 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5" /></button>
              <DialogTitle className="text-3xl sm:text-4xl font-bold">Qual demanda foi reprovada?</DialogTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Selecione a demanda de <span className="font-semibold text-foreground">{rejectedByClientSelectedClient?.fantasy_name || rejectedByClientSelectedClient?.name}</span> que foi reprovada pelo cliente.
            </p>
          </DialogHeader>
          <div className="py-2">
            {rejectedByClientLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : rejectedByClientDemands.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma demanda encontrada no período em andamento.</p>
            ) : (
              <>
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {rejectedByClientDemands.map(demand => (
                    <div
                      key={demand.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${rejectedByClientSelectedDemandId === demand.id ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}
                      onClick={() => setRejectedByClientSelectedDemandId(demand.id)}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${rejectedByClientSelectedDemandId === demand.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                        {rejectedByClientSelectedDemandId === demand.id && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{demand.title}</p>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                          {demand.demand_type && <span>{demand.demand_type}</span>}
                          {demand.channel && <span>• {demand.channel}</span>}
                          {demand.publish_date && <span>• {new Date(demand.publish_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    disabled={!rejectedByClientSelectedDemandId}
                    onClick={() => {
                      toast.info('Funcionalidade em desenvolvimento.');
                    }}
                  >
                    Prosseguir
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Home;
