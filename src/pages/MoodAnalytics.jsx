import React, { useEffect, useState, useMemo, useRef } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import "./moodanalytics.css";

const MOOD_META = {
  "😊": { label: "Happy",      color: "#f6c90e", positive: true  },
  "😢": { label: "Sad",        color: "#74b9ff", positive: false },
  "😡": { label: "Angry",      color: "#ff7675", positive: false },
  "😌": { label: "Calm",       color: "#55efc4", positive: true  },
  "😰": { label: "Anxious",    color: "#a29bfe", positive: false },
  "🥳": { label: "Excited",    color: "#fd79a8", positive: true  },
  "😴": { label: "Tired",      color: "#b2bec3", positive: false },
  "🤔": { label: "Thoughtful", color: "#fdcb6e", positive: true  },
};

/* load Chart.js from CDN once */
function loadChartJs() {
  return new Promise((res) => {
    if (window.Chart) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    s.onload = res;
    document.head.appendChild(s);
  });
}

export default function MoodAnalytics() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range,   setRange]   = useState("30"); // "7" | "30" | "90" | "all"

  const donutRef = useRef(null);
  const barRef   = useRef(null);
  const donutChart = useRef(null);
  const barChart   = useRef(null);

  /* ── fetch entries ── */
  useEffect(() => {
    let unsubE = null;
    const unsubA = onAuthStateChanged(auth, (user) => {
      if (!user) { setLoading(false); return; }
      const q = query(
        collection(db, "entries"),
        where("userId",   "==", user.uid),
        where("archived", "==", false),
        where("draft",    "==", false),
        orderBy("createdAt", "desc")
      );
      unsubE = onSnapshot(q, (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (e) => { console.error(e); setLoading(false); });
    });
    return () => { unsubA(); if (unsubE) unsubE(); };
  }, []);

  /* ── filter by range ── */
  const filtered = useMemo(() => {
    if (range === "all") return entries;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(range));
    return entries.filter((e) => e.createdAt && e.createdAt.toDate() >= cutoff);
  }, [entries, range]);

  const withMood = filtered.filter((e) => e.mood);

  const moodCounts = useMemo(() => {
    const c = {};
    withMood.forEach((e) => { c[e.mood] = (c[e.mood] || 0) + 1; });
    return c;
  }, [withMood]);

  const sorted       = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
  const maxCount     = sorted[0]?.[1] || 1;
  const positiveRate = withMood.length
    ? Math.round((withMood.filter((e) => MOOD_META[e.mood]?.positive).length / withMood.length) * 100)
    : 0;
  const topMood = sorted[0]?.[0];

  /* ── this week grid ── */
  const weekGrid = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayE = entries.filter((e) =>
        e.createdAt && e.createdAt.toDate().toISOString().slice(0, 10) === key
      );
      const mood = dayE.find((e) => e.mood)?.mood || null;
      days.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: d.getDate(), mood, count: dayE.length
      });
    }
    return days;
  }, [entries]);

  /* ── weekly % breakdown (last 7 days) ── */
  const weekMoodBreakdown = useMemo(() => {
    const week = new Date(); week.setDate(week.getDate() - 7);
    const weekEntries = entries.filter((e) => e.mood && e.createdAt && e.createdAt.toDate() >= week);
    const total = weekEntries.length || 1;
    const c = {};
    weekEntries.forEach((e) => { c[e.mood] = (c[e.mood] || 0) + 1; });
    return Object.entries(c)
      .sort((a,b) => b[1]-a[1])
      .map(([emoji, cnt]) => ({
        emoji, label: MOOD_META[emoji]?.label, pct: Math.round((cnt/total)*100), color: MOOD_META[emoji]?.color
      }));
  }, [entries]);

  /* ── Chart.js donut ── */
  useEffect(() => {
    if (!sorted.length) return;
    loadChartJs().then(() => {
      if (!donutRef.current) return;
      if (donutChart.current) donutChart.current.destroy();
      donutChart.current = new window.Chart(donutRef.current, {
        type: "doughnut",
        data: {
          labels: sorted.map(([e]) => `${e} ${MOOD_META[e]?.label || e}`),
          datasets: [{
            data:            sorted.map(([,c]) => c),
            backgroundColor: sorted.map(([e]) => MOOD_META[e]?.color || "#ccc"),
            borderWidth: 3,
            borderColor: "var(--surface, #fff)",
          }]
        },
        options: {
          cutout: "68%",
          plugins: {
            legend: {
              position: "right",
              labels: { color: "var(--text, #111)", font: { size: 13 }, padding: 14, boxWidth: 14 }
            },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}×` } }
          },
          animation: { animateRotate: true, duration: 700 }
        }
      });
    });
    return () => { if (donutChart.current) donutChart.current.destroy(); };
  }, [sorted]);

  /* ── Chart.js bar (weekly summary) ── */
  useEffect(() => {
    if (!weekMoodBreakdown.length) return;
    loadChartJs().then(() => {
      if (!barRef.current) return;
      if (barChart.current) barChart.current.destroy();
      barChart.current = new window.Chart(barRef.current, {
        type: "bar",
        data: {
          labels: weekMoodBreakdown.map((m) => `${m.emoji} ${m.label}`),
          datasets: [{
            label: "% of entries",
            data:  weekMoodBreakdown.map((m) => m.pct),
            backgroundColor: weekMoodBreakdown.map((m) => m.color),
            borderRadius: 6,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "var(--text2, #666)", font: { size: 12 } }, grid: { display: false } },
            y: {
              beginAtZero: true, max: 100,
              ticks: { color: "var(--text2, #666)", callback: (v) => `${v}%` },
              grid: { color: "var(--border, #eee)" }
            }
          },
          animation: { duration: 600 }
        }
      });
    });
    return () => { if (barChart.current) barChart.current.destroy(); };
  }, [weekMoodBreakdown]);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div className="mood-analytics">
      <div className="ma-header">
        <h2>📊 Mood Analytics</h2>
        <div className="range-tabs">
          {[["7","7d"],["30","30d"],["90","90d"],["all","All"]].map(([v,l]) => (
            <button key={v} className={`range-tab ${range===v?"active":""}`} onClick={() => setRange(v)}>{l}</button>
          ))}
        </div>
      </div>

      {withMood.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No mood data yet</h3>
          <p>Select a mood when writing entries to see analytics here.</p>
        </div>
      ) : (
        <>
          {/* ── SUMMARY CARDS ── */}
          <div className="ma-cards">
            <div className="ma-card">
              <span className="ma-card-icon">{topMood}</span>
              <div>
                <div className="ma-card-val">{MOOD_META[topMood]?.label || "—"}</div>
                <div className="ma-card-lbl">Top Mood</div>
              </div>
            </div>
            <div className="ma-card">
              <span className="ma-card-icon">😊</span>
              <div>
                <div className="ma-card-val">{positiveRate}%</div>
                <div className="ma-card-lbl">Positive Rate</div>
              </div>
            </div>
            <div className="ma-card">
              <span className="ma-card-icon">📝</span>
              <div>
                <div className="ma-card-val">{withMood.length}</div>
                <div className="ma-card-lbl">Tracked</div>
              </div>
            </div>
            <div className="ma-card">
              <span className="ma-card-icon">🌈</span>
              <div>
                <div className="ma-card-val">{sorted.length}</div>
                <div className="ma-card-lbl">Moods Used</div>
              </div>
            </div>
          </div>

          {/* ── THIS WEEK GRID ── */}
          <div className="chart-card">
            <h3>This Week</h3>
            <div className="week-grid">
              {weekGrid.map((d, i) => (
                <div key={i} className={`week-cell ${d.mood ? "has-mood" : ""}`}
                  title={d.mood ? `${MOOD_META[d.mood]?.label} · ${d.count} entr${d.count===1?"y":"ies"}` : "No entry"}>
                  <span className="wc-emoji">{d.mood || "·"}</span>
                  <span className="wc-day">{d.day}</span>
                  <span className="wc-date">{d.date}</span>
                  {d.count > 0 && <span className="wc-badge">{d.count}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="charts-row">
            {/* ── DONUT ── */}
            <div className="chart-card chart-card-half">
              <h3>Mood Distribution</h3>
              <div className="donut-wrap">
                <canvas ref={donutRef} />
                {topMood && (
                  <div className="donut-center">
                    <span className="donut-emoji">{topMood}</span>
                    <span className="donut-label">{MOOD_META[topMood]?.label}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── WEEKLY % BAR ── */}
            <div className="chart-card chart-card-half">
              <h3>This Week's Breakdown</h3>
              {weekMoodBreakdown.length === 0 ? (
                <p className="no-data">No mood data this week</p>
              ) : (
                <div className="bar-wrap">
                  <canvas ref={barRef} />
                </div>
              )}
            </div>
          </div>

          {/* ── HORIZONTAL BARS ── */}
          <div className="chart-card">
            <h3>All Moods ({range === "all" ? "all time" : `last ${range} days`})</h3>
            <div className="hbar-list">
              {sorted.map(([emoji, count]) => (
                <div key={emoji} className="hbar-row">
                  <span className="hbar-emoji">{emoji}</span>
                  <div className="hbar-track">
                    <div
                      className="hbar-fill"
                      style={{
                        width: `${(count/maxCount)*100}%`,
                        background: MOOD_META[emoji]?.color || "var(--primary)"
                      }}
                    />
                  </div>
                  <span className="hbar-count">{count}×</span>
                  <span className="hbar-name">{MOOD_META[emoji]?.label}</span>
                  <span className="hbar-pct">{Math.round((count/withMood.length)*100)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── POSITIVITY BAR ── */}
          <div className="chart-card">
            <h3>Overall Positivity</h3>
            <div className="pos-track">
              <div className="pos-fill" style={{ width: `${positiveRate}%` }} />
            </div>
            <p className="pos-label">
              <strong>{positiveRate}%</strong> of your tracked entries have a positive mood
              {positiveRate >= 70 ? " 🌟 Wonderful!" : positiveRate >= 40 ? " 💪 Keep going!" : " 💙 All emotions are valid."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}