import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadUmami } from "./analytics";
import "./styles.css";

// Inject the Umami tracker before render. auto-track logs the initial pageview; explicit
// events (login/logout, …) go through track() in analytics.ts.
loadUmami();

// Register the service worker backing web push (webPushTokenAdapter awaits
// navigator.serviceWorker.ready but never registers one itself — see Push.tsx). Fire-and-forget;
// requires no permission and doesn't prompt the user (only Notification.requestPermission(),
// triggered later by the Push tab's Register button, does that).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
