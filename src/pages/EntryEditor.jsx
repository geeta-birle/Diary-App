import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, query,
  where, orderBy, limit, getDocs, deleteDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useToast } from "./Main";
import "./entryeditor.css";

const MOODS = ["😊","😢","😡","😌","😰","🥳","😴","🤔"];
const MOOD_LABELS = {
  "😊":"Happy","😢":"Sad","😡":"Angry","😌":"Calm",
  "😰":"Anxious","🥳":"Excited","😴":"Tired","🤔":"Thoughtful"
};
const AUTO_SAVE_INTERVAL = 5000; // 5 seconds
const LOCAL_DRAFT_KEY    = "diary_local_draft";

export default function EntryEditor() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const addToast  = useToast();
  const isEditing = !!id;

  const [user,      setUser]      = useState(null);
  const [title,     setTitle]     = useState("");
  const [content,   setContent]   = useState("");
  const [mood,      setMood]      = useState("");
  const [tagInput,  setTagInput]  = useState("");
  const [tags,      setTags]      = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(isEditing);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [wordCount, setWordCount] = useState(0);
  const [draftId,   setDraftId]   = useState(null); // Firestore draft doc id

  const autoSaveTimer = useRef(null);
  const lastSaved     = useRef({ title: "", content: "" });

  /* ── auth ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
    });
    return () => unsub();
  }, []);

  /* ── load existing entry ── */
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "entries", id));
        if (snap.exists()) {
          const d = snap.data();
          setTitle(d.title || ""); setContent(d.content || "");
          setMood(d.mood || ""); setTags(d.tags || []);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  /* ── restore local draft on new entry load ── */
  useEffect(() => {
    if (isEditing) return;
    const local = localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!local) return;
    try {
      const { title: t, content: c, mood: m, tags: tg, savedAt } = JSON.parse(local);
      if (!t && !c) return;
      const age = Date.now() - savedAt;
      if (age > 24 * 60 * 60 * 1000) { localStorage.removeItem(LOCAL_DRAFT_KEY); return; }
      setTitle(t || ""); setContent(c || ""); setMood(m || ""); setTags(tg || []);
      setSaveState("saved");
      addToast("Unsaved draft restored 📝", "info");
    } catch {}
  }, [isEditing]);

  /* ── word count ── */
  useEffect(() => {
    setWordCount(content.trim() ? content.trim().split(/\s+/).length : 0);
  }, [content]);

  /* ── auto-save (local + Firestore draft) every 5 s ── */
  const doAutoSave = useCallback(async () => {
    // skip if nothing changed or content is empty
    if (!title && !content) return;
    if (lastSaved.current.title === title && lastSaved.current.content === content) return;

    setSaveState("saving");

    // always save to localStorage (works offline)
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({
      title, content, mood, tags, savedAt: Date.now()
    }));

    // save to Firestore if logged in
    if (user && !isEditing) {
      try {
        const payload = {
          userId: user.uid, title, content, mood, tags,
          draft: true, archived: false, updatedAt: serverTimestamp()
        };
        if (draftId) {
          await updateDoc(doc(db, "entries", draftId), payload);
        } else {
          const ref = await addDoc(collection(db, "entries"), {
            ...payload, createdAt: serverTimestamp()
          });
          setDraftId(ref.id);
        }
      } catch (e) { console.error("Auto-save error:", e); }
    }

    lastSaved.current = { title, content };
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2500);
  }, [title, content, mood, tags, user, isEditing, draftId]);

  useEffect(() => {
    if (isEditing) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, AUTO_SAVE_INTERVAL);
    return () => clearTimeout(autoSaveTimer.current);
  }, [title, content, mood, tags, doAutoSave, isEditing]);

  /* ── tags ── */
  const addTag = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const t = tagInput.trim().replace(/,/g, "").toLowerCase();
      if (t && !tags.includes(t) && tags.length < 5) { setTags([...tags, t]); setTagInput(""); }
    }
  };
  const removeTag = (tag) => setTags(tags.filter((t) => t !== tag));

  /* ── publish / update ── */
  const handleSave = async (draft = false) => {
    if (!user) return;
    if (!draft && !title.trim()) { addToast("Please add a title", "error"); return; }
    if (!draft && !content.trim()) { addToast("Please write some content", "error"); return; }
    setSaving(true);
    try {
      if (isEditing) {
        await updateDoc(doc(db, "entries", id), {
          title, content, mood, tags, draft: false, updatedAt: serverTimestamp()
        });
        addToast("Entry updated ✅", "success");
      } else {
        const payload = {
          userId: user.uid, title, content, mood, tags,
          draft, archived: false, updatedAt: serverTimestamp()
        };
        if (draftId) {
          await updateDoc(doc(db, "entries", draftId), { ...payload, draft });
        } else {
          await addDoc(collection(db, "entries"), { ...payload, createdAt: serverTimestamp() });
        }
        addToast(draft ? "Saved as draft 📝" : "Entry published! 🎉", "success");
      }
      // clear local draft
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      navigate(draft ? "/app/drafts" : "/app/dashboard");
    } catch (e) { addToast("Error saving entry", "error"); console.error(e); }
    setSaving(false);
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="editor-page">

      {/* ── TOOLBAR ── */}
      <div className="editor-header">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <h2>{isEditing ? "Edit Entry" : "New Entry"}</h2>
        <div className="editor-meta-right">
          {/* Save state indicator */}
          <span className={`save-indicator ${saveState}`}>
            {saveState === "saving" && <><span className="save-dot" />Saving…</>}
            {saveState === "saved"  && <>✓ Saved</>}
          </span>
          <div className="editor-actions">
            {!isEditing && (
              <button className="draft-btn" onClick={() => handleSave(true)} disabled={saving}>
                {saving ? "…" : "Save Draft"}
              </button>
            )}
            <button className="publish-btn" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? "Saving…" : isEditing ? "Update" : "Publish"}
            </button>
          </div>
        </div>
      </div>

      <div className="editor-body">

        {/* Title */}
        <input
          className="title-input"
          placeholder="Entry title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Mood picker */}
        <div className="mood-row">
          <span className="mood-label">How are you feeling?</span>
          <div className="mood-picker">
            {MOODS.map((m) => (
              <button
                key={m}
                className={`mood-btn ${mood === m ? "selected" : ""}`}
                onClick={() => setMood(mood === m ? "" : m)}
                title={MOOD_LABELS[m]}
              >
                {m}
              </button>
            ))}
          </div>
          {mood && <span className="mood-selected-label">{mood} {MOOD_LABELS[mood]}</span>}
        </div>

        {/* Content */}
        <textarea
          className="content-area"
          placeholder="Write your thoughts, feelings, or anything on your mind…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {/* Footer */}
        <div className="editor-footer">
          <span className="word-count">{wordCount} words · {readTime} min read</span>
          <div className="tag-section">
            {tags.length > 0 && (
              <div className="tags-display">
                {tags.map((tag) => (
                  <span key={tag} className="tag">
                    #{tag}<button onClick={() => removeTag(tag)} aria-label="remove">×</button>
                  </span>
                ))}
              </div>
            )}
            {tags.length < 5 && (
              <input
                className="tag-input"
                placeholder="Add tag and press Enter…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={addTag}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}