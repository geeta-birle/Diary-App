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
  "😊": "Happy",   "😢": "Sad",       "😡": "Angry",
  "😌": "Calm",    "😰": "Anxious",   "🥳": "Excited",
  "😴": "Tired",   "🤔": "Thoughtful"
};

const toDateKey  = (d) => d.toISOString().slice(0, 10);
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };

function buildHeatmap(entries) {
  const map = {};
  entries.forEach((e) => {
    if (!e.createdAt) return;
    const key = toDateKey(startOfDay(e.createdAt.toDate()));
    map[key] = (map[key] || 0) + 1;
  });
  const days = [];
  const now  = new Date();
  for (let i = 104; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = toDateKey(startOfDay(d));
    days.push({ date: key, count: map[key] || 0 });
  }
  return days;
}

export default function Dashboard() {
  const navigate    = useNavigate();
  const addToast    = useToast();
  const searchQuery = useSearch();

  const [entries,      setEntries]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [user,         setUser]         = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let unsubEntries = null;
    const unsubAuth  = onAuthStateChanged(auth, (u) => {
      if (!u) { setLoading(false); return; }
      setUser(u);
      const q = query(
        collection(db, "entries"),
        where("userId",   "==", u.uid),
        where("archived", "==", false),
        where("draft",    "==", false),
        orderBy("createdAt", "desc")
      );
      unsubEntries = onSnapshot(q,
        (snap) => {
          setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => { console.error("Firestore:", err); setLoading(false); }
      );
    });
    return () => { unsubAuth(); if (unsubEntries) unsubEntries(); };
  }, []);

  const stats = useMemo(() => {
    const now   = new Date();
    const today = startOfDay(now);
    const week  = new Date(now); week.setDate(week.getDate() - 7);

    const thisWeek   = entries.filter((e) => e.createdAt && e.createdAt.toDate() >= week);
    const wroteToday = entries.some((e) =>
      e.createdAt && startOfDay(e.createdAt.toDate()).getTime() === today.getTime()
    );

    // streak
    const writtenDays = new Set(
      entries.filter((e) => e.createdAt).map((e) => toDateKey(startOfDay(e.createdAt.toDate())))
    );
    let streak = 0;
    for (let i = 0; i <= 365; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      if (writtenDays.has(toDateKey(d))) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    // top mood
    const moodCount = {};
    entries.forEach((e) => { if (e.mood) moodCount[e.mood] = (moodCount[e.mood] || 0) + 1; });
    const topMood = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];

    // happiest day this month
    const month = new Date(now); month.setDate(month.getDate() - 30);
    const dayMoods = {};
    entries
      .filter((e) => e.createdAt && e.createdAt.toDate() >= month && e.mood)
      .forEach((e) => {
        const key = toDateKey(startOfDay(e.createdAt.toDate()));
        if (!dayMoods[key]) dayMoods[key] = 0;
        if (e.mood === "😊" || e.mood === "🥳") dayMoods[key]++;
      });
    const happiestDay = Object.entries(dayMoods).sort((a, b) => b[1] - a[1])[0];

    // weekly mood row — FIXED: no more "○" placeholders
    const weekMoods = Array.from({ length: 7 }, (_, i) => {
      const d   = new Date(today); d.setDate(d.getDate() - (6 - i));
      const key = toDateKey(d);
      const dayEntries = entries.filter((e) =>
        e.createdAt && toDateKey(startOfDay(e.createdAt.toDate())) === key
      );
      const mood = dayEntries.find((e) => e.mood)?.mood ?? null;
      return {
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        date:  d.getDate(),
        mood,
        count: dayEntries.length,
      };
    });

    return { thisWeek: thisWeek.length, streak, topMood, wroteToday, happiestDay, weekMoods };
  }, [entries]);

  const heatmap = useMemo(() => buildHeatmap(entries), [entries]);

  const filtered = useMemo(() =>
    entries.filter((e) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return e.title?.toLowerCase().includes(q) || e.content?.toLowerCase().includes(q);
    }),
    [entries, searchQuery]
  );

  const handleDelete = async (id) => {
    try   { await deleteDoc(doc(db, "entries", id)); addToast("Entry deleted", "success"); }
    catch { addToast("Failed to delete", "error"); }
    setDeleteTarget(null);
  };

  const handleArchive = async (id) => {
    try   { await updateDoc(doc(db, "entries", id), { archived: true }); addToast("Archived", "info"); }
    catch { addToast("Failed to archive", "error"); }
  };

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="dashboard">
      {deleteTarget && (
        <ConfirmModal
          message="Delete this entry permanently? This cannot be undone."
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* HEADER — button is INSIDE this flex row, not floating */}
      <div className="dashboard-header">
        <div>
          <h2>{greeting}{user?.displayName ? `, ${user.displayName}` : ""} 👋</h2>
          <p className="user-email">{user?.email}</p>
        </div>
        <button className="new-entry-btn" onClick={() => navigate("/app/new-entry")}>
          ✏️ New Entry
        </button>
      </div>

      {/* STATS */}
      <div className="stats-grid">
        <StatCard icon="📖" value={entries.length} label="Total Entries"  loading={loading} delay={0}   />
        <StatCard icon="📅" value={stats.thisWeek} label="This Week"      loading={loading} delay={60}  />
        <StatCard
          icon={stats.topMood ? stats.topMood[0] : "✨"}
          value={stats.topMood ? MOODS[stats.topMood[0]] : "—"}
          label="Top Mood"
          loading={loading}
          delay={120}
        />
        <StatCard
          icon={stats.wroteToday ? "🔥" : "💤"}
          value={stats.streak > 0 ? `${stats.streak}d` : "—"}
          label={stats.wroteToday ? "Active Streak" : "Rest Day"}
          loading={loading}
          delay={180}
          highlight={stats.wroteToday}
        />
      </div>

      {/* WEEKLY MOOD — FIXED rendering */}
      {!loading && (
        <div className="weekly-mood">
          <div className="section-title">This Week's Mood</div>
          <div className="mood-week-row">
            {stats.weekMoods.map((day, i) => (
              <div key={i} className={`mood-day ${day.count > 0 ? "has-entry" : "no-entry"}`}>
                <span className="mood-day-emoji">
                  {day.count === 0
                    ? <span className="empty-dot" />
                    : day.mood ?? "📝"}
                </span>
                <span className="mood-day-label">{day.label}</span>
                <span className="mood-day-date">{day.date}</span>
                {day.count > 0 && <span className="mood-day-count">{day.count}</span>}
              </div>
            ))}
          </div>
          {stats.happiestDay && (
            <p className="happiest-day">
              🌟 Your happiest day this month:{" "}
              <strong>
                {new Date(stats.happiestDay[0] + "T12:00:00").toLocaleDateString("en-US", {
                  month: "long", day: "numeric"
                })}
              </strong>
            </p>
          )}
        </div>
      )}

      {/* HEATMAP — FIXED layout */}
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

      {/* ENTRIES */}
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
            <p>{searchQuery ? "Try different keywords." : "Write your first journal entry."}</p>
            {!searchQuery && (
              <button onClick={() => navigate("/app/new-entry")}>✏️ Create Entry</button>
            )}
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

function StatCard({ icon, value, label, loading, delay = 0, highlight }) {
  return (
    <div className={`stat-card ${highlight ? "stat-highlight" : ""}`} style={{ animationDelay: `${delay}ms` }}>
      {loading ? <div className="stat-skeleton" /> : (
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

function EntryCard({ entry, index, onEdit, onDelete, onArchive }) {
  const wordCount = entry.content ? entry.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const readTime  = Math.max(1, Math.ceil(wordCount / 200));
  return (
    <div className="entry-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="card-top">
        {entry.mood ? <span className="mood-badge">{entry.mood}</span> : <span />}
        <span className="card-date">
          {entry.createdAt?.toDate?.().toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric"
          }) ?? "No date"}
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
            {entry.tags.slice(0, 3).map((t) => <span key={t} className="tag">#{t}</span>)}
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