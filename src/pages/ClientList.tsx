import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Edit, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import BackButton from "@/components/BackButton";

const ClientList = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { setSelectedClient } = useSelectedClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const { data: clients, isLoading, refetch } = useQuery({
    queryKey: ['tenant-clients', tenantId, searchTerm],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase
        .from('tenant_companies')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,sector.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId
  });

  const handleClientSelect = (client: any) => {
    setSelectedClient({
      id: client.id,
      name: client.name,
      fantasy_name: client.fantasy_name,
      cnpj_cpf: client.cnpj_cpf,
      email: client.email
    });
    toast.success(`Cliente ${client.fantasy_name || client.name} selecionado`);
    navigate('/client-hub');
  };

  const handleDelete = async () => {
    if (!deleteId || !tenantId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .delete()
        .eq('id', deleteId)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      toast.success("Cliente removido com sucesso");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover cliente");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="pb-8">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Header */}
          <div className="mb-8 sm:mb-12 text-center relative">
            <div className="absolute left-0 top-0">
              <BackButton to="/home" />
            </div>
            <div className="inline-flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 px-4 sm:px-6 py-2 sm:py-3 bg-primary/10 rounded-full">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-primary rounded-full animate-pulse" />
              <span className="text-xs sm:text-sm font-medium text-primary">Clientes Cadastrados</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
              Gerenciar Clientes
            </h1>
            <p className="text-sm sm:text-lg text-muted-foreground">
              Selecione um cliente para acessar seu hub
            </p>
          </div>

          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, setor ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode(!editMode)}
              className="w-full sm:w-auto"
            >
              <Edit className="h-4 w-4 mr-2" />
              Modo Edição
            </Button>
          </div>

          {/* Client Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-muted animate-pulse mb-3 sm:mb-4" />
                    <div className="h-5 w-24 bg-muted rounded animate-pulse" />
                  </div>
                </Card>
              ))}
            </div>
          ) : !clients || clients.length === 0 ? (
            <div className="text-center py-12 sm:py-20 px-4">
              <Building2 className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
              <p className="text-base sm:text-lg font-medium mb-2">Nenhum cliente cadastrado ainda</p>
              <p className="text-sm text-muted-foreground mb-4">
                Comece adicionando seu primeiro cliente
              </p>
              <Button onClick={() => navigate("/registration")} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Primeiro Cliente
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {clients.map((client, index) => (
                <div key={client.id} className="relative">
                  {editMode && (
                    <div 
                      className="absolute top-2 right-2 z-10 flex gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => navigate(`/clientes/${client.id}`)}
                        title="Editar cliente"
                        className="h-8 w-8"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setDeleteId(client.id)}
                        title="Excluir cliente"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <Card 
                    className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" 
                    onClick={() => !editMode && handleClientSelect(client)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-5 group-hover:opacity-10 transition-opacity" />
                    
                    <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                        <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                      </div>
                      
                      <h3 className="text-base sm:text-xl font-bold transition-colors text-indigo-600 dark:text-indigo-400 line-clamp-2">
                        {client.fantasy_name || client.name}
                      </h3>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Confirmar Exclusão"
        description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita."
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </>
  );
};

export default ClientList;
