import { useState, useCallback, useRef, useEffect } from "react";

interface UseVoiceSearchOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  language?: string;
}

interface UseVoiceSearchReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  cancelListening: () => void;
  error: string | null;
}

export function useVoiceSearch({
  onTranscript,
  onError,
  language = "pt-BR",
}: UseVoiceSearchOptions = {}): UseVoiceSearchReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isCancelledRef = useRef(false);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== "undefined" && 
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      isCancelledRef.current = false;
    };

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const transcriptText = result[0].transcript;
      
      setTranscript(transcriptText);
      
      if (result.isFinal && !isCancelledRef.current) {
        onTranscript?.(transcriptText);
      }
    };

    recognition.onerror = (event: any) => {
      const errorMessage = getErrorMessage(event.error);
      setError(errorMessage);
      setIsListening(false);
      onError?.(errorMessage);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [isSupported, language, onTranscript, onError]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      const errorMsg = "Seu navegador não suporta pesquisa por voz.";
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setTranscript("");
    setError(null);
    isCancelledRef.current = false;

    try {
      recognitionRef.current?.start();
    } catch (err) {
      // Recognition might already be running
      console.error("Error starting recognition:", err);
    }
  }, [isSupported, onError]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const cancelListening = useCallback(() => {
    isCancelledRef.current = true;
    recognitionRef.current?.abort();
    setTranscript("");
    setIsListening(false);
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    startListening,
    stopListening,
    cancelListening,
    error,
  };
}

function getErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
      return "Permissão de microfone negada. Habilite nas configurações do navegador.";
    case "no-speech":
      return "Nenhuma fala detectada. Tente novamente.";
    case "audio-capture":
      return "Nenhum microfone encontrado.";
    case "network":
      return "Erro de rede. Verifique sua conexão.";
    case "aborted":
      return "Gravação cancelada.";
    default:
      return "Erro ao capturar áudio. Tente novamente.";
  }
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
