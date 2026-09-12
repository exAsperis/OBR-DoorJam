import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ContextMenuPanel } from "./panel";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ContextMenuPanel /></StrictMode>);
