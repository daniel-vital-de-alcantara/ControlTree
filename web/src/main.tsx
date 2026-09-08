import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { PresentationView } from "./PresentationView";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("view") === "present" ? <PresentationView /> : <App />}
  </StrictMode>,
);
