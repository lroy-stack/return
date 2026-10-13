import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { watchInstall } from "./lib/install";
import { registerServiceWorker } from "./lib/pwa";
import { applyTheme, readTheme } from "./lib/theme";
import "./styles.css";

applyTheme(readTheme());
// Before React mounts: `beforeinstallprompt` can fire at any moment and only once.
watchInstall();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
