import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Download, FileText, Pencil, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MarketingPlan {
  id: string;
  plan_content: string | null;
  company_id: string;
  strategy_id: string;
}

export default function Plans() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<MarketingPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const planId = searchParams.get("planId");

  useEffect(() => {
    if (!planId) {
      setLoading(false);
      return;
    }

    const fetchPlan = async () => {
      try {
        const { data, error } = await supabase
          .from("marketing_plans")
          .select("*")
          .eq("id", planId)
          .maybeSingle();

        if (error) throw error;
        
        setPlan(data);
      } catch (error) {
        console.error("Error fetching plan:", error);
        toast({
          title: "Erro ao carregar plano",
          description: "Não foi possível carregar o plano estratégico.",
          variant: "destructive",
        });
      } finally {
        // Simulate a small delay for smooth transition
        setTimeout(() => setLoading(false), 300);
      }
    };

    fetchPlan();
  }, [planId, toast]);

  const handleSave = async () => {
    if (!plan) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("marketing_plans")
        .update({ 
          approved: true,
          approved_at: new Date().toISOString() 
        })
        .eq("id", plan.id);

      if (error) throw error;

      toast({
        title: "Plano salvo com sucesso!",
        description: "O plano estratégico foi salvo na plataforma.",
      });
    } catch (error) {
      console.error("Error saving plan:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o plano.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (!plan) return;
    
    setExporting(true);
    try {
      // Create a simple HTML string with the plan content
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Plano Estratégico</title>
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.8;
                color: #2c3e50;
                max-width: 800px;
                margin: 40px auto;
                padding: 40px;
              }
              h1 {
                color: #1976d2;
                font-size: 32px;
                margin-bottom: 20px;
                border-bottom: 3px solid #1976d2;
                padding-bottom: 10px;
              }
              h2 {
                color: #2196f3;
                font-size: 24px;
                margin-top: 32px;
                margin-bottom: 16px;
                font-weight: 600;
              }
              h3 {
                color: #42a5f5;
                font-size: 18px;
                margin-top: 24px;
                margin-bottom: 12px;
                font-weight: 500;
              }
              p {
                margin-bottom: 16px;
                text-align: justify;
              }
              ul, ol {
                margin-bottom: 16px;
                padding-left: 24px;
              }
              li {
                margin-bottom: 8px;
              }
              strong {
                color: #1976d2;
              }
            </style>
          </head>
          <body>
            <h1>Plano Estratégico</h1>
            ${formatContent(plan.plan_content || '')}
          </body>
        </html>
      `;

      // Create a blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `plano-estrategico-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Plano exportado!",
        description: "O arquivo HTML foi baixado. Você pode abri-lo e imprimir como PDF.",
      });
    } catch (error) {
      console.error("Error exporting plan:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar o plano.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const formatContent = (content: string) => {
    // Split content by lines
    const lines = content.split('\n');
    let formattedHtml = '';
    let inList = false;
    let listType = '';

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      
      if (!trimmedLine) {
        if (inList) {
          formattedHtml += listType === 'ul' ? '</ul>' : '</ol>';
          inList = false;
        }
        return;
      }

      // Headers
      if (trimmedLine.startsWith('# ')) {
        if (inList) {
          formattedHtml += listType === 'ul' ? '</ul>' : '</ol>';
          inList = false;
        }
        formattedHtml += `<h2>${trimmedLine.substring(2)}</h2>`;
      } else if (trimmedLine.startsWith('## ')) {
        if (inList) {
          formattedHtml += listType === 'ul' ? '</ul>' : '</ol>';
          inList = false;
        }
        formattedHtml += `<h3>${trimmedLine.substring(3)}</h3>`;
      }
      // Unordered list
      else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        if (!inList) {
          formattedHtml += '<ul>';
          inList = true;
          listType = 'ul';
        } else if (listType !== 'ul') {
          formattedHtml += '</ol><ul>';
          listType = 'ul';
        }
        formattedHtml += `<li>${trimmedLine.substring(2)}</li>`;
      }
      // Ordered list
      else if (/^\d+\.\s/.test(trimmedLine)) {
        if (!inList) {
          formattedHtml += '<ol>';
          inList = true;
          listType = 'ol';
        } else if (listType !== 'ol') {
          formattedHtml += '</ul><ol>';
          listType = 'ol';
        }
        formattedHtml += `<li>${trimmedLine.replace(/^\d+\.\s/, '')}</li>`;
      }
      // Bold text
      else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
        if (inList) {
          formattedHtml += listType === 'ul' ? '</ul>' : '</ol>';
          inList = false;
        }
        formattedHtml += `<p><strong>${trimmedLine.slice(2, -2)}</strong></p>`;
      }
      // Regular paragraph
      else {
        if (inList) {
          formattedHtml += listType === 'ul' ? '</ul>' : '</ol>';
          inList = false;
        }
        // Handle inline bold
        const processedLine = trimmedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formattedHtml += `<p>${processedLine}</p>`;
      }
    });

    if (inList) {
      formattedHtml += listType === 'ul' ? '</ul>' : '</ol>';
    }

    return formattedHtml;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="space-y-6">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-6 w-96" />
            <Card className="p-8 sm:p-12 space-y-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </Card>
          </div>
        </div>
        <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground font-medium">Carregando plano...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!plan || !plan.plan_content) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-12 h-12 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              Nenhum plano encontrado
            </h2>
            <p className="text-muted-foreground">
              Gere um plano na etapa anterior para visualizá-lo aqui.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => navigate("/generate-questions")}
            className="gap-2"
          >
            Gerar Plano
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="gap-2 mb-6 hover:bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>

        {/* Plan Card */}
        <Card className="bg-card border-border shadow-lg overflow-hidden">
          {/* Card Header with Title and Actions */}
          <div className="border-b bg-muted/30 px-6 py-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                  Plano Estratégico de Marketing
                </h1>
                <p className="text-sm text-muted-foreground">
                  Plano personalizado gerado com base nos dados fornecidos
                </p>
              </div>
              
              {/* Action Buttons - Horizontal Layout */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="gap-2 hover:bg-muted"
                >
                  <Pencil className="w-4 h-4" />
                  <span className="hidden sm:inline">Editar</span>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="gap-2 hover:bg-muted"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {exporting ? "Exportando..." : "Exportar"}
                  </span>
                </Button>
                
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {saving ? "Aprovando..." : "Aprovar"}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {/* Card Content */}
          <div 
            className="p-6 sm:p-8 lg:p-10 prose prose-slate max-w-none
              prose-headings:text-foreground 
              prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-primary prose-h2:border-b prose-h2:border-border prose-h2:pb-2
              prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-primary/80
              prose-p:text-foreground prose-p:mb-4 prose-p:leading-relaxed prose-p:text-base
              prose-ul:my-4 prose-ul:space-y-2 prose-ul:list-disc prose-ul:pl-6
              prose-ol:my-4 prose-ol:space-y-2 prose-ol:list-decimal prose-ol:pl-6
              prose-li:text-foreground prose-li:leading-relaxed prose-li:marker:text-primary
              prose-strong:text-primary prose-strong:font-semibold
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
            dangerouslySetInnerHTML={{ __html: formatContent(plan.plan_content) }}
          />
        </Card>
      </div>
    </div>
  );
}