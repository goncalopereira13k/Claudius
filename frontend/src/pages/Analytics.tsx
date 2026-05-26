import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { activitiesApi, healthApi } from "../services/api";
import type { Activity, HealthDay } from "../types";

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  ctl: "#c9a84c", atl: "#a0522d", tsb: "#7a6f5a",
  dist: "#c9a84c", dur: "#8b6914", tss: "#b5602b", kj: "#6b8e7a",
  hrv: "#2d6a4f", rhr: "#c1121f", weight: "#264653",
  sleep: "#457b9d", battery: "#e9c46a", stress: "#e76f51",
};

const SPORT_COLORS: Record<string, string> = {
  run: "#f59e0b", trail: "#10b981", walk: "#0ea5e9",
  bike: "#3b82f6", swim: "#06b6d4", gym: "#f43f5e", other: "#7a6f5a",
};
const SPORT_LABELS: Record<string, string> = {
  run: "Road Run", trail: "Trail", walk: "Walk",
  bike: "Cycling", swim: "Swim", gym: "Gym", other: "Other",
};

const TIP = { contentStyle: { background: "#faf8f3", border: "1px solid #d4c9a8", fontFamily: "Cinzel, serif", fontSize: 11 }, cursor: { fill: "#d4c9a818" } };
const AX  = { fontSize: 9, fill: "#7a6f5a", fontFamily: "Cinzel, serif" };

// ── Period ────────────────────────────────────────────────────────────────────
type Period = "4W" | "3M" | "6M" | "1Y" | "All";
const PERIOD_DAYS: Record<Period, number | null> = { "4W": 28, "3M": 90, "6M": 180, "1Y": 365, "All": null };
const PERIODS: Period[] = ["4W", "3M", "6M", "1Y", "All"];

function cutoff(days: number | null): Date | null {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function filterActs(acts: Activity[], period: Period) {
  const c = cutoff(PERIOD_DAYS[period]);
  return c ? acts.filter(a => new Date(a.start_date) >= c) : acts;
}
function filterHealth(h: HealthDay[], period: Period) {
  const c = cutoff(PERIOD_DAYS[period]);
  return c ? h.filter(d => new Date(d.date) >= c) : h;
}

// ── Sport category ────────────────────────────────────────────────────────────
function getSport(type: string) {
  const t = type.toLowerCase();
  if (t.includes("trail")) return "trail";
  if (t.includes("run") || t.includes("corrida")) return "run";
  if (t.includes("walk") || t.includes("hike")) return "walk";
  if (t.includes("cycl") || t.includes("bike") || t.includes("ride")) return "bike";
  if (t.includes("swim")) return "swim";
  if (t.includes("strength") || t.includes("gym") || t.includes("weight") || t.includes("fitness")) return "gym";
  return "other";
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function isoWeek(d: Date): string {
  const tmp = new Date(d);
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const y = tmp.getFullYear();
  const start = new Date(y, 0, 1);
  const w = Math.ceil(((tmp.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

function byWeek(acts: Activity[], getValue: (a: Activity) => number) {
  const map = new Map<string, { label: string; value: number; sortKey: string }>();
  for (const a of acts) {
    const d = new Date(a.start_date);
    const key = isoWeek(d);
    const label = d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
    const prev = map.get(key);
    map.set(key, { label: prev?.label ?? label, sortKey: key, value: (prev?.value ?? 0) + getValue(a) });
  }
  return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

// ── PMC ───────────────────────────────────────────────────────────────────────
function computePMC(acts: Activity[], period: Period) {
  const ATL_K = Math.exp(-1 / 7);
  const CTL_K = Math.exp(-1 / 42);
  let atl = 0, ctl = 0;
  const all = [...acts].reverse().map(a => {
    const tss = a.tss ?? 0;
    atl = atl * ATL_K + tss * (1 - ATL_K);
    ctl = ctl * CTL_K + tss * (1 - CTL_K);
    return { date: a.start_date.slice(0, 10), label: new Date(a.start_date).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }), CTL: +ctl.toFixed(1), ATL: +atl.toFixed(1), TSB: +(ctl - atl).toFixed(1) };
  });
  const c = cutoff(PERIOD_DAYS[period]);
  return c ? all.filter(d => new Date(d.date) >= c) : all;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDur(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}
function fmtPace(secPerKm: number) {
  if (!isFinite(secPerKm)) return "—";
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

// ── UI atoms ──────────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <div className="flex-1 h-px bg-stone/60" />
      <h2 className="text-[9px] font-cinzel tracking-[0.4em] text-ash uppercase px-2 flex items-center gap-2">
        <span className="text-gold text-[7px]">◆</span>{children}<span className="text-gold text-[7px]">◆</span>
      </h2>
      <div className="flex-1 h-px bg-stone/60" />
    </div>
  );
}

function Tabs({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex border border-stone overflow-hidden mb-5 w-fit">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={`px-3 py-1.5 text-[8px] font-cinzel tracking-[0.2em] uppercase transition-colors
            ${value === o ? "bg-gold/20 text-bronze" : "text-ash hover:text-ink"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function StatCard({ label, value, unit, sub }: { label: string; value: string | number; unit?: string; sub?: string }) {
  return (
    <div className="bg-tablet border border-stone p-4">
      <p className="text-[7.5px] font-cinzel tracking-[0.4em] text-ash uppercase mb-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-cinzel text-ink leading-none">{value}</span>
        {unit && <span className="text-[10px] font-cinzel text-ash">{unit}</span>}
      </div>
      {sub && <p className="text-[8px] font-cinzel text-ash/60 mt-1">{sub}</p>}
    </div>
  );
}

function PeakCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-stone p-4 bg-parchment">
      <p className="text-[7.5px] font-cinzel tracking-[0.35em] text-ash uppercase mb-1">{label}</p>
      <p className="text-xl font-cinzel text-ink leading-tight">{value}</p>
      {sub && <p className="text-[8px] font-cinzel text-ash/60 mt-0.5">{sub}</p>}
    </div>
  );
}

function NoData() {
  return <p className="text-[10px] font-cinzel text-ash/50 italic py-8 text-center">Nulla data pro hoc periodo.</p>;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [health, setHealth]         = useState<HealthDay[]>([]);
  const [period, setPeriod]         = useState<Period>("3M");
  const [volTab, setVolTab]         = useState("Distance");
  const [hlthTab, setHlthTab]       = useState("HRV");
  const [sportTab, setSportTab]     = useState("Distance");

  useEffect(() => {
    activitiesApi.list().then(setActivities).catch(() => {});
    healthApi.list(365).then(setHealth).catch(() => {});
  }, []);

  // Filtered sets
  const acts = useMemo(() => filterActs(activities, period), [activities, period]);
  const hlth = useMemo(() => filterHealth(health, period), [health, period]);

  // Summary stats
  const totalDist     = acts.reduce((s, a) => s + a.distance_meters / 1000, 0);
  const totalDur      = acts.reduce((s, a) => s + a.duration_seconds, 0);
  const totalTSS      = acts.reduce((s, a) => s + (a.tss ?? 0), 0);
  const totalKJ       = acts.reduce((s, a) => s + (a.avg_power ? Math.round(a.avg_power * a.duration_seconds / 1000) : 0), 0);
  const totalElevGain = acts.reduce((s, a) => s + (a.elevation_gain ?? 0), 0);

  // Advanced efficiency metrics
  const powerActs = acts.filter(a => a.norm_power != null && a.avg_power != null && a.avg_power > 0);
  const avgVI     = powerActs.length ? powerActs.reduce((s, a) => s + a.norm_power! / a.avg_power!, 0) / powerActs.length : null;
  const npActs    = acts.filter(a => a.norm_power != null);
  const avgNP     = npActs.length ? Math.round(npActs.reduce((s, a) => s + a.norm_power!, 0) / npActs.length) : null;

  const peakNPAct = npActs.reduce<Activity | null>((b, a) => !b || a.norm_power! > b.norm_power! ? a : b, null);
  const peakElevAct = acts
    .filter(a => (a.elevation_gain ?? 0) > 50)
    .reduce<Activity | null>((b, a) => !b || a.elevation_gain! > b.elevation_gain! ? a : b, null);
  const peakMaxHRAct = activities
    .filter(a => a.max_hr != null)
    .reduce<Activity | null>((b, a) => !b || a.max_hr! > b.max_hr! ? a : b, null);
  const bestVAMAct = acts
    .filter(a => (a.elevation_gain ?? 0) > 100 && a.duration_seconds > 0)
    .reduce<Activity | null>((b, a) => {
      const vam = a.elevation_gain! / (a.duration_seconds / 3600);
      return !b || vam > b.elevation_gain! / (b.duration_seconds / 3600) ? a : b;
    }, null);
  const bestPwHRAct = acts
    .filter(a => a.avg_power && a.avg_hr)
    .reduce<Activity | null>((b, a) => {
      const r = a.avg_power! / a.avg_hr!;
      return !b || r > b.avg_power! / b.avg_hr! ? a : b;
    }, null);
  const bestPaHRAct = acts
    .filter(a => getSport(a.sport_type) === "run" && a.avg_speed && a.avg_hr)
    .reduce<Activity | null>((b, a) => {
      const r = (a.avg_speed! * 60) / a.avg_hr!;
      return !b || r > (b.avg_speed! * 60) / b.avg_hr! ? a : b;
    }, null);

  // PMC
  const pmc = useMemo(() => computePMC(activities, period), [activities, period]);

  // Volume by week
  const distWeek = useMemo(() => byWeek(acts, a => +(a.distance_meters / 1000).toFixed(1)), [acts]);
  const durWeek  = useMemo(() => byWeek(acts, a => +(a.duration_seconds / 60).toFixed(0)), [acts]);
  const tssWeek  = useMemo(() => byWeek(acts, a => +(a.tss ?? 0).toFixed(1)), [acts]);
  const kjWeek   = useMemo(() => byWeek(acts, a => a.avg_power ? Math.round(a.avg_power * a.duration_seconds / 1000) : 0), [acts]);
  const elevWeek = useMemo(() => byWeek(acts, a => Math.round(a.elevation_gain ?? 0)), [acts]);

  const volData: Record<string, typeof distWeek> = {
    Distance: distWeek, Duration: durWeek, TSS: tssWeek, Kilojoules: kjWeek, Elevation: elevWeek,
  };
  const volUnit: Record<string, string>  = { Distance: "km", Duration: "min", TSS: "TSS", Kilojoules: "kJ", Elevation: "m" };
  const volColor: Record<string, string> = { Distance: C.dist, Duration: C.dur, TSS: C.tss, Kilojoules: C.kj, Elevation: "#8b7355" };

  // Health trend
  const hlthChart = useMemo(() =>
    [...hlth].reverse().map(h => ({
      label: new Date(h.date).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }),
      hrv: h.avg_hrv,
      rhr: h.resting_hr,
      weight: h.weight_grams ? +(h.weight_grams / 1000).toFixed(1) : null,
      sleep: h.sleep_duration_seconds ? +(h.sleep_duration_seconds / 3600).toFixed(1) : null,
      battery: h.body_battery_high,
      stress: h.avg_stress,
      spo2: h.avg_spo2,
      vo2: h.vo2_max,
    })), [hlth]);

  const hlthKey: Record<string, string> = {
    HRV: "hrv", "Resting HR": "rhr", Weight: "weight",
    Sleep: "sleep", "Body Battery": "battery", Stress: "stress", SpO2: "spo2", "VO2 Max": "vo2",
  };
  const hlthColor: Record<string, string> = {
    HRV: C.hrv, "Resting HR": C.rhr, Weight: C.weight,
    Sleep: C.sleep, "Body Battery": C.battery, Stress: C.stress, SpO2: "#7c3aed", "VO2 Max": "#2196a8",
  };
  const hlthUnit: Record<string, string> = {
    HRV: "ms", "Resting HR": "bpm", Weight: "kg",
    Sleep: "h", "Body Battery": "", Stress: "", SpO2: "%", "VO2 Max": "ml/kg/min",
  };

  // Peaks (all time)
  const peakHR    = activities.length ? Math.max(...activities.map(a => a.avg_hr ?? 0)) : 0;
  const peakPower = activities.length ? Math.max(...activities.map(a => a.avg_power ?? 0)) : 0;
  const bestPaceAct = activities
    .filter(a => a.distance_meters > 1000 && a.duration_seconds > 60)
    .reduce<Activity | null>((best, a) => {
      const pace = a.duration_seconds / (a.distance_meters / 1000);
      return !best || pace < best.duration_seconds / (best.distance_meters / 1000) ? a : best;
    }, null);
  const longestDistAct = activities.reduce<Activity | null>((b, a) => !b || a.distance_meters > b.distance_meters ? a : b, null);
  const longestDurAct  = activities.reduce<Activity | null>((b, a) => !b || a.duration_seconds > b.duration_seconds ? a : b, null);

  // Sport breakdown
  const sportMap = useMemo(() => {
    const map = new Map<string, { km: number; min: number; sessions: number }>();
    for (const a of acts) {
      const k = getSport(a.sport_type);
      const p = map.get(k) ?? { km: 0, min: 0, sessions: 0 };
      map.set(k, { km: p.km + a.distance_meters / 1000, min: p.min + a.duration_seconds / 60, sessions: p.sessions + 1 });
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({ sport: k, label: SPORT_LABELS[k] ?? k, color: SPORT_COLORS[k] ?? "#7a6f5a", ...v }))
      .sort((a, b) => b.km - a.km);
  }, [acts]);

  return (
    <div className="space-y-10 w-full">

      {/* ── Header ── */}
      <div className="flex items-end justify-between pb-5 border-b border-stone">
        <div>
          <p className="text-[8px] font-cinzel tracking-[0.5em] text-ash uppercase mb-1">Academia</p>
          <h1 className="text-[1.6rem] font-cinzel tracking-[0.08em] text-ink leading-none">Analytics</h1>
        </div>
        <div className="flex border border-stone overflow-hidden">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-2 text-[8px] font-cinzel tracking-[0.2em] uppercase transition-colors
                ${period === p ? "bg-gold/20 text-bronze" : "text-ash hover:text-ink"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summarium ── */}
      <div>
        <SectionTitle>Summarium</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Exercitationes" value={acts.length} unit="sessions" />
          <StatCard label="Distantia" value={totalDist.toFixed(0)} unit="km" />
          <StatCard label="Duratio" value={fmtDur(totalDur)} />
          <StatCard label="TSS" value={totalTSS.toFixed(0)} unit="load" />
        </div>
        {(totalKJ > 0 || totalElevGain > 0 || avgNP != null) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {totalKJ > 0 && <StatCard label="Kilojoules" value={totalKJ.toLocaleString()} unit="kJ" sub="avg_power × duration" />}
            {totalElevGain > 0 && (
              <StatCard
                label="Elevatio"
                value={totalElevGain >= 1000 ? (totalElevGain / 1000).toFixed(1) : Math.round(totalElevGain)}
                unit={totalElevGain >= 1000 ? "km" : "m"}
                sub="cumulative gain"
              />
            )}
            {avgNP != null && <StatCard label="Avg NP" value={avgNP} unit="W" sub="normalized power" />}
            {avgVI != null && <StatCard label="Avg VI" value={avgVI.toFixed(2)} sub="NP ÷ avg power" />}
          </div>
        )}
      </div>

      {/* ── PMC ── */}
      <div>
        <SectionTitle>Fitness · Fatiga · Forma</SectionTitle>
        <p className="text-[8px] font-cinzel text-ash/60 uppercase tracking-widest mb-4">
          CTL = fitness (42d) · ATL = fatiga (7d) · TSB = CTL − ATL
        </p>
        {pmc.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={pmc}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d4c9a830" vertical={false} />
              <XAxis dataKey="label" tick={AX} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={AX} axisLine={false} tickLine={false} width={32} />
              <Tooltip {...TIP} />
              <ReferenceLine y={0} stroke="#d4c9a860" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="CTL" stroke={C.ctl} dot={false} strokeWidth={2} name="CTL (Fitness)" />
              <Line type="monotone" dataKey="ATL" stroke={C.atl} dot={false} strokeWidth={2} name="ATL (Fatiga)" />
              <Line type="monotone" dataKey="TSB" stroke={C.tsb} dot={false} strokeWidth={1.5} strokeDasharray="5 3" name="TSB (Forma)" />
            </LineChart>
          </ResponsiveContainer>
        ) : <NoData />}
      </div>

      {/* ── Volume ── */}
      <div>
        <SectionTitle>Volume por Semana</SectionTitle>
        <Tabs options={["Distance", "Duration", "TSS", "Kilojoules", "Elevation"]} value={volTab} onChange={setVolTab} />
        {volData[volTab].length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={volData[volTab]} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#d4c9a830" vertical={false} />
              <XAxis dataKey="label" tick={AX} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={AX} axisLine={false} tickLine={false} width={38} unit={` ${volUnit[volTab]}`} />
              <Tooltip {...TIP} formatter={(v: number) => [`${v} ${volUnit[volTab]}`, volTab]} />
              <Bar dataKey="value" fill={volColor[volTab]} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <NoData />}
      </div>

      {/* ── Health ── */}
      <div>
        <SectionTitle>Saúde · Wellness</SectionTitle>
        <Tabs
          options={["HRV", "Resting HR", "Weight", "Sleep", "Body Battery", "Stress", "SpO2", "VO2 Max"]}
          value={hlthTab}
          onChange={setHlthTab}
        />
        {hlthChart.some(h => h[hlthKey[hlthTab] as keyof typeof h] != null) ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={hlthChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d4c9a830" vertical={false} />
              <XAxis dataKey="label" tick={AX} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={AX} axisLine={false} tickLine={false} width={38} unit={hlthUnit[hlthTab] ? ` ${hlthUnit[hlthTab]}` : undefined} />
              <Tooltip {...TIP} formatter={(v: number) => [`${v}${hlthUnit[hlthTab] ? " " + hlthUnit[hlthTab] : ""}`, hlthTab]} />
              <Line
                type="monotone"
                dataKey={hlthKey[hlthTab]}
                stroke={hlthColor[hlthTab]}
                dot={false}
                strokeWidth={2}
                connectNulls
                name={hlthTab}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : <NoData />}
      </div>

      {/* ── Peaks ── */}
      <div>
        <SectionTitle>Peak Performance · All Time</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {peakHR > 0 && (
            <PeakCard label="Peak Avg Heart Rate" value={`${peakHR} bpm`} sub="highest avg HR in a session" />
          )}
          {peakPower > 0 && (
            <PeakCard label="Peak Avg Power" value={`${peakPower} W`} sub="highest avg power in a session" />
          )}
          {bestPaceAct && (
            <PeakCard
              label="Best Pace"
              value={fmtPace(bestPaceAct.duration_seconds / (bestPaceAct.distance_meters / 1000))}
              sub={`${(bestPaceAct.distance_meters / 1000).toFixed(1)} km · ${bestPaceAct.name}`}
            />
          )}
          {longestDistAct && (
            <PeakCard
              label="Longest Workout (Distance)"
              value={`${(longestDistAct.distance_meters / 1000).toFixed(1)} km`}
              sub={longestDistAct.name}
            />
          )}
          {longestDurAct && (
            <PeakCard
              label="Longest Workout (Duration)"
              value={fmtDur(longestDurAct.duration_seconds)}
              sub={longestDurAct.name}
            />
          )}
          {activities.filter(a => a.tss != null).length > 0 && (
            <PeakCard
              label="Peak TSS (single session)"
              value={Math.max(...activities.map(a => a.tss ?? 0)).toFixed(0)}
              sub="highest single-session training load"
            />
          )}
          {peakNPAct && (
            <PeakCard
              label="Peak NP"
              value={`${peakNPAct.norm_power!.toFixed(0)} W`}
              sub={peakNPAct.name}
            />
          )}
          {peakMaxHRAct && (
            <PeakCard
              label="Peak Max HR"
              value={`${peakMaxHRAct.max_hr} bpm`}
              sub={peakMaxHRAct.name}
            />
          )}
          {peakElevAct && (
            <PeakCard
              label="Best Elevation Gain"
              value={`${Math.round(peakElevAct.elevation_gain!)} m`}
              sub={peakElevAct.name}
            />
          )}
        </div>
      </div>

      {/* ── Efficientiae ── */}
      {(powerActs.length > 0 || bestPaHRAct || bestVAMAct) && (
        <div>
          <SectionTitle>Efficientiae · Power &amp; Pacing</SectionTitle>
          <p className="text-[8px] font-cinzel text-ash/60 uppercase tracking-widest mb-4">
            VI = NP ÷ avg power · Pw:HR = W/bpm · Pa:HR = m·min⁻¹/bpm · VAM = m ascended/h
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {peakNPAct && avgVI != null && (
              <PeakCard
                label="Best NP · VI"
                value={`${peakNPAct.norm_power!.toFixed(0)} W · ${(peakNPAct.norm_power! / peakNPAct.avg_power!).toFixed(2)}`}
                sub={peakNPAct.name}
              />
            )}
            {avgVI != null && (
              <PeakCard
                label="Avg VI"
                value={avgVI.toFixed(2)}
                sub="NP ÷ avg power · 1.00 = perfectly even"
              />
            )}
            {bestPwHRAct && (
              <PeakCard
                label="Best Pw:HR (EF cycling)"
                value={`${(bestPwHRAct.avg_power! / bestPwHRAct.avg_hr!).toFixed(2)} W/bpm`}
                sub={bestPwHRAct.name}
              />
            )}
            {bestPaHRAct && (
              <PeakCard
                label="Best Pa:HR (EF running)"
                value={`${((bestPaHRAct.avg_speed! * 60) / bestPaHRAct.avg_hr!).toFixed(2)} m·min⁻¹/bpm`}
                sub={bestPaHRAct.name}
              />
            )}
            {bestVAMAct && (
              <PeakCard
                label="Best VAM"
                value={`${Math.round(bestVAMAct.elevation_gain! / (bestVAMAct.duration_seconds / 3600))} m/h`}
                sub={bestVAMAct.name}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Sport breakdown ── */}
      {sportMap.length > 0 && (
        <div>
          <SectionTitle>Sport Breakdown</SectionTitle>
          <Tabs options={["Distance", "Duration", "Sessions"]} value={sportTab} onChange={setSportTab} />
          <div className="grid grid-cols-[1fr_200px] gap-6 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                layout="vertical"
                data={sportMap}
                barCategoryGap="25%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#d4c9a830" horizontal={false} />
                <XAxis
                  type="number"
                  tick={AX}
                  axisLine={false}
                  tickLine={false}
                  unit={sportTab === "Distance" ? " km" : sportTab === "Duration" ? " min" : ""}
                />
                <YAxis type="category" dataKey="label" tick={AX} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  {...TIP}
                  formatter={(v: number) =>
                    [`${sportTab === "Distance" ? v.toFixed(1) + " km" : sportTab === "Duration" ? Math.round(v) + " min" : v + " sessions"}`, sportTab]
                  }
                />
                <Bar
                  dataKey={sportTab === "Distance" ? "km" : sportTab === "Duration" ? "min" : "sessions"}
                  radius={[0, 2, 2, 0]}
                >
                  {sportMap.map((entry) => (
                    <Cell key={entry.sport} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="space-y-2">
              {sportMap.map(s => (
                <div key={s.sport} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[9px] font-cinzel text-ash">{s.label}</span>
                  </div>
                  <span className="text-[9px] font-cinzel text-ink">
                    {sportTab === "Distance" ? `${s.km.toFixed(0)} km`
                      : sportTab === "Duration" ? `${Math.round(s.min / 60)}h`
                      : `${s.sessions}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Coming soon ── */}
      <div>
        <SectionTitle>Coming Soon · Requires Granular Data</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            "Time in HR Zones", "Time in Power Zones", "Time in Speed Zones",
            "Peak Cadence", "Power Profile / Curve", "NGP (Normalized Graded Pace)",
            "Peak Pace by Distance", "Race Reports", "HR Zones by Week",
          ].map(label => (
            <div key={label} className="border border-stone/30 border-dashed p-3 opacity-40">
              <p className="text-[8px] font-cinzel tracking-[0.2em] text-ash uppercase">{label}</p>
              <p className="text-[7px] font-cinzel text-ash/50 mt-1">lap / stream data needed</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
