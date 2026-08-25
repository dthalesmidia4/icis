/**
 * Estado de falha na carga do Financeiro.
 *
 * Pós-cutover os valores só existem cifrados e chegam por RPC segura; se essa
 * leitura falhar, é obrigatório mostrar erro em vez de renderizar R$ 0,00 como
 * se fosse dado válido.
 */
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface FinanceLoadErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function FinanceLoadErrorState({ message, onRetry }: FinanceLoadErrorStateProps) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-start gap-3 py-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-semibold">Não foi possível exibir os valores</span>
        </div>
        <p className="text-sm text-muted-foreground max-w-prose">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}
