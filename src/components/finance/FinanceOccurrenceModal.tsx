/**
 * Registro do fato do mês (`finance_occurrences`): valor real, câmbio,
 * data, pagamento e comprovante. Só aqui a linha é materializada.
 *
 * DUAS NATUREZAS, DUAS DATAS:
 *  - compra no cartão → o fato é a COBRANÇA (`charge_date`). O vencimento
 *    pertence à fatura, nunca à compra: `due_date` fica NULL.
 *  - obrigação direta → o fato é o VENCIMENTO (`due_date`).
 *
 * Compra no cartão também não tem switch `Pago`: a liquidação é derivada do
 * pagamento da fatura. Já a obrigação direta tem `Pago` + `Data do pagamento`
 * reais e reversíveis — o `paid_at` nunca sai do relógio como regra.
 *
 * LAYOUT: todo par de campos é `grid-cols-1 sm:grid-cols-2` com trilhas
 * `minmax(0,1fr)` e filhos `min-w-0`; `input[type=date]` tem largura intrínseca
 * maior que a trilha e estouraria o modal sem isso.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarOff, Paperclip, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CARD_PAYMENT_METHOD,
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  PAYMENT_METHODS,
  cardDisplayLabel,
  formatBRL,
  formatDateBR,
  installmentRowLabel,
  effectiveUsdRate,
  isStatementRow,
} from "@/lib/financeModel";
import {
  USD_CONVERSION_HELP,
  UsdConversionField,
  UsdConversionState,
  applyUsdEdit,
  resolveUsdNumbers,
  seedUsdConversion,
} from "@/lib/financeUsdConversion";
import { parseLocalizedNumber } from "@/lib/financeNumber";
import {
  installmentHeaderLine,
  installmentProjectedNote,
  isInstallmentRow,
  occurrenceAmountLabel,
  occurrencePaidHelp,
} from "@/lib/financeInstallmentPresentation";
import { isCardCharge, resolveRowStatus, type RowStatusContext } from "@/lib/financeRowStatus";
import { buildOccurrencePatch } from "@/lib/financeOccurrencePatch";
import FinanceDateInput from "./FinanceDateInput";
import {
  canSubmitOccurrence,
  initialPaymentDate,
  occurrenceContextLine,
  paymentStatusMessage,
  persistedPaymentDate,
} from "@/lib/financeOccurrenceForm";
import { effectivePaid } from "@/lib/financeModel";
import {
  CARD_CHARGE_DATE_HELP,
  cardChargeDateFieldLabel,
} from "@/lib/financeCardLabels";
import {
  OCCURRENCE_ACTION_LABELS,
  occurrenceDeleteActionForRow,
} from "@/lib/financeDeletePolicy";
import {
  deleteFinanceOccurrenceSafe,
  inactivateFinanceItemSafe,
} from "@/lib/financeSafeDelete";
import {
  FACT_CORRECTION_BUTTON,
  FACT_CORRECTION_INCONSISTENT,
  FACT_CORRECTION_NOTE,
  FACT_CORRECTION_SAVE_LABEL,
  FACT_CORRECTION_SUCCESS,
  LEGACY_CONVERT_LABEL,
  LEGACY_CONVERT_NEEDS_DATE,
  LEGACY_CONVERT_SUCCESS,
  LEGACY_DIRECT_ON_CARD_NOTE,
  buildFactCorrectionPatch,
  correctionWasApplied,
  factCorrectionMode,
  isLegacyDirectPaymentOnCard,
} from "@/lib/financeFactCorrection";
import {
  convertOccurrenceToCardCharge,
  correctFinanceOccurrence,
} from "@/lib/financeCorrectionRpc";



const BUCKET = "bill-attachments";

/** Sentinela: "seguir o cadastro" — não grava snapshot algum. */
const FOLLOW_ITEM = "__follow__";
/** Sentinela: pagamento direto sem forma definida neste mês. */
const NO_METHOD = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MonthRow | null;
  /** Cartões cadastrados — permitem trocar a origem do pagamento SÓ neste mês. */
  cards?: FinanceItem[];
  defaultUsdRate: number | null;
  /** Contexto para exibir a situação canônica de uma compra no cartão. */
  statusContext?: RowStatusContext;
  onSave: (row: MonthRow, patch: Partial<FinanceOccurrence>) => Promise<FinanceOccurrence | null>;
  /** Abre o cadastro permanente (cronograma) do item desta linha. */
  onEditItem?: (item: FinanceItem) => void;
  /** Recarrega a tela após exclusão/inativação (o dado deixou de existir). */
  onRefresh?: () => void;
  /**
   * IGNORA este lançamento do cronograma (exceção do mês). Não mexe no padrão:
   * a recorrência continua valendo para as próximas datas.
   */
  onSkip?: (row: MonthRow) => Promise<boolean>;
}


/** Seção do modal: título discreto + conteúdo, sem accordion obrigatório. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </section>
  );
}

export default function FinanceOccurrenceModal({
  open,
  onOpenChange,
  row,
  cards = [],
  defaultUsdRate,
  statusContext,
  onSave,
  onEditItem,
  onRefresh,
  onSkip,
}: Props) {

  const [skipping, setSkipping] = useState(false);

  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  /** Valor cobrado em reais: EDITÁVEL (ver `financeUsdConversion`). */
  const [brlCharged, setBrlCharged] = useState("");
  /** Data do fato: cobrança (cartão) ou vencimento (obrigação direta). */
  const [factDate, setFactDate] = useState("");
  const [paid, setPaid] = useState(false);
  /** Data REAL do pagamento (obrigação direta). Nunca é o vencimento. */
  const [paymentDate, setPaymentDate] = useState("");
  const [observations, setObservations] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  /** Origem do pagamento DESTE mês (`NONE` = seguir o cadastro permanente). */
  const [origin, setOrigin] = useState<string>(FOLLOW_ITEM);

  /**
   * Fato FECHADO (pago direto ou liquidado por fatura paga) é imutável nas suas
   * PROVAS: data, origem, pagamento e comprovante. A RPC valida de novo no banco.
   *
   * Exceção estritamente monetária: um COMPONENTE de cartão liquidado por uma
   * fatura já paga pode ter o valor deste mês corrigido (o banco cobrou outro
   * valor) — sem desfazer pagamento nem mexer em datas (`financeClosedCorrection`).
   */
  const rowClosed = row
    ? effectivePaid(row, statusContext?.rows ?? [row], statusContext?.settlement ?? null)
    : false;
  /** Compra no cartão: a data é cobrança e o pagamento vem da fatura. */
  const cardRow = !!row && isCardCharge(row);
  const statementRow = !!row && isStatementRow(row);
  const factMode = closedFactMode({ cardRow, statementRow, closed: rowClosed });
  /** Correção seletiva: só os campos monetários deste mês abrem. */
  const correcting = factMode === "card_component_correction";
  const readOnlyFact = rowClosed;
  /** Valor / dólar / câmbio: bloqueados só quando nem correção é permitida. */
  const readOnlyMoney = readOnlyFact && !correcting;
  const deleteAction = row ? occurrenceDeleteActionForRow(row, rowClosed) : "nothing_to_delete";


  const handleDestructive = async () => {
    if (!row) return;
    setRemoving(true);
    const result =
      deleteAction === "inactivate_item"
        ? await inactivateFinanceItemSafe(row.item.id)
        : row.occurrence
          ? await deleteFinanceOccurrenceSafe(row.occurrence.id)
          : { ok: false, message: "Nada informado neste mês" };
    setRemoving(false);
    if (!result.ok) {
      toast.error(result.message ?? "Não foi possível concluir");
      return;
    }
    toast.success(
      deleteAction === "inactivate_item" ? "Cadastro inativado" : "Lançamento excluído",
    );
    onOpenChange(false);
    onRefresh?.();
  };


  /** Câmbio já provado pelo par (BRL real / USD original) desta compra. */
  const persistedRate = row ? effectiveUsdRate(row) : null;
  /** Dia civil do `paid_at` já salvo — a prova do fato. */
  const persistedPaidDate = persistedPaymentDate(row);
  /** Hoje canônico do Financeiro (fonte única já usada pelos status). */
  const today = statusContext?.today ?? new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open || !row) return;
    setAmount(
      row.currency === "USD"
        ? row.amountOriginal != null ? String(row.amountOriginal) : ""
        : row.amountBrl != null ? String(row.amountBrl) : "",
    );
    /**
     * Câmbio EFETIVO tem prioridade: uma vez que existe valor real em reais,
     * o câmbio de referência do mês nunca volta a sobrescrever o fato.
     */
    const effective = effectiveUsdRate(row);
    setRate(
      effective != null
        ? String(effective)
        : row.exchangeRate != null
          ? String(row.exchangeRate)
          : defaultUsdRate != null
            ? String(defaultUsdRate)
            : "",
    );
    setBrlCharged(
      row.currency === "USD"
        ? seedUsdConversion({
            original: row.amountOriginal ?? null,
            rate: effective ?? row.exchangeRate ?? defaultUsdRate ?? null,
            brl: row.amountBrl ?? null,
          }).brl
        : "",
    );
    setFactDate(
      isCardCharge(row)
        ? row.chargeDate ?? ""
        : row.dueDate ?? row.chargeDate ?? "",
    );
    setPaid(row.paid);
    setPaymentDate(initialPaymentDate(row, today));
    setObservations(row.occurrence?.observations ?? "");
    setAttachmentUrl(row.occurrence?.attachment_url ?? null);
    setAttachmentName(row.occurrence?.attachment_name ?? null);
    const occ = row.occurrence;
    if (occ?.card_item_id_snapshot) setOrigin(`card:${occ.card_item_id_snapshot}`);
    else if (occ?.payment_method_snapshot) setOrigin(`method:${occ.payment_method_snapshot}`);
    else setOrigin(FOLLOW_ITEM);
  }, [open, row, defaultUsdRate, today]);

  const isUsd = row?.currency === "USD";
  const usdState: UsdConversionState = { original: amount, rate, brl: brlCharged };
  /** Edição bidirecional: câmbio ↔ valor cobrado em reais. */
  const editUsd = (field: UsdConversionField, value: string) => {
    if (!isUsd) {
      if (field === "original") setAmount(value);
      else if (field === "rate") setRate(value);
      else setBrlCharged(value);
      return;
    }
    const next = applyUsdEdit(usdState, field, value);
    setAmount(next.original);
    setRate(next.rate);
    setBrlCharged(next.brl);
  };

  const usdNumbers = resolveUsdNumbers(usdState);
  const amountNumber = parseLocalizedNumber(amount);
  const rateNumber = isUsd
    ? usdNumbers.exchangeRate ?? parseLocalizedNumber(rate) ?? defaultUsdRate
    : null;

  const brl = useMemo(() => {
    if (isUsd) return usdNumbers.amountBrl;
    return amountNumber;
  }, [isUsd, usdNumbers.amountBrl, amountNumber]);

  /** Situação canônica read-only de uma compra no cartão. */
  const cardStatus = useMemo(() => {
    if (!row || !cardRow || !statusContext) return null;
    return resolveRowStatus(row, statusContext);
  }, [row, cardRow, statusContext]);

  const status = useMemo(
    () =>
      paymentStatusMessage({
        cardRow,
        cardStatusLabel: cardStatus?.label ?? (row?.paid ? "Pago" : null),
        persistedPaymentDate: persistedPaidDate,
        paid,
        paymentDate,
      }),
    [cardRow, cardStatus?.label, row?.paid, persistedPaidDate, paid, paymentDate],
  );

  const canSubmit = canSubmitOccurrence({ cardRow, paid, paymentDate });

  const handleUpload = async (file: File) => {
    if (!row) return;
    setUploading(true);
    const path = `finance/${row.item.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.error("Não foi possível anexar o comprovante");
      return;
    }
    setAttachmentUrl(path);
    setAttachmentName(file.name);
    toast.success("Comprovante anexado");
  };

  /**
   * Snapshot da origem: só este mês muda. O cadastro permanente fica intacto,
   * então o histórico dos meses anteriores nunca é reescrito.
   */
  const originPatch: Partial<FinanceOccurrence> = useMemo(() => {
    if (origin === FOLLOW_ITEM) return { payment_method_snapshot: null, card_item_id_snapshot: null };
    if (origin === NO_METHOD) return { payment_method_snapshot: null, card_item_id_snapshot: null };
    if (origin.startsWith("card:")) {
      return {
        payment_method_snapshot: CARD_PAYMENT_METHOD,
        card_item_id_snapshot: origin.slice(5),
      };
    }
    return { payment_method_snapshot: origin.slice(7), card_item_id_snapshot: null };
  }, [origin]);

  const handleSave = async () => {
    if (!row) return;
    if (readOnlyFact && !correcting) return;
    if (!correcting && !canSubmit) return;
    setSaving(true);
    /**
     * Correção fechada envia patch MÍNIMO: nada de data, origem, pagamento ou
     * comprovante entra — a prova histórica permanece exatamente como está.
     */
    const patch = correcting
      ? buildClosedCorrectionPatch({
          currency: row.currency,
          amountOriginal: amountNumber,
          amountBrl: brl,
          exchangeRate: rateNumber,
        })
      : buildOccurrencePatch({
          row,
          cardRow,
          factDate,
          amountOriginal: amountNumber,
          amountBrl: brl,
          exchangeRate: rateNumber,
          paid,
          paymentDate: cardRow ? null : paymentDate,
          observations,
          attachmentUrl,
          attachmentName,
          originPatch,
        });
    const saved = await onSave(row, patch);

    setSaving(false);
    if (saved) {
      toast.success(correcting ? CLOSED_CORRECTION_SUCCESS : "Lançamento salvo");
      onOpenChange(false);
    }
  };


  if (!row) return null;

  const dateLabel = cardRow ? cardChargeDateFieldLabel(row.projected) : "Vencimento";
  const rateLabel = persistedRate != null ? "Câmbio efetivo" : "Câmbio de referência";
  const whenText = cardRow
    ? `${row.projected ? "cobrança prevista no cartão" : "cobrado no cartão"} em ${formatDateBR(row.chargeDate)}`
    : `vencimento ${row.projected ? "previsto" : ""} ${formatDateBR(row.dueDate ?? row.chargeDate)}`.replace("  ", " ");

  const toneClass =
    status.tone === "success"
      ? "text-primary"
      : status.tone === "warning"
        ? "text-amber-600 dark:text-amber-500"
        : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words pr-8">{row.item.name}</DialogTitle>
          <DialogDescription className="break-words">
            {occurrenceContextLine(row, statusContext?.competenceMonth)}
            <br />
            <span className={`font-medium ${toneClass}`}>{status.label}</span>
            {row.projected && " · ainda não lançado neste mês"}
            {isInstallmentRow(row) && (
              <>
                <br />
                {installmentHeaderLine(row) ?? installmentRowLabel(row)}
              </>
            )}
            {installmentProjectedNote(row) && (
              <>
                <br />
                {installmentProjectedNote(row)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1 min-w-0">
          <Block title="Dados deste mês">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <Label>{occurrenceAmountLabel(row)}</Label>
                <Input
                  className="w-full min-w-0 max-w-full"
                  value={amount}
                  onChange={(e) => editUsd("original", e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  readOnly={readOnlyMoney}

                />
              </div>

              <div className="min-w-0">
                <Label htmlFor="occurrence-fact-date">{dateLabel}</Label>
                {/* Digitável E com calendário: `type=date` não garantia digitação. */}
                <FinanceDateInput
                  id="occurrence-fact-date"
                  value={factDate}
                  onChange={setFactDate}
                  readOnly={readOnlyFact}
                />
                {cardRow && (
                  <p className="text-xs text-muted-foreground mt-1">{CARD_CHARGE_DATE_HELP}</p>
                )}
              </div>

              {row.currency === "USD" && (
                <>
                  <div className="min-w-0">
                    <Label>{rateLabel}</Label>
                    <Input
                      className="w-full min-w-0 max-w-full"
                      value={rate}
                      onChange={(e) => editUsd("rate", e.target.value)}
                      inputMode="decimal"
                      readOnly={readOnlyMoney}

                    />
                  </div>
                  <div className="min-w-0">
                    <Label>Valor cobrado em R$</Label>
                    <Input
                      className="w-full min-w-0 max-w-full"
                      value={brlCharged}
                      onChange={(e) => editUsd("brl", e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      readOnly={readOnlyMoney}

                    />
                  </div>
                </>
              )}
            </div>

            {row.currency === "USD" && (
              <p className="text-xs text-muted-foreground">
                {USD_CONVERSION_HELP}{" "}
                {persistedRate != null
                  ? "Câmbio efetivo desta compra, calculado pelo valor exato cobrado em reais."
                  : "Usado apenas para estimativa até o valor real ser confirmado."}
              </p>
            )}

            {cardRow && (
              <p className="text-xs text-muted-foreground">
                O vencimento pertence à fatura do cartão, não a esta compra.
              </p>
            )}

            <div className="min-w-0">
              <Label>Forma de pagamento deste mês</Label>
              <Select value={origin} onValueChange={setOrigin} disabled={readOnlyFact}>
                <SelectTrigger className="mt-1 w-full min-w-0 max-w-full">
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent className="max-w-[min(28rem,calc(100vw-3rem))]">
                  <SelectItem value={FOLLOW_ITEM}>
                    Seguir o cadastro{row.item.payment_method ? ` (${row.item.payment_method})` : ""}
                  </SelectItem>
                  {cards.map((card) => (
                    <SelectItem key={card.id} value={`card:${card.id}`}>
                      {cardDisplayLabel(card)}
                    </SelectItem>
                  ))}
                  {PAYMENT_METHODS.filter((m) => m !== CARD_PAYMENT_METHOD).map((m) => (
                    <SelectItem key={m} value={`method:${m}`}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Vale só para este mês. O cadastro permanente e os meses anteriores não mudam.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">{whenText}</p>
          </Block>

          <Block title="Situação do pagamento">
            {cardRow || statementRow ? (
              <div className="rounded-lg border p-3 min-w-0">
                <p className={`text-sm font-medium ${toneClass}`}>{status.label}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {statementRow
                    ? "Fatura fechada: valores, datas e pagamento ficam somente para consulta."
                    : correcting
                      ? CLOSED_CORRECTION_NOTE
                      : "Compras no cartão são liquidadas pelo pagamento da fatura."}
                </p>

              </div>
            ) : (
              <div className="rounded-lg border divide-y">
                <div className="flex items-center justify-between gap-3 p-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Pago</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {occurrencePaidHelp(row)}
                    </p>
                  </div>
                  <Switch checked={paid} onCheckedChange={setPaid} className="flex-shrink-0" disabled={readOnlyFact} />
                </div>

                {paid && (
                  <div className="p-3 min-w-0">
                    <Label htmlFor="occurrence-payment-date">Data do pagamento</Label>
                    <FinanceDateInput
                      id="occurrence-payment-date"
                      className="mt-1"
                      value={paymentDate}
                      onChange={setPaymentDate}
                      readOnly={readOnlyFact}
                    />
                    {!canSubmit ? (
                      <p className="text-xs text-destructive mt-1">
                        Informe uma data de pagamento válida
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        Data real da saída de caixa, mesmo retroativa. O vencimento não muda.
                      </p>
                    )}
                  </div>
                )}

                {status.pendingNote && (
                  <p className={`p-3 text-xs ${toneClass}`}>{status.pendingNote}</p>
                )}
              </div>
            )}
          </Block>

          <Block title="Comprovante e observações">
            <div className="min-w-0">
              <Label>Comprovante</Label>
              {attachmentUrl ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2 mt-1 min-w-0">
                  <span className="flex items-center gap-2 text-sm min-w-0">
                    <Paperclip className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{attachmentName ?? "Comprovante"}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={() => {
                      setAttachmentUrl(null);
                      setAttachmentName(null);
                    }}
                    disabled={readOnlyFact}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ) : (
                <Input
                  type="file"
                  className="mt-1 w-full min-w-0 max-w-full file:mr-2"
                  disabled={uploading || readOnlyFact}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
              )}
            </div>

            <div className="min-w-0">
              <Label>Observações</Label>
              <Textarea
                className="w-full min-w-0 max-w-full"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={2}
              readOnly={readOnlyFact}
              />
            </div>
          </Block>

          {/* Cadastro inativado: o fato do mês continua real, mas não se repete. */}
          {!row.item.active && (
            <p className="text-xs text-muted-foreground break-words">
              <strong>Cadastro inativo</strong> — este lançamento continua valendo neste mês, mas o
              cadastro não será mais projetado nos meses seguintes.
            </p>
          )}

          {/* Categoria é do CADASTRO permanente, nunca do fato mensal. */}
          <p className="text-xs text-muted-foreground break-words">
            Categoria: <strong>{row.item.category?.trim() || "Sem categoria"}</strong> — definida no
            cadastro do item e válida para os próximos meses.
          </p>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {onEditItem ? (
            <Button
              variant="ghost"
              className="justify-start min-w-0 sm:w-auto"
              onClick={() => {
                onOpenChange(false);
                onEditItem(row.item);
              }}
            >
              <Pencil className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">
                {isInstallmentRow(row) ? "Editar parcelamento" : "Editar cadastro / categoria"}
              </span>
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex flex-wrap justify-end gap-2 min-w-0">
            {/* Exceção do mês: só faz sentido em data prevista e ainda não paga. */}
            {onSkip && row.scheduledDate && !row.paid && !readOnlyFact ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  setSkipping(true);
                  const ok = await onSkip(row);
                  setSkipping(false);
                  if (ok) onOpenChange(false);
                }}
                disabled={saving || removing || skipping}
              >
                <CalendarOff className="w-4 h-4 mr-2 flex-shrink-0" />
                {skipping ? "Ignorando..." : "Ignorar este lançamento"}
              </Button>
            ) : null}
            {deleteAction === "delete_statement" ||
            deleteAction === "delete_one_off" ||
            deleteAction === "inactivate_item" ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleDestructive}
                disabled={saving || removing}
              >
                <Trash2 className="w-4 h-4 mr-2 flex-shrink-0" />
                {removing ? "Processando..." : OCCURRENCE_ACTION_LABELS[deleteAction]}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>

            {(!readOnlyFact || correcting) && (
              <Button
                onClick={handleSave}
                disabled={saving || uploading || (!correcting && !canSubmit)}
              >
                {saving
                  ? "Salvando..."
                  : correcting
                    ? CLOSED_CORRECTION_SAVE_LABEL
                    : "Salvar lançamento"}
              </Button>
            )}
          </div>

        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
