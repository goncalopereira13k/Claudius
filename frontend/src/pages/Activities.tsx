import { useEffect, useState } from "react";
import { activitiesApi } from "../services/api";
import type { Activity } from "../types";

const PAGE_SIZE = 12;

export default function Activities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [analysing, setAnalysing] = useState<number | null>(null);
  const [analyses, setAnalyses] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    activitiesApi.list().then(setActivities).catch(() => {});
  }, []);

  async function handleAnalyse(id: number) {
    setAnalysing(id);
    const res = await activitiesApi.analyse(id).catch(() => ({ analysis: "Errore in analysi." }));
    setAnalyses((prev) => ({ ...prev, [id]: res.analysis }));
    setAnalysing(null);
  }

  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const paged = activities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-cinzel tracking-widest uppercase">Treinos</h1>
        {activities.length > 0 && (
          <span className="text-[10px] font-cinzel tracking-[0.2em] text-ash uppercase">
            {activities.length} actividades
          </span>
        )}
      </div>

      {activities.length === 0 ? (
        <p className="text-ash text-sm font-cinzel p-6 tracking-wide border border-stone">
          Nulla exercitatio — synchronise in Dashboard.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paged.map((a) => (
              <div key={a.id} className="border border-stone p-5 hover:bg-tablet transition-colors flex flex-col">
                <div className="flex-1">
                  <p className="font-cinzel text-sm tracking-wide leading-snug">{a.name || a.sport_type}</p>
                  <p className="text-[10px] font-cinzel tracking-[0.12em] text-ash mt-1 uppercase">
                    {new Date(a.start_date).toLocaleDateString("pt-PT")}
                  </p>
                  <p className="text-[10px] font-cinzel tracking-[0.12em] text-ash uppercase">{a.source}</p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-cinzel text-ash">
                    {a.distance_meters > 0 && (
                      <span>{(a.distance_meters / 1000).toFixed(1)} km</span>
                    )}
                    {a.avg_hr && <span>FC {a.avg_hr}</span>}
                    {a.avg_power && <span>{a.avg_power} W</span>}
                    {a.tss && <span>TSS {a.tss.toFixed(0)}</span>}
                  </div>

                  {analyses[a.id] && (
                    <div className="mt-4 border border-stone bg-parchment p-3 text-xs text-ink whitespace-pre-wrap leading-relaxed">
                      <p className="text-[9px] font-cinzel tracking-[0.3em] text-ash uppercase mb-2">Analysis · Claudius</p>
                      {analyses[a.id]}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleAnalyse(a.id)}
                  disabled={analysing === a.id}
                  className="mt-4 text-[10px] font-cinzel tracking-[0.2em] uppercase text-bronze hover:text-ink disabled:opacity-40 transition-colors text-left"
                >
                  {analysing === a.id ? "Analysing..." : "Analyse →"}
                </button>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-6 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-[10px] font-cinzel tracking-[0.2em] uppercase text-bronze hover:text-ink disabled:opacity-30 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-[10px] font-cinzel tracking-[0.2em] text-ash uppercase">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-[10px] font-cinzel tracking-[0.2em] uppercase text-bronze hover:text-ink disabled:opacity-30 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
