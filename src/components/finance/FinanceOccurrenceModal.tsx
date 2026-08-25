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
 * pagamento da fatura.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
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
  KIND_LABELS,
  effectiveUsdRate,
} from "@/lib/financeModel";
import { parseLocalizedNumber } from "@/lib/financeNumber";
import {
  installmentHeaderLine,
  installmentProjectedNote,
  isInstallmentRow,
  occurrenceAmountLabel,
  occurrencePaidHelp,
} from "@/lib/financeInstallmentPresentation";
import { isCardCharge, resolveRowStatus, type RowStatusContext } from "@/lib/financeRowStatus";

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
}: Props) {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  /** Data do fato: cobrança (cartão) ou vencimento (obrigação direta). */
  const [factDate, setFactDate] = useState("");
  const [paid, setPaid] = useState(false);
  const [observations, setObservations] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Origem do pagamento DESTE mês (`NONE` = seguir o cadastro permanente). */
  const [origin, setOrigin] = useState<string>(FOLLOW_ITEM);

  /** Compra no cartão: a data é cobrança e o pagamento vem da fatura. */
  const cardRow = !!row && isCardCharge(row);
  /** Câmbio já provado pelo par (BRL real / USD original) desta compra. */
  const persistedRate = row ? effectiveUsdRate(row) : null;

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
    setFactDate(
      isCardCharge(row)
        ? row.chargeDate ?? ""
        : row.dueDate ?? row.chargeDate ?? "",
    );
    setPaid(row.paid);
    setObservations(row.occurrence?.observations ?? "");
    setAttachmentUrl(row.occurrence?.attachment_url ?? null);
    setAttachmentName(row.occurrence?.attachment_name ?? null);
    const occ = row.occurrence;
    if (occ?.card_item_id_snapshot) setOrigin(`card:${occ.card_item_id_snapshot}`);
    else if (occ?.payment_method_snapshot) setOrigin(`method:${occ.payment_method_snapshot}`);
    else setOrigin(FOLLOW_ITEM);
  }, [open, row, defaultUsdRate]);

  const amountNumber = parseLocalizedNumber(amount);
  const rateNumber = parseLocalizedNumber(rate) ?? defaultUsdRate;

  const brl = useMemo(() => {
    if (amountNumber == null) return null;
    if (row?.currency === "USD") return rateNumber != null ? Number((amountNumber * rateNumber).toFixed(2)) : null;
    return amountNumber;
  }, [amountNumber, rateNumber, row?.currency]);

  /** Situação canônica read-only de uma compra no cartão. */
  const cardStatus = useMemo(() => {
    if (!row || !cardRow || !statusContext) return null;
    return resolveRowStatus(row, statusContext);
  }, [row, cardRow, statusContext]);

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
    setSaving(true);
    /** Data do fato conforme a natureza — nunca as duas ao mesmo tempo. */
    const datePatch: Partial<FinanceOccurrence> = cardRow
      ? { charge_date: factDate || null, due_date: null }
      : { due_date: factDate || null, charge_date: row.chargeDate };
    /**
     * Compra no cartão NÃO carrega pagamento próprio: `paid_at` viria do
     * pagamento da fatura, então este modal nunca o envia.
     */
    const paymentPatch: Partial<FinanceOccurrence> = cardRow
      ? {}
      : {
          paid_at: paid ? row.occurrence?.paid_at ?? new Date().toISOString() : null,
          paid_amount_brl: paid ? brl : null,
        };
    const patch: Partial<FinanceOccurrence> = {
      currency: row.currency,
      amount_original: amountNumber,
      exchange_rate: row.currency === "USD" ? rateNumber : null,
      amount_brl: brl,
      is_estimated: false,
      observations: observations.trim() || null,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      ...datePatch,
      ...paymentPatch,
      ...originPatch,
    };
    const saved = await onSave(row, patch);
    setSaving(false);
    if (saved) {
      toast.success("Lançamento salvo");
      onOpenChange(false);
    }
  };

  if (!row) return null;

  const dateLabel = cardRow ? "Data da cobrança no cartão" : "Vencimento";
  const rateLabel = persistedRate != null ? "Câmbio efetivo" : "Câmbio de referência";
  const whenText = cardRow
    ? `cobrança ${row.projected ? "prevista" : "real"} em ${formatDateBR(row.chargeDate)}`
    : `vencimento previsto ${formatDateBR(row.dueDate ?? row.chargeDate)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.item.name}</DialogTitle>
          <DialogDescription>
            {isInstallmentRow(row) ? (
              <>
                {installmentHeaderLine(row) ?? installmentRowLabel(row) ?? "Parcelamento"}
                <br />
                {KIND_LABELS[row.item.kind]} · {whenText}
                {installmentProjectedNote(row) && (
                  <>
                    <br />
                    {installmentProjectedNote(row)}
                  </>
                )}
              </>
            ) : (
              <>
                {KIND_LABELS[row.item.kind]} · {whenText}
                {row.projected && " · ainda não lançado neste mês"}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{occurrenceAmountLabel(row)}</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>

            {row.currency === "USD" ? (
              <div>
                <Label>{rateLabel}</Label>
                <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
              </div>
            ) : (
              <div>
                <Label>{dateLabel}</Label>
                <Input type="date" value={factDate} onChange={(e) => setFactDate(e.target.value)} />
              </div>
            )}
          </div>

          {row.currency === "USD" && (
            <>
              <div className="grid grid-cols-2 gap-4 items-end">
                <div>
                  <Label>{dateLabel}</Label>
                  <Input type="date" value={factDate} onChange={(e) => setFactDate(e.target.value)} />
                </div>
                <p className="text-sm text-muted-foreground pb-2">
                  Em reais: <span className="font-semibold text-foreground">{formatBRL(brl)}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {persistedRate != null
                  ? "Câmbio efetivo desta compra, calculado pelo valor exato cobrado em reais."
                  : "Usado apenas para estimativa até o valor real ser confirmado."}
              </p>
            </>
          )}

          {cardRow && (
            <p className="text-xs text-muted-foreground">
              O vencimento pertence à fatura do cartão, não a esta compra.
            </p>
          )}

          <div>
            <Label>Forma de pagamento deste mês</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
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

          {cardRow ? (
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Situação</p>
              <p className="text-sm text-foreground mt-0.5">
                {cardStatus?.label ?? (row.paid ? "Pago" : "Na fatura do cartão")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Compras no cartão são liquidadas pelo pagamento da fatura.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Pago</p>
                <p className="text-xs text-muted-foreground">{occurrencePaidHelp(row)}</p>
              </div>
              <Switch checked={paid} onCheckedChange={setPaid} />
            </div>
          )}

          <div>
            <Label>Comprovante</Label>
            {attachmentUrl ? (
              <div className="flex items-center justify-between rounded-lg border p-2 mt-1">
                <span className="flex items-center gap-2 text-sm truncate">
                  <Paperclip className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{attachmentName ?? "Comprovante"}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setAttachmentUrl(null);
                    setAttachmentName(null);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ) : (
              <Input
                type="file"
                className="mt-1"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
            )}
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          {isInstallmentRow(row) && onEditItem ? (
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                onOpenChange(false);
                onEditItem(row.item);
              }}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Editar parcelamento
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving ? "Salvando..." : "Salvar lançamento"}
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
