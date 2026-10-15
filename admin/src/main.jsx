import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import { hashRouteFor } from "./config/navigation.js";
import "./index.css";
import "./ui.css";
import "./layout.css";

// /hod/login and /staff/login (without the "#") would otherwise open the admin sign-in.
const deepLink = hashRouteFor(window.location.pathname, window.location.search, window.location.hash);

if (deepLink) {
  window.location.replace(deepLink);
} else {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
