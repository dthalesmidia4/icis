import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import BackButton from "@/components/BackButton";
import NewBillModal from "@/components/NewBillModal";

const Financial = () => {
  const [billsModalOpen, setBillsModalOpen] = useState(false);
  const [newBillModalOpen, setNewBillModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleNewBill = () => {
    setBillsModalOpen(false);
    setNewBillModalOpen(true);
  };

  const handleViewBills = () => {
    setBillsModalOpen(false);
    navigate("/financeiro/contas");
  };

  const hubCards = [
    { title: "Contas a Pagar", icon: Receipt, onClick: () => setBillsModalOpen(true) },
  ];

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="flex items-center gap-3 mb-8 sm:mb-12">
          <BackButton to="/" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              Gestão financeira da sua agência
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {hubCards.map((card, index) => (
            <Card
              key={index}
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
              onClick={card.onClick}
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

      <Dialog open={billsModalOpen} onOpenChange={setBillsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contas a Pagar</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button onClick={handleNewBill} className="w-full h-12 text-base">
              Nova Conta
            </Button>
            <Button onClick={handleViewBills} variant="outline" className="w-full h-12 text-base">
              Ver Contas
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NewBillModal
        open={newBillModalOpen}
        onOpenChange={setNewBillModalOpen}
      />
    </div>
  );
};

export default Financial;
