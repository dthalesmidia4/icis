import "@/index.css";
import { createRoot } from "react-dom/client";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import type { MonthRow } from "@/lib/financeModel";

const row = {
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
} as unknown as MonthRow;

createRoot(document.getElementById("root")!).render(
  <FinanceOccurrenceModal
    open
    onOpenChange={() => {}}
    row={row}
    defaultUsdRate={null}
    onSave={async () => null}
    onVoidPaidDirect={async () => true}
  />,
);
