import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Repeat, Loader2 } from "lucide-react";
import { computeValidDays, fetchHolidaysInRange, formatBR } from "@/lib/dailyCards";

export interface DailyCardValues {
  is_daily_card: boolean;
  daily_start_date: string | null;
  daily_end_date: string | null;
  daily_time: string | null;
  daily_exclude_weekends: boolean;
  daily_exclude_holidays: boolean;
  daily_next_date: string | null;
  daily_total_occurrences: number | null;
  daily_completed_occurrences?: number;
  daily_completed_dates?: string[];
}

interface Props {
  values: DailyCardValues;
  onChange: (v: DailyCardValues) => void;
  /** true = pode editar. false = apenas leitura (card já existente e ativo). */
  editable?: boolean;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function DailyCardSection({ values, onChange, editable = true }: Props) {
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  useEffect(() => {
    let cancel = false;
    async function run() {
      if (!values.is_daily_card || !values.daily_start_date || !values.daily_end_date) return;
      if (!values.daily_exclude_holidays) {
        setHolidays(new Set());
        return;
      }
      setLoadingHolidays(true);
      const h = await fetchHolidaysInRange(values.daily_start_date, values.daily_end_date);
      if (!cancel) setHolidays(h);
      setLoadingHolidays(false);
    }
    run();
    return () => {
      cancel = true;
    };
  }, [values.is_daily_card, values.daily_start_date, values.daily_end_date, values.daily_exclude_holidays]);

  const preview = useMemo(() => {
    if (!values.is_daily_card || !values.daily_start_date || !values.daily_end_date) return [];
    return computeValidDays(
      values.daily_start_date,
      values.daily_end_date,
      !!values.daily_exclude_weekends,
      !!values.daily_exclude_holidays,
      holidays,
    );
  }, [values, holidays]);

  // Sync total_occurrences + next_date based on preview
  useEffect(() => {
    if (!values.is_daily_card) return;
    const total = preview.length || null;
    const next = preview[0] || null;
    if (values.daily_total_occurrences !== total || values.daily_next_date !== next) {
      onChange({ ...values, daily_total_occurrences: total, daily_next_date: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, values.is_daily_card]);

  const set = (patch: Partial<DailyCardValues>) => onChange({ ...values, ...patch });

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-amber-600" />
          <Label className="text-sm font-semibold">Card Diário (recorrência)</Label>
        </div>
        <Switch
          checked={values.is_daily_card}
          disabled={!editable}
          onCheckedChange={(checked) =>
            set({
              is_daily_card: checked,
              daily_start_date: checked ? values.daily_start_date || todayISO() : null,
              daily_end_date: checked ? values.daily_end_date : null,
              daily_time: checked ? values.daily_time || "09:00" : null,
              daily_exclude_weekends: values.daily_exclude_weekends ?? true,
              daily_exclude_holidays: values.daily_exclude_holidays ?? true,
            })
          }
        />
      </div>

      {values.is_daily_card && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Início</Label>
              <Input
                type="date"
                disabled={!editable}
                value={values.daily_start_date || ""}
                onChange={(e) => set({ daily_start_date: e.target.value || null })}
              />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input
                type="date"
                disabled={!editable}
                value={values.daily_end_date || ""}
                onChange={(e) => set({ daily_end_date: e.target.value || null })}
              />
            </div>
            <div>
              <Label className="text-xs">Horário diário</Label>
              <Input
                type="time"
                disabled={!editable}
                value={values.daily_time || ""}
                onChange={(e) => set({ daily_time: e.target.value || null })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!values.daily_exclude_weekends}
                disabled={!editable}
                onCheckedChange={(c) => set({ daily_exclude_weekends: c })}
              />
              Ignorar finais de semana
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!values.daily_exclude_holidays}
                disabled={!editable}
                onCheckedChange={(c) => set({ daily_exclude_holidays: c })}
              />
              Ignorar feriados
            </label>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Preview de ocorrências ({preview.length})
              </span>
              {loadingHolidays && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            {preview.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Defina o período para visualizar as datas.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {preview.slice(0, 60).map((d) => (
                  <Badge key={d} variant="outline" className="text-[10px] font-mono">
                    {formatBR(d)}
                    {values.daily_time ? ` · ${values.daily_time}` : ""}
                  </Badge>
                ))}
                {preview.length > 60 && (
                  <Badge variant="secondary" className="text-[10px]">
                    +{preview.length - 60} datas
                  </Badge>
                )}
              </div>
            )}
          </div>

          {(values.daily_completed_occurrences || 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              Concluídas: {values.daily_completed_occurrences} / {values.daily_total_occurrences ?? "?"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
