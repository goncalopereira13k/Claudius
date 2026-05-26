import { Outlet, NavLink } from "react-router-dom";
import { routes } from "../routes";

export default function Layout() {
  return (
    <div className="min-h-screen bg-parchment text-ink flex">

      {/* ── Sidebar ── */}
      <aside className="w-52 min-h-screen flex flex-col flex-shrink-0 bg-tablet border-r border-stone/50">

        {/* Logo */}
        <div className="px-6 pt-8 pb-6">
          <h1 className="font-cinzel text-ink tracking-[0.15em]" style={{ fontSize: "1.15rem", fontWeight: 600 }}>
            C·Lavdivs
          </h1>
          <p className="mt-0.5 text-[8px] font-cinzel tracking-[0.35em] text-ash uppercase">
            Excellence in Discipline
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px bg-stone/60 mb-4" />

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1">
          {routes.map(({ path, label, sublabel, icon: Icon, index }) => (
            <NavLink
              key={path}
              to={path}
              end={index}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-sm transition-colors group ${
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
          <div className="h-px bg-stone/60 mb-4" />
          <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash/50 uppercase">
            Anno Domini MMXXVI
          </p>
        </div>

      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <main className="flex-1 px-10 py-10 w-full">
          <Outlet />
        </main>
      </div>

    </div>
  );
}
