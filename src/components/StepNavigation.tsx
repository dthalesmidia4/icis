import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  number: number;
  title: string;
  path: string;
}

const steps: Step[] = [
  { number: 1, title: "Cadastro", path: "/registration" },
  { number: 2, title: "Estratégia", path: "/strategy" },
  { number: 3, title: "Plano", path: "/plan" },
  { number: 4, title: "Cards", path: "/cards" },
];

export const StepNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const currentStepIndex = steps.findIndex((step) => step.path === location.pathname);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = location.pathname === step.path;
          const isCompleted = index < currentStepIndex;
          const isClickable = index <= currentStepIndex;

          return (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-2 flex-1">
                <Button
                  variant={isActive ? "default" : "outline"}
                  size="icon"
                  className={cn(
                    "h-12 w-12 rounded-full transition-all",
                    isActive && "bg-gradient-to-r from-primary to-secondary shadow-[var(--shadow-glow)]",
                    isCompleted && "bg-primary/20 border-primary",
                    !isClickable && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => isClickable && navigate(step.path)}
                  disabled={!isClickable}
                >
                  {isCompleted ? (
                    <Check className="h-6 w-6" />
                  ) : (
                    <span className="text-lg font-semibold">{step.number}</span>
                  )}
                </Button>
                <span
                  className={cn(
                    "text-sm font-medium transition-colors hidden sm:block",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-1 flex-1 mx-2 rounded-full transition-colors",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
