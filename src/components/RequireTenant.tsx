/**
 * RequireTenant - Componente de proteção para rotas que requerem agency
 * 
 * NOTA: Mantido como RequireTenant para compatibilidade.
 * Internamente usa useAgency() do novo modelo.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgency } from '@/contexts/AgencyContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, LogOut, Home } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RequireTenantProps {
  children: ReactNode;
}

export const RequireTenant = ({ children }: RequireTenantProps) => {
  // Usar novo contexto de Agency (agencyId substitui tenantId)
  const { agencyId, isLoading, error, refreshAgency } = useAgency();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);
  const [showFallback, setShowFallback] = useState(false);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset redirect flag when agencyId becomes available
  useEffect(() => {
    if (agencyId) {
      hasRedirected.current = false;
      setShowFallback(false);
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    }
  }, [agencyId]);

  // Handle redirect with delay to avoid race conditions
  useEffect(() => {
    if (!isLoading && !agencyId && !error && !hasRedirected.current) {
      redirectTimerRef.current = setTimeout(() => {
        if (!agencyId) {
          console.log('[RequireTenant] No agency after delay, redirecting to agency-setup');
          hasRedirected.current = true;
          navigate('/agency-setup');
        }
      }, 2000);
      setShowFallback(true);
    }

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [agencyId, isLoading, error, navigate]);

  const handleForceLogout = async () => {
    localStorage.clear();
    sessionStorage.clear();
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  const handleRetry = async () => {
    setShowFallback(false);
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    hasRedirected.current = false;
    await refreshAgency();
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Erro ao carregar configurações</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleRetry} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
          <Button onClick={handleForceLogout} variant="outline">
            <LogOut className="h-4 w-4 mr-2" />
            Fazer login novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!agencyId && showFallback) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verificando configurações...</p>
          <p className="text-sm text-muted-foreground">Você será redirecionado em breve.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button onClick={handleRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
          <Button onClick={() => navigate('/')} variant="ghost" size="sm">
            <Home className="h-4 w-4 mr-2" />
            Voltar ao início
          </Button>
          <Button onClick={handleForceLogout} variant="ghost" size="sm" className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </div>
    );
  }

  if (!agencyId) return null;

  return <>{children}</>;
};
