import { NavLink } from "react-router-dom";
import { NAVIGATION } from "../../utils/constants.js";

export default function Sidebar({ items = NAVIGATION }) {
  return (
    <aside className="w-full shrink-0 border-b border-gray-200 bg-white p-4 md:min-h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="mb-5 text-lg font-bold text-[#1b3a1e]">WM CareerConnect</div>
      <nav aria-label="Main navigation" className="flex gap-2 overflow-x-auto md:flex-col">
        {items.map((item) => (
          <NavLink
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? "bg-[#1b3a1e] text-white" : "text-gray-600 hover:bg-gray-100"}`
            }
            key={item.path}
            to={item.path}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
