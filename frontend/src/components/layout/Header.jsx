import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth.js";
import { logout } from "../../services/auth.service.js";
import Button from "../common/Button.jsx";

export default function Header() {
  const [error, setError] = useState("");
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    setError("");
    try {
      await logout();
      signOut();
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign out.",
      );
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <span className="text-sm text-gray-600">{user?.name ?? user?.email}</span>
      <div className="flex items-center gap-3">
        {error && <p aria-live="polite" className="text-sm text-red-600" role="alert">{error}</p>}
        <Button onClick={handleSignOut} type="button" variant="secondary">Sign out</Button>
      </div>
    </header>
  );
}
