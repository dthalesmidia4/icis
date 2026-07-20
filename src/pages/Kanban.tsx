import { useLocation } from "react-router-dom";
import Scheduled from "@/components/Scheduled";

const Kanban = () => {
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from || "/home";

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Scheduled backTo={backTo} />
    </div>
  );
};

export default Kanban;
