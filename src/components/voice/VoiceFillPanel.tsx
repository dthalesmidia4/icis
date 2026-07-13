import { useState } from "react";
import { Mic, Square, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  VoiceReviewPanel,
  type AppliedField,
  type MappedField,
} from "./VoiceReviewPanel";
import type { VoiceFieldDef } from "@/lib/voiceFieldSchemas";
import { toast } from "sonner";

interface Props {
  formType: "anamnesis" | "period_planning";
  tenantId: string;
  clientId: string;
  fields: VoiceFieldDef[];
  currentValues: Record<string, unknown>;
  onApply: (applied: AppliedField[]) => void;
}

interface TranscribeResponse {
  transcript: string;
  mappedFields: Record<string, MappedField>;
  unmappedText: string[];
}

export function VoiceFillPanel({
  formType,
  tenantId,
  clientId,
  fields,
  currentValues,
  onApply,
}: Props) {
  const recorder = useVoiceRecorder();
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<TranscribeResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const sendAudio = async (blob: Blob) => {
    setProcessing(true);
    setServerError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.wav");
      form.append("formType", formType);
      form.append("tenantId", tenantId);
      form.append("clientId", clientId);
      form.append(
        "fields",
        JSON.stringify(fields.map((f) => ({ key: f.key, label: f.label, type: f.type, hint: f.hint, options: f.options })))
      );
      form.append("currentFormValues", JSON.stringify(currentValues));

      const { data, error } = await supabase.functions.invoke(
        "transcribe-and-map-form-voice",
        { body: form }
      );
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("Resposta inválida");
      const resp = data as TranscribeResponse;
      if (!resp.transcript) {
        setServerError("Não foi possível transcrever o áudio.");
        return;
      }
      setResult(resp);
    } catch (err: any) {
      console.error("[VoiceFillPanel] error", err);
      setServerError(err?.message || "Erro ao processar áudio.");
    } finally {
      setProcessing(false);
    }
  };

  const handleStop = async () => {
    const blob = await recorder.stop();
    if (blob) await sendAudio(blob);
  };

  const handleApply = (applied: AppliedField[]) => {
    onApply(applied);
    setResult(null);
    toast.success(`${applied.length} campo(s) preenchido(s) por voz`);
  };

  const handleDiscard = () => {
    setResult(null);
  };

  if (result) {
    return (
      <VoiceReviewPanel
        transcript={result.transcript}
        mappedFields={result.mappedFields || {}}
        unmappedText={result.unmappedText || []}
        fields={fields}
        currentValues={currentValues}
        onApply={handleApply}
        onDiscard={handleDiscard}
      />
    );
  }

  const busy = processing || recorder.state === "processing";

  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <Mic className="h-4 w-4" /> Preenchimento por voz
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fale livremente. A IA vai transcrever e sugerir onde encaixar cada trecho. Você revisa antes de aplicar.
            {" "}Limite: {recorder.maxSeconds}s por gravação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {recorder.state === "recording" && (
            <span className="text-sm font-mono text-red-600 animate-pulse">
              ● {recorder.seconds}s
            </span>
          )}
          {recorder.state !== "recording" && !busy && (
            <Button size="sm" onClick={() => recorder.start()}>
              <Mic className="h-4 w-4 mr-1" /> Gravar
            </Button>
          )}
          {recorder.state === "recording" && (
            <>
              <Button size="sm" variant="destructive" onClick={handleStop}>
                <Square className="h-4 w-4 mr-1" /> Parar
              </Button>
              <Button size="sm" variant="ghost" onClick={recorder.cancel}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            </>
          )}
          {busy && (
            <span className="text-sm flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando…
            </span>
          )}
        </div>
      </div>

      {(recorder.error || serverError) && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{recorder.error || serverError}</AlertDescription>
        </Alert>
      )}
    </Card>
  );
}
