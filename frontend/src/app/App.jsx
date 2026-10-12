import { RouterProvider } from "react-router-dom";

import router from "./routes";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
