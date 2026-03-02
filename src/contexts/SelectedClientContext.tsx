import { createContext, useContext, useState, ReactNode } from 'react';

interface Client {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_font?: string | null;
  has_mascot?: boolean;
  mascot_description?: string | null;
  mascot_url?: string | null;
  tenant_id?: string;
}

interface SelectedClientContextType {
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  clearSelectedClient: () => void;
  isInitialized: boolean;
}

const SelectedClientContext = createContext<SelectedClientContextType | undefined>(undefined);

export const useSelectedClient = () => {
  const context = useContext(SelectedClientContext);
  if (!context) {
    throw new Error('useSelectedClient must be used within SelectedClientProvider');
  }
  return context;
};

interface SelectedClientProviderProps {
  children: ReactNode;
}

export const SelectedClientProvider = ({ children }: SelectedClientProviderProps) => {
  // Inicializa o estado diretamente com o valor do sessionStorage
  const [selectedClient, setSelectedClientState] = useState<Client | null>(() => {
    try {
      const stored = sessionStorage.getItem('selectedClient');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  
  // isInitialized é sempre true pois o useState já leu do sessionStorage sincronamente
  const isInitialized = true;

  const setSelectedClient = (client: Client | null) => {
    setSelectedClientState(client);
    if (client) {
      sessionStorage.setItem('selectedClient', JSON.stringify(client));
    } else {
      sessionStorage.removeItem('selectedClient');
    }
  };

  const clearSelectedClient = () => {
    setSelectedClientState(null);
    sessionStorage.removeItem('selectedClient');
  };

  return (
    <SelectedClientContext.Provider value={{ selectedClient, setSelectedClient, clearSelectedClient, isInitialized }}>
      {children}
    </SelectedClientContext.Provider>
  );
};
