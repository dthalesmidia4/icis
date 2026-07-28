import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useCollaborators } from "@/hooks/useCollaborators";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type WorkArea = "midia" | "sistemas";
type DefaultArea = "midia" | "sistemas" | "ambos";

interface ScheduleRow {
  id: string;
  user_id: string;
  work_area: WorkArea;
  weekday: number;
  start_time: string;
  end_time: string;
}

const WEEKDAYS = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 0, label: "Dom" },
];

const AREAS: { key: WorkArea; label: string; badge: string }[] = [
  { key: "midia", label: "Mídia", badge: "bg-primary/10 text-primary border-primary/30" },
  { key: "sistemas", label: "Sistemas", badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300" },
];

function normalizeTime(t: string | null | undefined): string {
  if (!t) return "";
  // "09:00:00" -> "09:00"
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function AreaAllocationTab() {
  const { agencyId } = useAgency();
  const { collaborators, loading: loadingCollabs } = useCollaborators(agencyId);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [defaultAreas, setDefaultAreas] = useState<Record<string, DefaultArea>>({});
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const [{ data: schedules }, { data: profiles }] = await Promise.all([
        supabase
          .from("user_area_schedules")
          .select("id, user_id, work_area, weekday, start_time, end_time")
          .eq("tenant_id", agencyId),
        supabase
          .from("profiles")
          .select("id, default_work_area")
          .eq("tenant_id", agencyId),
      ]);
      if (cancel) return;
      setRows(((schedules as any[]) || []).map((r) => ({
        ...r,
        start_time: normalizeTime(r.start_time),
        end_time: normalizeTime(r.end_time),
      })));
      const dm: Record<string, DefaultArea> = {};
      (profiles || []).forEach((p: any) => {
        dm[p.id] = (p.default_work_area as DefaultArea) || "ambos";
      });
      setDefaultAreas(dm);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [agencyId]);

  useEffect(() => {
    if (!selectedUserId && collaborators.length > 0) {
      setSelectedUserId(collaborators[0].userId);
    }
  }, [collaborators, selectedUserId]);

  const selected = collaborators.find((c) => c.userId === selectedUserId);

  const cellRow = (userId: string, weekday: number, area: WorkArea): ScheduleRow | undefined =>
    rows.find(
      (r) => r.user_id === userId && r.weekday === weekday && r.work_area === area
    );

  const saveCell = async (
    userId: string,
    weekday: number,
    area: WorkArea,
    start: string,
    end: string
  ) => {
    if (!agencyId) return;
    const cellKey = `${userId}:${weekday}:${area}`;
    setSavingCell(cellKey);
    const existing = cellRow(userId, weekday, area);

    // Empty both = delete
    if (!start && !end) {
      if (existing) {
        const { error } = await supabase
          .from("user_area_schedules")
          .delete()
          .eq("id", existing.id);
        if (error) {
          toast.error("Erro ao remover bloco");
        } else {
          setRows((prev) => prev.filter((r) => r.id !== existing.id));
        }
      }
      setSavingCell(null);
      return;
    }

    if (!start || !end) {
      toast.error("Preencha início e fim");
      setSavingCell(null);
      return;
    }
    if (start >= end) {
      toast.error("Hora final deve ser maior que a inicial");
      setSavingCell(null);
      return;
    }

    if (existing) {
      const { error } = await supabase
        .from("user_area_schedules")
        .update({ start_time: start, end_time: end })
        .eq("id", existing.id);
      if (error) {
        toast.error("Erro ao salvar");
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === existing.id ? { ...r, start_time: start, end_time: end } : r
          )
        );
      }
    } else {
      const { data, error } = await supabase
        .from("user_area_schedules")
        .insert({
          tenant_id: agencyId,
          user_id: userId,
          work_area: area,
          weekday,
          start_time: start,
          end_time: end,
        })
        .select("id, user_id, work_area, weekday, start_time, end_time")
        .single();
      if (error || !data) {
        toast.error("Erro ao criar bloco");
      } else {
        setRows((prev) => [
          ...prev,
          {
            ...(data as any),
            start_time: normalizeTime((data as any).start_time),
            end_time: normalizeTime((data as any).end_time),
          },
        ]);
      }
    }
    setSavingCell(null);
  };

  const setDefaultArea = async (userId: string, area: DefaultArea) => {
    setSavingDefault(userId);
    setDefaultAreas((prev) => ({ ...prev, [userId]: area }));
    const { error } = await supabase
      .from("profiles")
      .update({ default_work_area: area })
      .eq("id", userId);
    if (error) {
      toast.error("Erro ao salvar área padrão");
    } else {
      toast.success("Área padrão atualizada");
    }
    setSavingDefault(null);
  };

  const copyAllWeekdays = async (userId: string, area: WorkArea) => {
    // Uses Monday as source, copies to Tue-Fri
    const src = cellRow(userId, 1, area);
    if (!src || !src.start_time || !src.end_time) {
      toast.error("Preencha o bloco de segunda primeiro");
      return;
    }
    for (const wd of [2, 3, 4, 5]) {
      await saveCell(userId, wd, area, src.start_time, src.end_time);
    }
    toast.success("Aplicado a ter–sex");
  };

  if (loading || loadingCollabs) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (collaborators.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Nenhum colaborador interno encontrado.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
      {/* Lista de colaboradores */}
      <div className="border rounded-lg overflow-hidden max-h-[65vh] overflow-y-auto">
        {collaborators.map((c) => {
          const isSel = c.userId === selectedUserId;
          const def = defaultAreas[c.userId] || "ambos";
          return (
            <button
              key={c.userId}
              onClick={() => setSelectedUserId(c.userId)}
              className={cn(
                "w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors flex items-center gap-2",
                isSel && "bg-primary/10"
              )}
            >
              <Avatar className="h-8 w-8">
                {c.avatarUrl && <AvatarImage src={c.avatarUrl} />}
                <AvatarFallback className="text-xs">
                  {c.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-sm">{c.fullName}</div>
                <div className="text-[10px] text-muted-foreground uppercase">
                  {def === "midia" ? "Mídia" : def === "sistemas" ? "Sistemas" : "Ambos"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Grade de horários */}
      <div className="min-w-0">
        {selected && (
          <>
            <div className="flex items-center justify-between gap-3 mb-3 p-3 border rounded-lg bg-muted/30">
              <div>
                <div className="font-semibold">{selected.fullName}</div>
                <div className="text-xs text-muted-foreground">
                  Blocos de horário por dia da semana × área. Deixe vazio para não alocar.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Área padrão:</span>
                <Select
                  value={defaultAreas[selected.userId] || "ambos"}
                  onValueChange={(v) => setDefaultArea(selected.userId, v as DefaultArea)}
                  disabled={savingDefault === selected.userId}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="midia">Mídia</SelectItem>
                    <SelectItem value="sistemas">Sistemas</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-semibold uppercase text-[10px] w-16">Dia</th>
                    {AREAS.map((a) => (
                      <th
                        key={a.key}
                        className="text-center p-2 font-semibold uppercase text-[10px]"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded border text-[10px]",
                              a.badge
                            )}
                          >
                            {a.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyAllWeekdays(selected.userId, a.key)}
                            className="text-[9px] text-muted-foreground hover:text-foreground underline"
                            title="Copiar bloco de segunda para ter–sex"
                          >
                            aplicar seg → ter-sex
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((wd) => (
                    <tr key={wd.n} className="border-t">
                      <td className="p-2 font-medium text-xs uppercase text-muted-foreground">
                        {wd.label}
                      </td>
                      {AREAS.map((a) => {
                        const row = cellRow(selected.userId, wd.n, a.key);
                        const cellKey = `${selected.userId}:${wd.n}:${a.key}`;
                        const isSaving = savingCell === cellKey;
                        return (
                          <td key={a.key} className="p-2">
                            <TimeRangeCell
                              start={row?.start_time || ""}
                              end={row?.end_time || ""}
                              disabled={isSaving}
                              onCommit={(s, e) =>
                                saveCell(selected.userId, wd.n, a.key, s, e)
                              }
                              onClear={() =>
                                saveCell(selected.userId, wd.n, a.key, "", "")
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TimeRangeCell({
  start,
  end,
  disabled,
  onCommit,
  onClear,
}: {
  start: string;
  end: string;
  disabled: boolean;
  onCommit: (start: string, end: string) => void;
  onClear: () => void;
}) {
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  useEffect(() => {
    setS(start);
    setE(end);
  }, [start, end]);

  const commit = () => {
    if (s === start && e === end) return;
    onCommit(s, e);
  };

  const hasValue = !!(start || end);

  return (
    <div className="flex items-center gap-1 justify-center">
      <Input
        type="time"
        value={s}
        disabled={disabled}
        onChange={(ev) => setS(ev.target.value)}
        onBlur={commit}
        className="h-8 w-[95px] text-xs px-1"
      />
      <span className="text-muted-foreground text-xs">–</span>
      <Input
        type="time"
        value={e}
        disabled={disabled}
        onChange={(ev) => setE(ev.target.value)}
        onBlur={commit}
        className="h-8 w-[95px] text-xs px-1"
      />
      {hasValue && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={disabled}
          onClick={onClear}
          title="Remover bloco"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
