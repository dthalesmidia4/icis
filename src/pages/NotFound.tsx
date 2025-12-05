import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if the pathname contains encoded query parameters
    const decodedPath = decodeURIComponent(location.pathname);
    
    // If the path contains a question mark after decoding, it was incorrectly encoded
    if (decodedPath.includes('?') && decodedPath !== location.pathname) {
      console.log('Fixing malformed URL:', location.pathname, '->', decodedPath);
      // Navigate to the correctly formatted URL
      navigate(decodedPath, { replace: true });
      return;
    }

    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname, navigate]);

  // If we're redirecting, don't show the 404 page
  const decodedPath = decodeURIComponent(location.pathname);
  if (decodedPath.includes('?') && decodedPath !== location.pathname) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-primary">404</h1>
          <p className="text-xl text-muted-foreground">Página não encontrada</p>
          <p className="text-sm text-muted-foreground/70 max-w-md">
            A página que você está procurando não existe ou foi movida.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            variant="outline" 
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button 
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Ir para Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
