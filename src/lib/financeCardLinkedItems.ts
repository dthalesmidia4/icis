/**
 * OUTROS ITENS VINCULADOS AO CARTÃO (nunca "cobranças desta fatura").
 *
 * `group.components` é a única verdade contábil da fatura: só entra o que o
 * ciclo consegue AFIRMAR que pertence àquela fatura, e só isso soma
 * `projectedTotal`/diferença.
 *
 * Esta camada é de APRESENTAÇÃO e responde outra pergunta: "quais cadastros
 * ativos estão ligados a este cartão e NÃO estão nesta fatura — e por quê?".
 * Nada aqui soma valor, marca pago ou grava dado.
 */
import {
  Competence,
  chargeDateCompetence,
  chargeDayFrom,
  resolveStatementForCharge,
  sameCompetence,
} from "./financeCardCycle";
import {
  FinanceItem,
  MonthRow,
  StatementGroup,
  isCostBearing,
} from "./financeModel";
import { monthFullLabel } from "./financeRowStatus";

export type LinkedCardReason =
  /** O ciclo resolve para uma fatura FUTURA. */
  | "next_statement"
  /** O ciclo resolve para uma fatura ANTERIOR (fato já fechado). */
  | "other_statement"
  /** Não há `charge_date` nem `charge_day` suficiente. */
  | "missing_charge_date"
  /** Ocorrência migrada/inconsistente ou ciclo do cartão incompleto. */
  | "unclassifiable";

/** O que o usuário pode fazer para tornar o item classificável. */
export type LinkedCardFix = "fix_charge_date" | "edit_item" | "none";

export interface LinkedCardItem {
  item: FinanceItem;
  /** Linha do mês exibido, quando existe (fato real ou projeção). */
  row: MonthRow | null;
  reason: LinkedCardReason;
  /** Rótulo curto e honesto do motivo. */
  label: string;
  detail: string | null;
  /** Fatura para a qual o ciclo resolve, quando resolvível. */
  statementCompetence: Competence | null;
  fix: LinkedCardFix;
  /** Compra de cartão com fato real e SEM `charge_date` (dado migrado). */
  needsChargeDateCorrection: boolean;
}

/**
 * QUALIDADE DE DADO: fato real de cartão sem `charge_date` (ex.: migração que
 * gravou `due_date`). Nada é corrigido automaticamente — apenas sinalizado.
 */
export function needsChargeDateCorrection(row: MonthRow | null | undefined): boolean {
  if (!row?.occurrence) return false;
  if (!row.cardItemId) return false;
  return !row.chargeDate;
}

/** Cartão efetivo de um cadastro no mês (snapshot da linha > cadastro). */
function linkedCardId(item: FinanceItem, row: MonthRow | null): string | null {
  return row?.cardItemId ?? item.card_item_id ?? null;
}

/**
 * Cadastros ATIVOS ligados ao cartão que não estão na fatura selecionada.
 * Itens inativos, recursos incluídos e o próprio cartão nunca entram.
 */
export function buildLinkedCardItems(params: {
  group: StatementGroup;
  items: FinanceItem[];
  rows: MonthRow[];
  competence: Competence;
}): LinkedCardItem[] {
  const { group, items, rows, competence } = params;
  const card = group.card;
  const inStatement = new Set(group.components.map((c) => c.item.id));
  const cycle = {
    closingDay: card.statement_closing_day,
    dueDay: card.statement_due_day,
  };

  const result: LinkedCardItem[] = [];

  for (const item of items) {
    if (item.id === card.id) continue;
    if (!item.active) continue;
    if (!isCostBearing(item)) continue;
    if (item.kind === "card") continue;
    if (inStatement.has(item.id)) continue;

    const row = rows.find((r) => r.item.id === item.id) ?? null;
    if (linkedCardId(item, row) !== card.id) continue;

    const migrated = needsChargeDateCorrection(row);
    const chargeDay = chargeDayFrom(row?.chargeDate ?? null, item.charge_day);

    let reason: LinkedCardReason;
    let label: string;
    let detail: string | null = null;
    let statementCompetence: Competence | null = null;

    if (migrated) {
      reason = "unclassifiable";
      label = "Ciclo não classificável";
      detail =
        "Existe um lançamento real deste mês sem a data de cobrança no cartão. Informe a data para que ele entre na fatura correta.";
    } else if (chargeDay == null) {
      reason = "missing_charge_date";
      label = "Data de cobrança não informada";
      detail =
        "Sem o dia em que este item é cobrado no cartão não é possível dizer a qual fatura ele pertence.";
    } else {
      const resolved = resolveStatementForCharge({
        chargeDay,
        competence: chargeDateCompetence(row?.chargeDate ?? null, competence),
        card: cycle,
      });
      if (resolved.incomplete || !resolved.statementCompetence) {
        reason = "unclassifiable";
        label = "Ciclo não classificável";
        detail = resolved.reason;
      } else {
        statementCompetence = resolved.statementCompetence;
        if (sameCompetence(statementCompetence, competence)) {
          reason = "unclassifiable";
          label = "Ciclo não classificável";
          detail =
            "O ciclo aponta para esta fatura, mas não há cobrança confirmada deste item aqui. Revise a data de cobrança.";
        } else {
          const future =
            statementCompetence.year * 12 + statementCompetence.month >
            competence.year * 12 + competence.month;
          reason = future ? "next_statement" : "other_statement";
          label = future
            ? `Vai para a fatura de ${monthFullLabel(statementCompetence)}`
            : `Ficou na fatura de ${monthFullLabel(statementCompetence)}`;
        }
      }
    }

    result.push({
      item,
      row,
      reason,
      label,
      detail,
      statementCompetence,
      /**
       * Só oferecemos corrigir a DATA quando existe fato do mês; sem fato o que
       * se corrige é o cadastro (dia de cobrança / próximos meses).
       */
      fix: row?.occurrence
        ? "fix_charge_date"
        : reason === "missing_charge_date" || reason === "unclassifiable"
          ? "edit_item"
          : "none",
      needsChargeDateCorrection: migrated,
    });
  }

  return result.sort((a, b) => a.item.name.localeCompare(b.item.name, "pt-BR"));
}

export const LINKED_CARD_FIX_LABELS: Record<LinkedCardFix, string | null> = {
  fix_charge_date: "Corrigir data de cobrança",
  edit_item: "Editar cadastro / próximos meses",
  none: null,
};
