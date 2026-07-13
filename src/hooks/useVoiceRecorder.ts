import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav } from "@/lib/wavEncoder";

export type RecorderState = "idle" | "recording" | "processing" | "error";

const MAX_RECORDING_SECONDS = 60;
const AUTO_STOP_MS = MAX_RECORDING_SECONDS * 1000;

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    try {
      nodeRef.current?.disconnect();
    } catch {}
    try {
      srcRef.current?.disconnect();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    nodeRef.current = null;
    srcRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtor();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      srcRef.current = src;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      nodeRef.current = node;
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(data));
      };
      src.connect(node);
      node.connect(ctx.destination);
      setState("recording");
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
      autoStopRef.current = window.setTimeout(() => {
        stopResolverRef.current?.(null);
        void stopInternal();
      }, AUTO_STOP_MS);
    } catch (err: any) {
      setError(
        err?.name === "NotAllowedError"
          ? "Permissão de microfone negada."
          : "Não foi possível acessar o microfone."
      );
      setState("error");
      cleanup();
    }
  }, [cleanup]);

  const stopInternal = useCallback(async (): Promise<Blob | null> => {
    if (state !== "recording" && chunksRef.current.length === 0) {
      cleanup();
      setState("idle");
      return null;
    }
    setState("processing");
    const sampleRate = ctxRef.current?.sampleRate ?? 48000;
    const chunks = chunksRef.current;
    cleanup();
    if (chunks.length === 0) {
      setState("idle");
      return null;
    }
    const blob = encodeWav(chunks, sampleRate);
    if (blob.size < 2048) {
      setError("Gravação muito curta. Fale novamente.");
      setState("error");
      return null;
    }
    setState("idle");
    return blob;
  }, [state, cleanup]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    return stopInternal();
  }, [stopInternal]);

  const cancel = useCallback(() => {
    chunksRef.current = [];
    cleanup();
    setState("idle");
    setSeconds(0);
    setError(null);
  }, [cleanup]);

  return { state, error, seconds, start, stop, cancel, maxSeconds: MAX_RECORDING_SECONDS };
}
