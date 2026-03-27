import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CatchesPage from "./pages/CatchesPage";
import AddCatchPage from "./pages/AddCatchPage";
import CompetitionsPage from "./pages/CompetitionsPage";
import CompetitionDetailsPage from "./pages/CompetitionDetailsPage";
import ProfilePage from "./pages/ProfilePage";
import NotFoundPage from "./pages/NotFoundPage";

/*
  MODIFICATION ADMIN :
  import de la page admin
*/
import AdminDashboardPage from "./pages/AdminDashboardPage";

/*
  MODIFICATION :
  - ajout de la route détail concours
  - protection des pages internes via ProtectedRoute

  NOUVELLES MODIFICATIONS :
  - blocage global si profil incomplet
  - redirection automatique vers /profil
  - bannière globale sur la page profil tant que le profil n'est pas complet

  NOUVELLE MODIFICATION ADMIN :
  - ajout d'une route protégée admin
*/

/*
  MODIFICATION ADMIN :
  route protégée pour accès admin uniquement
*/
function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function ProfileCompletionGuard({ children }) {
  const { user, isProfileComplete, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (user && !isProfileComplete && location.pathname !== "/profil") {
    return <Navigate to="/profil" replace />;
  }

  return children;
}

function ProfileCompletionBanner() {
  const { user, isProfileComplete, loading } = useAuth();
  const location = useLocation();

  if (loading || !user || isProfileComplete || location.pathname !== "/profil") {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: "16px",
        padding: "12px 16px",
        borderRadius: "12px",
        background: "#fff7ed",
        border: "1px solid #fdba74",
        color: "#9a3412"
      }}
    >
      Ton profil doit être complété avant d’utiliser l’application.
      Remplis les champs obligatoires puis enregistre.
    </div>
  );
}

function ProtectedAppShell() {
  return (
    <>
      <ProfileCompletionBanner />
      <AppLayout />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <ProfileCompletionGuard>
              <ProtectedAppShell />
            </ProfileCompletionGuard>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/tableau-de-bord" replace />} />

        <Route path="/tableau-de-bord" element={<DashboardPage />} />
        <Route path="/captures" element={<CatchesPage />} />
        <Route path="/captures/ajouter" element={<AddCatchPage />} />
        <Route path="/concours" element={<CompetitionsPage />} />
        <Route
          path="/concours/:competitionId"
          element={<CompetitionDetailsPage />}
        />

        <Route path="/profil" element={<ProfilePage />} />

        {/* =========================
            MODIFICATION ADMIN
            ========================= */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}