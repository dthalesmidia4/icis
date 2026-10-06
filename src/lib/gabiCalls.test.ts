import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { gabiCallStatusLabel, translateGabiCallError, formatCallDuration } from "./gabiCalls";

describe("gabi calls", () => {
  it("traduz mensagens antigas", () => {
    expect(translateGabiCallError("There is already an active commercial voice call for this prospect")).toMatch(/^Já existe uma chamada da Gabi/);
    expect(translateGabiCallError("ELEVENLABS_API_KEY not configured")).toBe("Integração com a ElevenLabs não configurada.");
    expect(translateGabiCallError("Prospect does not have a valid Brazilian phone number")).toBe("O prospect não possui um telefone brasileiro válido.");
    expect(translateGabiCallError("ElevenLabs rejected the call")).toBe("A ElevenLabs recusou o início da chamada.");
    expect(translateGabiCallError("Failed to reach ElevenLabs")).toBe("Não foi possível conectar à ElevenLabs.");
    expect(translateGabiCallError("Edge Function returned a non-2xx status code")).toBe("Não foi possível iniciar a chamada.");
    expect(translateGabiCallError("Prospect sem telefone válido.")).toBe("Prospect sem telefone válido.");
  });
  it("status", () => {
    expect(gabiCallStatusLabel({ status: "completed", voicemail_detected: true })).toBe("Caixa postal / sem resposta humana");
    expect(gabiCallStatusLabel({ status: "completed", voicemail_detected: false })).toBe("Concluída");
    expect(gabiCallStatusLabel({ status: "initiation_failed", voicemail_detected: null })).toBe("Falhou");
    expect(gabiCallStatusLabel({ status: "no_answer", voicemail_detected: null })).toBe("Sem resposta");
    expect(formatCallDuration(95)).toBe("1min 35s");
  });
});
