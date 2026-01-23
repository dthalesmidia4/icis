import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface FormSectionProps {
  /** Título da seção */
  title: string;
  /** Descrição opcional abaixo do título */
  description?: string;
  /** Ícone Lucide para exibir ao lado do título */
  icon: LucideIcon;
  /** Conteúdo da seção (inputs, fields, etc) */
  children: ReactNode;
  /** Classe adicional para o Card */
  className?: string;
  /** Classe adicional para o container de conteúdo */
  contentClassName?: string;
}

/**
 * Componente de seção de formulário com título, descrição e ícone padronizados.
 * 
 * @example
 * <FormSection title="Localização" icon={MapPin} description="Endereço da empresa">
 *   <div className="grid grid-cols-2 gap-4">
 *     <Input ... />
 *   </div>
 * </FormSection>
 */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className = "",
  contentClassName = "space-y-4",
}: FormSectionProps) {
  return (
    <Card className={`border-border/50 bg-card/50 backdrop-blur-sm ${className}`}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-base font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {title}
        </CardTitle>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className={contentClassName}>
        {children}
      </CardContent>
    </Card>
  );
}
