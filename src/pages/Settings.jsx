import { useState, useEffect } from "react";
import { auth } from "../firebase";
import {
  onAuthStateChanged, updateProfile, updatePassword,
  deleteUser, EmailAuthProvider, reauthenticateWithCredential
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useToast } from "./Main";
import { useTheme, THEMES } from "./ThemeContext";
import "./settings.css";

export default function Settings() {
  const addToast = useToast();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [user,           setUser]           = useState(null);
  const [displayName,    setDisplayName]    = useState("");
  const [newPassword,    setNewPassword]    = useState("");
  const [confirmPassword,setConfirmPassword]= useState("");
  const [currentPassword,setCurrentPassword]= useState("");
  const [saving,         setSaving]         = useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setDisplayName(u.displayName || ""); }
    });
    return () => unsub();
  }, []);

  const handleUpdateProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: displayName.trim() });
      addToast("Profile updated ✅", "success");
    } catch { addToast("Failed to update profile", "error"); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { addToast("Passwords don't match", "error"); return; }
    if (newPassword.length < 6) { addToast("Password must be at least 6 characters", "error"); return; }
    setSaving(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      addToast("Password changed ✅", "success");
      setNewPassword(""); setConfirmPassword(""); setCurrentPassword("");
    } catch (e) {
      addToast(e.code === "auth/wrong-password" ? "Current password is incorrect" : "Failed to change password", "error");
    }
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) { addToast("Enter your password to confirm", "error"); return; }
    try {
      const cred = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, cred);
      await deleteUser(user);
      navigate("/login");
    } catch (e) {
      addToast(e.code === "auth/wrong-password" ? "Incorrect password" : "Failed to delete account", "error");
    }
  };

  if (!user) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div className="settings-page">
      <h2>⚙️ Settings</h2>

      {/* ── THEME ── */}
      <section className="settings-section">
        <h3>🎨 Appearance</h3>
        <p className="section-desc">Choose a theme that matches your journaling mood.</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-tile ${theme === t.id ? "active" : ""}`}
              onClick={() => setTheme(t.id)}
            >
              <div className="theme-tile-swatch">
                {t.preview.map((c, i) => (
                  <div key={i} style={{ background: c, flex: 1 }} />
                ))}
              </div>
              <span className="theme-tile-icon">{t.icon}</span>
              <span className="theme-tile-name">{t.label}</span>
              {theme === t.id && <span className="theme-tile-check">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* ── PROFILE ── */}
      <section className="settings-section">
        <h3>👤 Profile</h3>
        <div className="settings-field">
          <label>Display Name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="settings-field">
          <label>Email</label>
          <input value={user.email} disabled />
        </div>
        <div className="settings-field">
          <label>Email Verified</label>
          <div className={`verify-badge ${user.emailVerified ? "verified" : "unverified"}`}>
            {user.emailVerified ? "✅ Verified" : "⚠️ Not verified"}
          </div>
        </div>
        <button className="settings-btn" onClick={handleUpdateProfile} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </section>

      {/* ── PASSWORD ── */}
      <section className="settings-section">
        <h3>🔒 Change Password</h3>
        <div className="settings-field">
          <label>Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="settings-field">
          <label>New Password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="settings-field">
          <label>Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <button className="settings-btn" onClick={handleChangePassword} disabled={saving}>
          Update Password
        </button>
      </section>

      {/* ── DANGER ZONE ── */}
      <section className="settings-section danger-zone">
        <h3>⚠️ Danger Zone</h3>
        {!deleteConfirm ? (
          <button className="settings-btn danger" onClick={() => setDeleteConfirm(true)}>
            Delete Account
          </button>
        ) : (
          <div>
            <p className="danger-warning">
              This will permanently delete your account and all journal entries. This cannot be undone.
            </p>
            <div className="settings-field">
              <label>Enter your password to confirm</label>
              <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-cancel" onClick={() => setDeleteConfirm(false)}>Cancel</button>
              <button className="settings-btn danger" onClick={handleDeleteAccount}>Permanently Delete</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}