import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Mail, Phone, Building2, Briefcase, Calendar, Trash2, BarChart3, Users } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ClientDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ['client-details', id, tenantId],
    queryFn: async () => {
      if (!id || !tenantId) return null;

      const { data, error } = await supabase
        .from('tenant_companies')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          toast.error("Cliente não encontrado");
          navigate('/clientes');
          return null;
        }
        throw error;
      }

      return data;
    },
    enabled: !!id && !!tenantId
  });

  const handleDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      toast.success("Cliente excluído com sucesso");
      navigate('/clientes');
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error("Erro ao excluir cliente");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando informações do cliente...</p>
        </div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/clientes")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar à Lista
          </Button>

          {/* Header Card */}
          <Card className="shadow-[var(--shadow-elevated)]">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-secondary">
                    <Users className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl mb-2">{client.name}</CardTitle>
                    <CardDescription className="text-base">
                      Informações detalhadas do cliente
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowDeleteModal(true)}
                    title="Excluir cliente"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Informações Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informações de Contato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">E-mail</p>
                    <p className="font-medium">{client.email}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Telefone</p>
                    <p className="font-medium">{client.phone}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informações Empresariais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Setor de Atuação</p>
                    <Badge variant="outline">{client.sector}</Badge>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Tamanho da Empresa</p>
                    <Badge variant="secondary">{client.size}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Informações Adicionais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detalhes do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">CNPJ/CPF</p>
                <p className="font-medium">{client.cnpj_cpf}</p>
              </div>

              <Separator />

              <div>
                <p className="text-xs text-muted-foreground mb-2">Produtos ou Serviços Oferecidos</p>
                <p className="text-sm leading-relaxed">{client.products_services}</p>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Mês do Cronograma</p>
                  <Badge>{client.selected_month}</Badge>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs text-muted-foreground mb-1">Data de Cadastro</p>
                <p className="text-sm">
                  {client.created_at ? format(new Date(client.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Botão de Estratégias */}
          <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                    <BarChart3 className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Estratégias e Planejamentos</h3>
                    <p className="text-sm text-muted-foreground">
                      Acompanhe e gerencie as estratégias de marketing e os planejamentos deste cliente
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate(`/clientes/${client.id}/planejamentos`)}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Ver Estratégias e Planejamentos
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmationModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Confirmar Exclusão"
        description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita e todos os dados associados serão perdidos."
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
};

export default ClientDetails;
