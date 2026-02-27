import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Share, Smartphone, CheckCircle2 } from "lucide-react";
import BackButton from "@/components/BackButton";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-2" />
            <CardTitle>App Instalado!</CardTitle>
            <CardDescription>O ICIS já está instalado no seu dispositivo.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col gap-6 pt-8">
      <BackButton to="/home" />
      
      <div className="text-center space-y-2">
        <Smartphone className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-2xl font-bold">Instalar ICIS</h1>
        <p className="text-muted-foreground text-sm">
          Instale o app no seu celular para acesso rápido, offline e notificações.
        </p>
      </div>

      {deferredPrompt && (
        <Button onClick={handleInstall} size="lg" className="w-full gap-2">
          <Download className="h-5 w-5" />
          Instalar Agora
        </Button>
      )}

      {isIOS && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como instalar no iPhone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Share className="h-5 w-5 shrink-0 mt-0.5" />
              <p>Toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta) na barra do Safari.</p>
            </div>
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 shrink-0 mt-0.5" />
              <p>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <p>Toque em <strong>"Adicionar"</strong> para confirmar.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!deferredPrompt && !isIOS && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como instalar</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Abra o menu do seu navegador (⋮) e selecione <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
