/**
 * Leitura das JANELAS DE FATURA no servidor (`finance_statement_cycles`).
 * Fica separada do módulo puro para que a lógica de recorte continue testável
 * sem cliente Supabase.
 */
import { supabase } from "@/integrations/supabase/client";
import { Competence, competenceToISO } from "./financeCardCycle";
import {
  FinanceStatementCycleError,
  StatementCycleMap,
  parseStatementCycles,
} from "./financeStatementCycles";

/**
 * Janelas do mês selecionado (a RPC já devolve ±2 meses). Erro é PROPAGADO:
 * cair no padrão sem avisar mudaria silenciosamente a composição da fatura.
 */
export async function fetchStatementCycles(
  tenantId: string,
  competence: Competence,
): Promise<StatementCycleMap> {
  const { data, error } = await (supabase as any).rpc("finance_statement_cycles", {
    _tenant_id: tenantId,
    _competence_month: competenceToISO(competence),
  });
  if (error) throw new FinanceStatementCycleError(error);
  if (!Array.isArray(data)) throw new FinanceStatementCycleError();
  return parseStatementCycles(data);
}
