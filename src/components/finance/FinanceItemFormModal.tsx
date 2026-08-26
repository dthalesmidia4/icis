/**
 * Cadastro permanente do Financeiro (`finance_items`).
 * Um cadastro descreve O QUE é pago; os valores por mês são fatos separados.
 */
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CARD_PAYMENT_METHOD,
  FinanceAmountMode,
  COST_CENTER_LABELS,
  FinanceCostCenter,
  FinanceCurrency,
  FinanceItem,
  FinanceKind,
  FinanceRecurrence,
  KIND_LABELS,
  PAYMENT_METHODS,
  cardDisplayLabel,
  formatBRL,
  normalizeToolName,
} from "@/lib/financeModel";
import { parseDayOfMonth, parseLocalizedNumber, parsePositiveInt } from "@/lib/financeNumber";
import {
  USD_CONVERSION_HELP,
  UsdConversionField,
  UsdConversionState,
  applyUsdEdit,
  resolveUsdNumbers,
  seedUsdConversion,
} from "@/lib/financeUsdConversion";
import { installmentSchedulePreview } from "@/lib/financeInstallmentPresentation";
import { WEEKDAYS } from "@/lib/financeRecurrenceSchedule";

import { FinanceScope, allowedCostCentersForScope, allowedKindsForScope } from "@/lib/financeScope";
import { Competence, competenceToISO } from "@/lib/financeCardCycle";
import { OneOffFact, shouldMaterializeOneOff } from "@/lib/financeOneOff";
import {
  CARD_CHARGE_DAY_FIELD_LABEL,
  CARD_CHARGE_DAY_HELP,
  DIRECT_CHARGE_DAY_FIELD_LABEL,
} from "@/lib/financeCardLabels";
import {
  chargeDueConflictMessage,
  itemDueDayIsMeaningless,
  resolveRecurrenceIntervals,
} from "@/lib/financeItemPayload";
import FinanceItemDeleteModal from "./FinanceItemDeleteModal";
import FinanceDateInput from "./FinanceDateInput";



interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: FinanceItem | null;
  /** Recarrega a lista depois de excluir/inativar o cadastro. */
  onAfterDelete?: () => void;
  /** Quando vem de um domínio (Cartões, Assinaturas...), pula o passo de intenção. */
  initialKind?: FinanceKind | null;
  cards: FinanceItem[];
  packages: FinanceItem[];
  /** Cadastros existentes — usados só para AVISAR sobre nome parecido. */
  allItems?: FinanceItem[];
  /** Categorias já usadas pelo tenant — sugestões; texto livre continua válido. */
  knownCategories?: string[];
  defaultUsdRate: number | null;
  /** Escopo do usuário: `tools` não cadastra despesa/cartão nem administrativo. */
  scope?: FinanceScope;
  /**
   * Competência exibida na tela. Um gasto AVULSO nasce como fato deste mês —
   * sem ela o avulso não teria onde ser materializado.
   */
  competence?: Competence | null;
  onSave: (
    payload: Partial<FinanceItem>,
    id?: string,
    /** Fato do mês que acompanha a criação de um avulso. */
    oneOff?: OneOffFact | null,
  ) => Promise<boolean>;
}



const KIND_OPTIONS: FinanceKind[] = ["expense", "tool", "package", "card", "included_resource"];
const COST_CENTERS: FinanceCostCenter[] = ["midia", "sistemas", "administrativo", "compartilhado"];
const NONE = "__none__";

/* ------------------- Tipo de cobrança em linguagem humana ------------------ */

/** O que o usuário escolhe. `recurrence_type` do banco é derivado disto. */
type ChargeMode = "one_off" | "recurring" | "installments" | "consumption";

const CHARGE_MODES: { value: ChargeMode; title: string; help: string }[] = [
  { value: "one_off", title: "Avulsa", help: "Acontece uma vez, sem repetir." },
  { value: "recurring", title: "Recorrente", help: "Repete sempre, sem data para acabar." },
  { value: "installments", title: "Parcelada", help: "Tem começo, número de parcelas e fim." },
  { value: "consumption", title: "Consumo", help: "O valor muda: só se confirma no mês." },
];

type Frequency = "daily" | "weekly" | "monthly" | "custom" | "annual";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Todos os dias" },
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
  { value: "custom", label: "A cada X meses" },
  { value: "annual", label: "Uma vez por ano" },
];

/** Cadastro salvo -> escolha humana (leitura reversa, sem perder informação). */
function chargeModeFromItem(item?: FinanceItem | null): ChargeMode {
  if (!item) return "recurring";
  if (item.recurrence_type === "installments") return "installments";
  if (item.recurrence_type === "one_off") return "one_off";
  if (item.recurrence_type === "credits" || item.recurrence_type === "variable") return "consumption";
  if (item.amount_mode === "variable") return "consumption";
  return "recurring";
}

function frequencyFromItem(item?: FinanceItem | null): Frequency {
  if (!item) return "monthly";
  if (item.recurrence_type === "daily") return "daily";
  if (item.recurrence_type === "weekly") return "weekly";
  if (item.recurrence_type === "annual") return "annual";
  return (item.recurrence_interval_months ?? 1) > 1 ? "custom" : "monthly";
}


export default function FinanceItemFormModal({
  open,
  onOpenChange,
  item,
  initialKind,
  cards,
  packages,
  allItems = [],
  knownCategories = [],
  defaultUsdRate,
  scope = "full",
  competence = null,
  onSave,
  onAfterDelete,
}: Props) {
  // Opções derivadas do escopo — a RLS confirma, aqui só evitamos oferecer.
  const kindOptions = KIND_OPTIONS.filter((k) => allowedKindsForScope(scope).includes(k));
  const costCenterOptions = COST_CENTERS.filter((c) => allowedCostCentersForScope(scope).includes(c));
  const [kind, setKind] = useState<FinanceKind>("expense");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [costCenter, setCostCenter] = useState<FinanceCostCenter>("administrativo");
  const [active, setActive] = useState(true);
  const [chargeMode, setChargeMode] = useState<ChargeMode>("recurring");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [intervalMonths, setIntervalMonths] = useState("2");
  const [recurrenceStart, setRecurrenceStart] = useState("");
  /** "A cada N" das frequências sub-mensais (dias/semanas). */
  const [subInterval, setSubInterval] = useState("1");
  /** Dia da semana (ISO 1–7) da recorrência semanal. */
  const [weekday, setWeekday] = useState<string>("1");

  const [currency, setCurrency] = useState<FinanceCurrency>("BRL");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  /**
   * Valor cobrado em reais: EDITÁVEL. Junto com dólar e câmbio forma a
   * identidade `BRL = USD × câmbio` — editar um recalcula o outro
   * (`financeUsdConversion`), sem loop e sem divisão por zero.
   */
  const [brlCharged, setBrlCharged] = useState("");
  const [chargeDay, setChargeDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(NONE);
  const [cardItemId, setCardItemId] = useState<string>(NONE);
  const [parentItemId, setParentItemId] = useState<string>(NONE);
  const [bankName, setBankName] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [statementDueDay, setStatementDueDay] = useState("");
  const [subscriptionDate, setSubscriptionDate] = useState("");
  const [installmentStart, setInstallmentStart] = useState("");
  const [installmentCount, setInstallmentCount] = useState("");
  /** Data real do gasto AVULSO (não é `subscription_date` disfarçada). */
  const [oneOffDate, setOneOffDate] = useState("");
  const [link, setLink] = useState("");

  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /**
   * O cadastro deixou de existir (excluído) ou foi inativado nesta sessão do
   * modal. Um `Salvar` stale reativaria `active=true` a partir do estado antigo
   * do formulário — por isso o formulário morre junto com o cadastro.
   */
  const [destroyed, setDestroyed] = useState(false);
  /** Passo 1: intenção. Só existe para NOVOS cadastros. */
  const [step, setStep] = useState<"intent" | "form">("form");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestroyed(false);
    setDeleteOpen(false);
    setStep(item || initialKind ? "form" : "intent");
    setShowMore(false);

    setKind((item?.kind as FinanceKind) ?? initialKind ?? (scope === "tools" ? "tool" : "expense"));
    setName(item?.name ?? "");
    setPurpose(item?.purpose ?? "");
    setCategory(item?.category ?? "");
    setCostCenter(
      (item?.cost_center as FinanceCostCenter) ??
        (scope === "tools" ? "midia" : "administrativo"),
    );
    setActive(item?.active ?? true);
    setChargeMode(chargeModeFromItem(item));
    setFrequency(frequencyFromItem(item));
    setIntervalMonths(
      item?.recurrence_interval_months != null && item.recurrence_interval_months > 1
        ? String(item.recurrence_interval_months)
        : "2",
    );
    setSubInterval(
      item?.recurrence_interval != null && item.recurrence_interval > 0
        ? String(item.recurrence_interval)
        : "1",
    );
    setWeekday(item?.recurrence_weekday != null ? String(item.recurrence_weekday) : "1");

    setRecurrenceStart(item?.recurrence_start_date ?? "");
    setCurrency((item?.currency as FinanceCurrency) ?? "BRL");
    setAmount(
      item?.currency === "USD"
        ? item?.default_amount_original != null
          ? String(item.default_amount_original)
          : ""
        : item?.default_amount_brl != null
          ? String(item.default_amount_brl)
          : "",
    );
    const seeded = seedUsdConversion({
      original: item?.default_amount_original ?? null,
      rate: item?.default_exchange_rate ?? defaultUsdRate ?? null,
      brl: item?.default_amount_brl ?? null,
    });
    setRate(item?.default_exchange_rate != null ? String(item.default_exchange_rate) : "");
    setBrlCharged(item?.currency === "USD" ? seeded.brl : "");
    setChargeDay(item?.charge_day != null ? String(item.charge_day) : "");
    setDueDay(item?.due_day != null ? String(item.due_day) : "");
    setPaymentMethod(item?.payment_method ?? NONE);
    setCardItemId(item?.card_item_id ?? NONE);
    setParentItemId(item?.parent_item_id ?? NONE);
    setBankName(item?.bank_name ?? "");
    setCardLast4(item?.card_last4 ?? "");
    setCardLimit(item?.card_limit_brl != null ? String(item.card_limit_brl) : "");
    setClosingDay(item?.statement_closing_day != null ? String(item.statement_closing_day) : "");
    setStatementDueDay(item?.statement_due_day != null ? String(item.statement_due_day) : "");
    setSubscriptionDate(item?.subscription_date ?? "");
    setInstallmentStart(item?.installment_start_date ?? "");
    setInstallmentCount(item?.installment_count != null ? String(item.installment_count) : "");
    setOneOffDate(competence ? competenceToISO(competence) : "");
    setLink(item?.link ?? "");
    setNotes(item?.notes ?? "");
  }, [open, item, initialKind, defaultUsdRate]);


  const isCard = kind === "card";
  const isIncluded = kind === "included_resource";
  const onCard = paymentMethod === CARD_PAYMENT_METHOD;
  const usdState: UsdConversionState = { original: amount, rate, brl: brlCharged };
  /** Aplica a edição e propaga só os campos DERIVADOS. */
  const editUsd = (field: UsdConversionField, value: string) => {
    if (currency !== "USD") {
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
  const effectiveRate =
    currency === "USD"
      ? usdNumbers.exchangeRate ?? parseLocalizedNumber(rate) ?? defaultUsdRate
      : null;
  const amountNumber = parseLocalizedNumber(amount);
  const isInstallments = !isCard && !isIncluded && chargeMode === "installments";
  const isRecurring = !isCard && !isIncluded && chargeMode === "recurring";
  const isAnnual = isRecurring && frequency === "annual";
  /** Avulsa: nasce como FATO do mês, então pede data real (não dia genérico). */
  const isOneOff = !isCard && !isIncluded && chargeMode === "one_off";
  /** Só criação materializa o fato: editar um avulso antigo não cria nada. */
  const materializesOneOff = isOneOff && !item && !!competence;
  const oneOffDateValid = !materializesOneOff || /^\d{4}-\d{2}-\d{2}$/.test(oneOffDate);
  const intervalNumber = frequency === "custom" ? parsePositiveInt(intervalMonths) ?? 1 : 1;
  /** Recorrência sub-mensal: gera mais de um lançamento no mesmo mês. */
  const isSubMonthly = isRecurring && (frequency === "daily" || frequency === "weekly");
  const subIntervalNumber = parsePositiveInt(subInterval) ?? 1;
  const weekdayNumber = Number(weekday) || 1;
  const cardSelected = onCard && cardItemId !== NONE;
  /**
   * Compra no cartão não tem vencimento próprio: o vencimento é da FATURA.
   * O campo desaparece e `due_day` é gravado como NULL.
   */
  const hideItemDueDay = itemDueDayIsMeaningless(onCard, cardSelected);
  const selectedCard = cardSelected ? cards.find((c) => c.id === cardItemId) ?? null : null;
  const chargeDayNumber = parseDayOfMonth(chargeDay);
  const dueDayNumber = parseDayOfMonth(dueDay);
  /**
   * Cobrança/vencimento no mesmo mês precisam ser coerentes. Não é regra de
   * banco: `due < charge` pode ser vencimento no mês seguinte, e não guardamos
   * offset de mês — então bloqueamos aqui, explicando a saída.
   */
  const chargeDueConflict =
    !isCard && !isInstallments && !isOneOff
      ? chargeDueConflictMessage({
          onCard,
          cardSelected,
          chargeDay: chargeDayNumber,
          dueDay: hideItemDueDay ? null : dueDayNumber,
        })
      : null;
  /** Intervalos NOT NULL do banco: resolvidos num único lugar, nunca null. */
  const recurrenceIntervals = resolveRecurrenceIntervals({
    isRecurring,
    frequency,
    intervalMonths: frequency === "custom" ? parsePositiveInt(intervalMonths) : null,
    subInterval: subIntervalNumber,
  });


  /** Escolha humana -> `recurrence_type` do banco. */
  const recurrence: FinanceRecurrence = useMemo(() => {
    if (isIncluded) return "monthly";
    switch (chargeMode) {
      case "one_off":
        return "one_off";
      case "installments":
        return "installments";
      case "consumption":
        return "variable";
      default:
        if (frequency === "daily") return "daily";
        if (frequency === "weekly") return "weekly";
        return frequency === "annual" ? "annual" : "monthly";
    }
  }, [chargeMode, frequency, isIncluded]);


  const amountMode: FinanceAmountMode = chargeMode === "consumption" ? "variable" : "fixed";

  /**
   * Aviso (nunca bloqueio) de possível duplicidade: mesmo nome normalizado em
   * um cadastro ativo diferente deste.
   */
  const duplicateWarning = useMemo(() => {
    const key = normalizeToolName(name);
    if (!key || key.length < 3) return null;
    const hit = allItems.find(
      (i) => i.id !== item?.id && i.active && normalizeToolName(i.name) === key,
    );
    return hit ? hit.name : null;
  }, [name, allItems, item?.id]);

  const installmentCountNumber = useMemo(() => {
    const n = Number(installmentCount);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }, [installmentCount]);

  const installmentsValid = !isInstallments || (!!installmentStart && installmentCountNumber != null);




  /** `12 parcelas mensais · última prevista em 11/02/2027`. */
  const schedulePreview = useMemo(
    () => (isInstallments ? installmentSchedulePreview(installmentStart || null, installmentCountNumber) : null),
    [isInstallments, installmentStart, installmentCountNumber],
  );


  const brlPreview = useMemo(() => {
    if (currency === "USD") return usdNumbers.amountBrl;
    return amountNumber;
  }, [amountNumber, currency, usdNumbers.amountBrl]);

  const handleSubmit = async () => {
    // Cadastro já inativado/excluído: salvar aqui ressuscitaria o registro.
    if (destroyed) return;
    if (!name.trim()) return;

    if (!installmentsValid) return;
    if (!oneOffDateValid) return;
    // Ambiguidade de mês: validamos ANTES do request, com explicação.
    if (chargeDueConflict) return;
    setSaving(true);

    const payload: Partial<FinanceItem> = {
      kind,
      name: name.trim(),
      purpose: purpose.trim() || null,
      category: category.trim() || null,
      cost_center: costCenter,
      active,
      recurrence_type: recurrence,
      // Colunas NOT NULL DEFAULT 1: sempre >= 1, nunca null.
      recurrence_interval_months: recurrenceIntervals.recurrence_interval_months,
      recurrence_start_date: isRecurring && frequency === "custom" ? recurrenceStart || null : null,
      // Cronograma sub-mensal: "a cada N", dia da semana e âncora de contagem.
      recurrence_interval: recurrenceIntervals.recurrence_interval,
      recurrence_weekday: isSubMonthly && frequency === "weekly" ? weekdayNumber : null,
      recurrence_anchor_date: isSubMonthly ? recurrenceStart || null : null,

      amount_mode: isIncluded ? "fixed" : amountMode,
      currency,
      default_amount_original: isIncluded ? null : amountNumber,
      default_exchange_rate: currency === "USD" ? effectiveRate : null,
      default_amount_brl: isIncluded ? null : brlPreview != null ? Number(brlPreview.toFixed(2)) : null,
      // No parcelamento o cronograma define os dias: nada de dia genérico.
      charge_day: isCard || isInstallments ? null : chargeDayNumber,
      // Item no cartão: vencimento é da FATURA (`statement_due_day`).
      due_day: isCard || isInstallments || hideItemDueDay ? null : dueDayNumber,
      payment_method: isCard || paymentMethod === NONE ? null : paymentMethod,
      card_item_id: !isCard && onCard && cardItemId !== NONE ? cardItemId : null,
      parent_item_id: isIncluded && parentItemId !== NONE ? parentItemId : null,
      bank_name: isCard ? bankName.trim() || null : null,
      card_last4: isCard ? cardLast4.trim() || null : null,
      card_limit_brl: isCard ? parseLocalizedNumber(cardLimit) : null,
      statement_closing_day: isCard ? parseDayOfMonth(closingDay) : null,
      statement_due_day: isCard ? parseDayOfMonth(statementDueDay) : null,
      subscription_date: subscriptionDate || null,
      installment_start_date: isInstallments ? installmentStart : null,
      installment_count: isInstallments ? installmentCountNumber : null,
      link: link.trim() || null,
      notes: notes.trim() || null,
    };
    /**
     * Gasto avulso não é cadastro abstrato: já nasce como fato da competência
     * exibida, senão sumiria do mês (`one_off` não é projetável).
     */
    const oneOff: OneOffFact | null =
      materializesOneOff && shouldMaterializeOneOff(payload)
        ? {
            competenceMonth: competenceToISO(competence!),
            date: oneOffDate || null,
            currency,
            amountOriginal: amountNumber,
            amountBrl: brlPreview != null ? Number(brlPreview.toFixed(2)) : null,
            exchangeRate: currency === "USD" ? effectiveRate : null,
            paymentMethod: payload.payment_method ?? null,
            cardItemId: payload.card_item_id ?? null,
          }
        : null;
    const ok = await onSave(payload, item?.id, oneOff);
    setSaving(false);
    if (ok) onOpenChange(false);
  };


  const ALL_INTENTS: { kind: FinanceKind; title: string; description: string; recurrence?: FinanceRecurrence }[] = [
    { kind: "expense", title: "Conta ou despesa", description: "Uma cobrança ou pagamento" },
    { kind: "tool", title: "Assinatura ou ferramenta", description: "Ex.: Adobe, ChatGPT, Canva" },
    { kind: "card", title: "Cartão de crédito", description: "Para organizar suas faturas" },
    { kind: "package", title: "Pacote de ferramentas", description: "Um plano que inclui vários serviços" },
  ];
  const INTENTS = ALL_INTENTS.filter((intent) => kindOptions.includes(intent.kind));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar cadastro" : step === "intent" ? "O que você quer adicionar?" : "Novo cadastro"}
          </DialogTitle>
          <DialogDescription>
            {step === "intent"
              ? "Escolha o tipo para mostrarmos apenas os campos necessários."
              : "O cadastro é permanente. Os valores de cada mês são registrados nas contas do mês."}
          </DialogDescription>
        </DialogHeader>

        {step === "intent" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            {INTENTS.map((intent) => (
              <button
                key={intent.kind}
                type="button"
                className="rounded-lg border p-4 text-left hover:bg-muted/50 min-h-[76px]"
                onClick={() => {
                  setKind(intent.kind);
                  setStep("form");
                }}
              >
                <p className="text-[15px] font-semibold">{intent.title}</p>
                <p className="text-sm text-muted-foreground">{intent.description}</p>
              </button>
            ))}
          </div>
        ) : (
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: ChatGPT Plus" />
              {duplicateWarning && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  Já existe um cadastro ativo parecido: “{duplicateWarning}”. Pode salvar mesmo
                  assim, mas confira se não é a mesma despesa.
                </p>
              )}
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FinanceKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kindOptions.map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Para que serve</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Ex: Copy e roteiros" />
            </div>
            <div>
              <Label>Centro de custo</Label>
              <Select value={costCenter} onValueChange={(v) => setCostCenter(v as FinanceCostCenter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {costCenterOptions.map((c) => (
                    <SelectItem key={c} value={c}>{COST_CENTER_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isIncluded && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Recurso incluído não gera custo próprio — ele só documenta o que o pacote já cobre.
              </p>
              <div>
                <Label>Pacote de origem</Label>
                <Select value={parentItemId} onValueChange={setParentItemId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o pacote" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isCard && (
            <div className="rounded-lg border p-3 space-y-4">
              <p className="text-xs text-muted-foreground">
                A fatura é a saída de caixa do cartão. Ela nunca é somada de novo às despesas que a compõem.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Banco</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Itaú" />
                </div>
                <div>
                  <Label>Final do cartão</Label>
                  <Input value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} placeholder="7587" maxLength={4} />
                </div>
                <div className="col-span-2">
                  <Label>Limite do cartão (R$)</Label>
                  <Input
                    value={cardLimit}
                    onChange={(e) => setCardLimit(e.target.value)}
                    placeholder="5.000,00"
                    inputMode="decimal"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Opcional. É o limite do cartão — não é o orçamento mensal da agência.
                  </p>
                </div>
                <div>
                  <Label>Dia de fechamento da fatura</Label>
                  <Input value={closingDay} onChange={(e) => setClosingDay(e.target.value)} placeholder="10" inputMode="numeric" />
                </div>
                <div>
                  <Label>Dia de vencimento da fatura</Label>
                  <Input value={statementDueDay} onChange={(e) => setStatementDueDay(e.target.value)} placeholder="17" inputMode="numeric" />
                </div>
              </div>
            </div>
          )}

          {!isIncluded && !isCard && (
            <>
              <div className="rounded-lg border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Como essa despesa é cobrada?</p>
                  <p className="text-xs text-muted-foreground">
                    Isso define em quais meses ela vai aparecer sozinha.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CHARGE_MODES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setChargeMode(option.value)}
                      className={`rounded-lg border p-3 text-left min-h-[66px] transition-colors ${
                        chargeMode === option.value
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.title}</p>
                      <p className="text-xs text-muted-foreground">{option.help}</p>
                    </button>
                  ))}
                </div>

                {isRecurring && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label>Frequência</Label>
                      <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FREQUENCIES.map((f) => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {frequency === "custom" && (
                      <>
                        <div>
                          <Label>Intervalo (meses)</Label>
                          <Input
                            value={intervalMonths}
                            onChange={(e) => setIntervalMonths(e.target.value)}
                            inputMode="numeric"
                            placeholder="2"
                          />
                        </div>
                        <div>
                          <Label>Primeira cobrança</Label>
                          <Input
                            type="date"
                            value={recurrenceStart}
                            onChange={(e) => setRecurrenceStart(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                    {isSubMonthly && (
                      <>
                        <div>
                          <Label>{frequency === "daily" ? "A cada quantos dias" : "A cada quantas semanas"}</Label>
                          <Input
                            value={subInterval}
                            onChange={(e) => setSubInterval(e.target.value)}
                            inputMode="numeric"
                            placeholder="1"
                          />
                        </div>
                        {frequency === "weekly" ? (
                          <div>
                            <Label>Dia da semana</Label>
                            <Select value={weekday} onValueChange={setWeekday}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {WEEKDAYS.map((w) => (
                                  <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div>
                            <Label>Começa em</Label>
                            <FinanceDateInput value={recurrenceStart} onChange={setRecurrenceStart} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {isSubMonthly && frequency === "weekly" && (
                  <div className="max-w-xs">
                    <Label>Começa em</Label>
                    <FinanceDateInput value={recurrenceStart} onChange={setRecurrenceStart} />
                  </div>
                )}

                {isSubMonthly && (
                  <p className="text-xs text-muted-foreground">
                    {frequency === "daily"
                      ? subIntervalNumber === 1
                        ? "Aparece um lançamento por dia no mês."
                        : `Aparece um lançamento a cada ${subIntervalNumber} dias.`
                      : subIntervalNumber === 1
                        ? `Aparece toda ${(WEEKDAYS.find((w) => w.value === weekdayNumber)?.label ?? "").toLowerCase()}.`
                        : `Aparece a cada ${subIntervalNumber} semanas na ${(WEEKDAYS.find((w) => w.value === weekdayNumber)?.label ?? "").toLowerCase()}.`}
                    {" "}Nenhum lançamento é criado antes do tempo: o mês mostra as datas previstas e
                    você confirma cada uma.
                  </p>
                )}

                {isRecurring && frequency === "custom" && (
                  <p className="text-xs text-muted-foreground">
                    {recurrenceStart
                      ? `Aparece a cada ${intervalNumber} ${intervalNumber === 1 ? "mês" : "meses"} a partir de ${recurrenceStart.split("-").reverse().join("/")}.`
                      : "Informe a primeira cobrança para o sistema saber quais meses contar."}
                  </p>
                )}


                {chargeMode === "consumption" && (
                  <p className="text-xs text-muted-foreground">
                    O valor informado abaixo é só referência: cada mês fica como estimativa até
                    você registrar o valor real.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Moeda</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as FinanceCurrency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">Real (BRL)</SelectItem>
                      <SelectItem value="USD">Dólar (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>
                    {chargeMode === "consumption" ? "Valor estimado" : "Valor de referência"}
                  </Label>
                  <Input
                    value={amount}
                    onChange={(e) => editUsd("original", e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
              </div>


              {currency === "USD" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <Label>Câmbio (R$ por US$)</Label>
                      <Input
                        value={rate}
                        onChange={(e) => editUsd("rate", e.target.value)}
                        placeholder={defaultUsdRate != null ? String(defaultUsdRate) : "5,13"}
                        inputMode="decimal"
                      />
                    </div>
                    <div className="min-w-0">
                      <Label>Valor cobrado em R$</Label>
                      <Input
                        value={brlCharged}
                        onChange={(e) => editUsd("brl", e.target.value)}
                        placeholder="0,00"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{USD_CONVERSION_HELP}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Forma de pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não definida</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!isInstallments && !isOneOff && (
                  <>
                    <div>
                      <Label>
                        {onCard ? CARD_CHARGE_DAY_FIELD_LABEL : DIRECT_CHARGE_DAY_FIELD_LABEL}
                      </Label>
                      <Input value={chargeDay} onChange={(e) => setChargeDay(e.target.value)} placeholder="23" inputMode="numeric" />
                      {onCard && (
                        <p className="text-xs text-muted-foreground mt-1">{CARD_CHARGE_DAY_HELP}</p>
                      )}
                    </div>
                    {/* Item no cartão não tem vencimento próprio: ele é da fatura. */}
                    {!hideItemDueDay && (
                      <div>
                        <Label>Dia de vencimento</Label>
                        <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="10" inputMode="numeric" />
                      </div>
                    )}
                  </>
                )}
                {isOneOff && (
                  <div>
                    <Label htmlFor="one-off-date">Data / vencimento</Label>
                    <FinanceDateInput id="one-off-date" value={oneOffDate} onChange={setOneOffDate} />
                    <p className="text-xs text-muted-foreground mt-1">
                      {materializesOneOff
                        ? "Gasto avulso é um lançamento do mês: ele já aparece nos totais desta competência."
                        : "Data real do gasto."}
                    </p>
                    {!oneOffDateValid && (
                      <p className="text-xs text-destructive mt-1">Informe a data do gasto</p>
                    )}
                  </div>
                )}
              </div>

              {chargeDueConflict && (
                <p className="text-xs text-destructive">{chargeDueConflict}</p>
              )}

              {onCard && (
                <div>
                  <Label>Cartão utilizado</Label>
                  <Select value={cardItemId} onValueChange={setCardItemId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Nenhum</SelectItem>
                      {cards.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{cardDisplayLabel(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vinculando ao cartão, a despesa entra na composição da fatura.
                    {selectedCard?.statement_due_day != null && (
                      <> A fatura vence no dia {selectedCard.statement_due_day}.</>
                    )}
                  </p>
                </div>
              )}
            </>
          )}
          {isInstallments && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Cronograma do parcelamento</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Data da 1ª parcela</Label>
                  <FinanceDateInput value={installmentStart} onChange={setInstallmentStart} />
                </div>
                <div>
                  <Label>Quantidade de parcelas</Label>
                  <Input
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(e.target.value)}
                    placeholder="12"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {schedulePreview
                  ? `${schedulePreview} — depois disso a despesa deixa de aparecer automaticamente.`
                  : "Informe início e quantidade para o sistema encerrar o parcelamento sozinho."}
              </p>

            </div>
          )}
          {(isAnnual || !!subscriptionDate) && (
            <div>
              <Label>Data da assinatura</Label>
              <FinanceDateInput value={subscriptionDate} onChange={setSubscriptionDate} />
              <p className="text-xs text-muted-foreground mt-1">
                Em cobranças anuais, o mês da assinatura define quando a despesa aparece.
              </p>
            </div>
          )}

          <div className="rounded-lg border">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium"
              onClick={() => setShowMore((v) => !v)}
            >
              Mais opções
              <span className="text-muted-foreground">{showMore ? "−" : "+"}</span>
            </button>
            {showMore && (
              <div className="space-y-4 p-3 pt-0">
                {!isAnnual && !subscriptionDate && (
                  <div>
                    <Label>Data da assinatura</Label>
                    <FinanceDateInput value={subscriptionDate} onChange={setSubscriptionDate} />
                  </div>
                )}
                <div>
                  <Label>Categoria</Label>
                  {/* Categoria pertence ao CADASTRO: organiza o histórico deste
                      item e vale para os meses/projeções futuros. */}
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    list="finance-category-options"
                    placeholder="Ex: Folha de pagamento, Encargos trabalhistas, Assinaturas"
                  />
                  <datalist id="finance-category-options">
                    {knownCategories.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground mt-1">
                    Escolha uma categoria existente ou digite uma nova. Ela agrupa este item na
                    Composição do mês e vale também para os próximos meses.
                  </p>
                </div>
                <div>
                  <Label>Link / painel</Label>
                  <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Cadastro ativo</p>
              <p className="text-xs text-muted-foreground">Inativos param de aparecer nos meses seguintes.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        )}

        {step === "form" && (
          <DialogFooter className="sm:justify-between">
            {/* Destruir/inativar é decisão do banco: o botão só abre a consulta. */}
            {item && scope === "full" ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive sm:mr-auto"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Excluir cadastro
              </Button>
            ) : null}
            {!item && (
              <Button variant="ghost" onClick={() => setStep("intent")}>Voltar</Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={
                saving ||
                destroyed ||
                !name.trim() ||
                !installmentsValid ||
                !oneOffDateValid ||
                !!chargeDueConflict
              }
            >

              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
      {item && (
        <FinanceItemDeleteModal
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          item={item}
          /**
           * Fechamento DETERMINÍSTICO: consulta fechada, formulário fechado e
           * tela recarregada — nunca sobra um formulário vivo capaz de
           * reativar o cadastro que acabou de ser inativado.
           */
          onDone={() => {
            setDestroyed(true);
            setDeleteOpen(false);
            onOpenChange(false);
            onAfterDelete?.();
          }}
        />
      )}

    </Dialog>
  );
}

