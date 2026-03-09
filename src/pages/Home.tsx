import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, BookOpen, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/contexts/AgencyContext";
import { useHubPermissions } from "@/hooks/useHubPermissions";
import { Card } from "@/components/ui/card";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { getFilteredNavigationItems } from "@/lib/constants/navigation";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { ClientSelectionModal } from "@/components/ClientSelectionModal";
import { toast } from "sonner";
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
  const { canAccess, loading: permissionsLoading } = useHubPermissions();
  const { role, isLoading: roleLoading } = useAgencyRole();
  const { setSelectedClient } = useSelectedClient();
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [extrasModalOpen, setExtrasModalOpen] = useState(false);

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
  });

  const handleCardClick = (card: typeof actionCards[0]) => {
    if (card.opensClientModal) {
      setClientModalOpen(true);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {actionCards.map((card, index) => (
            <Card 
              key={index} 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" 
              onClick={() => handleCardClick(card)}
            >
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
              
              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                </div>
                
                <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">
                  {card.title}
                </h3>
              </div>
            </Card>
          
          {/* Atividades Extras card */}
          <Card 
            className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" 
            onClick={() => setExtrasModalOpen(true)}
          >
            <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
            <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
              </div>
              <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">
                Atividades Extras
              </h3>
            </div>
          </Card>
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
    </div>
  );
};

export default Home;
