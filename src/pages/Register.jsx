import { useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import "./auth.css";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      await sendEmailVerification(cred.user);
      navigate("/verify");
    } catch (err) {
      const msgs = {
        "auth/email-already-in-use": "This email is already registered.",
        "auth/invalid-email":        "Please enter a valid email address.",
        "auth/weak-password":        "Password is too weak.",
      };
      setError(msgs[err.code] || "Registration failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">📓</div>
        <h1>Create account</h1>
        <p className="auth-sub">Start your journaling journey</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleRegister}>
          <div className="auth-field">
            <label>Name</label>
            <input
              type="text" placeholder="Your name"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email" placeholder="you@example.com" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password" placeholder="Min. 6 characters" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label>Confirm Password</label>
            <input
              type="password" placeholder="Repeat password" required
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}