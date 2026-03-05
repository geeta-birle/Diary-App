import { useEffect, useState } from "react";
import { sendEmailVerification, signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./verifyemail.css";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [sending, setSending]   = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [user, setUser]         = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { navigate("/login"); return; }
      if (u.emailVerified) { navigate("/app/dashboard"); return; }
      setUser(u);
    });
    // Poll every 4 s to catch when user clicks the email link
    const poll = setInterval(async () => {
      const u = auth.currentUser;
      if (!u) return;
      await u.reload();
      if (u.emailVerified) navigate("/app/dashboard");
    }, 4000);
    return () => { unsub(); clearInterval(poll); };
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (!user || cooldown > 0) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      setCooldown(60);
    } catch (e) {
      console.error(e);
    }
    setSending(false);
  };

  const handleLogout = () => signOut(auth).then(() => navigate("/login"));

  return (
    <div className="verify-page">
      <div className="verify-card">
        <div className="verify-icon">📬</div>
        <h1>Verify your email</h1>
        <p>
          We sent a verification link to <strong>{user?.email}</strong>.
          <br />Click the link in the email to activate your account.
        </p>
        <p className="verify-note">
          This page will automatically continue once verified.
        </p>

        <button
          className="verify-btn"
          onClick={handleResend}
          disabled={sending || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : sending ? "Sending…" : "Resend Email"}
        </button>

        <button className="verify-logout" onClick={handleLogout}>
          ← Back to Login
        </button>
      </div>
    </div>
  );
}