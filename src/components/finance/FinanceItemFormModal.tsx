/**
 * Cadastro permanente do Financeiro (`finance_items`).
 * Um cadastro descreve O QUE é pago; os valores por mês são fatos separados.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CARD_PAYMENT_METHOD,
  COST_CENTER_LABELS,
  FinanceCostCenter,
  FinanceCurrency,
  FinanceItem,
  FinanceKind,
  FinanceRecurrence,
  KIND_LABELS,
  PAYMENT_METHODS,
  RECURRENCE_LABELS,
  cardDisplayLabel,
  formatBRL,
  formatDateBR,
  installmentEndDate,
} from "@/lib/financeModel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: FinanceItem | null;
  /** Quando vem de um domínio (Cartões, Assinaturas...), pula o passo de intenção. */
  initialKind?: FinanceKind | null;
  cards: FinanceItem[];
  packages: FinanceItem[];
  defaultUsdRate: number | null;
  onSave: (payload: Partial<FinanceItem>, id?: string) => Promise<boolean>;
}


const KIND_OPTIONS: FinanceKind[] = ["expense", "tool", "package", "card", "included_resource"];
const COST_CENTERS: FinanceCostCenter[] = ["midia", "sistemas", "administrativo", "compartilhado"];
const RECURRENCES: FinanceRecurrence[] = [
  "monthly",
  "installments",
  "annual",
  "one_off",
  "credits",
  "variable",
];

const NONE = "__none__";

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dayOrNull(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return Math.trunc(n);
}

export default function FinanceItemFormModal({
  open,
  onOpenChange,
  item,
  initialKind,
  cards,
  packages,
  defaultUsdRate,
  onSave,
}: Props) {
  const [kind, setKind] = useState<FinanceKind>("expense");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [costCenter, setCostCenter] = useState<FinanceCostCenter>("administrativo");
  const [active, setActive] = useState(true);
  const [recurrence, setRecurrence] = useState<FinanceRecurrence>("monthly");
  const [currency, setCurrency] = useState<FinanceCurrency>("BRL");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
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
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  /** Passo 1: intenção. Só existe para NOVOS cadastros. */
  const [step, setStep] = useState<"intent" | "form">("form");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(item || initialKind ? "form" : "intent");
    setShowMore(false);
    setKind((item?.kind as FinanceKind) ?? initialKind ?? "expense");
    setName(item?.name ?? "");
    setPurpose(item?.purpose ?? "");
    setCategory(item?.category ?? "");
    setCostCenter((item?.cost_center as FinanceCostCenter) ?? "administrativo");
    setActive(item?.active ?? true);
    setRecurrence((item?.recurrence_type as FinanceRecurrence) ?? "monthly");
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
    setRate(item?.default_exchange_rate != null ? String(item.default_exchange_rate) : "");
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
    setLink(item?.link ?? "");
    setNotes(item?.notes ?? "");
  }, [open, item, initialKind]);

  const isCard = kind === "card";
  const isIncluded = kind === "included_resource";
  const onCard = paymentMethod === CARD_PAYMENT_METHOD;
  const effectiveRate = numberOrNull(rate) ?? defaultUsdRate;
  const amountNumber = numberOrNull(amount);
  const isInstallments = !isCard && !isIncluded && recurrence === "installments";

  const installmentCountNumber = useMemo(() => {
    const n = Number(installmentCount);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }, [installmentCount]);

  const installmentsValid = !isInstallments || (!!installmentStart && installmentCountNumber != null);

  /** Última parcela prevista, derivada de início + quantidade. */
  const lastInstallmentDate = useMemo(() => {
    if (!isInstallments || !installmentStart || installmentCountNumber == null) return null;
    return installmentEndDate({
      recurrence_type: "installments",
      installment_start_date: installmentStart,
      installment_count: installmentCountNumber,
    } as FinanceItem);
  }, [isInstallments, installmentStart, installmentCountNumber]);

  /** `12 parcelas mensais · última prevista em 11/02/2027`. */
  const schedulePreview = useMemo(
    () => (isInstallments ? installmentSchedulePreview(installmentStart || null, installmentCountNumber) : null),
    [isInstallments, installmentStart, installmentCountNumber],
  );


  const brlPreview = useMemo(() => {
    if (amountNumber == null) return null;
    if (currency === "USD") return effectiveRate != null ? amountNumber * effectiveRate : null;
    return amountNumber;
  }, [amountNumber, currency, effectiveRate]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (!installmentsValid) return;
    setSaving(true);
    const payload: Partial<FinanceItem> = {
      kind,
      name: name.trim(),
      purpose: purpose.trim() || null,
      category: category.trim() || null,
      cost_center: costCenter,
      active,
      recurrence_type: isIncluded ? "monthly" : recurrence,
      currency,
      default_amount_original: isIncluded ? null : amountNumber,
      default_exchange_rate: currency === "USD" ? effectiveRate : null,
      default_amount_brl: isIncluded ? null : brlPreview != null ? Number(brlPreview.toFixed(2)) : null,
      // No parcelamento o cronograma define os dias: nada de dia genérico.
      charge_day: isCard || isInstallments ? null : dayOrNull(chargeDay),
      due_day: isCard || isInstallments ? null : dayOrNull(dueDay),
      payment_method: isCard || paymentMethod === NONE ? null : paymentMethod,
      card_item_id: !isCard && onCard && cardItemId !== NONE ? cardItemId : null,
      parent_item_id: isIncluded && parentItemId !== NONE ? parentItemId : null,
      bank_name: isCard ? bankName.trim() || null : null,
      card_last4: isCard ? cardLast4.trim() || null : null,
      card_limit_brl: isCard ? numberOrNull(cardLimit) : null,
      statement_closing_day: isCard ? dayOrNull(closingDay) : null,
      statement_due_day: isCard ? dayOrNull(statementDueDay) : null,
      subscription_date: subscriptionDate || null,
      installment_start_date: isInstallments ? installmentStart : null,
      installment_count: isInstallments ? installmentCountNumber : null,
      link: link.trim() || null,
      notes: notes.trim() || null,
    };
    const ok = await onSave(payload, item?.id);
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  const INTENTS: { kind: FinanceKind; title: string; description: string; recurrence?: FinanceRecurrence }[] = [
    { kind: "expense", title: "Conta ou despesa", description: "Uma cobrança ou pagamento" },
    { kind: "tool", title: "Assinatura ou ferramenta", description: "Ex.: Adobe, ChatGPT, Canva" },
    { kind: "card", title: "Cartão de crédito", description: "Para organizar suas faturas" },
    { kind: "package", title: "Pacote de ferramentas", description: "Um plano que inclui vários serviços" },
  ];

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
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FinanceKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => (
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
                  {COST_CENTERS.map((c) => (
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
                  <Label>Dia de fechamento</Label>
                  <Input value={closingDay} onChange={(e) => setClosingDay(e.target.value)} placeholder="10" inputMode="numeric" />
                </div>
                <div>
                  <Label>Dia de vencimento</Label>
                  <Input value={statementDueDay} onChange={(e) => setStatementDueDay(e.target.value)} placeholder="17" inputMode="numeric" />
                </div>
              </div>
            </div>
          )}

          {!isIncluded && !isCard && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Recorrência</Label>
                  <Select value={recurrence} onValueChange={(v) => setRecurrence(v as FinanceRecurrence)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCES.map((r) => (
                        <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <Label>Valor de referência</Label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
                </div>
              </div>

              {currency === "USD" && (
                <div className="grid grid-cols-2 gap-4 items-end">
                  <div>
                    <Label>Câmbio (R$ por US$)</Label>
                    <Input
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder={defaultUsdRate != null ? String(defaultUsdRate) : "5,13"}
                      inputMode="decimal"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground pb-2">
                    Equivalente: <span className="font-semibold text-foreground">{formatBRL(brlPreview)}</span>
                  </p>
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
                {!isInstallments && (
                  <>
                    <div>
                      <Label>Dia da cobrança</Label>
                      <Input value={chargeDay} onChange={(e) => setChargeDay(e.target.value)} placeholder="23" inputMode="numeric" />
                    </div>
                    <div>
                      <Label>Dia de vencimento</Label>
                      <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="10" inputMode="numeric" />
                    </div>
                  </>
                )}
              </div>

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
                  <Input
                    type="date"
                    value={installmentStart}
                    onChange={(e) => setInstallmentStart(e.target.value)}
                  />
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
          {(recurrence === "annual" || !!subscriptionDate) && (
            <div>
              <Label>Data da assinatura</Label>
              <Input type="date" value={subscriptionDate} onChange={(e) => setSubscriptionDate(e.target.value)} />
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
                {recurrence !== "annual" && !subscriptionDate && (
                  <div>
                    <Label>Data da assinatura</Label>
                    <Input type="date" value={subscriptionDate} onChange={(e) => setSubscriptionDate(e.target.value)} />
                  </div>
                )}
                <div>
                  <Label>Categoria</Label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: IA, Infra, Design" />
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
          <DialogFooter>
            {!item && (
              <Button variant="ghost" onClick={() => setStep("intent")}>Voltar</Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || !name.trim() || !installmentsValid}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

