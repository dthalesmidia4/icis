import { supabase } from "@/integrations/supabase/client";

/**
 * Sync scheduled_at of an EXISTING active dispatch for a demand.
 * - Does NOT create a new dispatch if none exists.
 * - Skips dispatches with status = 'published' (returns { skipped: true, publishedExists: true }).
 * - Considers active statuses: 'scheduled', 'dispatching', 'failed'.
 * - SAFETY: if the new date/time is in the past (with 60s tolerance), does NOT
 *   update scheduled_at to a past value. Instead cancels the active dispatch
 *   (marks it as 'failed') so `run-scheduled-dispatches` never picks it up
 *   and publishes automatically.
 */
export async function syncActiveDispatchDate(params: {
  cardId: string;
  publishDate?: string | null; // YYYY-MM-DD
  publishTime?: string | null; // HH:mm
}): Promise<{
  updated: boolean;
  skipped?: boolean;
  publishedExists?: boolean;
  pastDate?: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  const { cardId, publishDate, publishTime } = params;
  if (!cardId) return { updated: false };
  if (!publishDate || !publishTime) return { updated: false };

  try {
    const { data: dispatches, error } = await supabase
      .from("scheduled_publication_dispatches" as any)
      .select("id, status, scheduled_at")
      .eq("card_id", cardId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[syncActiveDispatchDate] load error", error);
      return { updated: false, error: error.message };
    }

    const rows = (dispatches as any[]) || [];
    if (rows.length === 0) return { updated: false };

    const published = rows.find((d) => d.status === "published");
    const active = rows.find((d) => ["scheduled", "dispatching", "failed"].includes(d.status));

    if (!active) {
      return { updated: false, skipped: true, publishedExists: !!published };
    }

    const time = publishTime.length === 5 ? publishTime : publishTime.slice(0, 5);
    const scheduledIso = `${publishDate}T${time}:00-03:00`;
    const scheduledAt = new Date(scheduledIso);
    if (isNaN(scheduledAt.getTime())) return { updated: false, error: "Data/horário inválidos." };

    // SAFETY GUARD: never move an active dispatch to a past date.
    // 60s tolerance to absorb clock skew / quick user actions.
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      console.warn(
        `[syncActiveDispatchDate] refusing to sync to past date; cancelling active dispatch ${active.id} for card ${cardId}`,
      );
      const { error: cancelErr } = await supabase
        .from("scheduled_publication_dispatches" as any)
        .update({
          status: "failed",
          error_message:
            "Agendamento cancelado automaticamente: a data foi alterada para uma data passada.",
        })
        .eq("id", active.id);
      if (cancelErr) {
        console.error("[syncActiveDispatchDate] cancel error", cancelErr);
        return { updated: false, error: cancelErr.message, pastDate: true };
      }
      return {
        updated: false,
        pastDate: true,
        cancelled: true,
        publishedExists: !!published,
      };
    }

    const { error: upErr } = await supabase
      .from("scheduled_publication_dispatches" as any)
      .update({ scheduled_at: scheduledAt.toISOString(), status: "scheduled", error_message: null })
      .eq("id", active.id);

    if (upErr) {
      console.error("[syncActiveDispatchDate] update error", upErr);
      return { updated: false, error: upErr.message };
    }

    return { updated: true, publishedExists: !!published };
  } catch (e: any) {
    console.error("[syncActiveDispatchDate] fatal", e);
    return { updated: false, error: e?.message || String(e) };
  }
}
