import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useToast, ConfirmModal, useSearch } from "./Main";
import "./allentries.css";

const MOODS = ["😊", "😢", "😡", "😌", "😰", "🥳", "😴", "🤔"];

export default function AllEntries() {
  const navigate = useNavigate();
  const addToast = useToast();
  const searchQuery = useSearch();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [moodFilter, setMoodFilter] = useState("");
  const [sortBy, setSortBy] = useState("desc");

  useEffect(() => {
    let unsubEntries = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) { setLoading(false); return; }
      const q = query(
        collection(db, "entries"),
        where("userId", "==", user.uid),
        where("archived", "==", false),
        where("draft", "==", false),
        orderBy("createdAt", "desc")
      );
      unsubEntries = onSnapshot(q, (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (e) => { console.error(e); setLoading(false); });
    });
    return () => { unsubAuth(); if (unsubEntries) unsubEntries(); };
  }, []);

  const handleDelete = async (id) => {
    try { await deleteDoc(doc(db, "entries", id)); addToast("Entry deleted", "success"); }
    catch (e) { addToast("Failed to delete", "error"); }
    setDeleteTarget(null);
  };

  const handleArchive = async (id) => {
    try { await updateDoc(doc(db, "entries", id), { archived: true }); addToast("Entry archived", "info"); }
    catch (e) { addToast("Failed to archive", "error"); }
  };

  let filtered = entries.filter((e) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || e.title?.toLowerCase().includes(q) || e.content?.toLowerCase().includes(q);
    const matchMood = !moodFilter || e.mood === moodFilter;
    return matchSearch && matchMood;
  });

  if (sortBy === "asc") filtered = [...filtered].reverse();

  return (
    <div className="all-entries">
      {deleteTarget && (
        <ConfirmModal
          message="Delete this entry permanently?"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="ae-header">
        <h2>All Entries</h2>
        <button className="new-entry-btn" onClick={() => navigate("/app/new-entry")}>+ New</button>
      </div>

      {/* FILTERS */}
      <div className="filters-row">
        <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
        <div className="mood-filters">
          <button className={`mood-filter-btn ${!moodFilter ? "active" : ""}`} onClick={() => setMoodFilter("")}>All</button>
          {MOODS.map((m) => (
            <button key={m} className={`mood-filter-btn ${moodFilter === m ? "active" : ""}`} onClick={() => setMoodFilter(moodFilter === m ? "" : m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="ae-count">{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</div>

      {loading ? (
        <div className="loading-screen"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No entries found</h3>
          <p>Try adjusting your filters or write a new entry.</p>
        </div>
      ) : (
        <div className="ae-list">
          {filtered.map((entry) => {
            const words = entry.content?.trim().split(/\s+/).length || 0;
            return (
              <div key={entry.id} className="ae-row">
                <div className="ae-left">
                  {entry.mood && <span className="ae-mood">{entry.mood}</span>}
                  <div>
                    <h3 onClick={() => navigate(`/app/edit-entry/${entry.id}`)}>{entry.title || "Untitled"}</h3>
                    <p className="ae-meta">
                      {entry.createdAt?.toDate?.().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) || "No date"}
                      {" · "}{words} words
                    </p>
                    {entry.tags?.length > 0 && (
                      <div className="tags">{entry.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
                    )}
                  </div>
                </div>
                <div className="ae-actions">
                  <button onClick={() => navigate(`/app/edit-entry/${entry.id}`)}>Edit</button>
                  <button onClick={() => handleArchive(entry.id)}>Archive</button>
                  <button className="danger" onClick={() => setDeleteTarget(entry.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}