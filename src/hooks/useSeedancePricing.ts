import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SeedancePriceRow = {
  id: string;
  model_key: string;
  resolution: string;
  price_credits_per_second: number;
  price_brl_per_credit: number | null;
  notes: string | null;
};

/**
 * Loads the Seedance pricing catalog once and offers a cost estimator.
 * Pricing is admin-configured (see /dev/apis).
 */
export function useSeedancePricing() {
  const [rows, setRows] = useState<SeedancePriceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("seedance_pricing")
      .select("id, model_key, resolution, price_credits_per_second, price_brl_per_credit, notes")
      .order("model_key")
      .order("resolution");
    if (!error) setRows((data ?? []) as SeedancePriceRow[]);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  /** Returns `null` when no matching price row is configured. */
  const estimate = (opts: {
    model: "lite" | "pro" | "v2";
    resolution: "480p" | "720p" | "1080p";
    durationSeconds: number;
  }) => {
    const row = rows.find(
      (r) => r.model_key === opts.model && r.resolution === opts.resolution,
    );
    if (!row) return null;
    const credits = row.price_credits_per_second * opts.durationSeconds;
    const brl =
      row.price_brl_per_credit != null ? credits * row.price_brl_per_credit : null;
    return { credits, brl, row };
  };

  return { rows, loading, reload, estimate };
}
