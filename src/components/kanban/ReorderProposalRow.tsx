import { useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, Pencil, Pin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtMinutes, reorderTier, type ReorderCardInput, type ReorderProposal, type ReorderManualOverride } from "@/lib/reorderSequence";

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Rótulos legíveis de etapa e tipo. */
export const STAGE_LABELS: Record<string, string> = {
  planejar: "Planejar",
  criar_roteiro: "Criar roteiro",
  revisar_roteiro: "Revisar roteiro",
  criar_arte: "Criar arte",
  captar: "Captar",
  descarregar_captacao: "Descarregar captação",
  revisar_captacao: "Revisar captação",
  gerar_video: "Gerar vídeo",
  editar_video: "Editar vídeo",
  revisar: "Revisar",
  enviar_cliente: "Enviar cliente",
  aguardando_cliente: "Aguardando cliente",
  publicar: "Publicar",
  revisar_publicacao: "Revisar publicação",
  especificar: "Especificar",
  desenvolver: "Em desenvolvimento",
  corrigir_bug_n1: "Bug — Nível 1",
  corrigir_bug_n2: "Bug — Nível 2",
  corrigir_bug_n3: "Bug — Nível 3",
  testar: "Testar",
  ajustar: "Ajustar",
  entregar_cliente: "Entregar ao cliente",
  feedback_cliente: "Feedback ao cliente",
};

export const TYPE_LABELS: Record<string, string> = {
  criativo_estatico: "Criativo estático",
  carrossel: "Carrossel",
  video_captado: "Vídeo captado",
  video_gerado: "Vídeo gerado",
  anuncio: "Anúncio",
  outro: "Outro",
  bug_n1: "Bug nível 1",
  bug_n2: "Bug nível 2",
  bug_n3: "Bug nível 3",
  desenvolvimento: "Desenvolvimento",
  melhoria: "Melhoria",
  suporte: "Suporte",
};

export const labelFor = (map: Record<string, string>, key?: string | null): string | null => {
  const k = (key || "").toLowerCase();
  if (!k) return null;
  return map[k] || k.replace(/_/g, " ");
};

export type DraftState = {
  date: string;
  time: string;
  duration: string;
  endDate: string;
  endTime: string;
  durMode: "auto" | "manual";
  endEdited: boolean;
};

/** Um único selo de estado por card — evita competição visual. */
function primaryBadge(p: ReorderProposal): { label: string; cls: string; title?: string } | null {
  if (p.skipped) {
    return { label: "não reagendado", cls: "border-border text-muted-foreground", title: "Este card mantém o horário atual." };
  }
  if (p.riskStatus === "risk") {
    return {
      label: "risco de atraso",
      cls: "border-red-500/60 text-red-600 dark:text-red-400",
      title: `Faltam ${fmtMinutes(Math.max(p.slackMin ?? 0, 0))} para o prazo e a etapa atual leva ~${fmtMinutes(p.remainingCycleMin || 0)} — por isso foi priorizado.`,
    };
  }
  if (p.keepStart) {
    return { label: "em execução", cls: "border-primary/60 text-primary", title: "Já iniciado: o início é preservado e só o término é recalculado." };
  }
  if (p.pinned) {
    return {
      label: "ajuste manual",
      cls: "border-primary/60 text-primary",
      title: p.pinnedKind === "both" ? "Início e término definidos manualmente." : p.pinnedKind === "end" ? "Término definido manualmente." : "Início definido manualmente.",
    };
  }
  if (p.changed) {
    return { label: "reagendado", cls: "border-border text-muted-foreground" };
  }
  return null;
}

/** Um único motivo visível — o resto vai para "detalhes". */
function primaryReason(p: ReorderProposal): { text: string; tone: "muted" | "warn" } | null {
  if (p.skipped) {
    const stage = labelFor(STAGE_LABELS, p.stageKey);
    return { text: p.warning || `${stage || "Etapa"} — horário fixo, não reagendado.`, tone: "muted" };
  }
  if (p.jumpReason) return { text: p.jumpReason, tone: "muted" };
  if (p.warning) return { text: p.warning, tone: "warn" };
  if (p.pausedByCaptar) return { text: `Pausado às ${p.pausedByCaptar.atTime} para a captação "${p.pausedByCaptar.captarTitle}".`, tone: "muted" };
  return null;
}

interface Props {
  index: number;
  proposal: ReorderProposal;
  orig?: ReorderCardInput;
  isEditing: boolean;
  disabled: boolean;
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  onToggleEdit: () => void;
  onCloseEdit: () => void;
  hasOverride: boolean;
  onSaveOverride: (o: ReorderManualOverride) => void;
  onRemoveOverride: () => void;
  baseDate: Date;
}

export default function ReorderProposalRow({
  index,
  proposal: p,
  orig,
  isEditing,
  disabled,
  draft,
  setDraft,
  onToggleEdit,
  onCloseEdit,
  hasOverride,
  onSaveOverride,
  onRemoveOverride,
  baseDate,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const origStart = orig?.due_date ? `${fmtDate(orig.due_date)} ${(orig.due_time || "").slice(0, 5)}` : "—";
  const origEnd = orig?.delivery_date ? `${fmtDate(orig.delivery_date)} ${(orig.delivery_time || "").slice(0, 5)}` : "—";
  const newStart = p.startISO ? `${fmtDate(p.startISO)} ${p.startTime}` : "—";
  const newEnd = p.endISO ? `${fmtDate(p.endISO)} ${p.endTime}` : "—";

  const badge = primaryBadge(p);
  const reason = primaryReason(p);
  const stage = labelFor(STAGE_LABELS, p.stageKey ?? orig?.current_function_key);
  const type = labelFor(TYPE_LABELS, p.demandTypeKey ?? orig?.demand_type_key);
  const area = (p.workArea ?? orig?.work_area) === "sistemas" ? "Sistemas" : (p.workArea ?? orig?.work_area) === "midia" ? "Mídia" : null;
  const metaLine = [stage, type, area].filter(Boolean).join(" · ");

  const tier = orig ? reorderTier(orig) : 0;
  const tierLabel = tier === 2 ? "Avaliar" : tier === 1 ? "Revisão" : "Produção";

  const accent = p.skipped
    ? "border-border/60"
    : p.riskStatus === "risk"
      ? "border-red-500/40"
      : p.warning
        ? "border-amber-500/40"
        : p.changed
          ? "border-primary/30"
          : "border-border/60";

  return (
    <div className={"rounded-lg border bg-card px-3 py-2.5 " + accent}>
      {/* Linha 1: título + estado + ajustar */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-tight">{p.title}</div>
              {metaLine && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{metaLine}</div>}
            </div>
            {badge && (
              <Badge variant="outline" className={"shrink-0 text-[10px] font-normal " + badge.cls} title={badge.title}>
                {badge.label}
              </Badge>
            )}
            {!p.skipped && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-1.5 text-muted-foreground"
                disabled={disabled}
                onClick={onToggleEdit}
                title="Ajustar manualmente"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Linha 2: a informação principal — de → para */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm tabular-nums">
            {p.skipped ? (
              <span className="text-muted-foreground">{origStart}</span>
            ) : p.keepStart ? (
              <>
                <span className="text-muted-foreground">{newStart}</span>
                <span className="text-muted-foreground">→</span>
                {origEnd !== newEnd && <span className="text-xs text-muted-foreground line-through">{origEnd}</span>}
                <span className="font-semibold">{newEnd}</span>
                <span className="text-xs text-muted-foreground">+{fmtDuration(p.extensionMin || p.durationMin)}</span>
              </>
            ) : (
              <>
                {p.changed && <span className="text-xs text-muted-foreground line-through">{origStart}</span>}
                {p.changed && <span className="text-muted-foreground">→</span>}
                <span className="font-semibold">{newStart}</span>
                <span className="text-muted-foreground">–</span>
                <span className="font-semibold">{newEnd}</span>
                <span className="text-xs text-muted-foreground">{fmtDuration(p.durationMin)}</span>
              </>
            )}
          </div>

          {/* Linha 3: um único motivo */}
          {reason && (
            <div
              className={
                "mt-1 flex items-start gap-1 text-[11px] " +
                (reason.tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")
              }
            >
              {reason.tone === "warn" ? (
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              ) : (
                <CalendarClock className="mt-0.5 h-3 w-3 shrink-0" />
              )}
              <span>{reason.text}</span>
            </div>
          )}

          {/* Detalhes sob demanda */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <ChevronDown className={"h-3 w-3 transition-transform " + (detailsOpen ? "rotate-180" : "")} />
                detalhes
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                <li>Fila: {tierLabel}</li>
                {p.remainingCycleMin ? (
                  <li>
                    {stage || "Etapa atual"} leva ~{fmtMinutes(p.remainingCycleMin)}
                    {p.slackMin != null ? ` · prazo em ${fmtMinutes(p.slackMin)}` : ""}
                  </li>
                ) : null}
                {p.keepStart && (
                  <li>
                    Na etapa desde {p.stageStartISO && p.stageStartTime ? `${fmtDate(p.stageStartISO)} ${p.stageStartTime}` : "—"}
                    {p.stagePlannedMin ? ` · planejado ${fmtDuration(p.stagePlannedMin)} · extensão de 30% = ${fmtDuration(p.extensionMin || 0)}` : ""}
                  </li>
                )}
                {p.riskStatus === "recent" && <li>Chegou há pouco na coluna e não está em risco — entrou no fim da fila.</li>}
                {p.slackApplied && <li>Folga de segurança aplicada antes do prazo.</li>}
                {p.spansDays && p.spansDays > 1 ? <li>Ocupa {p.spansDays} dias úteis.</li> : null}
                {p.pinned && (
                  <li className="flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    {p.pinnedKind === "both" ? "Início e término manuais" : p.pinnedKind === "end" ? "Término manual" : "Início manual"}
                  </li>
                )}
                {p.pausedByCaptar && <li>Pausado às {p.pausedByCaptar.atTime} pela captação "{p.pausedByCaptar.captarTitle}".</li>}
                {orig?.publish_date && (
                  <li>
                    Publicação prevista: {fmtDate(orig.publish_date)}
                    {orig.publish_time ? ` ${orig.publish_time.slice(0, 5)}` : ""}
                  </li>
                )}
                {p.warning && reason?.text !== p.warning && <li>{p.warning}</li>}
                {p.jumpReason && reason?.text !== p.jumpReason && <li>{p.jumpReason}</li>}
              </ul>
            </CollapsibleContent>
          </Collapsible>

          {/* Painel de ajuste manual — início sempre editável (inclusive no card em andamento) */}
          {isEditing && (
            <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-2">
              {p.keepStart && (
                <div className="mb-2 text-[10px] text-muted-foreground">
                  O início deste card é histórico e é preservado automaticamente — só é alterado se você editar abaixo.
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                {(
                  <>

                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">Início</Label>
                      <Input
                        type="date"
                        className="h-8 w-[9.5rem] text-xs"
                        value={draft.date}
                        onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">Hora</Label>
                      <Input
                        type="time"
                        className="h-8 w-[6.5rem] text-xs"
                        value={draft.time}
                        onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">Término</Label>
                      <Input
                        type="date"
                        className="h-8 w-[9.5rem] text-xs"
                        value={draft.endDate}
                        onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value, endEdited: true, durMode: "auto" }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">Hora</Label>
                      <Input
                        type="time"
                        className="h-8 w-[6.5rem] text-xs"
                        value={draft.endTime}
                        onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value, endEdited: true, durMode: "auto" }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        {draft.durMode === "manual"
                          ? "Duração (min) — manual"
                          : draft.endEdited
                            ? "Duração — derivada do término"
                            : "Duração — ajustada ao expediente e à área"}
                      </Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={5}
                          step={5}
                          disabled={draft.durMode === "auto"}
                          className="h-8 w-[6.5rem] text-xs"
                          value={draft.duration}
                          onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value, durMode: "manual", endEdited: false }))}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-[10px] text-muted-foreground"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              durMode: d.durMode === "auto" ? "manual" : "auto",
                              duration: d.durMode === "manual" ? String(p.durationMin) : d.duration,
                              endEdited: d.durMode === "auto" ? false : d.endEdited,
                            }))
                          }
                        >
                          {draft.durMode === "auto" ? "digitar" : "voltar para automática"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const base = baseDate;
                    const parseLocal = (dISO: string, t: string) => {
                      const [hh, mm] = t.split(":").map((x) => parseInt(x, 10) || 0);
                      const [y, mo, dd] = dISO.split("-").map((x) => parseInt(x, 10) || 0);
                      return new Date(y, (mo || 1) - 1, dd || 1, hh, mm, 0, 0);
                    };
                    if (p.keepStart) {
                      if (!draft.endDate || !draft.endTime) {
                        toast.error("Informe a data e a hora do novo término.");
                        return;
                      }
                      const endLocal = parseLocal(draft.endDate, draft.endTime);
                      if (endLocal.getTime() <= base.getTime()) {
                        toast.error("O novo término precisa ser posterior ao horário atual.");
                        return;
                      }
                      onSaveOverride({ endISO: draft.endDate, endTime: draft.endTime });
                      return;
                    }
                    const dur = parseInt(draft.duration, 10);
                    if (!draft.date || !draft.time) {
                      toast.error("Informe data e hora de início.");
                      return;
                    }
                    if (draft.durMode === "manual" && (!Number.isFinite(dur) || dur < 5)) {
                      toast.error("Duração manual mínima de 5 min.");
                      return;
                    }
                    const pinEnd = draft.durMode === "auto" && draft.endEdited;
                    if (pinEnd) {
                      if (!draft.endDate || !draft.endTime) {
                        toast.error("Informe a data e a hora do término.");
                        return;
                      }
                      const endLocal = parseLocal(draft.endDate, draft.endTime);
                      if (endLocal.getTime() <= parseLocal(draft.date, draft.time).getTime()) {
                        toast.error("O término precisa ser posterior ao início.");
                        return;
                      }
                      if (endLocal.getTime() <= base.getTime()) {
                        toast.error("O término precisa ser posterior ao horário atual.");
                        return;
                      }
                    }
                    onSaveOverride({
                      startISO: draft.date,
                      startTime: draft.time,
                      ...(draft.durMode === "manual" ? { durationMin: dur } : {}),
                      ...(pinEnd ? { endISO: draft.endDate, endTime: draft.endTime } : {}),
                    });
                  }}
                >
                  Aplicar ajuste
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={onCloseEdit}>
                  Fechar
                </Button>
                {hasOverride && (
                  <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={onRemoveOverride}>
                    Remover ajuste
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {p.keepStart
                  ? "Card em execução: o início histórico é preservado; apenas o término é recalculado."
                  : "Edite início e/ou término — a duração é derivada do intervalo útil (expediente da área). Ou digite a duração para que o término seja calculado."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
