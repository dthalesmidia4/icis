import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
const DevApis = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  useEffect(() => {
    checkExistingKey();
  }, []);
  const checkExistingKey = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('api_keys').select('id').eq('key_name', 'OPENAI_API_KEY').maybeSingle();
      if (error) throw error;
      setHasExistingKey(!!data);
    } catch (error) {
      console.error('Erro ao verificar chave existente:', error);
    }
  };
  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira uma chave API válida.",
        variant: "destructive"
      });
      return;
    }

    // Validação básica do formato da chave OpenAI
    if (!apiKey.startsWith('sk-')) {
      toast({
        title: "Formato inválido",
        description: "A chave API do OpenAI deve começar com 'sk-'",
        variant: "destructive"
      });
      return;
    }
    setIsSaving(true);
    try {
      const {
        error
      } = await supabase.from('api_keys').upsert({
        key_name: 'OPENAI_API_KEY',
        key_value: apiKey,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key_name'
      });
      if (error) throw error;
      toast({
        title: "✅ Chave API salva!",
        description: "A chave do OpenAI foi configurada com sucesso."
      });
      setHasExistingKey(true);
      setApiKey("");
    } catch (error) {
      console.error('Erro ao salvar chave API:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a chave API. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  return <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Navbar */}
      <nav className="w-full bg-card border-b border-border sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dev-hub')} className="hover:bg-accent">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">APIs do Sistema</h1>
                <p className="text-sm text-muted-foreground">Configure as chaves de API externas</p>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="container max-w-4xl mx-auto px-6 py-12">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  OpenAI API Key (GPT-5-mini)
                  {hasExistingKey && <CheckCircle className="h-5 w-5 text-green-500" />}
                </CardTitle>
                <CardDescription className="mt-2">
                  Configure a chave API do OpenAI para habilitar as funcionalidades de IA do sistema.
                  Esta chave será usada para gerar perguntas, análises e outras funcionalidades de IA.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {hasExistingKey && <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Chave API configurada
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Uma chave API já está configurada. Você pode atualizá-la inserindo uma nova chave abaixo.
                  </p>
                </div>
              </div>}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">Chave API</Label>
                <div className="relative">
                  <Input id="apiKey" type={showKey ? "text" : "password"} placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} className="pr-10" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cole aqui sua chave API do OpenAI. A chave deve começar com "sk-"
                </p>
              </div>

              

              <Button onClick={handleSave} disabled={isSaving || !apiKey.trim()} className="w-full" size="lg">
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Salvando..." : hasExistingKey ? "Atualizar Chave API" : "Salvar Chave API"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>;
};
export default DevApis;