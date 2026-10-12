import { Outlet } from "react-router-dom";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";

export default function DashboardLayout({ navigation }) {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar items={navigation} />
      <div className="min-w-0 flex-1">
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
