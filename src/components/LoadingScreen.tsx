import { Loader2, Sparkles, LucideIcon } from "lucide-react";

interface LoadingScreenProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  showSparkles?: boolean;
}

export function LoadingScreen({
  title,
  description,
  icon: Icon = Sparkles,
  showSparkles = true,
}: LoadingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-6">
      <div className="relative">
        <div className="h-20 w-20 rounded-full border-4 border-primary/20 flex items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
        {showSparkles && (
          <Icon className="h-6 w-6 text-primary absolute -top-2 -right-2 animate-pulse" />
        )}
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">{title}</h3>
        {description && (
          <p className="text-muted-foreground max-w-md">{description}</p>
        )}
      </div>
    </div>
  );
}
