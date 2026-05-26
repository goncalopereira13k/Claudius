import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, X, CheckCircle2,
  Bike, Waves, Dumbbell, Activity as Run, Zap, Footprints, Trophy,
} from "lucide-react";
import { activitiesApi, syncApi } from "../services/api";
import type { Activity, PlannedWorkout } from "../types";

// ── Sport system ────────────────────────────────────────────────────────────

type SportKey = "run" | "trail" | "walk" | "bike" | "swim" | "gym" | "race" | "other";

const SPORT: Record<SportKey, {
  chip: string; chipDash: string; text: string; dot: string; icon: string; label: string;
}> = {
  run:   { chip: "bg-amber-50 border border-amber-300",   chipDash: "bg-amber-50/60 border border-dashed border-amber-300",   text: "text-amber-800",   dot: "bg-amber-500",   icon: "text-amber-600",   label: "Road Run" },
  trail: { chip: "bg-emerald-50 border border-emerald-300", chipDash: "bg-emerald-50/60 border border-dashed border-emerald-300", text: "text-emerald-800", dot: "bg-emerald-500", icon: "text-emerald-600", label: "Trail Run" },
  walk:  { chip: "bg-sky-50 border border-sky-300",       chipDash: "bg-sky-50/60 border border-dashed border-sky-300",       text: "text-sky-800",     dot: "bg-sky-500",     icon: "text-sky-600",     label: "Walk / Hike" },
  bike:  { chip: "bg-blue-50 border border-blue-300",     chipDash: "bg-blue-50/60 border border-dashed border-blue-300",     text: "text-blue-800",    dot: "bg-blue-500",    icon: "text-blue-600",    label: "Cycling" },
  swim:  { chip: "bg-cyan-50 border border-cyan-300",     chipDash: "bg-cyan-50/60 border border-dashed border-cyan-300",     text: "text-cyan-800",    dot: "bg-cyan-500",    icon: "text-cyan-600",    label: "Swimming" },
  gym:   { chip: "bg-rose-50 border border-rose-300",     chipDash: "bg-rose-50/60 border border-dashed border-rose-300",     text: "text-rose-800",    dot: "bg-rose-500",    icon: "text-rose-600",    label: "Gym" },
  race:  { chip: "bg-violet-50 border border-violet-300", chipDash: "bg-violet-50/60 border border-dashed border-violet-300", text: "text-violet-800",  dot: "bg-violet-500",  icon: "text-violet-600",  label: "Race" },
  other: { chip: "bg-stone/10 border border-stone/40",    chipDash: "border border-dashed border-stone/40",                   text: "text-ash",         dot: "bg-stone",       icon: "text-ash",         label: "" },
};

function getSport(type: string): SportKey {
  const t = type.toLowerCase();
  if (t.includes("trail")) return "trail";
  if (t.includes("run") || t.includes("corrida")) return "run";
  if (t.includes("walk") || t.includes("hike")) return "walk";
  if (t.includes("cycl") || t.includes("bike") || t.includes("ride")) return "bike";
  if (t.includes("swim")) return "swim";
  if (t.includes("strength") || t.includes("gym") || t.includes("weight") || t.includes("fitness")) return "gym";
  return "other";
}

function sportIcon(key: SportKey) {
  if (key === "bike") return Bike;
  if (key === "swim") return Waves;
  if (key === "gym")  return Dumbbell;
  if (key === "walk") return Footprints;
  if (key === "race") return Trophy;
  if (key === "trail" || key === "run") return Run;
  return Zap;
}

// ── Session types ───────────────────────────────────────────────────────────

type DaySession =
  | { kind: "done";    sport: SportKey; activity: Activity }
  | { kind: "planned"; sport: SportKey; workout: PlannedWorkout }
  | { kind: "matched"; sport: SportKey; activity: Activity; workout: PlannedWorkout };

function nameScore(actName: string, planTitle: string): number {
  const a = actName.toLowerCase().trim();
  const b = planTitle.toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.includes(b.slice(0, 8)) || b.includes(a.slice(0, 8))) return 1;
  return 0;
}

function buildSessions(acts: Activity[], plans: PlannedWorkout[]): DaySession[] {
  const usedA = new Set<number>();
  const usedP = new Set<number>();
  const sessions: DaySession[] = [];

  // Pass 1: match by name similarity — prefer the activity whose name matches the plan title
  plans.forEach((p, pi) => {
    if (p.item_type === "event") return;
    const pSport = getSport(p.sport);
    let bestAi = -1, bestScore = 0;
    acts.forEach((a, ai) => {
      if (usedA.has(ai) || getSport(a.sport_type) !== pSport) return;
      const score = nameScore(a.name, p.title);
      if (score > bestScore) { bestScore = score; bestAi = ai; }
    });
    if (bestAi >= 0 && bestScore > 0) {
      usedA.add(bestAi);
      usedP.add(pi);
      sessions.push({ kind: "matched", sport: pSport, activity: acts[bestAi], workout: p });
    }
  });

  // Pass 2: match remaining plans by sport only
  plans.forEach((p, pi) => {
    if (usedP.has(pi) || p.item_type === "event") return;
    const pSport = getSport(p.sport);
    const ai = acts.findIndex((a, i) => !usedA.has(i) && getSport(a.sport_type) === pSport);
    if (ai >= 0) {
      usedA.add(ai);
      usedP.add(pi);
      sessions.push({ kind: "matched", sport: pSport, activity: acts[ai], workout: p });
    }
  });

  // Remaining unmatched planned + events
  plans.forEach((p, pi) => {
    if (usedP.has(pi)) return;
    sessions.push({ kind: "planned", sport: p.item_type === "event" ? "race" : getSport(p.sport), workout: p });
  });

  // Distances of already-matched sessions — used to suppress near-duplicate unmatched done activities
  const matchedDists = sessions
    .filter((s): s is Extract<DaySession, { kind: "matched" }> => s.kind === "matched")
    .map(s => s.activity.distance_meters);

  acts.forEach((a, ai) => {
    if (usedA.has(ai)) return;
    // Suppress if a matched session already accounts for the same distance (duplicate recording)
    if (
      a.distance_meters > 100 &&
      matchedDists.some(d => d > 100 && Math.abs(d - a.distance_meters) / Math.max(d, a.distance_meters) < 0.05)
    ) return;
    sessions.push({ kind: "done", sport: getSport(a.sport_type), activity: a });
  });

  return sessions;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const ROMAN_MONTHS = [
  "Ianuarius", "Februarius", "Martius", "Aprilis",
  "Maius", "Iunius", "Iulius", "Augustus",
  "September", "October", "November", "December",
];
const DAY_HEADERS = ["Lun", "Mar", "Mer", "Iov", "Ven", "Sab", "Sol"];

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
  return `${m}min`;
}

function fmtKm(m: number) {
  return m > 0 ? `${(m / 1000).toFixed(1)} km` : null;
}

// ── Chip (calendar cell card) ───────────────────────────────────────────────

function SessionChip({ session, onClick }: { session: DaySession; onClick: () => void }) {
  const s = SPORT[session.sport];
  const Icon = sportIcon(session.sport);

  let title: string;
  let metric: string | null = null;
  let isDone = false;
  let isMatched = false;

  if (session.kind === "done") {
    isDone = true;
    title = session.activity.name || session.activity.sport_type;
    metric = fmtKm(session.activity.distance_meters);
  } else if (session.kind === "planned") {
    title = session.workout.title || session.workout.sport;
  } else {
    isDone = true;
    isMatched = true;
    title = session.activity.name || session.workout.title;
    metric = fmtKm(session.activity.distance_meters);
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-left transition-opacity hover:opacity-80
        ${isDone ? s.chip : s.chipDash}`}
    >
      <Icon size={8} className={`${s.icon} flex-shrink-0`} strokeWidth={1.5} />
      <span className={`text-[7.5px] font-cinzel truncate leading-none flex-1 ${s.text}`}>{title}</span>
      {metric && <span className={`text-[7px] font-cinzel flex-shrink-0 opacity-60 ${s.text}`}>{metric}</span>}
      {isMatched && <CheckCircle2 size={7} className="text-emerald-500 flex-shrink-0" />}
    </button>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

function Modal({ session, date, onClose }: { session: DaySession; date: string; onClose: () => void }) {
  const s = SPORT[session.sport];
  const Icon = sportIcon(session.sport);
  const d = new Date(date + "T12:00:00");

  const activity = session.kind !== "planned" ? session.activity : null;
  const workout  = session.kind !== "done"    ? session.workout  : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(30,25,18,0.55)" }}
      onClick={onClose}
    >
      <div
        className="bg-parchment border border-stone w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className={`px-6 py-4 border-b border-stone ${s.chip.split(" ")[0]}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 flex items-center justify-center rounded-sm ${s.dot} bg-opacity-20`}>
                <Icon size={16} className={s.icon} strokeWidth={1.5} />
              </div>
              <div>
                <p className={`text-[8px] font-cinzel tracking-[0.35em] uppercase ${s.text} opacity-70`}>
                  {s.label || session.sport}
                  {session.kind === "matched" && " · Completed"}
                  {session.kind === "planned" && " · Planned"}
                </p>
                <p className="font-cinzel text-ink text-sm leading-tight mt-0.5">
                  {activity?.name || workout?.title || session.sport}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-ash hover:text-ink transition-colors mt-0.5">
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
          <p className="text-[9px] font-cinzel text-ash mt-2">
            {d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Matched: planned vs actual side by side */}
          {session.kind === "matched" && (
            <div className="grid grid-cols-2 gap-4">
              {/* Planned */}
              <div className="space-y-1">
                <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash uppercase border-b border-stone/40 pb-1 mb-2">
                  Planned
                </p>
                <p className="text-[10px] font-cinzel text-ash">{workout!.title}</p>
                {workout!.sport && <p className="text-[9px] font-cinzel text-ash/60">{workout!.sport}</p>}
                {workout!.description && (
                  <p className="text-[9px] font-cinzel text-ash/60 leading-relaxed">{workout!.description}</p>
                )}
              </div>

              {/* Actual */}
              <div className="space-y-1">
                <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash uppercase border-b border-stone/40 pb-1 mb-2">
                  Actual
                </p>
                <StatRow label="Duration" value={fmtDuration(activity!.duration_seconds)} />
                {activity!.distance_meters > 0 && (
                  <StatRow label="Distance" value={fmtKm(activity!.distance_meters)!} />
                )}
                {activity!.avg_hr && <StatRow label="Avg HR" value={`${activity!.avg_hr} bpm`} />}
                {activity!.avg_power && <StatRow label="Power" value={`${activity!.avg_power} W`} />}
                {activity!.tss != null && <StatRow label="TSS" value={activity!.tss.toFixed(0)} />}
              </div>
            </div>
          )}

          {/* Done only */}
          {session.kind === "done" && (
            <div className="grid grid-cols-2 gap-3">
              <StatRow label="Duration"  value={fmtDuration(activity!.duration_seconds)} />
              {activity!.distance_meters > 0 && (
                <StatRow label="Distance" value={fmtKm(activity!.distance_meters)!} />
              )}
              {activity!.avg_hr   && <StatRow label="Avg HR"  value={`${activity!.avg_hr} bpm`} />}
              {activity!.avg_power && <StatRow label="Power"  value={`${activity!.avg_power} W`} />}
              {activity!.tss != null && <StatRow label="TSS"  value={activity!.tss.toFixed(0)} />}
            </div>
          )}

          {/* Planned only */}
          {session.kind === "planned" && (
            <div className="space-y-2">
              {workout!.sport && (
                <div>
                  <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash uppercase mb-1">Sport</p>
                  <p className="text-[11px] font-cinzel text-ink capitalize">{workout!.sport}</p>
                </div>
              )}
              {workout!.description && (
                <div>
                  <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash uppercase mb-1">Details</p>
                  <p className="text-[10px] font-cinzel text-ash leading-relaxed">{workout!.description}</p>
                </div>
              )}
              <p className="text-[9px] font-cinzel text-ash/50 italic pt-1">Not yet completed.</p>
            </div>
          )}

          {/* Source badge */}
          {activity && (
            <p className="text-[7px] font-cinzel tracking-[0.3em] text-ash/40 uppercase border-t border-stone/30 pt-3">
              {activity.source}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-cinzel tracking-[0.2em] text-ash/60 uppercase">{label}</p>
      <p className="text-[11px] font-cinzel text-ink">{value}</p>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Calendar() {
  const today = new Date();
  const [current, setCurrent] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [planned, setPlanned]       = useState<PlannedWorkout[]>([]);
  const [modal, setModal]           = useState<{ session: DaySession; date: string } | null>(null);

  useEffect(() => {
    activitiesApi.list().then(setActivities).catch(() => {});
  }, []);

  useEffect(() => {
    const { year, month } = current;
    const endOfMonth = new Date(year, month + 1, 0);
    const msPerWeek  = 7 * 24 * 60 * 60 * 1000;
    const weeksAhead = Math.max(2, Math.ceil((endOfMonth.getTime() - today.getTime()) / msPerWeek) + 1);
    syncApi.calendar(weeksAhead).then(setPlanned).catch(() => {});
  }, [current.year, current.month]);

  // Close modal on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { year, month } = current;

  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const key = a.start_date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [activities]);

  const plannedByDay = useMemo(() => {
    const map = new Map<string, PlannedWorkout[]>();
    for (const p of planned) {
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date)!.push(p);
    }
    return map;
  }, [planned]);

  const firstDow   = new Date(year, month, 1).getDay();
  const startOffset = (firstDow + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const toKey = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayKey =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const prev = () => setCurrent(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const next = () => setCurrent(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  const openModal = useCallback((session: DaySession, date: string) => {
    setModal({ session, date });
  }, []);

  return (
    <>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-end justify-between pb-5 border-b border-stone">
          <div>
            <p className="text-[8px] font-cinzel tracking-[0.5em] text-ash uppercase mb-1">Calendarium</p>
            <h1 className="text-[1.6rem] font-cinzel tracking-[0.08em] text-ink leading-none">
              {ROMAN_MONTHS[month]} · {year}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prev} className="p-2 border border-stone text-ash hover:text-ink hover:border-ink transition-colors">
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setCurrent({ year: today.getFullYear(), month: today.getMonth() })}
              className="px-3 py-2 text-[9px] font-cinzel tracking-[0.25em] uppercase border border-stone text-ash hover:text-ink hover:border-ink transition-colors"
            >
              Hodie
            </button>
            <button onClick={next} className="p-2 border border-stone text-ash hover:text-ink hover:border-ink transition-colors">
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {(["run","trail","walk","bike","swim","gym","race"] as SportKey[]).map((k) => {
            const s = SPORT[k];
            const Icon = sportIcon(k);
            return (
              <div key={k} className="flex items-center gap-1">
                <Icon size={9} className={s.icon} strokeWidth={1.5} />
                <span className={`text-[7px] font-cinzel tracking-[0.15em] uppercase ${s.text}`}>{s.label}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-stone/40">
            <CheckCircle2 size={9} className="text-emerald-500" />
            <span className="text-[7px] font-cinzel tracking-[0.15em] uppercase text-ash">Matched</span>
          </div>
        </div>

        {/* Grid */}
        <div>
          <div className="grid grid-cols-7 mb-px">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-center text-[8px] font-cinzel tracking-[0.25em] text-ash uppercase py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-l border-t border-stone">
            {cells.map((day, i) => {
              if (!day) {
                return <div key={i} className="border-r border-b border-stone min-h-[110px] bg-tablet/20" />;
              }

              const key      = toKey(day);
              const isToday  = key === todayKey;
              const isFuture = key > todayKey;
              const acts     = byDay.get(key) ?? [];
              const plans    = plannedByDay.get(key) ?? [];
              const sessions = buildSessions(acts, plans);

              return (
                <div
                  key={i}
                  className={`border-r border-b border-stone min-h-[110px] p-1.5 flex flex-col
                    ${isToday ? "bg-tablet" : isFuture ? "bg-parchment/30" : ""}`}
                >
                  {/* Day number */}
                  <div className="flex justify-end mb-1">
                    <span className={`text-[9px] font-cinzel w-5 h-5 flex items-center justify-center rounded-full leading-none
                      ${isToday ? "bg-bronze text-parchment font-semibold" : isFuture ? "text-ash/40" : "text-ash"}`}>
                      {day}
                    </span>
                  </div>

                  {/* Session chips */}
                  <div className="flex flex-col gap-0.5">
                    {sessions.slice(0, 3).map((session, si) => (
                      <SessionChip
                        key={si}
                        session={session}
                        onClick={() => openModal(session, key)}
                      />
                    ))}
                    {sessions.length > 3 && (
                      <span className="text-[7px] font-cinzel text-ash/40 pl-1">+{sessions.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <Modal session={modal.session} date={modal.date} onClose={() => setModal(null)} />
      )}
    </>
  );
}
