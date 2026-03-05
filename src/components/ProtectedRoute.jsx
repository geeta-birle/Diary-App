import { Navigate } from "react-router-dom";
import { auth } from "../firebase";

function ProtectedRoute({ children }) {
  return auth.currentUser ? children : <Navigate to="/login" />;
}

export default ProtectedRoute;