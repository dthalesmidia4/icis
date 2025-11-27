import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon, Loader2 } from "lucide-react";

interface ButtonColorfulProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: LucideIcon;
  loading?: boolean;
  loadingLabel?: string;
}

export function ButtonColorful({
  className,
  label = "Explore Components",
  icon: Icon,
  loading = false,
  loadingLabel = "Carregando...",
  disabled,
  ...props
}: ButtonColorfulProps) {
  const displayLabel = loading ? loadingLabel : label;
  const DisplayIcon = loading ? Loader2 : Icon;
  
  return (
    <Button
      size="lg"
      disabled={loading || disabled}
      className={cn(
        "relative overflow-hidden",
        "bg-gradient-to-r from-primary via-purple-600 to-pink-600",
        "hover:from-primary/90 hover:via-purple-600/90 hover:to-pink-600/90",
        "text-white",
        "transition-all duration-300 ease-in-out",
        "hover:scale-105 hover:shadow-lg",
        "gap-2",
        loading && "opacity-80 cursor-not-allowed",
        className
      )}
      {...props}
    >
      {/* Animated shine effect */}
      <div
        className={cn(
          "absolute inset-0",
          "bg-gradient-to-r from-transparent via-white/20 to-transparent",
          "-translate-x-full",
          "group-hover:translate-x-full",
          "transition-transform duration-700 ease-in-out"
        )}
      />

      {/* Content */}
      <div className="relative flex items-center justify-center gap-2">
        {DisplayIcon && (
          <DisplayIcon className={cn("w-4 h-4", loading && "animate-spin")} />
        )}
        <span>{displayLabel}</span>
      </div>
    </Button>
  );
}
