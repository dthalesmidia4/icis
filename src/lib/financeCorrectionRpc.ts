/**
 * Rota SEGURA de correção do fato (RPCs `SECURITY DEFINER` com whitelist e
 * trilha em `finance_occurrence_corrections`).
 *
 * Só aqui o frontend corrige um lançamento fechado. Depois do sucesso a
 * ocorrência é RELIDA do banco: sem confirmação real não há toast de sucesso
 * (o chamador compara com `correctionWasApplied`).
 */
import { supabase } from "@/integrations/supabase/client";
import type { FinanceOccurrence } from "./financeModel";
import { FINANCE_OCCURRENCE_METADATA_COLUMNS } from "./financeSecureData";
import type { FactCorrectionPatch } from "./financeFactCorrection";

export interface CorrectionResult {
  ok: boolean;
  occurrence: FinanceOccurrence | null;
  message?: string;
}

async function reloadOccurrence(id: string): Promise<FinanceOccurrence | null> {
  const { data } = await supabase
    .from("finance_occurrences")
    .select(FINANCE_OCCURRENCE_METADATA_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as any as FinanceOccurrence) ?? null;
}

export async function correctFinanceOccurrence(
  occurrenceId: string,
  patch: FactCorrectionPatch,
): Promise<CorrectionResult> {
  const { error } = await (supabase as any).rpc("finance_correct_occurrence", {
    _occurrence_id: occurrenceId,
    _patch: patch,
  });
  if (error) {
    return { ok: false, occurrence: null, message: error.message || "Não foi possível corrigir" };
  }
  return { ok: true, occurrence: await reloadOccurrence(occurrenceId) };
}

export async function convertOccurrenceToCardCharge(
  occurrenceId: string,
  chargeDate: string,
): Promise<CorrectionResult> {
  const { error } = await (supabase as any).rpc("finance_convert_occurrence_to_card_charge", {
    _occurrence_id: occurrenceId,
    _charge_date: chargeDate,
  });
  if (error) {
    return { ok: false, occurrence: null, message: error.message || "Não foi possível converter" };
  }
  return { ok: true, occurrence: await reloadOccurrence(occurrenceId) };
}
