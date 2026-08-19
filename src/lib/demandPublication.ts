/**
 * PUBLICAÇÃO DA DEMANDA — helper canônico único.
 *
 * Salvar data/hora de publicação envolve três efeitos que nunca devem se
 * separar (senão o agendamento fica inconsistente com o card):
 *  1. gravar `publish_date` / `publish_time` na demanda;
 *  2. limpar `additional_publish_dates` quando a publicação é removida;
 *  3. sincronizar o disparo agendado ativo (`syncActiveDispatchDate`), que
 *     também cancela agendamentos movidos para o passado.
 *
 * Consumidores: aba Conteúdo do TaskCard e o Feed Simulado.
 */
import { supabase } from "@/integrations/supabase/client";
import { syncActiveDispatchDate } from "@/lib/syncActiveDispatchDate";

export interface SaveDemandPublicationResult {
  ok: boolean;
  error?: string;
  /** Agendamento movido para o passado e cancelado automaticamente. */
  dispatchCancelled?: boolean;
  /** Já existe publicação publicada: o agendamento não foi alterado. */
  alreadyPublished?: boolean;
}

/** Mensagem pronta para toast quando o agendamento sofreu efeito colateral. */
export function publicationNotice(res: SaveDemandPublicationResult): string | null {
  if (res.dispatchCancelled) {
    return "A data escolhida já passou. O agendamento automático foi desativado para evitar publicação imediata.";
  }
  if (res.alreadyPublished) {
    return "Existe uma publicação já publicada para este card; o agendamento não foi alterado.";
  }
  return null;
}

export async function saveDemandPublication(params: {
  demandId: string;
  date: string | null;
  time: string | null;
}): Promise<SaveDemandPublicationResult> {
  const { demandId } = params;
  if (!demandId) return { ok: false, error: "Demanda inválida." };

  const date = (params.date || "").trim();
  const time = date ? (params.time || "09:00").slice(0, 5) : "";

  const patch: Record<string, any> = {
    publish_date: date || null,
    publish_time: time || null,
  };
  if (!date) patch.additional_publish_dates = [];

  const { error } = await supabase.from("demands").update(patch as any).eq("id", demandId);
  if (error) {
    console.error("[saveDemandPublication] update error", error);
    return { ok: false, error: error.message };
  }

  if (!date) return { ok: true };

  const sync = await syncActiveDispatchDate({
    cardId: demandId,
    publishDate: date,
    publishTime: time,
  });

  return {
    ok: true,
    dispatchCancelled: !!(sync.pastDate && sync.cancelled),
    alreadyPublished: !!(sync.skipped && sync.publishedExists),
  };
}
