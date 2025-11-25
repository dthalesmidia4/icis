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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface PeriodSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (periodData: {
    titulo: string;
    dataInicio: Date;
    dataFim: Date;
  }) => void;
  isGenerating: boolean;
}

export function PeriodSelectionModal({ open, onClose, onConfirm, isGenerating }: PeriodSelectionModalProps) {
  const [periodTitle, setPeriodTitle] = useState<string>('');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [errors, setErrors] = useState<{ title?: string; dates?: string }>({});

  const validatePeriod = () => {
    const newErrors: { title?: string; dates?: string } = {};

    if (!periodTitle.trim()) {
      newErrors.title = 'O nome do período é obrigatório';
    }

    if (!startDate || !endDate) {
      newErrors.dates = 'Selecione as datas de início e fim';
    } else if (endDate < startDate) {
      newErrors.dates = 'A data final não pode ser anterior à data inicial';
    } else {
      const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 90) {
        newErrors.dates = 'Período máximo recomendado: 90 dias. Você pode continuar, mas considere dividir em períodos menores.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (!validatePeriod()) return;
    if (startDate && endDate) {
      onConfirm({
        titulo: periodTitle.trim(),
        dataInicio: startDate,
        dataFim: endDate,
      });
    }
  };

  const calculateDuration = () => {
    if (!startDate || !endDate) return null;
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Selecionar Período do Cronograma
          </DialogTitle>
          <DialogDescription>
            Defina o período para o qual deseja gerar o planejamento e cronograma de marketing.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Nome do Período */}
          <div className="space-y-2">
            <Label htmlFor="period-title">Nome do Período *</Label>
            <Input
              id="period-title"
              placeholder="Ex: Campanha de Verão 2025, Estratégia Q2"
              value={periodTitle}
              onChange={(e) => {
                setPeriodTitle(e.target.value);
                if (errors.title) setErrors({ ...errors, title: undefined });
              }}
              className={errors.title ? 'border-destructive' : ''}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title}</p>
            )}
          </div>

          {/* Data de Início */}
          <div className="space-y-2">
            <Label>Data de Início *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground",
                    errors.dates && "border-destructive"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    if (errors.dates) setErrors({ ...errors, dates: undefined });
                  }}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Data de Fim */}
          <div className="space-y-2">
            <Label>Data de Fim *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !endDate && "text-muted-foreground",
                    errors.dates && "border-destructive"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "PPP", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    if (errors.dates) setErrors({ ...errors, dates: undefined });
                  }}
                  initialFocus
                  disabled={(date) => startDate ? date < startDate : false}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            {errors.dates && (
              <p className="text-sm text-destructive">{errors.dates}</p>
            )}
          </div>

          {/* Resumo da Duração */}
          {calculateDuration() && (
            <div className="bg-muted p-3 rounded-lg text-sm">
              <p className="text-muted-foreground">
                💡 <strong>Duração:</strong> {calculateDuration()} dias
              </p>
            </div>
          )}
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
            disabled={!periodTitle || !startDate || !endDate || isGenerating}
          >
            {isGenerating ? 'Gerando...' : 'Gerar Planejamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
