import { useState, useEffect } from "react";
import { Save, Link2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const DevWebhooks = () => {
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasExistingUrl, setHasExistingUrl] = useState(false);

  useEffect(() => {
    loadExistingUrl();
  }, []);

  const loadExistingUrl = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('key_value')
        .eq('key_name', 'WEBHOOK_URL')
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setWebhookUrl(data.key_value);
        setHasExistingUrl(true);
      }
    } catch (error) {
      console.error('Erro ao carregar webhook:', error);
    }
  };

  const handleSave = async () => {
    if (!webhookUrl.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira uma URL de webhook.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('api_keys')
        .upsert({
          key_name: 'WEBHOOK_URL',
          key_value: webhookUrl.trim(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key_name'
        });

      if (error) throw error;

      toast({
        title: "✅ Webhook salvo!",
        description: "A URL do webhook foi configurada com sucesso."
      });
      setHasExistingUrl(true);
    } catch (error) {
      console.error('Erro ao salvar webhook:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o webhook. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Webhooks</h1>
        <p className="text-muted-foreground">
          Configure URLs de webhook para integrações externas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            URL do Webhook
            {hasExistingUrl && <CheckCircle className="h-5 w-5 text-green-500" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">URL do Webhook</Label>
            <Input
              id="webhookUrl"
              type="text"
              placeholder="Cole aqui a URL do webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <Button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="w-full" 
            size="lg"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DevWebhooks;
