import { createRoot } from "react-dom/client";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import type { MonthRow } from "@/lib/financeModel";

declare global {
  interface Window {
    __voidCalls: { id: string; reason: string }[];
  }
}
window.__voidCalls = [];

const base = (over: Partial<MonthRow> = {}): MonthRow =>
  ({
    key: "k",
    item: {
      id: "i1",
      tenant_id: "t",
      kind: "expense",
      recurrence_type: "one_off",
      category: null,
      cost_center: "midia",
      name: "Energia",
      currency: "BRL",
      active: true,
    },
    occurrence: {
      id: "o1",
      item_id: "i1",
      competence_month: "2026-10-01",
      currency: "BRL",
      entry_role: "regular",
      paid_at: "2026-10-05T12:00:00Z",
      amount_brl: 100,
      due_date: "2026-10-05",
    },
    projected: false,
    paid: true,
    amountBrl: 100,
    amountOriginal: null,
    currency: "BRL",
    exchangeRate: null,
    chargeDate: null,
    dueDate: "2026-10-05",
    paidAmountBrl: 100,
    cardItemId: null,
    paymentMethod: "Pix",
    paymentOverridden: false,
    estimated: false,
    installmentNumber: null,
    installmentCount: null,
    scheduledDate: null,
    entryRole: "regular",
    supplemental: false,
    ...over,
  }) as unknown as MonthRow;

/** Fato direto pago (anulável) x fato em aberto (não anulável). */
const paidDirect = base();
const openDirect = base({
  key: "k2",
  paid: false,
  occurrence: {
    id: "o2",
    item_id: "i1",
    competence_month: "2026-10-01",
    currency: "BRL",
    entry_role: "regular",
    paid_at: null,
    due_date: "2026-10-05",
  } as any,
});

createRoot(document.getElementById("root")!).render(
  <div className="p-6 space-y-4">
    <FinanceOccurrenceModal
      open
      onOpenChange={() => {}}
      row={paidDirect}
      defaultUsdRate={null}
      onSave={async () => null}
      onVoidPaidDirect={async (id, reason) => {
        window.__voidCalls.push({ id, reason });
        return true;
      }}
    />
    <FinanceOccurrenceModal
      open
      onOpenChange={() => {}}
      row={openDirect}
      defaultUsdRate={null}
      onSave={async () => null}
      onVoidPaidDirect={async (id, reason) => {
        window.__voidCalls.push({ id, reason });
        return true;
      }}
    />
  </div>,
);
