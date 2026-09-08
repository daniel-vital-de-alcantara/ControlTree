import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { PresentationView } from "./PresentationView";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname === "/present" ? <PresentationView /> : <App />}
  </StrictMode>,
);
