import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import {
  BookOpen,
  ClipboardList,
  Library,
  Eye,
  CalendarCheck,
  History,
} from "lucide-react";

const leituraCards = [
  { title: "Estratégia Geral", icon: BookOpen, route: "" },
  { title: "Anamnese Pessoal", icon: ClipboardList, route: "" },
  { title: "Livros sendo usados", icon: Library, route: "" },
  { title: "Supervisão", icon: Eye, route: "" },
  { title: "Resultado do dia", icon: CalendarCheck, route: "" },
  { title: "Histórico de progresso", icon: History, route: "" },
];

const LeituraHub = () => {
  const navigate = useNavigate();

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <PageHeader title="Leitura" backTo="/home" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-6">
          {leituraCards.map((card, index) => (
            <Card
              key={index}
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
              onClick={() => card.route && navigate(card.route)}
            >
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />

              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                </div>

                <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">
                  {card.title}
                </h3>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LeituraHub;
