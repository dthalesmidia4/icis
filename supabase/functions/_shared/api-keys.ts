// Centralized loader for API keys stored in the api_keys table.
// Throws a typed error so callers can return a consistent 500 payload.
export class MissingApiKeyError extends Error {
  constructor(public keyName: string) {
    super(`Chave '${keyName}' não encontrada na tabela api_keys (Dev > APIs do Sistema).`);
    this.name = "MissingApiKeyError";
  }
}

export async function getApiKey(supabase: any, keyName: string): Promise<string> {
  const { data } = await supabase
    .from("api_keys")
    .select("key_value")
    .eq("key_name", keyName)
    .single();
  const value = data?.key_value;
  if (!value) throw new MissingApiKeyError(keyName);
  return value as string;
}

export const getGoogleAiKey = (supabase: any) => getApiKey(supabase, "Google AI Studio");
export const getOpenAiKey = (supabase: any) => getApiKey(supabase, "OPENAI_API_KEY");
