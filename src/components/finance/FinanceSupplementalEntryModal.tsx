/**
 * NOVO LANÇAMENTO SUPLEMENTAR (recarga/extra) do MESMO cadastro.
 *
 * Aqui nasce um FATO adicional do mês — nunca um novo cadastro e nunca uma
 * projeção futura. A renovação prevista continua existindo do lado dela.
 *
 * Datas: quem paga por cartão registra COBRANÇA; pagamento direto registra
 * VENCIMENTO. A decisão é da RPC (`finance_create_supplemental_occurrence`),
 * esta tela apenas informa a data real e a origem.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle } from "lucide-react";
import {
  CARD_PAYMENT_METHOD,
  FinanceItem,
  PAYMENT_METHODS,
  cardDisplayLabel,
} from "@/lib/financeModel";
import { parseLocalizedNumber } from "@/lib/financeNumber";
import {
  USD_CONVERSION_HELP,
  UsdConversionState,
  applyUsdEdit,
  resolveUsdNumbers,
  seedUsdConversion,
} from "@/lib/financeUsdConversion";
import {
  SupplementalFormState,
  SupplementalRpcArgs,
  buildSupplementalArgs,
  initialSupplementalState,
  supplementalAction,
  supplementalBlockReason,
} from "@/lib/financeSupplementalEntry";
import FinanceDateInput from "./FinanceDateInput";

const FOLLOW_ITEM = "__follow__";
const NO_METHOD = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FinanceItem | null;
  cards?: FinanceItem[];
  today: string;
  defaultUsdRate: number | null;
  onCreate: (args: SupplementalRpcArgs) => Promise<string | null>;
}

export default function FinanceSupplementalEntryModal({
  open,
  onOpenChange,
  item,
  cards = [],
  today,
  defaultUsdRate,
  onCreate,
}: Props) {
  const action = item ? supplementalAction(item) : null;
  const [factDate, setFactDate] = useState(today);
  const [amountBrlText, setAmountBrlText] = useState("");
  const [usd, setUsd] = useState<UsdConversionState>({ original: "", rate: "", brl: "" });
  const [origin, setOrigin] = useState<string>(FOLLOW_ITEM);
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    const base = initialSupplementalState(item, today);
    setFactDate(base.factDate);
    setAmountBrlText("");
    setUsd(
      seedUsdConversion({
        original: null,
        rate: item.default_exchange_rate ?? defaultUsdRate ?? null,
        brl: null,
      }),
    );
    setOrigin(FOLLOW_ITEM);
    setObservations("");
  }, [open, item, today, defaultUsdRate]);

  const state: SupplementalFormState = useMemo(() => {
    if (!item) {
      return {
        factDate,
        currency: "BRL",
        amountOriginal: null,
        exchangeRate: null,
        amountBrl: null,
        paymentMethod: null,
        cardItemId: null,
        observations,
      };
    }
    const usdNumbers = resolveUsdNumbers(usd);
    const cardId = origin.startsWith("card:") ? origin.slice(5) : null;
    const method =
      origin === FOLLOW_ITEM
        ? null
        : origin === NO_METHOD
          ? null
          : cardId
            ? CARD_PAYMENT_METHOD
            : origin;
    return {
      factDate,
      currency: item.currency,
      amountOriginal: item.currency === "USD" ? usdNumbers.amountOriginal : null,
      exchangeRate: item.currency === "USD" ? usdNumbers.exchangeRate : null,
      amountBrl:
        item.currency === "USD" ? usdNumbers.amountBrl : parseLocalizedNumber(amountBrlText),
      paymentMethod: method,
      cardItemId: cardId,
      observations,
    };
  }, [item, factDate, usd, amountBrlText, origin, observations]);

  if (!item || !action) return null;

  const blockReason = supplementalBlockReason(item, state);

  const handleSave = async () => {
    setSaving(true);
    const id = await onCreate(buildSupplementalArgs(item, action.role, state));
    setSaving(false);
    if (id) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
          <DialogDescription>
            {item.name} — fato adicional deste mês. O lançamento previsto do cadastro continua
            valendo e não é substituído.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="min-w-0">
            <Label htmlFor="supplemental-date">Data real do lançamento</Label>
            <FinanceDateInput
              id="supplemental-date"
              className="mt-1"
              value={factDate}
              onChange={setFactDate}
            />
          </div>

          {item.currency === "USD" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <div className="min-w-0">
                <Label>Valor em US$</Label>
                <Input
                  className="mt-1"
                  value={usd.original}
                  onChange={(e) => setUsd((s) => applyUsdEdit(s, "original", e.target.value))}
                  placeholder="0,00"
                />
              </div>
              <div className="min-w-0">
                <Label>Câmbio</Label>
                <Input
                  className="mt-1"
                  value={usd.rate}
                  onChange={(e) => setUsd((s) => applyUsdEdit(s, "rate", e.target.value))}
                  placeholder="0,0000"
                />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <Label>Valor cobrado em R$</Label>
                <Input
                  className="mt-1"
                  value={usd.brl}
                  onChange={(e) => setUsd((s) => applyUsdEdit(s, "brl", e.target.value))}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground mt-1">{USD_CONVERSION_HELP}</p>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <Label>Valor em R$</Label>
              <Input
                className="mt-1"
                value={amountBrlText}
                onChange={(e) => setAmountBrlText(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          <div className="min-w-0">
            <Label>Origem do pagamento</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLLOW_ITEM}>Seguir o cadastro</SelectItem>
                <SelectItem value={NO_METHOD}>Pagamento direto sem forma definida</SelectItem>
                {PAYMENT_METHODS.filter((m) => m !== CARD_PAYMENT_METHOD).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
                {cards.map((card) => (
                  <SelectItem key={card.id} value={`card:${card.id}`}>
                    {cardDisplayLabel(card)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              No cartão o fato é a cobrança e a liquidação vem do pagamento da fatura.
            </p>
          </div>

          <div className="min-w-0">
            <Label>Observações</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </div>

          {blockReason && <p className="text-xs text-destructive">{blockReason}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !!blockReason}>
            <PlusCircle className="w-4 h-4 mr-2" />
            {saving ? "Registrando..." : action.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
