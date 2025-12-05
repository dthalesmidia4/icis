import { ReactNode, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';

interface RequireTenantProps {
  children: ReactNode;
}

export const RequireTenant = ({ children }: RequireTenantProps) => {
  const { tenantId, isLoading } = useTenant();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Reset redirect flag when tenant changes
    if (tenantId) {
      hasRedirected.current = false;
    }
  }, [tenantId]);

  useEffect(() => {
    if (!isLoading && !tenantId && !hasRedirected.current) {
      hasRedirected.current = true;
      toast.error("Configure sua agência antes de continuar");
      navigate('/agency-setup');
    }
  }, [tenantId, isLoading, navigate]);

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

  if (!tenantId) return null;

  return <>{children}</>;
};
