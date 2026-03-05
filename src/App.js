import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login    from "./pages/Login";
import Register from "./pages/Register";
import Main     from "./pages/Main";
import Dashboard    from "./pages/Dashboard";
import EntryEditor  from "./pages/EntryEditor";
import AllEntries   from "./pages/AllEntries";
import Drafts       from "./pages/Drafts";
import Archived     from "./pages/Archived";
import Settings     from "./pages/Settings";
import MoodAnalytics from "./pages/MoodAnalytics";
import VerifyEmail  from "./pages/VerifyEmail";

function App() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#f5f3ef"
    }}>
      <div className="spinner" />
    </div>
  );

  /* user logged in but email not verified → gate to /verify page */
  const verified = user?.emailVerified;

  return (
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login"    element={user ? <Navigate to="/app/dashboard" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/app/dashboard" /> : <Register />} />

        {/* Email verification wall */}
        <Route path="/verify"   element={!user ? <Navigate to="/login" /> : <VerifyEmail />} />

        {/* Protected layout */}
        <Route
          path="/app"
          element={
            !user ? <Navigate to="/login" /> :
            !verified ? <Navigate to="/verify" /> :
            <Main />
          }
        >
          <Route index                    element={<Navigate to="dashboard" />} />
          <Route path="dashboard"         element={<Dashboard />} />
          <Route path="entries"           element={<AllEntries />} />
          <Route path="new-entry"         element={<EntryEditor />} />
          <Route path="edit-entry/:id"    element={<EntryEditor />} />
          <Route path="drafts"            element={<Drafts />} />
          <Route path="archived"          element={<Archived />} />
          <Route path="mood-analytics"    element={<MoodAnalytics />} />
          <Route path="settings"          element={<Settings />} />
        </Route>

        {/* Default + 404 */}
        <Route path="/"  element={<Navigate to={user ? "/app/dashboard" : "/login"} />} />
        <Route path="*"  element={<Navigate to={user ? "/app/dashboard" : "/login"} />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;