import React, { useState, useEffect, createContext, useContext } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import "./main.css";

export const ToastContext  = createContext(null);
export const SearchContext = createContext("");
export function useToast()  { return useContext(ToastContext);  }
export function useSearch() { return useContext(SearchContext); }

/* ── Reusable confirm modal (no window.confirm) ── */
export function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

export default function Main() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const [darkMode,     setDarkMode]     = useState(false);
  const [user,         setUser]         = useState(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [toasts,       setToasts]       = useState([]);

  /* ── auth guard ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/login");
      else    setUser(u);
    });
    return () => unsub();
  }, [navigate]);

  /* ── dark mode persistence ── */
  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    if (saved === "true") setDarkMode(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("darkMode", darkMode);
    document.body.className = darkMode ? "dark" : "";
  }, [darkMode]);

  /* ── toast system ── */
  const addToast = (message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  /* ── logout ── */
  const handleLogout = async () => {
    try { await signOut(auth); navigate("/login"); }
    catch (e) { console.error(e); }
  };

  const isActive = (path) => location.pathname === path ? "active" : "";

  if (!user) return (
    <div className="loading-screen">
      <div className="spinner" /><span>Loading…</span>
    </div>
  );

  const navItems = [
    { path: "/app/dashboard",      label: "🏠 Dashboard"      },
    { path: "/app/entries",        label: "📖 All Entries"    },
    { path: "/app/new-entry",      label: "✏️ New Entry"      },
    { path: "/app/drafts",         label: "📝 Drafts"         },
    { path: "/app/archived",       label: "🗄️ Archived"      },
    { path: "/app/mood-analytics", label: "📊 Mood Analytics" },
    { path: "/app/settings",       label: "⚙️ Settings"       },
  ];

  return (
    <ToastContext.Provider value={addToast}>
      <SearchContext.Provider value={searchQuery}>
        <div className={darkMode ? "app dark" : "app"}>

          {/* ── TOASTS ── */}
          <div className="toast-container">
            {toasts.map((t) => (
              <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
            ))}
          </div>

          {/* ── NAVBAR ── */}
          <header className="navbar">
            <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
              {sidebarOpen ? "✕" : "☰"}
            </button>
            <div className="logo" onClick={() => navigate("/app/dashboard")}>📓 MyJournal</div>
            <input
              type="text" placeholder="Search entries…" className="search"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="dark-toggle" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            <div className="profile">
              <div className="avatar">{(user.displayName || user.email)[0].toUpperCase()}</div>
              <span className="user-name">{user.displayName || user.email.split("@")[0]}</span>
            </div>
          </header>

          <div className="layout">
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            {/* ── SIDEBAR ── */}
            <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
              <div className="sidebar-profile">
                <div className="avatar lg">{(user.displayName || user.email)[0].toUpperCase()}</div>
                <div>
                  <p className="sidebar-name">{user.displayName || "User"}</p>
                  <p className="sidebar-email">{user.email}</p>
                </div>
              </div>
              <ul>
                {navItems.map(({ path, label }) => (
                  <li key={path} className={isActive(path)}
                    onClick={() => { navigate(path); setSidebarOpen(false); }}>
                    {label}
                  </li>
                ))}
                <li className="logout" onClick={handleLogout}>🚪 Logout</li>
              </ul>
            </aside>

            <main className="main-content"><Outlet /></main>
          </div>
        </div>
      </SearchContext.Provider>
    </ToastContext.Provider>
  );
}