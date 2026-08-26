/**
 * Campo de data do Financeiro: DIGITÁVEL e com calendário.
 *
 * Existe porque `<input type="date">` não garante digitação textual nos
 * ambientes atuais — o usuário conseguia focar mas não escrever a data de
 * cobrança. Aqui o texto é um input comum mascarado em `DD/MM/AAAA` e o
 * calendário (`ui/calendar` + `ui/popover`) escreve no MESMO valor ISO.
 *
 * Contrato externo: sempre ISO `YYYY-MM-DD` (ou "" para "sem data"). Data
 * incompleta ou impossível não emite ISO — nunca inventamos data.
 */
import { useEffect, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  calendarDateToIso,
  dateTextToIso,
  isIncompleteDateText,
  isoToCalendarDate,
  isoToDateText,
  maskDateText,
} from "@/lib/financeDateText";

interface Props {
  /** Valor ISO `YYYY-MM-DD` ou "" quando não há data. */
  value: string;
  /** Recebe ISO válido ou "" (texto incompleto/inválido não emite). */
  onChange: (iso: string) => void;
  id?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

export default function FinanceDateInput({
  value,
  onChange,
  id,
  disabled,
  readOnly,
  className,
  placeholder = "DD/MM/AAAA",
  ...rest
}: Props) {
  const [text, setText] = useState(() => isoToDateText(value));
  const [open, setOpen] = useState(false);

  // O valor ISO é a fonte da verdade: quando ele muda de fora (calendário,
  // reset do modal), o texto acompanha — sem apagar digitação em andamento.
  useEffect(() => {
    const iso = dateTextToIso(text);
    if ((value || "") === (iso || "")) return;
    setText(isoToDateText(value));
  }, [value]);

  const locked = disabled || readOnly;
  const invalid = isIncompleteDateText(text);

  const handleText = (raw: string) => {
    const masked = maskDateText(raw);
    setText(masked);
    const iso = dateTextToIso(masked);
    if (iso) onChange(iso);
    else if (!masked.trim()) onChange("");
  };

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Input
        id={id}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        className={cn("w-full min-w-0 max-w-full pr-10", invalid && "border-destructive")}
        {...rest}
      />
      <Popover open={open} onOpenChange={(next) => !locked && setOpen(next)}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={locked}
            aria-label="Escolher no calendário"
            className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:bg-transparent"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={isoToCalendarDate(value)}
            defaultMonth={isoToCalendarDate(value)}
            onSelect={(date) => {
              if (!date) return;
              const iso = calendarDateToIso(date);
              setText(isoToDateText(iso));
              onChange(iso);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {invalid && (
        <p className="text-xs text-destructive mt-1">Data inválida — use DD/MM/AAAA</p>
      )}
    </div>
  );
}
