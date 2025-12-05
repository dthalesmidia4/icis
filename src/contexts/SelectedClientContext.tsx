import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Client {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
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
  // DEBUG: Log quando o Provider é criado (indica novo mount da app)
  console.log('[SelectedClientContext] ========== PROVIDER CREATED ==========');
  console.log('[SelectedClientContext] This indicates app initialization/remount');
  console.log('[SelectedClientContext] Current URL:', window.location.href);
  console.log('[SelectedClientContext] Timestamp:', new Date().toISOString());
  
  // Inicializa o estado diretamente com o valor do sessionStorage
  const [selectedClient, setSelectedClientState] = useState<Client | null>(() => {
    try {
      const stored = sessionStorage.getItem('selectedClient');
      console.log('[SelectedClientContext] Initial load from sessionStorage:', stored);
      const parsed = stored ? JSON.parse(stored) : null;
      console.log('[SelectedClientContext] Parsed client:', parsed);
      return parsed;
    } catch (error) {
      console.error('[SelectedClientContext] Error parsing stored client:', error);
      return null;
    }
  });
  
  // isInitialized começa como true se já temos um cliente do sessionStorage
  // Isso evita o flash de loading quando há cliente persistido
  const [isInitialized, setIsInitialized] = useState(() => {
    const hasStoredClient = sessionStorage.getItem('selectedClient') !== null;
    console.log('[SelectedClientContext] Initial isInitialized:', hasStoredClient || true);
    return true; // Sempre começa como true pois o useState já leu do sessionStorage
  });

  const setSelectedClient = (client: Client | null) => {
    console.log('[SelectedClientContext] setSelectedClient called with:', client);
    setSelectedClientState(client);
    if (client) {
      sessionStorage.setItem('selectedClient', JSON.stringify(client));
      console.log('[SelectedClientContext] Saved to sessionStorage');
    } else {
      sessionStorage.removeItem('selectedClient');
      console.log('[SelectedClientContext] Removed from sessionStorage');
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