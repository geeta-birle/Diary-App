import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection, addDoc, doc, getDoc, updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useToast } from "./Main";
import "./entryeditor.css";

/* ── Quill loaded from CDN (no npm needed) ── */
const QUILL_CSS = "https://cdn.quilljs.com/1.3.7/quill.snow.css";
const QUILL_JS  = "https://cdn.quilljs.com/1.3.7/quill.min.js";

const MOODS = [
  { emoji: "😊", label: "Happy"     },
  { emoji: "😌", label: "Calm"      },
  { emoji: "🥳", label: "Excited"   },
  { emoji: "🤔", label: "Thoughtful"},
  { emoji: "😢", label: "Sad"       },
  { emoji: "😰", label: "Anxious"   },
  { emoji: "😡", label: "Angry"     },
  { emoji: "😴", label: "Tired"     },
];

const DEBOUNCE_MS    = 5000;   // save 5 s after last keystroke
const LOCAL_DRAFT_KEY = "diary_local_draft";

/* ── load script/link once ── */
function loadQuill() {
  return new Promise((resolve) => {
    if (window.Quill) { resolve(); return; }
    if (!document.querySelector(`link[href="${QUILL_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = QUILL_CSS;
      document.head.appendChild(link);
    }
    if (!document.querySelector(`script[src="${QUILL_JS}"]`)) {
      const s = document.createElement("script");
      s.src = QUILL_JS; s.onload = resolve;
      document.head.appendChild(s);
    } else {
      resolve();
    }
  });
}

export default function EntryEditor() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const addToast  = useToast();
  const isEditing = !!id;

  const [user,      setUser]      = useState(null);
  const [title,     setTitle]     = useState("");
  const [mood,      setMood]      = useState("");
  const [tagInput,  setTagInput]  = useState("");
  const [tags,      setTags]      = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [wordCount, setWordCount] = useState(0);
  const [draftId,   setDraftId]   = useState(null);
  const [quillReady, setQuillReady] = useState(false);

  const editorRef  = useRef(null); // div container
  const quillRef   = useRef(null); // Quill instance
  const debounceRef = useRef(null);
  const lastContent = useRef("");

  /* ── auth ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (u) setUser(u); });
    return () => unsub();
  }, []);

  /* ── init Quill ── */
  useEffect(() => {
    let mounted = true;
    loadQuill().then(() => {
      if (!mounted || !editorRef.current || quillRef.current) return;
      const q = new window.Quill(editorRef.current, {
        theme: "snow",
        placeholder: "Write your thoughts, feelings, or anything on your mind…",
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline", "strike"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["blockquote", "code-block"],
            ["link", "image"],
            [{ align: [] }],
            ["clean"],
          ],
        },
      });

      q.on("text-change", () => {
        const text = q.getText().trim();
        const words = text ? text.split(/\s+/).length : 0;
        setWordCount(words);
        scheduleSave();
      });

      quillRef.current = q;
      setQuillReady(true);
    });
    return () => { mounted = false; };
  }, []);

  /* ── load existing entry after Quill ready ── */
  useEffect(() => {
    if (!quillReady) return;

    const load = async () => {
      if (isEditing) {
        try {
          const snap = await getDoc(doc(db, "entries", id));
          if (snap.exists()) {
            const d = snap.data();
            setTitle(d.title || "");
            setMood(d.mood   || "");
            setTags(d.tags   || []);
            if (d.contentDelta) {
              quillRef.current.setContents(d.contentDelta);
            } else if (d.content) {
              quillRef.current.setText(d.content);
            }
          }
        } catch (e) { console.error(e); }
      } else {
        // restore local draft
        try {
          const local = localStorage.getItem(LOCAL_DRAFT_KEY);
          if (local) {
            const { title: t, contentDelta, mood: m, tags: tg, savedAt } = JSON.parse(local);
            if (Date.now() - savedAt < 24 * 3600 * 1000) {
              setTitle(t || ""); setMood(m || ""); setTags(tg || []);
              if (contentDelta) quillRef.current.setContents(contentDelta);
              addToast("Unsaved draft restored 📝", "info");
            } else {
              localStorage.removeItem(LOCAL_DRAFT_KEY);
            }
          }
        } catch {}
      }
      setLoading(false);
    };

    load();
  }, [quillReady, isEditing, id]);

  /* ── debounced auto-save ── */
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doAutoSave, DEBOUNCE_MS);
  }, []);

  const doAutoSave = useCallback(async () => {
    const q = quillRef.current;
    if (!q) return;
    const delta   = q.getContents();
    const text    = q.getText().trim();
    const titleEl = document.getElementById("entry-title-input");
    const t       = titleEl?.value || "";

    if (!text && !t) return; // prevent empty save
    const deltaStr = JSON.stringify(delta);
    if (deltaStr === lastContent.current) return; // nothing changed
    lastContent.current = deltaStr;

    setSaveState("saving");

    // localStorage (offline safety)
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({
      title: t, contentDelta: delta, mood, tags, savedAt: Date.now()
    }));

    // Firestore
    if (user && !isEditing) {
      try {
        const payload = {
          userId: user.uid, title: t, content: text,
          contentDelta: delta.ops, mood, tags,
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
      } catch (e) { console.error("Auto-save:", e); }
    }

    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2500);
  }, [user, isEditing, draftId, mood, tags]);

  /* ── publish / update ── */
  const handleSave = async (draft = false) => {
    const q = quillRef.current;
    if (!user || !q) return;
    const text  = q.getText().trim();
    const delta = q.getContents();

    if (!draft && !title.trim()) { addToast("Please add a title", "error"); return; }
    if (!draft && !text)          { addToast("Please write some content", "error"); return; }

    setSaving(true);
    try {
      const payload = {
        title, content: text, contentDelta: delta.ops,
        mood, tags, draft, archived: false,
        updatedAt: serverTimestamp()
      };
      if (isEditing) {
        await updateDoc(doc(db, "entries", id), { ...payload, draft: false });
        addToast("Entry updated ✅", "success");
      } else {
        if (draftId) {
          await updateDoc(doc(db, "entries", draftId), payload);
        } else {
          await addDoc(collection(db, "entries"), {
            ...payload, userId: user.uid, createdAt: serverTimestamp()
          });
        }
        addToast(draft ? "Saved as draft 📝" : "Entry published! 🎉", "success");
      }
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      navigate(draft ? "/app/drafts" : "/app/dashboard");
    } catch (e) { addToast("Error saving entry", "error"); console.error(e); }
    setSaving(false);
  };

  /* ── tags ── */
  const addTag = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const t = tagInput.trim().replace(/,/g, "").toLowerCase();
      if (t && !tags.includes(t) && tags.length < 5) { setTags([...tags, t]); setTagInput(""); }
    }
  };

  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="editor-page">

      {/* ── TOOLBAR ── */}
      <div className="editor-header">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <h2>{isEditing ? "Edit Entry" : "New Entry"}</h2>
        <div className="editor-meta-right">
          <span className={`save-indicator ${saveState}`}>
            {saveState === "saving" && <><span className="save-dot" />Auto-saving…</>}
            {saveState === "saved"  && <>✓ Saved</>}
          </span>
          <div className="editor-actions">
            {!isEditing && (
              <button className="draft-btn" onClick={() => handleSave(true)} disabled={saving}>
                Save Draft
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
          id="entry-title-input"
          className="title-input"
          placeholder="Entry title…"
          value={title}
          onChange={(e) => { setTitle(e.target.value); scheduleSave(); }}
        />

        {/* Mood picker */}
        <div className="mood-row">
          <span className="mood-label">Mood</span>
          <div className="mood-picker">
            {MOODS.map((m) => (
              <button
                key={m.emoji}
                className={`mood-btn ${mood === m.emoji ? "selected" : ""}`}
                onClick={() => setMood(mood === m.emoji ? "" : m.emoji)}
                title={m.label}
              >
                <span className="mood-emoji">{m.emoji}</span>
                <span className="mood-text">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Rich editor */}
        <div className={`quill-wrapper ${loading ? "quill-loading" : ""}`}>
          {loading && <div className="editor-skeleton" />}
          <div ref={editorRef} className="quill-editor" />
        </div>

        {/* Footer */}
        <div className="editor-footer">
          <span className="word-count">{wordCount} words · {readTime} min read</span>
          <div className="tag-section">
            {tags.length > 0 && (
              <div className="tags-display">
                {tags.map((tag) => (
                  <span key={tag} className="tag">
                    #{tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
              </div>
            )}
            {tags.length < 5 && (
              <input
                className="tag-input"
                placeholder="Add tag, press Enter…"
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