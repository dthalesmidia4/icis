import { describe, expect, it } from "vitest";
import { pickCompatibleReturnStage, type PipelineStage } from "./returnTargetResolution";

const seq: PipelineStage[] = [
  { function_key: "captar", name: "Captar" },
  { function_key: "descarregar_captacao", name: "Descarregar captação" },
  { function_key: "roteirizar", name: "Roteirizar" },
  { function_key: "editar", name: "Editar" },
  { function_key: "revisar", name: "Revisar" },
  { function_key: "enviar_cliente", name: "Enviar cliente" },
];
const CURRENT = 5; // card em "enviar_cliente"

describe("pickCompatibleReturnStage", () => {
  it("mantém a etapa pedida quando o usuário ainda possui a função", () => {
    const r = pickCompatibleReturnStage(seq, CURRENT, "revisar", ["revisar", "editar"]);
    expect(r?.stage.function_key).toBe("revisar");
    expect(r?.reconfigured).toBe(false);
    expect(r?.routing).toBe("requested_stage");
  });

  it("reconfigura para a etapa anterior válida quando o usuário não tem a função pedida", () => {
    const r = pickCompatibleReturnStage(seq, CURRENT, "revisar", ["editar"]);
    expect(r?.stage.function_key).toBe("editar");
    expect(r?.reconfigured).toBe(true);
    expect(r?.routing).toBe("compatible_stage_return");
  });

  it("com várias etapas válidas escolhe deterministicamente a mais próxima da pedida", () => {
    const r = pickCompatibleReturnStage(seq, CURRENT, "revisar", ["captar", "roteirizar", "editar"]);
    expect(r?.stage.function_key).toBe("editar");
  });

  it("empate de distância prefere a etapa anterior (índice menor)", () => {
    // pedida = roteirizar (idx 2); candidatas descarregar_captacao (1) e editar (3)
    const r = pickCompatibleReturnStage(seq, CURRENT, "roteirizar", ["descarregar_captacao", "editar"]);
    expect(r?.stage.function_key).toBe("descarregar_captacao");
  });

  it("nunca avança o card: etapas futuras são ignoradas", () => {
    const r = pickCompatibleReturnStage(seq, 2, "descarregar_captacao", ["revisar", "enviar_cliente"]);
    expect(r).toBeNull();
  });

  it("sem nenhuma etapa anterior compatível devolve null (fallback automático)", () => {
    const r = pickCompatibleReturnStage(seq, CURRENT, "revisar", ["aguardando_cliente"]);
    expect(r).toBeNull();
  });

  it("card na primeira etapa não tem destino de retorno", () => {
    expect(pickCompatibleReturnStage(seq, 0, "captar", ["captar"])).toBeNull();
  });

  it("etapa pedida fora do trecho anterior usa a última etapa anterior como âncora", () => {
    const r = pickCompatibleReturnStage(seq, 3, "revisar", ["captar", "roteirizar"]);
    expect(r?.stage.function_key).toBe("roteirizar");
    expect(r?.reconfigured).toBe(true);
  });
});
