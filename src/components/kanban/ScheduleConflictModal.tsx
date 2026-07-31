import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { AREA_LABEL, type AssignmentConflict, type FreeSlotSuggestion } from "@/lib/scheduleOccupancy";

interface ScheduleConflictModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome do responsável de destino. */
  targetName?: string;
  conflicts: AssignmentConflict[];
  suggestion?: FreeSlotSuggestion | null;
  /** Aplica a transferência reagendando para o slot sugerido. */
  onReschedule?: (slot: FreeSlotSuggestion) => void;
  rescheduling?: boolean;
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export default function ScheduleConflictModal({
  open,
  onOpenChange,
  targetName,
  conflicts,
  suggestion,
  onReschedule,
  rescheduling,
}: ScheduleConflictModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Conflito de agenda
          </AlertDialogTitle>
          <AlertDialogDescription>
            {targetName
              ? `${targetName} já tem demanda ocupando este horário. A transferência foi bloqueada.`
              : "O responsável já tem demanda ocupando este horário. A transferência foi bloqueada."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {conflicts.length > 0 && (
          <ul className="space-y-2 text-sm">
            {conflicts.map((c, i) => (
              <li
                key={`${c.id}-${i}`}
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
              >
                <div className="font-medium">{c.title}</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {AREA_LABEL[c.area]} · {c.message}
                </div>
              </li>
            ))}
          </ul>
        )}

        {suggestion && onReschedule && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-start gap-2">
            <CalendarClock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="font-medium">Primeiro horário livre</div>
              <div className="text-muted-foreground text-xs">
                {fmtDate(suggestion.date)} · {suggestion.startTime}–{suggestion.endTime}
              </div>
            </div>
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {suggestion && onReschedule ? (
            <Button disabled={rescheduling} onClick={() => onReschedule(suggestion)}>
              {rescheduling ? "Reagendando..." : "Transferir e reagendar"}
            </Button>
          ) : (
            <AlertDialogAction>Entendi</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
