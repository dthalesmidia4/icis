import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MonthSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selectedMonth: string) => void;
  isGenerating: boolean;
}

export function MonthSelectionModal({ open, onClose, onConfirm, isGenerating }: MonthSelectionModalProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Gerar opções de mês: mês atual + próximos 11 meses
  const generateMonthOptions = () => {
    const options = [];
    const today = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const monthYear = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      options.push({
        label: monthYear.charAt(0).toUpperCase() + monthYear.slice(1),
        value: value
      });
    }
    
    return options;
  };

  const monthOptions = generateMonthOptions();

  const handleConfirm = () => {
    if (selectedMonth) {
      onConfirm(selectedMonth);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Selecione o Mês de Execução
          </DialogTitle>
          <DialogDescription>
            Escolha o mês para o qual deseja gerar o planejamento e cronograma de marketing.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Mês de Referência</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="bg-muted p-3 rounded-lg text-sm">
            <p className="text-muted-foreground">
              💡 <strong>Dica:</strong> O planejamento será criado considerando as datas válidas do mês selecionado.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedMonth || isGenerating}
          >
            {isGenerating ? 'Gerando...' : 'Gerar Planejamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
