import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
interface Client {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
  logo_url: string | null;
}
interface ClientSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientSelected: (client: Client) => void;
}
export const ClientSelectionModal = ({
  open,
  onOpenChange,
  onClientSelected
}: ClientSelectionModalProps) => {
  const {
    tenantId
  } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Limpar o estado quando o modal fechar
  useEffect(() => {
    if (!open) {
      setSearchTerm('');
    }
  }, [open]);
  
  const {
    data: clients,
    isLoading
  } = useQuery({
    queryKey: ['clients', tenantId, searchTerm],
    queryFn: async () => {
      let query = supabase.from('tenant_companies').select('*').eq('tenant_id', tenantId!).order('fantasy_name');
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,fantasy_name.ilike.%${searchTerm}%`);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!tenantId && open
  });
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Selecionar Cliente</DialogTitle>
          <DialogDescription>
            Pesquise e selecione o cliente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar cliente por nome..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
          </div>

          {isLoading ? <div className="text-center py-8 text-muted-foreground">
              Carregando clientes disponíveis...
            </div> : !clients || clients.length === 0 ? <div className="text-center py-8 text-muted-foreground">
              Nenhum cliente encontrado
            </div> : <div className="max-h-[400px] overflow-y-auto space-y-2">
              {clients.map(client => <div key={client.id} onClick={() => onClientSelected(client)} className="p-4 rounded-lg border-2 cursor-pointer transition-all border-border hover:border-primary/50 hover:bg-accent/50">
                  <div className="flex items-center gap-3">
                    {client.logo_url ? (
                      <img src={client.logo_url} alt={client.fantasy_name || client.name} className="h-8 w-8 rounded-full object-cover border border-border" />
                    ) : (
                      <Building2 className="h-6 w-6 text-primary flex-shrink-0" />
                    )}
                    <h4 className="font-medium text-base">{client.fantasy_name || client.name}</h4>
                  </div>
                </div>)}
            </div>}
        </div>
      </DialogContent>
    </Dialog>;
};