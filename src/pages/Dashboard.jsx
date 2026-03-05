import React, { useEffect, useState, useMemo } from "react";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  collection, query, where, orderBy, onSnapshot,
  deleteDoc, doc, updateDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useToast, ConfirmModal, useSearch } from "./Main";
import "./dashboard.css";

const MOODS = {
  "😊": "Happy",  "😢": "Sad",  "😡": "Angry",  "😌": "Calm",
  "😰": "Anxious","🥳": "Excited","😴": "Tired","🤔": "Thoughtful"
};

/* ── helpers ── */
const startOfDay  = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const daysBetween = (a, b) => Math.floor((b - a) / 86400000);

function buildHeatmap(entries) {
  const map = {};
  entries.forEach((e) => {
    if (!e.createdAt) return;
    const key = startOfDay(e.createdAt.toDate()).toISOString().slice(0, 10);
    map[key] = (map[key] || 0) + 1;
  });
  // last 105 days (15 weeks)
  const days = [];
  const now = new Date();
  for (let i = 104; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = startOfDay(d).toISOString().slice(0, 10);
    days.push({ date: key, count: map[key] || 0 });
  }
  return days;
}

/* ══════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════ */
export default function Dashboard() {
  const navigate   = useNavigate();
  const addToast   = useToast();
  const searchQuery = useSearch();

  const [entries,      setEntries]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [user,         setUser]         = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* ── real-time fetch ── */
  useEffect(() => {
    let unsubEntries = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { setLoading(false); return; }
      setUser(u);
      const q = query(
        collection(db, "entries"),
        where("userId",   "==", u.uid),
        where("archived", "==", false),
        where("draft",    "==", false),
        orderBy("createdAt", "desc")
      );
      unsubEntries = onSnapshot(q, (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => { console.error(err); setLoading(false); });
    });
    return () => { unsubAuth(); if (unsubEntries) unsubEntries(); };
  }, []);

  /* ── computed stats ── */
  const stats = useMemo(() => {
    const now      = new Date();
    const today    = startOfDay(now);
    const week     = new Date(now); week.setDate(week.getDate() - 7);
    const month    = new Date(now); month.setDate(month.getDate() - 30);

    const thisWeek  = entries.filter((e) => e.createdAt && e.createdAt.toDate() >= week);
    const thisMonth = entries.filter((e) => e.createdAt && e.createdAt.toDate() >= month);
    const wroteToday = entries.some((e) => e.createdAt && startOfDay(e.createdAt.toDate()).getTime() === today.getTime());

    // streak
    const writtenDays = new Set(
      entries.map((e) => e.createdAt ? startOfDay(e.createdAt.toDate()).toISOString() : null).filter(Boolean)
    );
    let streak = 0;
    for (let i = 0; i <= 365; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      if (writtenDays.has(d.toISOString())) streak++;
      else if (i > 0) break;
    }

    // top mood
    const moodCount = {};
    entries.forEach((e) => { if (e.mood) moodCount[e.mood] = (moodCount[e.mood] || 0) + 1; });
    const topMood = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];

    // happiest day this month (most "happy" mood entries in a single day)
    const dayMoods = {};
    thisMonth.forEach((e) => {
      if (!e.createdAt) return;
      const key = startOfDay(e.createdAt.toDate()).toISOString().slice(0,10);
      if (!dayMoods[key]) dayMoods[key] = 0;
      if (e.mood === "😊" || e.mood === "🥳") dayMoods[key]++;
    });
    const happiestDay = Object.entries(dayMoods).sort((a,b) => b[1]-a[1])[0];

    // weekly mood summary (last 7 days buckets)
    const weekMoods = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      const dayEntries = entries.filter((e) =>
        e.createdAt && startOfDay(e.createdAt.toDate()).toISOString().slice(0,10) === key
      );
      const mood = dayEntries[0]?.mood || null;
      return { label: d.toLocaleDateString("en-US", { weekday: "short" }), mood, count: dayEntries.length };
    });

    return { thisWeek: thisWeek.length, streak, topMood, wroteToday, happiestDay, weekMoods, thisMonth: thisMonth.length };
  }, [entries]);

  const heatmap = useMemo(() => buildHeatmap(entries), [entries]);

  /* ── search filter ── */
  const filtered = entries.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.title?.toLowerCase().includes(q) || e.content?.toLowerCase().includes(q);
  });

  /* ── actions ── */
  const handleDelete = async (id) => {
    try { await deleteDoc(doc(db, "entries", id)); addToast("Entry deleted", "success"); }
    catch { addToast("Failed to delete", "error"); }
    setDeleteTarget(null);
  };

  const handleArchive = async (id) => {
    try { await updateDoc(doc(db, "entries", id), { archived: true }); addToast("Entry archived", "info"); }
    catch { addToast("Failed to archive", "error"); }
  };

  /* ── greeting ── */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="dashboard">
      {deleteTarget && (
        <ConfirmModal
          message="Are you sure you want to delete this entry? This cannot be undone."
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── HEADER ── */}
      <div className="dashboard-header">
        <div>
          <h2>{greeting}{user?.displayName ? `, ${user.displayName}` : ""} 👋</h2>
          <p className="user-email">{user?.email}</p>
        </div>
        <button className="new-entry-btn" onClick={() => navigate("/app/new-entry")}>
          ✏️ New Entry
        </button>
      </div>

      {/* ── STATS ── */}
      <div className="stats-grid">
        <StatCard icon="📖" value={entries.length}       label="Total Entries"  loading={loading} />
        <StatCard icon="📅" value={stats.thisWeek}       label="This Week"      loading={loading} />
        <StatCard
          icon={stats.topMood ? stats.topMood[0] : "✨"}
          value={stats.topMood ? MOODS[stats.topMood[0]] : "—"}
          label="Top Mood"
          loading={loading}
        />
        <StatCard
          icon={stats.wroteToday ? "🔥" : "💤"}
          value={stats.streak > 0 ? `${stats.streak}d` : "—"}
          label={stats.wroteToday ? "Active Streak" : "Rest Day"}
          loading={loading}
          highlight={stats.wroteToday}
        />
      </div>

      {/* ── WEEKLY MOOD SUMMARY ── */}
      {!loading && entries.length > 0 && (
        <div className="weekly-mood">
          <div className="section-title">This Week's Mood</div>
          <div className="mood-week-row">
            {stats.weekMoods.map((day, i) => (
              <div key={i} className="mood-day">
                <span className="mood-day-emoji">{day.mood || (day.count > 0 ? "📝" : "○")}</span>
                <span className="mood-day-label">{day.label}</span>
                {day.count > 0 && <span className="mood-day-count">{day.count}</span>}
              </div>
            ))}
          </div>
          {stats.happiestDay && (
            <p className="happiest-day">
              🌟 Your happiest day this month: <strong>{new Date(stats.happiestDay[0]).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</strong>
            </p>
          )}
        </div>
      )}

      {/* ── HEATMAP ── */}
      {!loading && entries.length > 0 && (
        <div className="heatmap-section">
          <div className="section-title">Writing Activity</div>
          <div className="heatmap">
            {heatmap.map((d) => (
              <div
                key={d.date}
                className={`heat-cell heat-${Math.min(d.count, 4)}`}
                title={`${d.date}: ${d.count} entr${d.count === 1 ? "y" : "ies"}`}
              />
            ))}
          </div>
          <div className="heatmap-legend">
            <span>Less</span>
            {[0,1,2,3,4].map((l) => <div key={l} className={`heat-cell heat-${l}`} />)}
            <span>More</span>
          </div>
        </div>
      )}

      {/* ── ENTRIES ── */}
      <div className="section-title" style={{ marginTop: 28 }}>
        {searchQuery ? `Results for "${searchQuery}"` : "Recent Entries"}
      </div>

      <div className="entries-grid">
        {loading ? (
          [1,2,3].map((i) => <div key={i} className="entry-card skeleton" />)
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📓</div>
            <h3>{searchQuery ? "No results found" : "No entries yet"}</h3>
            <p>{searchQuery ? "Try different keywords." : "Start your first journal entry."}</p>
            {!searchQuery && <button onClick={() => navigate("/app/new-entry")}>✏️ Create Entry</button>}
          </div>
        ) : (
          filtered.slice(0, 6).map((entry, i) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              index={i}
              onEdit={() => navigate(`/app/edit-entry/${entry.id}`)}
              onDelete={() => setDeleteTarget(entry.id)}
              onArchive={() => handleArchive(entry.id)}
            />
          ))
        )}
      </div>

      {filtered.length > 6 && (
        <div className="view-all-wrap">
          <button className="view-all-btn" onClick={() => navigate("/app/entries")}>
            View all {filtered.length} entries →
          </button>
        </div>
      )}
    </div>
  );
}

/* ── STAT CARD ── */
function StatCard({ icon, value, label, loading, highlight }) {
  return (
    <div className={`stat-card ${highlight ? "stat-highlight" : ""}`}>
      {loading ? (
        <div className="stat-skeleton" />
      ) : (
        <>
          <div className="stat-icon">{icon}</div>
          <div>
            <div className="stat-num">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── ENTRY CARD ── */
function EntryCard({ entry, index, onEdit, onDelete, onArchive }) {
  const wordCount = entry.content ? entry.content.trim().split(/\s+/).length : 0;
  const readTime  = Math.max(1, Math.ceil(wordCount / 200));
  return (
    <div className="entry-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="card-top">
        {entry.mood && <span className="mood-badge">{entry.mood}</span>}
        <span className="card-date">
          {entry.createdAt?.toDate?.().toLocaleDateString("en-US",
            { month: "short", day: "numeric", year: "numeric" }) || "No date"}
        </span>
      </div>
      <h3>{entry.title || "Untitled Entry"}</h3>
      <p className="preview">
        {entry.content
          ? entry.content.substring(0, 120) + (entry.content.length > 120 ? "…" : "")
          : "No content"}
      </p>
      <div className="card-meta">
        <span>{wordCount} words · {readTime} min read</span>
        {entry.tags?.length > 0 && (
          <div className="tags">
            {entry.tags.slice(0,3).map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        )}
      </div>
      <div className="card-actions">
        <button className="btn-edit"    onClick={onEdit}>Edit</button>
        <button className="btn-archive" onClick={onArchive}>Archive</button>
        <button className="btn-delete"  onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}