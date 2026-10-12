import { useContext } from "react";

import { ToastContext } from "../context/ToastContext";

// const toast = useToast();  toast.success("Saved");  toast.error(message);
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
