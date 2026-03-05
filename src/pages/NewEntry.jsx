import { useState } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "./newEntry.css";

export default function NewEntry() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSave = async (e) => {
    e.preventDefault();

    if (!title || !content) return;

    try {
      setLoading(true);

      await addDoc(collection(db, "entries"), {
        title,
        content,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        archived: false
      });

      navigate("/app/dashboard");
    } catch (error) {
      console.error("Error saving entry:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-entry-container">
      <div className="new-entry-card">
        <h2>Create New Entry</h2>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              placeholder="Enter title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Content</label>
            <textarea
              rows="8"
              placeholder="Write your thoughts..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Entry"}
          </button>
        </form>
      </div>
    </div>
  );
}