import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// DEBUG: Log inicial para rastrear quando o script é executado
console.log('[main.tsx] ========== SCRIPT EXECUTION STARTED ==========');
console.log('[main.tsx] Timestamp:', new Date().toISOString());
console.log('[main.tsx] Full URL:', window.location.href);
console.log('[main.tsx] pathname:', window.location.pathname);
console.log('[main.tsx] search:', window.location.search);
console.log('[main.tsx] hash:', window.location.hash);

// Fix malformed URLs with encoded query params (e.g., /schedule%3FperiodPlanId= instead of /schedule?periodPlanId=)
const fixEncodedUrl = (): boolean => {
  console.log('[main.tsx] fixEncodedUrl() called');
  
  const pathname = window.location.pathname;
  const decoded = decodeURIComponent(pathname);
  
  console.log('[main.tsx] pathname:', pathname);
  console.log('[main.tsx] decoded:', decoded);
  console.log('[main.tsx] needs fix:', decoded.includes('?') && decoded !== pathname);
  
  // If the decoded pathname contains a ?, it means the query params were incorrectly encoded in the path
  if (decoded.includes('?') && decoded !== pathname) {
    // Check if we already tried to fix this URL to prevent infinite loop
    const lastFixAttempt = sessionStorage.getItem('url-fix-attempt');
    const currentUrl = window.location.href;
    
    console.log('[main.tsx] lastFixAttempt:', lastFixAttempt);
    console.log('[main.tsx] currentUrl:', currentUrl);
    
    if (lastFixAttempt === currentUrl) {
      console.warn('[main.tsx] Loop detected, skipping correction');
      sessionStorage.removeItem('url-fix-attempt');
      return false;
    }
    
    const [path, query] = decoded.split('?');
    const newUrl = `${path}?${query}${window.location.hash}`;
    console.log('[main.tsx] Correcting malformed URL:', pathname, '->', newUrl);
    
    // Store current URL to detect loops
    sessionStorage.setItem('url-fix-attempt', currentUrl);
    
    // Use location.replace() for clean navigation - this reloads with the correct URL
    console.log('[main.tsx] Calling window.location.replace() - App will NOT render this time');
    window.location.replace(newUrl);
    return true; // Indicates redirect happened
  }
  
  // Clear flag if URL is correct
  sessionStorage.removeItem('url-fix-attempt');
  console.log('[main.tsx] URL is correct, no fix needed');
  return false;
};

// Only render the app if no URL correction redirect happened
if (!fixEncodedUrl()) {
  console.log('[main.tsx] Rendering React app now...');
  createRoot(document.getElementById("root")!).render(<App />);
  console.log('[main.tsx] createRoot().render() called');
} else {
  console.log('[main.tsx] Redirect triggered, React app NOT rendered');
}
