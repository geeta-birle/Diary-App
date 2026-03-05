import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useToast, ConfirmModal } from "./Main";

export default function Archived() {
  const addToast = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let unsub = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) { setLoading(false); return; }
      const q = query(
        collection(db, "entries"),
        where("userId", "==", user.uid),
        where("archived", "==", true),
        orderBy("createdAt", "desc")
      );
      unsub = onSnapshot(q, (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (e) => { console.error(e); setLoading(false); });
    });
    return () => { unsubAuth(); if (unsub) unsub(); };
  }, []);

  const handleRestore = async (id) => {
    try { await updateDoc(doc(db, "entries", id), { archived: false }); addToast("Entry restored ✅", "success"); }
    catch (e) { addToast("Failed to restore", "error"); }
  };

  const handleDelete = async (id) => {
    try { await deleteDoc(doc(db, "entries", id)); addToast("Entry permanently deleted", "success"); }
    catch (e) { addToast("Failed to delete", "error"); }
    setDeleteTarget(null);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {deleteTarget && (
        <ConfirmModal
          message="Permanently delete this entry? This cannot be undone."
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🗄️ Archived</h2>
      {loading ? (
        <div className="loading-screen"><div className="spinner" /></div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗄️</div>
          <h3>Nothing archived</h3>
          <p>Archived entries appear here. You can restore or delete them.</p>
        </div>
      ) : (
        <div className="ae-list">
          {entries.map((entry) => (
            <div key={entry.id} className="ae-row">
              <div className="ae-left">
                <div>
                  <h3>{entry.title || "Untitled"}</h3>
                  <p className="ae-meta">
                    {entry.createdAt?.toDate?.().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) || "No date"}
                  </p>
                </div>
              </div>
              <div className="ae-actions">
                <button onClick={() => handleRestore(entry.id)}>↩ Restore</button>
                <button className="danger" onClick={() => setDeleteTarget(entry.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}