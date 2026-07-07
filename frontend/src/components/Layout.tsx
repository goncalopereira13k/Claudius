import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Sun, Moon, Monitor, Landmark } from "lucide-react";
import { routes } from "../routes";
import { useTheme } from "../contexts/ThemeContext";

type ThemeMode = "light" | "system" | "dark";

const MODES: { key: ThemeMode; Icon: typeof Sun; label: string }[] = [
  { key: "light",  Icon: Sun,     label: "Light"  },
  { key: "system", Icon: Monitor, label: "System" },
  { key: "dark",   Icon: Moon,    label: "Night"  },
];

export default function Layout() {
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-parchment text-ink flex">

      {/* ── Sidebar ── */}
      <aside className="w-52 min-h-screen flex flex-col flex-shrink-0 bg-tablet border-r border-stone/50">

        {/* Logo */}
        <div className="px-6 pt-8 pb-5">
          <div className="flex items-center gap-2.5">
            <Landmark size={20} className="text-gold flex-shrink-0" strokeWidth={1.4} />
            <h1 className="font-cinzel gold-shimmer tracking-[0.15em]" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
              C·Lavdivs
            </h1>
          </div>
          <p className="mt-1.5 text-[8px] font-cinzel tracking-[0.35em] text-ash uppercase">
            Excellence in Discipline
          </p>
        </div>

        {/* Ornamental divider */}
        <div className="mx-6 mb-4 orn-divider" />

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1">
          {routes.map(({ path, label, icon: Icon, index }) => (
            <NavLink
              key={path}
              to={path}
              end={index}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-sm group ${
                  isActive
                    ? "bg-gold/10 border-l-2 border-gold text-bronze"
                    : "border-l-2 border-transparent text-ash hover:bg-stone/30 hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={17}
                    className={isActive ? "text-bronze" : "text-ash group-hover:text-ink"}
                    strokeWidth={1.5}
                  />
                  <span className="text-[11px] font-cinzel tracking-[0.15em] uppercase">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 pb-6">
          <div className="meander mb-4" />
          <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash/50 uppercase">
            Anno Domini MMXXVI
          </p>
        </div>

      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="meander flex-shrink-0" />
        <main className="flex-1 px-10 py-9 w-full overflow-hidden flex flex-col">
          <div
            key={location.pathname}
            className="page-enter flex-1 flex flex-col overflow-hidden"
          >
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Theme toggle (fixed top-right) ── */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-px bg-tablet border border-stone/60 shadow-sm">
        {MODES.map(({ key, Icon, label }) => (
          <button
            key={key}
            onClick={() => setTheme(key)}
            title={label}
            className={`flex items-center justify-center w-7 h-7 transition-colors ${
              theme === key
                ? "bg-gold/20 text-bronze"
                : "text-ash hover:text-ink hover:bg-stone/20"
            }`}
          >
            <Icon size={11} strokeWidth={1.5} />
          </button>
        ))}
      </div>

    </div>
  );
}
