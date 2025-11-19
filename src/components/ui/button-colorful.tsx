import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface ButtonColorfulProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: LucideIcon;
}

export function ButtonColorful({
  className,
  label = "Explore Components",
  icon: Icon,
  ...props
}: ButtonColorfulProps) {
  return (
    <Button
      size="lg"
      className={cn(
        "relative overflow-hidden",
        "bg-gradient-to-r from-primary via-purple-600 to-pink-600",
        "hover:from-primary/90 hover:via-purple-600/90 hover:to-pink-600/90",
        "text-white",
        "transition-all duration-300 ease-in-out",
        "hover:scale-105 hover:shadow-lg",
        "gap-2",
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
        {Icon && <Icon className="w-4 h-4" />}
        <span>{label}</span>
      </div>
    </Button>
  );
}
