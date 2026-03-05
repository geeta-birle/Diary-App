import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef              = useRef(null);

  /* ── reset the inactivity timer on any user event ── */
  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await signOut(auth);
    }, SESSION_TIMEOUT_MS);
  };

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer));

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) resetTimer();
      else {
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    });

    return () => {
      unsubscribe();
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { user, loading };
}