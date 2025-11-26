import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Plus, Edit, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
const ClientList = () => {
  const navigate = useNavigate();
  const {
    tenantId
  } = useTenant();
  const {
    setSelectedClient
  } = useSelectedClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const {
    data: clients,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['tenant-clients', tenantId, searchTerm],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase.from('tenant_companies').select('*').eq('tenant_id', tenantId).order('created_at', {
        ascending: false
      });
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,sector.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }
      const {
        data,
        error
      } = await query;
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
      const {
        error
      } = await supabase.from('tenant_companies').delete().eq('id', deleteId).eq('tenant_id', tenantId);
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
  return <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/home")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Home
        </Button>

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-bold">Gerenciar Clientes</h1>
            
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, setor ou e-mail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Button variant={editMode ? "default" : "outline"} onClick={() => setEditMode(!editMode)}>
              <Edit className="h-4 w-4 mr-2" />
              Modo Edição
            </Button>
          </div>

          {isLoading ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="group relative overflow-hidden">
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-12 w-12 rounded-xl bg-muted animate-pulse" />
                        <div className="flex-1 space-y-2">
                          <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                          <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div> : !clients || clients.length === 0 ? <div className="text-center py-20">
              <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">Nenhum cliente cadastrado ainda</p>
              <p className="text-muted-foreground mb-4">
                Comece adicionando seu primeiro cliente
              </p>
              <Button onClick={() => navigate("/registration")}>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Primeiro Cliente
              </Button>
            </div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map(client => <Card key={client.id} className="group relative cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/50 overflow-hidden" onClick={() => !editMode && handleClientSelect(client)}>
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <CardHeader className="relative space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary flex-shrink-0">
                          <Building2 className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">
                            {client.fantasy_name || client.name}
                          </CardTitle>
                          <Badge variant="outline" className="mt-2">
                            {client.sector}
                          </Badge>
                        </div>
                      </div>
                      
                      {editMode && <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/clientes/${client.id}`)} title="Editar cliente" className="h-8 w-8">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(client.id)} title="Excluir cliente" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>}
                    </div>
                  </CardHeader>
                </Card>)}
            </div>}
        </div>
      </div>

      <ConfirmationModal open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)} title="Confirmar Exclusão" description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita." onConfirm={handleDelete} loading={isDeleting} />
    </div>;
};
export default ClientList;