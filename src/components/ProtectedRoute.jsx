import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/*
  MODIFICATION :
  Ajout d'un affichage de debug pour comprendre si le blocage
  vient de loading, de l'utilisateur ou de la session.
*/

export default function ProtectedRoute({ children }) {
  const { user, loading, profile, session } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: "24px" }}>
        <p>Chargement...</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(
            {
              loading,
              hasUser: !!user,
              hasProfile: !!profile,
              hasSession: !!session
            },
            null,
            2
          )}
        </pre>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/connexion" replace />;
  }

  return children;
}