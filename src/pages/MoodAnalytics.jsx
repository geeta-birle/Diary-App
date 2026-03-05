import React, { useEffect, useState, useMemo } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import "./moodanalytics.css";

const MOODS = {
  "😊":"Happy","😢":"Sad","😡":"Angry","😌":"Calm",
  "😰":"Anxious","🥳":"Excited","😴":"Tired","🤔":"Thoughtful"
};
const MOOD_COLORS = {
  "😊":"#f6c90e","😢":"#74b9ff","😡":"#ff7675","😌":"#55efc4",
  "😰":"#a29bfe","🥳":"#fd79a8","😴":"#636e72","🤔":"#fdcb6e"
};
const POSITIVE_MOODS = new Set(["😊","🥳","😌"]);

export default function MoodAnalytics() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const withMood   = entries.filter((e) => e.mood);
  const moodCounts = useMemo(() => {
    const c = {};
    withMood.forEach((e) => { c[e.mood] = (c[e.mood] || 0) + 1; });
    return c;
  }, [withMood]);

  const sorted     = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
  const topMood    = sorted[0];
  const maxCount   = sorted[0]?.[1] || 1;

  const positiveRate = withMood.length
    ? Math.round((withMood.filter((e) => POSITIVE_MOODS.has(e.mood)).length / withMood.length) * 100)
    : 0;

  // last 30 days timeline
  const last30 = useMemo(() => {
    const days = [];
    const now  = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayEntries = entries.filter((e) => {
        if (!e.createdAt) return false;
        return e.createdAt.toDate().toISOString().slice(0, 10) === key;
      });
      const mood = dayEntries.find((e) => e.mood)?.mood || null;
      days.push({ key, day: d.getDate(), mood });
    }
    return days;
  }, [entries]);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  if (withMood.length === 0) return (
    <div className="mood-analytics">
      <h2>📊 Mood Analytics</h2>
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <h3>No mood data yet</h3>
        <p>Start selecting a mood when writing entries to see analytics here.</p>
      </div>
    </div>
  );

  return (
    <div className="mood-analytics">
      <h2>📊 Mood Analytics</h2>

      {/* ── SUMMARY CARDS ── */}
      <div className="mood-summary-grid">
        <div className="mood-summary-card">
          <div className="ms-icon">{topMood?.[0]}</div>
          <div className="ms-label">Top Mood</div>
          <div className="ms-value">{MOODS[topMood?.[0]] || "—"}</div>
        </div>
        <div className="mood-summary-card">
          <div className="ms-icon">😊</div>
          <div className="ms-label">Positive Rate</div>
          <div className="ms-value">{positiveRate}%</div>
        </div>
        <div className="mood-summary-card">
          <div className="ms-icon">📝</div>
          <div className="ms-label">Tracked Entries</div>
          <div className="ms-value">{withMood.length}</div>
        </div>
        <div className="mood-summary-card">
          <div className="ms-icon">🌈</div>
          <div className="ms-label">Moods Used</div>
          <div className="ms-value">{sorted.length}</div>
        </div>
      </div>

      {/* ── BAR CHART ── */}
      <div className="chart-section">
        <div className="section-title">Mood Distribution</div>
        <div className="bar-chart">
          {sorted.map(([emoji, count]) => (
            <div key={emoji} className="bar-row">
              <span className="bar-emoji">{emoji}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${(count / maxCount) * 100}%`,
                    background: MOOD_COLORS[emoji] || "var(--primary)"
                  }}
                />
              </div>
              <span className="bar-count">{count}×</span>
              <span className="bar-name">{MOODS[emoji]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── LAST 30 DAYS TIMELINE ── */}
      <div className="chart-section">
        <div className="section-title">Last 30 Days</div>
        <div className="timeline-row">
          {last30.map((d) => (
            <div key={d.key} className="timeline-cell" title={`${d.key}: ${d.mood ? MOODS[d.mood] : "No entry"}`}>
              <span className="tl-emoji">{d.mood || "·"}</span>
              <span className="tl-day">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── POSITIVE RATE BAR ── */}
      <div className="chart-section">
        <div className="section-title">Overall Positivity</div>
        <div className="positivity-track">
          <div className="positivity-bar" style={{ width: `${positiveRate}%` }} />
        </div>
        <p className="positivity-label">
          {positiveRate}% of your tracked entries have a positive mood
          {positiveRate >= 70 ? " 🌟 Keep it up!" : positiveRate >= 40 ? " 💪 You're doing great!" : " 💙 It's okay to feel all emotions."}
        </p>
      </div>
    </div>
  );
}