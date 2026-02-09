import Scheduled from "@/components/Scheduled";
import BackButton from "@/components/BackButton";

const Kanban = () => {
  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackButton to="/home" />
      <Scheduled />
    </div>
  );
};

export default Kanban;
