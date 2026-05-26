import { lazy } from "react";
import { LayoutDashboard, Dumbbell, BarChart2, MessageSquare, CalendarDays } from "lucide-react";
import { PATHS } from "./paths";
import type { LucideIcon } from "lucide-react";

export interface RouteConfig {
  path: string;
  label: string;
  sublabel: string;
  icon: LucideIcon;
  component: React.LazyExoticComponent<() => JSX.Element>;
  index?: boolean;
}

export const routes: RouteConfig[] = [
  { path: PATHS.DASHBOARD,  label: "Gymnasium",  sublabel: "Dashboard",   icon: LayoutDashboard, component: lazy(() => import("./pages/Dashboard")),  index: true },
  { path: PATHS.ACTIVITIES, label: "Stadium",    sublabel: "Treinos",     icon: Dumbbell,        component: lazy(() => import("./pages/Activities")) },
  { path: PATHS.ANALYTICS,  label: "Academia",   sublabel: "Analytics",   icon: BarChart2,       component: lazy(() => import("./pages/Analytics"))  },
  { path: PATHS.CHAT,       label: "Oraculum",   sublabel: "Chat Claude", icon: MessageSquare,   component: lazy(() => import("./pages/Chat"))       },
  { path: PATHS.CALENDAR,   label: "Calendarium", sublabel: "Calendário", icon: CalendarDays,    component: lazy(() => import("./pages/Calendar"))   },
];
