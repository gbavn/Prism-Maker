import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

const container = document.querySelector("#root");
if (container === null) throw new Error("a pagina do editor esta incompleta");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
