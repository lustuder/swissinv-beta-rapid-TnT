import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { openLabelLink } from "./lib/labels";
import { claimTab, loadAll } from "./lib/store";
import "./styles.css";

claimTab();
void loadAll().then(openLabelLink);
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
