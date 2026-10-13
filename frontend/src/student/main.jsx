import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import StudentApp from "./StudentApp.jsx";
import { StudentProvider } from "./auth.jsx";
import "./student.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <StudentProvider>
        <StudentApp />
      </StudentProvider>
    </HashRouter>
  </StrictMode>,
);
