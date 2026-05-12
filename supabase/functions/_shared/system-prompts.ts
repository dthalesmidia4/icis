// Centralized fetcher for system_prompts entries.
// Always returns a string ("" if not configured) so callers can unconditionally concatenate.

export async function getSystemPrompt(
  supabase: any,
  tenantId: string,
  promptKey: string,
): Promise<string> {
  const { data } = await supabase
    .from("system_prompts")
    .select("prompt_content")
    .eq("tenant_id", tenantId)
    .eq("prompt_key", promptKey)
    .maybeSingle();
  return (data?.prompt_content as string | undefined) ?? "";
}

// Carousel prompt resolves between the canonical key and the legacy custom key,
// matching the rule used today by auto-generate-carousel.
export async function getCarouselPrompt(
  supabase: any,
  tenantId: string,
): Promise<{ content: string; key: string | null }> {
  const { data } = await supabase
    .from("system_prompts")
    .select("prompt_key, prompt_content")
    .eq("tenant_id", tenantId)
    .in("prompt_key", ["generate_carousel_prompt", "custom_prompt_1774297057852"]);

  const canonical = data?.find(
    (p: any) => p.prompt_key === "generate_carousel_prompt" && p.prompt_content?.trim(),
  );
  const customCarousel = data?.find(
    (p: any) => p.prompt_key === "custom_prompt_1774297057852" && p.prompt_content?.trim(),
  );
  const selected = canonical || customCarousel;
  return {
    content: (selected?.prompt_content as string | undefined) ?? "",
    key: selected?.prompt_key ?? null,
  };
}
