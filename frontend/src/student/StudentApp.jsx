import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { useStudent } from "./auth.jsx";
import Assessment from "./pages/Assessment.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Home from "./pages/Home.jsx";
import Instructions from "./pages/Instructions.jsx";
import Interviews from "./pages/Interviews.jsx";
import Login from "./pages/Login.jsx";
import NotFound from "./pages/NotFound.jsx";
import Profile from "./pages/Profile.jsx";
import Register from "./pages/Register.jsx";
import Submitted from "./pages/Submitted.jsx";

function Splash() {
  return (
    <main className="splash" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>Loading…</p>
    </main>
  );
}

function RequireStudent() {
  const { status, user } = useStudent();
  const location = useLocation();

  if (status === "loading") return <Splash />;
  if (status !== "signedIn") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user?.mustChangePassword && location.pathname !== "/change-password") return <Navigate to="/change-password" replace />;

  return <Outlet />;
}

export default function StudentApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireStudent />}>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/" element={<Home />} />
        <Route path="/instructions" element={<Instructions />} />
        <Route path="/assessment" element={<Assessment />} />
        <Route path="/interviews" element={<Interviews />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/submitted" element={<Submitted />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
