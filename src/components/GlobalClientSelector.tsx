import { useState, useMemo } from "react";
import { Building2, ChevronDown, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
}

interface GlobalClientSelectorProps {
  className?: string;
  compact?: boolean;
}

export function GlobalClientSelector({ className, compact = false }: GlobalClientSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { selectedClient, setSelectedClient, clearSelectedClient } = useSelectedClient();
  const { tenantId } = useTenant();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['tenant-clients-selector', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('tenant_companies')
        .select('id, name, fantasy_name, cnpj_cpf, email')
        .eq('tenant_id', tenantId)
        .order('name');
      
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!tenantId,
  });

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter(client => 
      client.name.toLowerCase().includes(query) ||
      client.fantasy_name?.toLowerCase().includes(query) ||
      client.cnpj_cpf.includes(query)
    );
  }, [clients, searchQuery]);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setOpen(false);
    setSearchQuery("");
    navigate('/client-hub');
  };

  const handleClearClient = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearSelectedClient();
  };

  const displayName = selectedClient 
    ? (selectedClient.fantasy_name || selectedClient.name)
    : null;

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-xl transition-all duration-300",
              selectedClient 
                ? "bg-primary/10 text-primary hover:bg-primary/20" 
                : "hover:bg-accent",
              className
            )}
          >
            <Building2 className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="right" className="w-72 p-0">
          <ClientSelectorContent
            clients={filteredClients}
            selectedClient={selectedClient}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSelectClient={handleSelectClient}
            onClearClient={handleClearClient}
            isLoading={isLoading}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between min-w-[200px] max-w-[280px] h-10",
            !selectedClient && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">
              {displayName || "Selecionar cliente..."}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {selectedClient && (
              <X 
                className="h-4 w-4 opacity-50 hover:opacity-100 cursor-pointer" 
                onClick={handleClearClient}
              />
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <ClientSelectorContent
          clients={filteredClients}
          selectedClient={selectedClient}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSelectClient={handleSelectClient}
          onClearClient={handleClearClient}
          isLoading={isLoading}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ClientSelectorContentProps {
  clients: Client[];
  selectedClient: Client | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectClient: (client: Client) => void;
  onClearClient: (e: React.MouseEvent) => void;
  isLoading: boolean;
}

function ClientSelectorContent({
  clients,
  selectedClient,
  searchQuery,
  setSearchQuery,
  onSelectClient,
  onClearClient,
  isLoading,
}: ClientSelectorContentProps) {
  return (
    <div className="flex flex-col">
      {/* Header com cliente selecionado */}
      {selectedClient && (
        <div className="p-3 border-b bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {selectedClient.fantasy_name || selectedClient.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedClient.cnpj_cpf}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={onClearClient}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Busca */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Lista de clientes */}
      <ScrollArea className="max-h-[280px]">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Carregando clientes...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          </div>
        ) : (
          <div className="p-1">
            {clients.map((client) => {
              const isSelected = selectedClient?.id === client.id;
              return (
                <button
                  key={client.id}
                  onClick={() => onSelectClient(client)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                    isSelected 
                      ? "bg-primary/10 text-primary" 
                      : "hover:bg-accent"
                  )}
                >
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    isSelected ? "bg-primary/20" : "bg-muted"
                  )}>
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      isSelected && "text-primary"
                    )}>
                      {client.fantasy_name || client.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {client.cnpj_cpf}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
