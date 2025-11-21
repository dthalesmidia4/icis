import { createContext, useContext, useState, ReactNode } from 'react';

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
  const [selectedClient, setSelectedClientState] = useState<Client | null>(() => {
    const stored = sessionStorage.getItem('selectedClient');
    return stored ? JSON.parse(stored) : null;
  });

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
    <SelectedClientContext.Provider value={{ selectedClient, setSelectedClient, clearSelectedClient }}>
      {children}
    </SelectedClientContext.Provider>
  );
};
