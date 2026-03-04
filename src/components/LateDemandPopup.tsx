import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLateDemandAlerts } from '@/hooks/useLateDemandAlerts';

export default function LateDemandPopup() {
  const { lateDemands, dismissDemand, dismissAll } = useLateDemandAlerts();
  const navigate = useNavigate();

  if (lateDemands.length === 0) return null;

  const handleCardClick = (demandId: string) => {
    dismissDemand(demandId);
    navigate(`/kanban-central?highlight=${demandId}`);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full">
      {lateDemands.length > 1 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={dismissAll}
          >
            Dispensar todos ({lateDemands.length})
          </Button>
        </div>
      )}
      {lateDemands.slice(0, 3).map(demand => (
        <div
          key={demand.id}
          className="bg-card border border-destructive/50 rounded-lg shadow-lg p-4 animate-in slide-in-from-bottom-2 fade-in-0 duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-destructive mb-1">Demanda em atraso</p>
              <p className="text-sm font-semibold text-foreground truncate">{demand.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{demand.clientName}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => dismissDemand(demand.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3 text-xs gap-1.5"
            onClick={() => handleCardClick(demand.id)}
          >
            <ExternalLink className="h-3 w-3" />
            Ver no Kanban
          </Button>
        </div>
      ))}
      {lateDemands.length > 3 && (
        <p className="text-xs text-center text-muted-foreground">
          +{lateDemands.length - 3} demanda(s) em atraso
        </p>
      )}
    </div>
  );
}
