import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  RefreshCw, Bike, Waves, Dumbbell, Activity as ActivityIcon, Zap, BrainCircuit,
} from "lucide-react";
import { activitiesApi, syncApi, agentApi } from "../services/api";
import type { Activity } from "../types";
import { useTheme, useChartColors } from "../contexts/ThemeContext";

// ── helpers ────────────────────────────────────────────────────────────────

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function sportIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("cycl") || t.includes("bike") || t.includes("ride")) return Bike;
  if (t.includes("swim")) return Waves;
  if (t.includes("strength") || t.includes("gym") || t.includes("weight")) return Dumbbell;
  if (t.includes("hiit") || t.includes("circuit")) return Zap;
  return ActivityIcon;
}

// ── sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label, value, unit, subtitle, progress,
}: {
  label: string; value: string | number; unit?: string; subtitle: string; progress: number;
}) {
  return (
    <div className="bg-tablet border border-stone p-5 flex flex-col gap-2">
      <p className="text-[8px] font-cinzel tracking-[0.45em] text-ash uppercase">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-cinzel text-ink leading-none">{value}</span>
        {unit && <span className="text-sm font-cinzel text-ash">{unit}</span>}
      </div>
      <div className="h-[2px] bg-stone/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-gold rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
      <p className="text-[9px] font-cinzel text-ash/70 italic">{subtitle}</p>
    </div>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  const Icon = sportIcon(a.sport_type);
  return (
    <div className="flex items-center gap-3 py-3 border-b border-stone/40 last:border-0">
      <div className="w-9 h-9 bg-stone/30 flex items-center justify-center rounded-sm flex-shrink-0">
        <Icon size={15} className="text-bronze" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-cinzel text-ink truncate leading-tight">
          {a.name || a.sport_type}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-[9px] font-cinzel text-ash">
          <span>{fmtDuration(a.duration_seconds)}</span>
          {a.distance_meters > 0 && (
            <>
              <span className="text-stone">·</span>
              <span>{(a.distance_meters / 1000).toFixed(1)} km</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { isDark } = useTheme();
  const ch = useChartColors(isDark);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [syncing, setSyncing]       = useState(false);
  const [analysis, setAnalysis]     = useState("");
  const [analysing, setAnalysing]   = useState(false);
  const [period, setPeriod]         = useState<"week" | "month">("week");

  useEffect(() => {
    activitiesApi.list().then(setActivities).catch(() => {});
  }, []);

  const weekStart = getWeekStart();
  const cutoff = period === "week"
    ? weekStart
    : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const periodActivities = activities.filter((a) => new Date(a.start_date) >= cutoff);

  const recent   = periodActivities;
  const sessio   = recent.length;
  const totalKm  = recent.reduce((s, a) => s + a.distance_meters / 1000, 0);
  const totalTss = recent.reduce((s, a) => s + (a.tss ?? 0), 0);

  const chartData = period === "week"
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const label = d.toLocaleDateString("pt-PT", { weekday: "short" });
        const min = activities
          .filter((a) => new Date(a.start_date).toDateString() === d.toDateString())
          .reduce((s, a) => s + Math.round(a.duration_seconds / 60), 0);
        return { day: label, min };
      })
    : Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const label = d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
        const min = activities
          .filter((a) => new Date(a.start_date).toDateString() === d.toDateString())
          .reduce((s, a) => s + Math.round(a.duration_seconds / 60), 0);
        return { day: label, min };
      });

  const AX  = { fontSize: 9, fill: ch.axis, fontFamily: "Cinzel, serif" };
  const TIP = {
    contentStyle: { background: ch.tooltipBg, border: `1px solid ${ch.tooltipBorder}`, fontFamily: "Cinzel, serif", fontSize: 10 },
    cursor: { fill: ch.cursor },
  };

  const weeklyGradient = isDark
    ? "linear-gradient(135deg, #16120a 0%, #2b2210 45%, #45350f 100%)"
    : "linear-gradient(135deg, #f5efdd 0%, #ecdfbc 45%, #d5bd85 100%)";
  const weeklyLineColor = isDark ? "#dcb75f" : "#8a5f14";

  async function handleSync() {
    setSyncing(true);
    await syncApi.trigger().catch(() => {});
    setSyncing(false);
    activitiesApi.list().then(setActivities).catch(() => {});
  }

  async function handleAnalyse() {
    if (analysing || !recent.length) return;
    setAnalysing(true);
    const summary = recent
      .map((a) =>
        `${a.name || a.sport_type}: ${(a.distance_meters / 1000).toFixed(1)}km, ` +
        `${Math.round(a.duration_seconds / 60)}min, HR ${a.avg_hr ?? "N/A"}, TSS ${a.tss?.toFixed(0) ?? "N/A"}`
      )
      .join("\n");
    const reply = await agentApi
      .chat(`Analyse my last ${sessio} training sessions and give a short coaching insight (2–3 sentences):\n${summary}`)
      .catch(() => ({ reply: "Analysis unavailable.", conversation_id: 0 }));
    setAnalysis(typeof reply === "string" ? reply : reply.reply);
    setAnalysing(false);
  }

  return (
    <div className="space-y-6">

      {/* ── Top bar ── */}
      <div className="flex items-end justify-between pb-5 border-b border-stone">
        <div>
          <p className="text-[8px] font-cinzel tracking-[0.5em] text-ash uppercase mb-1">Gymnasium</p>
          <h1 className="text-[1.6rem] font-cinzel tracking-[0.08em] text-ink leading-none">Dashboard</h1>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-[9px] font-cinzel tracking-[0.25em] uppercase border border-stone text-ash hover:text-ink hover:border-ink disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Synchronise"}
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Exercitationes"
          value={sessio}
          unit="Sessio"
          subtitle={period === "week" ? (sessio >= 5 ? "Strong training week" : "Keep building consistency") : `${sessio} sessions this month`}
          progress={(sessio / (period === "week" ? 7 : 25)) * 100}
        />
        <StatCard
          label="Distantia"
          value={totalKm.toFixed(1)}
          unit="km"
          subtitle={totalKm >= 80 ? "Peak performance reached" : "Building volume"}
          progress={(totalKm / 100) * 100}
        />
        <StatCard
          label="TSS"
          value={totalTss.toFixed(0)}
          unit="Stress"
          subtitle={totalTss >= 500 ? "Sustainable volume" : "Room to load more"}
          progress={(totalTss / (period === "week" ? 700 : 3000)) * 100}
        />
      </div>

      {/* ── Middle grid ── */}
      <div className="grid grid-cols-[1fr_280px] gap-4">

        {/* Chart */}
        <div className="bg-tablet border border-stone p-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-[13px] font-cinzel tracking-[0.08em] text-ink">Exercitationes — Duratio</h2>
              <p className="text-[9px] font-cinzel text-ash/70 tracking-widest mt-0.5">Training intensity per day</p>
            </div>
            <div className="flex border border-stone text-[8px] font-cinzel tracking-[0.25em] uppercase overflow-hidden">
              {(["week", "month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 transition-colors ${period === p ? "bg-gold/20 text-bronze" : "text-ash hover:text-ink"}`}
                >
                  {p === "week" ? "VII Dies" : "XXX Dies"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
                <XAxis dataKey="day" tick={AX} axisLine={false} tickLine={false} interval={period === "month" ? 4 : 0} />
                <YAxis tick={AX} axisLine={false} tickLine={false} width={28} />
                <Tooltip {...TIP} formatter={(v: number) => [`${v} min`, "Duration"]} />
                <Bar dataKey="min" fill={isDark ? "#dcb75f" : "#c19a3d"} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent activities */}
        <div className="bg-tablet border border-stone p-5 flex flex-col">
          <h2 className="text-[11px] font-cinzel tracking-[0.2em] text-ink uppercase mb-4 flex items-center gap-2">
            <ActivityIcon size={13} className="text-bronze" strokeWidth={1.5} />
            Acta Recentia
          </h2>
          <div className="flex-1">
            {activities.slice(0, 4).map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
            {activities.length === 0 && (
              <p className="text-[10px] font-cinzel text-ash/60 italic">Nulla exercitatio — synchronise.</p>
            )}
          </div>
          <a
            href="/activities"
            className="mt-4 block text-center text-[8px] font-cinzel tracking-[0.4em] uppercase border border-stone text-ash hover:text-ink hover:border-ink transition-colors py-2"
          >
            Spectare Omnia
          </a>
        </div>
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-[1fr_280px] gap-4">

        {/* Weekly insight card */}
        <div
          className="border border-stone p-6 flex flex-col justify-end min-h-[200px] relative overflow-hidden"
          style={{ background: weeklyGradient }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: `repeating-linear-gradient(0deg, ${weeklyLineColor} 0px, transparent 1px, transparent 24px)` }}
          />
          <div className="meander absolute top-4 left-6 right-6" />
          <div className="relative">
            <p className="text-[8px] font-cinzel tracking-[0.5em] text-bronze uppercase mb-2">Weekly Insight</p>
            <h2 className="text-2xl font-cinzel gold-shimmer tracking-[0.05em] leading-tight">
              Vigor et<br />Disciplina
            </h2>
          </div>
        </div>

        {/* Mensa Analytica */}
        <div className="bg-tablet border border-stone p-5 flex flex-col">
          <h2 className="text-[11px] font-cinzel tracking-[0.2em] text-ink uppercase mb-3 flex items-center gap-2">
            <BrainCircuit size={13} className="text-bronze" strokeWidth={1.5} />
            Mensa Analytica
          </h2>
          {analysis ? (
            <p className="text-[10px] font-cinzel text-ash leading-relaxed flex-1">{analysis}</p>
          ) : (
            <p className="text-[10px] font-cinzel text-ash/60 italic flex-1">
              {recent.length
                ? "Request a coaching insight from Claudius based on your recent sessions."
                : "Sync your activities first to enable analysis."}
            </p>
          )}
          <button
            onClick={handleAnalyse}
            disabled={analysing || !recent.length}
            className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-bronze text-parchment text-[9px] font-cinzel tracking-[0.25em] uppercase hover:bg-ink disabled:opacity-40 transition-colors"
          >
            <BrainCircuit size={11} />
            {analysing ? "Analysing..." : "Full Analysis"}
          </button>
        </div>

      </div>
    </div>
  );
}
