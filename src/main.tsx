import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Fix malformed URLs with encoded query params (e.g., /schedule%3FperiodPlanId= instead of /schedule?periodPlanId=)
const fixEncodedUrl = () => {
  const pathname = window.location.pathname;
  const decoded = decodeURIComponent(pathname);
  
  // If the decoded pathname contains a ?, it means the query params were incorrectly encoded in the path
  if (decoded.includes('?') && decoded !== pathname) {
    const [path, query] = decoded.split('?');
    const newUrl = `${path}?${query}${window.location.hash}`;
    console.log('[URL Fix] Correcting malformed URL:', pathname, '->', newUrl);
    window.history.replaceState(null, '', newUrl);
  }
};

fixEncodedUrl();

createRoot(document.getElementById("root")!).render(<App />);
