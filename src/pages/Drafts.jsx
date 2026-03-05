import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useToast, ConfirmModal } from "./Main";

export default function Drafts() {
  const navigate = useNavigate();
  const addToast = useToast();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let unsub = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) { setLoading(false); return; }
      const q = query(
        collection(db, "entries"),
        where("userId", "==", user.uid),
        where("draft", "==", true),
        orderBy("updatedAt", "desc")
      );
      unsub = onSnapshot(q, (snap) => {
        setDrafts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (e) => { console.error(e); setLoading(false); });
    });
    return () => { unsubAuth(); if (unsub) unsub(); };
  }, []);

  const handleDelete = async (id) => {
    try { await deleteDoc(doc(db, "entries", id)); addToast("Draft deleted", "success"); }
    catch (e) { addToast("Failed", "error"); }
    setDeleteTarget(null);
  };

  const handlePublish = async (id) => {
    try {
      await updateDoc(doc(db, "entries", id), { draft: false, updatedAt: serverTimestamp() });
      addToast("Draft published! 🎉", "success");
    } catch (e) { addToast("Failed to publish", "error"); }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {deleteTarget && (
        <ConfirmModal
          message="Delete this draft permanently?"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>📝 Drafts</h2>
      {loading ? (
        <div className="loading-screen"><div className="spinner" /></div>
      ) : drafts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>No drafts</h3>
          <p>Drafts are auto-saved while writing. Start a new entry to create one.</p>
        </div>
      ) : (
        <div className="ae-list">
          {drafts.map((draft) => (
            <div key={draft.id} className="ae-row">
              <div className="ae-left">
                <div>
                  <h3>{draft.title || "Untitled Draft"}</h3>
                  <p className="ae-meta">
                    Last saved: {draft.updatedAt?.toDate?.().toLocaleString() || "Unknown"}
                  </p>
                  <p className="ae-meta" style={{ marginTop: 4 }}>
                    {draft.content?.substring(0, 80) || "No content"}...
                  </p>
                </div>
              </div>
              <div className="ae-actions">
                <button onClick={() => navigate(`/app/edit-entry/${draft.id}`)}>Edit</button>
                <button onClick={() => handlePublish(draft.id)}>Publish</button>
                <button className="danger" onClick={() => setDeleteTarget(draft.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}