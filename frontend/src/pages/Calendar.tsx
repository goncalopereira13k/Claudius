import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, X, CheckCircle2,
  Bike, Waves, Dumbbell, Activity as Run, Zap, Footprints, Trophy, Sparkles,
} from "lucide-react";
import { activitiesApi, syncApi, calendarEntriesApi } from "../services/api";
import type { Activity, PlannedWorkout, WorkoutDetail, WorkoutStep, UserCalendarEntry } from "../types";

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
  | { kind: "done";       sport: SportKey; activity: Activity }
  | { kind: "planned";    sport: SportKey; workout: PlannedWorkout }
  | { kind: "matched";    sport: SportKey; activity: Activity; workout: PlannedWorkout }
  | { kind: "ai_entry";   sport: SportKey; entry: UserCalendarEntry }
  | { kind: "ai_matched"; sport: SportKey; activity: Activity; entry: UserCalendarEntry };

function nameScore(actName: string, planTitle: string): number {
  const a = actName.toLowerCase().trim();
  const b = planTitle.toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.includes(b.slice(0, 8)) || b.includes(a.slice(0, 8))) return 1;
  return 0;
}

function buildSessions(acts: Activity[], plans: PlannedWorkout[], aiEntries: UserCalendarEntry[] = []): DaySession[] {
  const usedA  = new Set<number>();
  const usedP  = new Set<number>();
  const usedAi = new Set<number>();
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

  // Pass 3: match remaining activities to AI-added entries by sport
  aiEntries.forEach((entry, ei) => {
    const entrySport = getSport(entry.sport_type ?? "other");
    const ai = acts.findIndex((a, i) => !usedA.has(i) && getSport(a.sport_type) === entrySport);
    if (ai >= 0) {
      usedA.add(ai);
      usedAi.add(ei);
      sessions.push({ kind: "ai_matched", sport: entrySport, activity: acts[ai], entry });
    }
  });

  // Remaining unmatched planned + events
  plans.forEach((p, pi) => {
    if (usedP.has(pi)) return;
    sessions.push({ kind: "planned", sport: p.item_type === "event" ? "race" : getSport(p.sport), workout: p });
  });

  // Remaining unmatched AI entries
  aiEntries.forEach((entry, ei) => {
    if (usedAi.has(ei)) return;
    sessions.push({ kind: "ai_entry", sport: getSport(entry.sport_type ?? "other"), entry });
  });

  // Distances of already-matched sessions — used to suppress near-duplicate unmatched done activities
  const matchedDists = sessions
    .filter((s): s is Extract<DaySession, { kind: "matched" }> => s.kind === "matched")
    .map(s => s.activity.distance_meters);

  acts.forEach((a, ai) => {
    if (usedA.has(ai)) return;
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

  // AI-matched chip (scheduled by Claudius + completed)
  if (session.kind === "ai_matched") {
    const metric = fmtKm(session.activity.distance_meters);
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-sm text-left transition-opacity hover:opacity-80
          bg-gold border border-bronze"
      >
        <Sparkles size={11} className="text-parchment flex-shrink-0" strokeWidth={1.5} />
        <span className="text-[10px] font-cinzel truncate leading-tight flex-1 text-parchment">
          {session.activity.name || session.entry.title}
        </span>
        {metric && <span className="text-[9px] font-cinzel flex-shrink-0 opacity-80 text-parchment">{metric}</span>}
        <CheckCircle2 size={9} className="text-parchment flex-shrink-0" />
      </button>
    );
  }

  // AI-added entry chip
  if (session.kind === "ai_entry") {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-sm text-left transition-opacity hover:opacity-80
          bg-gold/10 border border-dashed border-gold"
      >
        <Sparkles size={11} className="text-bronze flex-shrink-0" strokeWidth={1.5} />
        <span className="text-[10px] font-cinzel truncate leading-tight flex-1 text-bronze">
          {session.entry.title}
        </span>
      </button>
    );
  }

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

// ── Step bar colors ──────────────────────────────────────────────────────────

const STEP_BAR: Record<string, string> = {
  warmup:   "bg-sky-400",
  cooldown: "bg-sky-400",
  interval: "bg-amber-500",
  rest:     "bg-stone-400",
  recovery: "bg-stone-400",
  repeat:   "bg-violet-400",
};

function StepRow({ step, depth = 0 }: { step: WorkoutStep; depth?: number }) {
  const key      = step.stepType?.stepTypeKey ?? "interval";
  const bar      = STEP_BAR[key] ?? STEP_BAR.interval;
  const dur      = fmtStepDuration(step);
  const target   = fmtStepTarget(step);
  const isRepeat = key === "repeat";

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div className="flex items-center gap-3 py-1.5">
        <div className={`w-0.5 h-4 rounded-full flex-shrink-0 ${bar}`} />
        <span className="text-[8px] font-cinzel tracking-[0.25em] uppercase text-ash w-16 shrink-0">{key}</span>
        {dur && <span className="text-[10px] font-cinzel text-ink">{dur}</span>}
        {isRepeat && step.numberOfIterations && (
          <span className="text-[9px] font-cinzel text-ash/80">×{step.numberOfIterations}</span>
        )}
        {target && <span className="text-[9px] font-cinzel text-ash/80 ml-auto">{target}</span>}
      </div>
      {step.description && (
        <p className="text-[8px] font-cinzel text-ash/70 pl-4 pb-0.5 italic">{step.description}</p>
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
    <div>
      {segments.map((seg, si) => (
        <div key={si}>
          {segments.length > 1 && (
            <p className="text-[7px] font-cinzel tracking-[0.3em] text-ash/70 uppercase mb-1">
              Segment {seg.segmentOrder} · {seg.sportType?.sportTypeKey ?? ""}
            </p>
          )}
          <div className="divide-y divide-stone/20">
            {seg.workoutSteps.map((step, i) => (
              <StepRow key={i} step={step} />
            ))}
          </div>
        </div>
      ))}
      {(estDist || estDur) && (
        <div className="flex gap-6 mt-4 pt-4 border-t border-stone/30">
          {estDist && <StatTile label="Est. Distance" value={`${(estDist / 1000).toFixed(1)} km`} />}
          {estDur  && <StatTile label="Est. Duration" value={fmtDuration(estDur)} />}
        </div>
      )}
    </div>
  );
}

// ── Plan vs Actual comparison ────────────────────────────────────────────────

interface CompRow {
  label: string;
  planned: string | null;
  actual: string | null;
  delta: string | null;
  deltaOk?: boolean;
}

function fmtDeltaSecs(secs: number): string {
  const abs = Math.abs(secs);
  const sign = secs >= 0 ? "+" : "−";
  if (abs < 60) return `${sign}${abs}s`;
  const m = Math.round(abs / 60);
  return `${sign}${m} min`;
}

function buildCompRows(detail: WorkoutDetail | null, activity: Activity, sport: SportKey): CompRow[] {
  const rows: CompRow[] = [];
  const plannedDur  = detail?.estimatedDurationInSecs   ?? null;
  const plannedDist = detail?.estimatedDistanceInMeters ?? null;
  const actualDur   = activity.duration_seconds;
  const actualDist  = activity.distance_meters;

  rows.push({
    label:   "Duration",
    planned: plannedDur  != null ? fmtDuration(plannedDur) : null,
    actual:  fmtDuration(actualDur),
    delta:   plannedDur  != null ? fmtDeltaSecs(actualDur - plannedDur) : null,
    deltaOk: plannedDur  != null ? Math.abs(actualDur - plannedDur) / plannedDur < 0.1 : undefined,
  });

  if (plannedDist || actualDist > 0) {
    const delta   = plannedDist && actualDist > 0 ? actualDist - plannedDist : null;
    const deltaPct = delta != null && plannedDist ? delta / plannedDist : null;
    rows.push({
      label:   "Distance",
      planned: plannedDist ? fmtKm(plannedDist) : null,
      actual:  actualDist  > 0 ? fmtKm(actualDist)! : null,
      delta:   delta != null ? `${delta >= 0 ? "+" : "−"}${Math.abs(delta / 1000).toFixed(1)} km` : null,
      deltaOk: deltaPct != null ? Math.abs(deltaPct) < 0.1 : undefined,
    });
  }

  if ((sport === "run" || sport === "trail" || sport === "walk") && actualDist > 0) {
    const paceSecKm = actualDur / (actualDist / 1000);
    rows.push({ label: "Avg Pace",  planned: null, actual: `${fmtPaceFromSecPerKm(paceSecKm)} /km`, delta: null });
  }
  if (sport === "bike" && activity.avg_speed) {
    rows.push({ label: "Avg Speed", planned: null, actual: `${(activity.avg_speed * 3.6).toFixed(1)} km/h`, delta: null });
  }
  if (activity.avg_hr)           rows.push({ label: "Avg HR",  planned: null, actual: `${activity.avg_hr} bpm`, delta: null });
  if (activity.avg_power)        rows.push({ label: "Power",   planned: null, actual: `${activity.avg_power} W`,  delta: null });
  if (activity.tss != null)      rows.push({ label: "TSS",     planned: null, actual: activity.tss.toFixed(0),    delta: null });
  if (activity.elevation_gain)   rows.push({ label: "Elevation",planned: null, actual: `${Math.round(activity.elevation_gain)} m`,  delta: null });

  return rows;
}

function PlanVsActual({ rows }: { rows: CompRow[] }) {
  return (
    <div>
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-x-3 text-[7px] font-cinzel tracking-[0.3em] uppercase text-ash/40 mb-1.5 pb-1.5 border-b border-stone/30">
        <span>Metric</span>
        <span className="text-right">Planned</span>
        <span className="text-right">Actual</span>
        <span className="text-right">Delta</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-x-3 py-1.5 border-b border-stone/10 last:border-0 items-center">
          <span className="text-[8px] font-cinzel text-ash/70 tracking-wide">{r.label}</span>
          <span className="text-[9px] font-cinzel text-ash/50 text-right">{r.planned ?? "—"}</span>
          <span className="text-[10px] font-cinzel text-ink text-right">{r.actual ?? "—"}</span>
          <span className={`text-[9px] font-cinzel text-right ${
            r.delta == null          ? "text-ash/20" :
            r.deltaOk === true       ? "text-emerald-600 dark:text-emerald-400" :
            r.deltaOk === false      ? "text-amber-500" :
            "text-ash/50"
          }`}>
            {r.delta ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tablet px-3 py-2 min-w-[72px]">
      <p className="text-[7px] font-cinzel tracking-[0.3em] uppercase text-ash mb-0.5">{label}</p>
      <p className="text-sm font-cinzel text-ink leading-none">{value}</p>
    </div>
  );
}

function ActivityStats({ activity }: { activity: Activity }) {
  return (
    <div className="flex flex-wrap gap-2">
      <StatTile label="Duration" value={fmtDuration(activity.duration_seconds)} />
      {activity.distance_meters > 0 && <StatTile label="Distance" value={fmtKm(activity.distance_meters)!} />}
      {activity.avg_hr   && <StatTile label="Avg HR"   value={`${activity.avg_hr} bpm`} />}
      {activity.avg_power && <StatTile label="Power"   value={`${activity.avg_power} W`} />}
      {activity.tss != null && <StatTile label="TSS"   value={activity.tss.toFixed(0)} />}
    </div>
  );
}

function Modal({ session, date, onClose, onDeleteAiEntry, allPlans }: {
  session: DaySession;
  date: string;
  onClose: () => void;
  onDeleteAiEntry?: (id: number) => void;
  allPlans: PlannedWorkout[];
}) {
  const s    = SPORT[session.sport];
  const Icon = sportIcon(session.sport);
  const d    = new Date(date + "T12:00:00");

  const activity = (session.kind === "done" || session.kind === "matched" || session.kind === "ai_matched") ? session.activity : null;
  const workout  = (session.kind === "matched" || session.kind === "planned") ? session.workout : null;
  const aiEntry  = (session.kind === "ai_entry" || session.kind === "ai_matched") ? session.entry : null;
  const isAi     = session.kind === "ai_entry" || session.kind === "ai_matched";

  // For "done" sessions, search all loaded plans for a cross-date match
  const matchedPlan = useMemo(() => {
    if (session.kind !== "done") return null;
    const actSport = session.sport;
    for (const p of allPlans) {
      if (getSport(p.sport) !== actSport || p.item_type === "event") continue;
      if (nameScore(session.activity.name, p.title) >= 1) return p;
    }
    return null;
  }, [session, allPlans]);

  const effectiveWorkout = workout ?? matchedPlan;

  const [workoutDetail, setWorkoutDetail] = useState<WorkoutDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting]           = useState(false);

  useEffect(() => {
    const wid = effectiveWorkout?.workout_id;
    if (!wid) return;
    setLoadingDetail(true);
    syncApi.workout(wid).then(setWorkoutDetail).catch(() => {}).finally(() => setLoadingDetail(false));
  }, [effectiveWorkout?.workout_id]);

  async function handleDeleteAiEntry() {
    if (session.kind !== "ai_entry") return;
    setDeleting(true);
    try {
      await calendarEntriesApi.delete(session.entry.id);
      onDeleteAiEntry?.(session.entry.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  const statusLabel =
    session.kind === "ai_entry"    ? "Claudius · Scheduled" :
    session.kind === "ai_matched"  ? "Claudius · Completed" :
    session.kind === "matched"     ? `${s.label} · Completed` :
    session.kind === "planned"     ? `${s.label} · Planned` :
    matchedPlan                    ? `${s.label} · Completed` :
                                     s.label;

  const title =
    isAi
      ? (activity?.name || aiEntry?.title || session.sport)
      : (activity?.name || workout?.title || session.sport);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-parchment border border-stone w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-stone/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {/* Sport icon pill */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isAi ? "bg-bronze" : s.dot}`}>
                {isAi
                  ? <Sparkles size={14} className="text-parchment" strokeWidth={2} />
                  : <Icon size={14} className="text-white" strokeWidth={2} />
                }
              </div>
              <div className="min-w-0">
                <p className="text-[8px] font-cinzel tracking-[0.4em] uppercase text-ash mb-1">
                  {statusLabel}
                </p>
                <p className="font-cinzel text-ink text-base leading-tight truncate">{title}</p>
                <p className="text-[9px] font-cinzel text-ash mt-1.5">
                  {d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-ash/50 hover:text-ink transition-colors flex-shrink-0 mt-0.5">
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">

          {/* Done — stats only (no plan found) */}
          {session.kind === "done" && !matchedPlan && <ActivityStats activity={activity!} />}

          {/* Done — plan found cross-date: show Plan vs Actual */}
          {session.kind === "done" && matchedPlan && (
            <>
              {matchedPlan.description && (
                <p className="text-[9px] font-cinzel text-ink leading-relaxed">{matchedPlan.description}</p>
              )}
              <div>
                <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-3">Plan vs Actual</p>
                {loadingDetail ? (
                  <p className="text-[8px] font-cinzel text-ash animate-pulse tracking-widest">Loading plan data…</p>
                ) : (
                  <PlanVsActual rows={buildCompRows(workoutDetail, activity!, session.sport)} />
                )}
              </div>
              {workoutDetail && workoutDetail.workoutSegments?.length > 0 && (
                <div>
                  <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-3">Workout Steps</p>
                  <WorkoutSteps detail={workoutDetail} />
                </div>
              )}
            </>
          )}

          {/* Matched — plan description + plan vs actual comparison + steps */}
          {session.kind === "matched" && (
            <>
              {workout!.description && (
                <p className="text-[9px] font-cinzel text-ink leading-relaxed">{workout!.description}</p>
              )}
              <div>
                <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-3">Plan vs Actual</p>
                {loadingDetail ? (
                  <p className="text-[8px] font-cinzel text-ash animate-pulse tracking-widest">Loading plan data…</p>
                ) : (
                  <PlanVsActual rows={buildCompRows(workoutDetail, activity!, session.sport)} />
                )}
              </div>
              {workoutDetail && workoutDetail.workoutSegments?.length > 0 && (
                <div>
                  <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-3">Workout Steps</p>
                  <WorkoutSteps detail={workoutDetail} />
                </div>
              )}
            </>
          )}

          {/* Planned — description + steps */}
          {session.kind === "planned" && (
            <>
              {workout!.description && (
                <p className="text-[9px] font-cinzel text-ink leading-relaxed">{workout!.description}</p>
              )}
              {loadingDetail && (
                <p className="text-[8px] font-cinzel text-ash animate-pulse tracking-widest">Loading steps...</p>
              )}
              {workoutDetail && workoutDetail.workoutSegments?.length > 0 && (
                <div>
                  <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-3">Workout Steps</p>
                  <WorkoutSteps detail={workoutDetail} />
                </div>
              )}
              {!loadingDetail && !workoutDetail && (
                <p className="text-[9px] font-cinzel text-ash italic">Not yet completed.</p>
              )}
            </>
          )}

          {/* AI entry — structured details + delete */}
          {session.kind === "ai_entry" && (
            <>
              {/* Key metrics grid */}
              {(aiEntry!.distance_km || aiEntry!.target_pace || aiEntry!.goal_time || aiEntry!.surface_type || aiEntry!.time_of_day || aiEntry!.duration_minutes) && (
                <div className="grid grid-cols-2 gap-2">
                  {aiEntry!.distance_km && (
                    <div className="bg-tablet border border-stone/40 px-4 py-3">
                      <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-1">Distance</p>
                      <p className="text-lg font-cinzel text-ink leading-none">{aiEntry!.distance_km} km</p>
                    </div>
                  )}
                  {aiEntry!.target_pace && (
                    <div className="bg-tablet border border-stone/40 px-4 py-3">
                      <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-1">Target Pace</p>
                      <p className="text-lg font-cinzel text-ink leading-none">{aiEntry!.target_pace}</p>
                    </div>
                  )}
                  {aiEntry!.goal_time && (
                    <div className="bg-tablet border border-stone/40 px-4 py-3">
                      <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-1">Goal Time</p>
                      <p className="text-lg font-cinzel text-ink leading-none">{aiEntry!.goal_time}</p>
                    </div>
                  )}
                  {aiEntry!.surface_type && (
                    <div className="bg-tablet border border-stone/40 px-4 py-3">
                      <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-1">Surface</p>
                      <p className="text-lg font-cinzel text-ink leading-none capitalize">{aiEntry!.surface_type}</p>
                    </div>
                  )}
                  {aiEntry!.time_of_day && (
                    <div className="bg-tablet border border-stone/40 px-4 py-3">
                      <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-1">Start Time</p>
                      <p className="text-lg font-cinzel text-ink leading-none">{aiEntry!.time_of_day}</p>
                    </div>
                  )}
                  {aiEntry!.duration_minutes && (
                    <div className="bg-tablet border border-stone/40 px-4 py-3">
                      <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-1">Duration</p>
                      <p className="text-lg font-cinzel text-ink leading-none">{aiEntry!.duration_minutes} min</p>
                    </div>
                  )}
                </div>
              )}

              {aiEntry!.description && (
                <div className="border-l-2 border-bronze/40 pl-4">
                  <p className="text-[8px] font-cinzel tracking-[0.25em] uppercase text-ash mb-2">Coach Notes</p>
                  <p className="text-[10px] font-cinzel text-ink leading-relaxed">{aiEntry!.description}</p>
                </div>
              )}

              <div className="pt-2 border-t border-stone/20 flex items-center justify-between">
                <p className="text-[7px] font-cinzel tracking-[0.3em] text-ash uppercase">Claudius · Scheduled</p>
                <button
                  onClick={handleDeleteAiEntry}
                  disabled={deleting}
                  className="text-[8px] font-cinzel tracking-[0.2em] uppercase text-ash hover:text-rose-600 disabled:opacity-30 transition-colors"
                >
                  {deleting ? "Removing..." : "Remove"}
                </button>
              </div>
            </>
          )}

          {/* AI matched — scheduled info + actual stats */}
          {session.kind === "ai_matched" && (
            <>
              <div>
                <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-3">Scheduled</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {aiEntry!.distance_km && <StatTile label="Distance" value={`${aiEntry!.distance_km} km`} />}
                  {aiEntry!.target_pace && <StatTile label="Target Pace" value={aiEntry!.target_pace} />}
                  {aiEntry!.goal_time && <StatTile label="Goal Time" value={aiEntry!.goal_time} />}
                  {aiEntry!.surface_type && <StatTile label="Surface" value={aiEntry!.surface_type} />}
                  {aiEntry!.time_of_day && <StatTile label="Start Time" value={aiEntry!.time_of_day} />}
                  {aiEntry!.duration_minutes && <StatTile label="Planned" value={`${aiEntry!.duration_minutes} min`} />}
                </div>
                {aiEntry!.description && (
                  <div className="border-l-2 border-bronze/40 pl-4">
                    <p className="text-[10px] font-cinzel text-ash/70 leading-relaxed">{aiEntry!.description}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-[7px] font-cinzel tracking-[0.35em] uppercase text-ash mb-2">Actual</p>
                <ActivityStats activity={activity!} />
              </div>
            </>
          )}

          {/* Footer: data source */}
          {activity && (
            <p className="text-[7px] font-cinzel tracking-[0.3em] text-ash/60 uppercase pt-2 border-t border-stone/20">
              {isAi ? `Claudius · ${activity.source}` : activity.source}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Calendar() {
  const today = new Date();
  const [current, setCurrent] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [activities, setActivities]   = useState<Activity[]>([]);
  const [planned, setPlanned]         = useState<PlannedWorkout[]>([]);
  const [aiEntries, setAiEntries]     = useState<UserCalendarEntry[]>([]);
  const [modal, setModal]             = useState<{ session: DaySession; date: string } | null>(null);

  useEffect(() => {
    activitiesApi.list().then(setActivities).catch(() => {});
    calendarEntriesApi.list().then(setAiEntries).catch(() => {});
  }, []);

  useEffect(() => {
    const { year, month } = current;
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth   = new Date(year, month + 1, 0);
    const msPerWeek    = 7 * 24 * 60 * 60 * 1000;
    const weeksAhead   = Math.max(2, Math.ceil((endOfMonth.getTime() - today.getTime()) / msPerWeek) + 1);
    const weeksBack    = Math.max(0, Math.ceil((today.getTime() - startOfMonth.getTime()) / msPerWeek) + 1);
    syncApi.calendar(weeksAhead, weeksBack).then(setPlanned).catch(() => {});
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

  const aiEntriesByDay = useMemo(() => {
    const map = new Map<string, UserCalendarEntry[]>();
    for (const e of aiEntries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [aiEntries]);

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
              const aiDay    = aiEntriesByDay.get(key) ?? [];
              const sessions = buildSessions(acts, plans, aiDay);

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
        <Modal
          session={modal.session}
          date={modal.date}
          onClose={() => setModal(null)}
          onDeleteAiEntry={(id) => setAiEntries((prev) => prev.filter((e) => e.id !== id))}
          allPlans={planned}
        />
      )}
    </>
  );
}
