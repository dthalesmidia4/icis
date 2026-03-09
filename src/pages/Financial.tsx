import { useState } from "react";
import BackButton from "@/components/BackButton";
import { Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
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

  return (
    <div className="pb-8">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <BackButton to="/" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Financeiro</h1>
              <p className="text-sm text-muted-foreground">
                Gestão financeira da sua agência
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => setBillsModalOpen(true)}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-all hover:scale-[1.02] min-h-[140px]"
            >
              <div className="p-3 rounded-full bg-primary/10">
                <Receipt className="h-7 w-7 text-primary" />
              </div>
              <span className="font-semibold text-sm">Contas a Pagar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Contas a Pagar */}
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

      {/* Modal Nova Conta */}
      <NewBillModal 
        open={newBillModalOpen} 
        onOpenChange={setNewBillModalOpen} 
      />
    </div>
  );
};

export default Financial;
