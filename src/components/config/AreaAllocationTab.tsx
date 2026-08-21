import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useCollaborators } from "@/hooks/useCollaborators";
import { Info, Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  blocksForCell,
  describeGaps,
  planApplyDayToWeek,
  validateBlock,
  type ScheduleBlock,
} from "@/lib/areaScheduleBlocks";

type WorkArea = "midia" | "sistemas";
type DefaultArea = "midia" | "sistemas" | "ambos";

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
  {
    key: "sistemas",
    label: "Sistemas",
    badge:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
  },
];

const MAX_BLOCKS = 3;

function normalizeTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

const normalizeRow = (r: any): ScheduleBlock => ({
  id: r.id,
  user_id: r.user_id,
  work_area: r.work_area,
  weekday: r.weekday,
  start_time: normalizeTime(r.start_time),
  end_time: normalizeTime(r.end_time),
});

export function AreaAllocationTab() {
  const { agencyId } = useAgency();
  const { collaborators, loading: loadingCollabs } = useCollaborators(agencyId);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduleBlock[]>([]);
  const [defaultAreas, setDefaultAreas] = useState<Record<string, DefaultArea>>({});
  const [loading, setLoading] = useState(true);
  const [busyCell, setBusyCell] = useState<string | null>(null);
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
        supabase.from("profiles").select("id, default_work_area").eq("tenant_id", agencyId),
      ]);
      if (cancel) return;
      setRows(((schedules as any[]) || []).map(normalizeRow));
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

  /** Cria um bloco novo (linha real em `user_area_schedules`). */
  const addBlock = async (
    userId: string,
    weekday: number,
    area: WorkArea,
    start: string,
    end: string,
  ): Promise<boolean> => {
    if (!agencyId) return false;
    const existing = blocksForCell(rows, userId, weekday, area);
    const check = validateBlock(existing, { start, end });
    if (check.ok === false) {
      toast.error(check.error);
      return false;
    }
    const cellKey = `${userId}:${weekday}:${area}`;
    setBusyCell(cellKey);
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
    setBusyCell(null);
    if (error || !data) {
      toast.error("Erro ao criar período");
      return false;
    }
    setRows((prev) => [...prev, normalizeRow(data)]);
    return true;
  };

  /** Atualiza APENAS a linha editada. */
  const updateBlock = async (block: ScheduleBlock, start: string, end: string) => {
    const existing = blocksForCell(rows, block.user_id, block.weekday, block.work_area);
    const check = validateBlock(existing, { start, end }, block.id);
    if (check.ok === false) {
      toast.error(check.error);
      return;
    }
    const cellKey = `${block.user_id}:${block.weekday}:${block.work_area}`;
    setBusyCell(cellKey);
    const { error } = await supabase
      .from("user_area_schedules")
      .update({ start_time: start, end_time: end })
      .eq("id", block.id);
    setBusyCell(null);
    if (error) {
      toast.error("Erro ao salvar período");
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === block.id ? { ...r, start_time: start, end_time: end } : r)),
    );
  };

  const removeBlock = async (block: ScheduleBlock) => {
    const cellKey = `${block.user_id}:${block.weekday}:${block.work_area}`;
    setBusyCell(cellKey);
    const { error } = await supabase.from("user_area_schedules").delete().eq("id", block.id);
    setBusyCell(null);
    if (error) {
      toast.error("Erro ao remover período");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== block.id));
  };

  const setDefaultArea = async (userId: string, area: DefaultArea) => {
    setSavingDefault(userId);
    setDefaultAreas((prev) => ({ ...prev, [userId]: area }));
    const { error } = await supabase
      .from("profiles")
      .update({ default_work_area: area })
      .eq("id", userId);
    if (error) toast.error("Erro ao salvar área padrão");
    else toast.success("Área padrão atualizada");
    setSavingDefault(null);
  };

  /** Copia TODOS os blocos de segunda para ter–sex (substitui, sem duplicar). */
  const copyMondayToWeek = async (userId: string, area: WorkArea) => {
    if (!agencyId) return;
    const source = blocksForCell(rows, userId, 1, area);
    if (source.length === 0) {
      toast.error("Cadastre os períodos de segunda primeiro");
      return;
    }
    const plan = planApplyDayToWeek({
      rows,
      userId,
      area,
      sourceWeekday: 1,
      targetWeekdays: [2, 3, 4, 5],
    });
    setBusyCell(`${userId}:week:${area}`);
    if (plan.toDelete.length > 0) {
      const { error } = await supabase
        .from("user_area_schedules")
        .delete()
        .in("id", plan.toDelete);
      if (error) {
        setBusyCell(null);
        toast.error("Erro ao limpar os dias de destino");
        return;
      }
    }
    const { data, error } = await supabase
      .from("user_area_schedules")
      .insert(
        plan.toInsert.map((b) => ({
          tenant_id: agencyId,
          user_id: userId,
          work_area: area,
          weekday: b.weekday,
          start_time: b.start_time,
          end_time: b.end_time,
        })),
      )
      .select("id, user_id, work_area, weekday, start_time, end_time");
    setBusyCell(null);
    if (error || !data) {
      toast.error("Erro ao aplicar os períodos");
      return;
    }
    const deleted = new Set(plan.toDelete);
    setRows((prev) => [...prev.filter((r) => !deleted.has(r.id)), ...data.map(normalizeRow)]);
    toast.success(`${source.length} período(s) aplicados a ter–sex`);
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
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          Cadastre mais de um período no mesmo dia para representar intervalos. Ex.:{" "}
          <strong className="text-foreground">08:00–12:00</strong> e{" "}
          <strong className="text-foreground">13:30–18:00</strong> — o intervalo 12:00–13:30 é
          reconhecido automaticamente pelo Escritório.
        </span>
      </div>

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
                  isSel && "bg-primary/10",
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
                    Períodos de trabalho por dia da semana × área. Sem período = sem expediente.
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
                        <th key={a.key} className="text-center p-2 font-semibold uppercase text-[10px]">
                          <div className="flex items-center justify-center gap-2">
                            <span
                              className={cn("inline-block px-2 py-0.5 rounded border text-[10px]", a.badge)}
                            >
                              {a.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyMondayToWeek(selected.userId, a.key)}
                              className="text-[9px] text-muted-foreground hover:text-foreground underline"
                              title="Copiar TODOS os períodos de segunda para ter–sex"
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
                      <tr key={wd.n} className="border-t align-top">
                        <td className="p-2 font-medium text-xs uppercase text-muted-foreground">
                          {wd.label}
                        </td>
                        {AREAS.map((a) => {
                          const cellBlocks = blocksForCell(rows, selected.userId, wd.n, a.key);
                          const cellKey = `${selected.userId}:${wd.n}:${a.key}`;
                          return (
                            <td key={a.key} className="p-2">
                              <ScheduleCell
                                blocks={cellBlocks}
                                busy={busyCell === cellKey || busyCell === `${selected.userId}:week:${a.key}`}
                                onAdd={(s, e) => addBlock(selected.userId, wd.n, a.key, s, e)}
                                onUpdate={updateBlock}
                                onRemove={removeBlock}
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
    </div>
  );
}

function ScheduleCell({
  blocks,
  busy,
  onAdd,
  onUpdate,
  onRemove,
}: {
  blocks: ScheduleBlock[];
  busy: boolean;
  onAdd: (start: string, end: string) => Promise<boolean>;
  onUpdate: (block: ScheduleBlock, start: string, end: string) => void;
  onRemove: (block: ScheduleBlock) => void;
}) {
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const gaps = describeGaps(blocks);

  const commitDraft = async () => {
    if (!draft) return;
    // Nunca persistir registro vazio/incompleto.
    if (!draft.start || !draft.end) return;
    const ok = await onAdd(draft.start, draft.end);
    if (ok) setDraft(null);
  };

  return (
    <div className="space-y-1">
      {blocks.map((b) => (
        <BlockRow
          key={b.id}
          block={b}
          disabled={busy}
          onCommit={(s, e) => onUpdate(b, s, e)}
          onRemove={() => onRemove(b)}
        />
      ))}

      {draft && (
        <div className="flex items-center gap-1 justify-center">
          <Input
            type="time"
            autoFocus
            value={draft.start}
            disabled={busy}
            onChange={(ev) => setDraft({ ...draft, start: ev.target.value })}
            className="h-8 w-[95px] text-xs px-1"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="time"
            value={draft.end}
            disabled={busy}
            onChange={(ev) => setDraft({ ...draft, end: ev.target.value })}
            onBlur={commitDraft}
            className="h-8 w-[95px] text-xs px-1"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={busy}
            onClick={() => setDraft(null)}
            title="Cancelar período"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      {blocks.length + (draft ? 1 : 0) < MAX_BLOCKS && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setDraft({ start: "", end: "" })}
          className="mx-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Adicionar período
        </button>
      )}

      {gaps.length > 0 && (
        <p className="text-center text-[9px] text-muted-foreground">
          Intervalo: {gaps.join(", ")}
        </p>
      )}
    </div>
  );
}

function BlockRow({
  block,
  disabled,
  onCommit,
  onRemove,
}: {
  block: ScheduleBlock;
  disabled: boolean;
  onCommit: (start: string, end: string) => void;
  onRemove: () => void;
}) {
  const [s, setS] = useState(block.start_time);
  const [e, setE] = useState(block.end_time);
  useEffect(() => {
    setS(block.start_time);
    setE(block.end_time);
  }, [block.start_time, block.end_time]);

  const commit = () => {
    if (s === block.start_time && e === block.end_time) return;
    if (!s || !e) return;
    onCommit(s, e);
  };

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
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={disabled}
        onClick={onRemove}
        title="Remover período"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
