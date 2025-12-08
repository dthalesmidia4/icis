import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ActionCardProps {
  title: string;
  icon: LucideIcon;
  gradient: string;
  colorClass: string;
  onClick: () => void;
}

const ActionCard = ({ title, icon: Icon, gradient, colorClass, onClick }: ActionCardProps) => {
  return (
    <Card
      className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
      onClick={onClick}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
      
      <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
        <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300`}>
          <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
        </div>
        
        <h3 className={`text-base sm:text-xl font-bold transition-colors ${colorClass}`}>
          {title}
        </h3>
      </div>
    </Card>
  );
};

export default ActionCard;
