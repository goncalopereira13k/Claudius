import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, X, CheckCircle2,
  Bike, Waves, Dumbbell, Activity as Run, Zap, Footprints, Trophy,
} from "lucide-react";
import { activitiesApi, syncApi } from "../services/api";
import type { Activity, PlannedWorkout, WorkoutDetail, WorkoutStep } from "../types";

// ── Sport system ────────────────────────────────────────────────────────────

type SportKey = "run" | "trail" | "walk" | "bike" | "swim" | "gym" | "race" | "other";

const SPORT: Record<SportKey, {
  chip: string; chipDash: string; modalBg: string;
  text: string; chipText: string;
  dot: string; icon: string; chipIcon: string; label: string;
}> = {
  run:   { chip: "bg-amber-500 border border-amber-600 dark:bg-amber-950/60 dark:border-amber-700",     chipDash: "bg-amber-50 border border-dashed border-amber-400 dark:bg-amber-950/30 dark:border-amber-700",     modalBg: "bg-amber-50 dark:bg-amber-950/40",     text: "text-amber-700 dark:text-amber-300",   chipText: "text-white dark:text-amber-300",   dot: "bg-amber-500",   icon: "text-amber-600 dark:text-amber-400",   chipIcon: "text-white dark:text-amber-400",   label: "Road Run" },
  trail: { chip: "bg-emerald-500 border border-emerald-600 dark:bg-emerald-950/60 dark:border-emerald-700", chipDash: "bg-emerald-50 border border-dashed border-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-700", modalBg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", chipText: "text-white dark:text-emerald-300", dot: "bg-emerald-500", icon: "text-emerald-600 dark:text-emerald-400", chipIcon: "text-white dark:text-emerald-400", label: "Trail Run" },
  walk:  { chip: "bg-sky-500 border border-sky-600 dark:bg-sky-950/60 dark:border-sky-700",             chipDash: "bg-sky-50 border border-dashed border-sky-400 dark:bg-sky-950/30 dark:border-sky-700",             modalBg: "bg-sky-50 dark:bg-sky-950/40",         text: "text-sky-700 dark:text-sky-300",       chipText: "text-white dark:text-sky-300",     dot: "bg-sky-500",     icon: "text-sky-600 dark:text-sky-400",       chipIcon: "text-white dark:text-sky-400",     label: "Walk / Hike" },
  bike:  { chip: "bg-blue-500 border border-blue-600 dark:bg-blue-950/60 dark:border-blue-700",         chipDash: "bg-blue-50 border border-dashed border-blue-400 dark:bg-blue-950/30 dark:border-blue-700",         modalBg: "bg-blue-50 dark:bg-blue-950/40",       text: "text-blue-700 dark:text-blue-300",     chipText: "text-white dark:text-blue-300",   dot: "bg-blue-500",    icon: "text-blue-600 dark:text-blue-400",     chipIcon: "text-white dark:text-blue-400",   label: "Cycling" },
  swim:  { chip: "bg-cyan-500 border border-cyan-600 dark:bg-cyan-950/60 dark:border-cyan-700",         chipDash: "bg-cyan-50 border border-dashed border-cyan-400 dark:bg-cyan-950/30 dark:border-cyan-700",         modalBg: "bg-cyan-50 dark:bg-cyan-950/40",       text: "text-cyan-700 dark:text-cyan-300",     chipText: "text-white dark:text-cyan-300",   dot: "bg-cyan-500",    icon: "text-cyan-600 dark:text-cyan-400",     chipIcon: "text-white dark:text-cyan-400",   label: "Swimming" },
  gym:   { chip: "bg-rose-500 border border-rose-600 dark:bg-rose-950/60 dark:border-rose-700",         chipDash: "bg-rose-50 border border-dashed border-rose-400 dark:bg-rose-950/30 dark:border-rose-700",         modalBg: "bg-rose-50 dark:bg-rose-950/40",       text: "text-rose-700 dark:text-rose-300",     chipText: "text-white dark:text-rose-300",   dot: "bg-rose-500",    icon: "text-rose-600 dark:text-rose-400",     chipIcon: "text-white dark:text-rose-400",   label: "Gym" },
  race:  { chip: "bg-violet-500 border border-violet-600 dark:bg-violet-950/60 dark:border-violet-700", chipDash: "bg-violet-50 border border-dashed border-violet-400 dark:bg-violet-950/30 dark:border-violet-700", modalBg: "bg-violet-50 dark:bg-violet-950/40",   text: "text-violet-700 dark:text-violet-300", chipText: "text-white dark:text-violet-300", dot: "bg-violet-500",  icon: "text-violet-600 dark:text-violet-400", chipIcon: "text-white dark:text-violet-400", label: "Race" },
  other: { chip: "bg-stone-400 border border-stone-500 dark:bg-stone/10 dark:border-stone/40",           chipDash: "bg-stone-50 border border-dashed border-stone-300 dark:border-stone/40",                          modalBg: "bg-stone-50 dark:bg-stone/10",         text: "text-stone-600 dark:text-ash",         chipText: "text-white dark:text-ash",         dot: "bg-stone",       icon: "text-stone-500 dark:text-ash",         chipIcon: "text-white dark:text-ash",         label: "" },
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

  const textCls = isDone ? s.chipText : s.text;
  const iconCls = isDone ? s.chipIcon : s.icon;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-sm text-left transition-opacity hover:opacity-80
        ${isDone ? s.chip : s.chipDash}`}
    >
      <Icon size={11} className={`${iconCls} flex-shrink-0`} strokeWidth={1.5} />
      <span className={`text-[10px] font-cinzel truncate leading-tight flex-1 ${textCls}`}>{title}</span>
      {metric && <span className={`text-[9px] font-cinzel flex-shrink-0 opacity-70 ${textCls}`}>{metric}</span>}
      {isMatched && <CheckCircle2 size={9} className="text-white dark:text-emerald-400 flex-shrink-0" />}
    </button>
  );
}

// ── Workout step helpers ─────────────────────────────────────────────────────

function fmtStepDuration(step: WorkoutStep): string {
  const type = step.durationType?.durationTypeKey ?? "";
  const val  = step.durationValue ?? 0;
  if (type === "distance") {
    return val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)} km` : `${val} m`;
  }
  if (type === "time") {
    const h = Math.floor(val / 3600);
    const m = Math.floor((val % 3600) / 60);
    const s = val % 60;
    if (h > 0) return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
    return s > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${m} min`;
  }
  if (type === "lap.button") return "Lap button";
  if (type === "open")       return "Open";
  if (type === "iterations") return `×${step.numberOfIterations ?? val}`;
  return "";
}

function fmtPaceFromSecPerKm(v: number): string {
  const min = Math.floor(v / 60);
  const sec = Math.round(v % 60);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtStepTarget(step: WorkoutStep): string {
  const type = step.targetType?.workoutTargetTypeKey ?? "";
  const v1   = step.targetValueOne;
  const v2   = step.targetValueTwo;
  const zone = step.zoneNumber;

  if (type === "no.target" || (!v1 && !v2 && !zone)) return "";

  if (zone) return `Zone ${zone}`;

  if (type.includes("pace") && v1 && v2) {
    // Garmin stores pace targets as speed in m/s → sec/km = 1000 / mps
    const s1 = 1000 / v1;
    const s2 = 1000 / v2;
    const [slow, fast] = s1 > s2 ? [s1, s2] : [s2, s1];
    return `${fmtPaceFromSecPerKm(fast)}–${fmtPaceFromSecPerKm(slow)} min/km`;
  }
  if (type.includes("heart.rate") && v1 && v2) {
    return `${Math.round(Math.min(v1, v2))}–${Math.round(Math.max(v1, v2))} bpm`;
  }
  if (type.includes("power") && v1 && v2) {
    return `${Math.round(Math.min(v1, v2))}–${Math.round(Math.max(v1, v2))} W`;
  }
  if (type.includes("cadence") && v1 && v2) {
    return `${Math.round(Math.min(v1, v2))}–${Math.round(Math.max(v1, v2))} spm`;
  }
  if (v1 && v2) return `${Math.round(Math.min(v1, v2))}–${Math.round(Math.max(v1, v2))}`;
  return "";
}

const STEP_STYLE: Record<string, string> = {
  warmup:   "text-sky-700 dark:text-sky-300 bg-transparent border border-sky-300 dark:border-sky-800",
  cooldown: "text-sky-700 dark:text-sky-300 bg-transparent border border-sky-300 dark:border-sky-800",
  interval: "text-amber-800 dark:text-amber-300 bg-transparent border border-amber-400 dark:border-amber-700",
  rest:     "text-stone-500 dark:text-stone-400 bg-transparent border border-stone-300 dark:border-stone-600",
  recovery: "text-stone-500 dark:text-stone-400 bg-transparent border border-stone-300 dark:border-stone-600",
  repeat:   "text-violet-700 dark:text-violet-300 bg-transparent border border-violet-300 dark:border-violet-700",
};

function StepRow({ step, depth = 0 }: { step: WorkoutStep; depth?: number }) {
  const key      = step.stepType?.stepTypeKey ?? "interval";
  const style    = STEP_STYLE[key] ?? STEP_STYLE.interval;
  const dur      = fmtStepDuration(step);
  const target   = fmtStepTarget(step);
  const isRepeat = key === "repeat";

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div className={`flex items-center gap-2 px-2 py-1 rounded-sm border text-[9px] font-cinzel ${style}`}>
        <span className="tracking-[0.25em] uppercase w-16 shrink-0 opacity-70">{key}</span>
        {dur    && <span className="font-semibold">{dur}</span>}
        {isRepeat && step.numberOfIterations && <span className="opacity-70">×{step.numberOfIterations}</span>}
        {target && <span className="opacity-60 ml-auto">{target}</span>}
      </div>
      {step.description && (
        <p className="text-[8px] font-cinzel text-ash/50 pl-2 mt-0.5">{step.description}</p>
      )}
      {step.workoutSteps?.map((sub, i) => (
        <StepRow key={i} step={sub} depth={depth + 1} />
      ))}
    </div>
  );
}

function WorkoutSteps({ detail }: { detail: WorkoutDetail }) {
  const segments = detail.workoutSegments ?? [];
  const estDist  = detail.estimatedDistanceInMeters;
  const estDur   = detail.estimatedDurationInSecs;

  return (
    <div className="space-y-3">
      {segments.map((seg, si) => (
        <div key={si} className="space-y-1">
          {segments.length > 1 && (
            <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash uppercase">
              Segment {seg.segmentOrder} · {seg.sportType?.sportTypeKey ?? ""}
            </p>
          )}
          {seg.workoutSteps.map((step, i) => (
            <StepRow key={i} step={step} />
          ))}
        </div>
      ))}
      {(estDist || estDur) && (
        <div className="flex gap-4 pt-2 border-t border-stone/30">
          {estDist && (
            <div>
              <p className="text-[7px] font-cinzel tracking-[0.2em] text-ash/50 uppercase">Est. Distance</p>
              <p className="text-[10px] font-cinzel text-ink">{(estDist / 1000).toFixed(1)} km</p>
            </div>
          )}
          {estDur && (
            <div>
              <p className="text-[7px] font-cinzel tracking-[0.2em] text-ash/50 uppercase">Est. Duration</p>
              <p className="text-[10px] font-cinzel text-ink">{fmtDuration(estDur)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

function Modal({ session, date, onClose }: { session: DaySession; date: string; onClose: () => void }) {
  const s = SPORT[session.sport];
  const Icon = sportIcon(session.sport);
  const d = new Date(date + "T12:00:00");

  const activity = session.kind !== "planned" ? session.activity : null;
  const workout  = session.kind !== "done"    ? session.workout  : null;

  const [workoutDetail, setWorkoutDetail] = useState<WorkoutDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const wid = workout?.workout_id;
    if (!wid) return;
    setLoadingDetail(true);
    syncApi.workout(wid)
      .then(setWorkoutDetail)
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [workout?.workout_id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="bg-parchment border border-stone w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className={`px-6 py-4 border-b border-stone ${s.modalBg}`}>
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
            <div className="space-y-3">
              {workout!.description && (
                <p className="text-[9px] font-cinzel text-ash leading-relaxed">{workout!.description}</p>
              )}

              {loadingDetail && (
                <p className="text-[8px] font-cinzel text-ash/50 animate-pulse tracking-widest">Loading steps...</p>
              )}

              {workoutDetail && workoutDetail.workoutSegments?.length > 0 && (
                <div>
                  <p className="text-[8px] font-cinzel tracking-[0.3em] text-ash uppercase border-b border-stone/40 pb-1 mb-2">
                    Workout Steps
                  </p>
                  <WorkoutSteps detail={workoutDetail} />
                </div>
              )}

              {!loadingDetail && !workoutDetail && (
                <p className="text-[9px] font-cinzel text-ash/50 italic">Not yet completed.</p>
              )}
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
        <div className="flex items-center gap-2 flex-wrap">
          {(["run","trail","walk","bike","swim","gym","race"] as SportKey[]).map((k) => {
            const s = SPORT[k];
            const Icon = sportIcon(k);
            return (
              <div key={k} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm ${s.chip}`}>
                <Icon size={11} className={s.chipIcon} strokeWidth={1.5} />
                <span className={`text-[9px] font-cinzel tracking-[0.12em] uppercase ${s.chipText}`}>{s.label}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-emerald-500 border border-emerald-600 dark:bg-emerald-950/60 dark:border-emerald-700 ml-1">
            <CheckCircle2 size={11} className="text-white dark:text-emerald-400" />
            <span className="text-[9px] font-cinzel tracking-[0.12em] uppercase text-white dark:text-emerald-300">Matched</span>
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
                return <div key={i} className="border-r border-b border-stone min-h-[130px] bg-tablet/20" />;
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
                  className={`border-r border-b border-stone min-h-[130px] p-2 flex flex-col
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
                  <div className="flex flex-col gap-1">
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
