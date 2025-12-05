import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Fix malformed URLs with encoded query params (e.g., /schedule%3FperiodPlanId= instead of /schedule?periodPlanId=)
// This handles cases where external systems encode the ? as %3F
const fixEncodedUrl = (): boolean => {
  const pathname = window.location.pathname;
  const decoded = decodeURIComponent(pathname);
  
  // If the decoded pathname contains a ?, it means the query params were incorrectly encoded in the path
  if (decoded.includes('?') && decoded !== pathname) {
    // Check if we already tried to fix this URL to prevent infinite loop
    const lastFixAttempt = sessionStorage.getItem('url-fix-attempt');
    const currentUrl = window.location.href;
    
    if (lastFixAttempt === currentUrl) {
      sessionStorage.removeItem('url-fix-attempt');
      return false;
    }
    
    const [path, query] = decoded.split('?');
    const newUrl = `${path}?${query}${window.location.hash}`;
    
    // Store current URL to detect loops
    sessionStorage.setItem('url-fix-attempt', currentUrl);
    
    // Use location.replace() for clean navigation
    window.location.replace(newUrl);
    return true;
  }
  
  // Clear flag if URL is correct
  sessionStorage.removeItem('url-fix-attempt');
  return false;
};

// Only render the app if no URL correction redirect happened
if (!fixEncodedUrl()) {
  createRoot(document.getElementById("root")!).render(<App />);
}
