import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadUmami } from "./analytics";
import "./styles.css";

// Inject the Umami tracker before render. auto-track logs the initial pageview; explicit
// events (login/logout, …) go through track() in analytics.ts.
loadUmami();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
