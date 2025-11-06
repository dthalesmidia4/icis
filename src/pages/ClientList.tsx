import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Plus, Edit, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";

const ClientList = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteId) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .delete()
        .eq('id', deleteId)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      toast.success("Cliente excluído com sucesso");
      refetch();
      setDeleteId(null);
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error("Erro ao excluir cliente");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
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
                  <Users className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl">Lista de Clientes</CardTitle>
                  <CardDescription>
                    Visualize e gerencie os clientes cadastrados na sua empresa
                  </CardDescription>
                </div>
                <Button
                  onClick={() => navigate("/registration")}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Cliente
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, setor ou e-mail..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-4 text-muted-foreground">Carregando seus clientes...</p>
                  </div>
                ) : !clients || clients.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">Nenhum cliente cadastrado ainda</p>
                    <p className="text-muted-foreground mb-4">
                      Comece adicionando seu primeiro cliente
                    </p>
                    <Button onClick={() => navigate("/registration")}>
                      <Plus className="h-4 w-4 mr-2" />
                      Cadastrar Primeiro Cliente
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Nome do Cliente</TableHead>
                          <TableHead className="font-semibold">Setor</TableHead>
                          <TableHead className="font-semibold">Tamanho</TableHead>
                          <TableHead className="font-semibold">E-mail</TableHead>
                          <TableHead className="font-semibold text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clients.map((client) => (
                          <TableRow 
                            key={client.id} 
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => navigate(`/clientes/${client.id}`)}
                          >
                            <TableCell className="font-medium">{client.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{client.sector}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{client.size}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{client.email}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => navigate(`/clientes/${client.id}`)}
                                  title="Ver detalhes"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteId(client.id)}
                                  title="Excluir cliente"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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
    </div>
  );
};

export default ClientList;
