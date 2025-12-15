import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  to?: string;
  onClick?: () => void;
}

const BackButton = ({ to, onClick }: BackButtonProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <Button 
      variant="ghost" 
      size="icon"
      onClick={handleClick} 
      className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
    >
      <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
    </Button>
  );
};

export default BackButton;
