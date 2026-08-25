/**
 * Payload da RPC `set_finance_settings`.
 *
 * `null` significa “não definido”: orçamento ausente não é zero e câmbio zero é
 * inválido (a RPC rejeita). Por isso o payload preserva `null` literalmente.
 */
export interface FinanceSettingsInput {
  monthlyBudgetBrl: number | null;
  defaultUsdRate: number | null;
}

export interface FinanceSettingsRpcPayload {
  _tenant_id: string;
  _monthly_budget_brl: number | null;
  _default_usd_rate: number | null;
}

export function financeSettingsRpcPayload(
  tenantId: string,
  settings: FinanceSettingsInput,
): FinanceSettingsRpcPayload {
  return {
    _tenant_id: tenantId,
    _monthly_budget_brl: settings.monthlyBudgetBrl,
    _default_usd_rate: settings.defaultUsdRate,
  };
}
