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
  MODIFICATION :
  - ajout de la route détail concours
  - protection des pages internes via ProtectedRoute

  NOUVELLES MODIFICATIONS :
  - blocage global si profil incomplet
  - redirection automatique vers /profil
  - bannière globale sur la page profil tant que le profil n'est pas complet
*/

function ProfileCompletionGuard({ children }) {
  const { user, isProfileComplete, loading } = useAuth();
  const location = useLocation();

  /*
    MODIFICATION :
    on attend la fin du chargement auth avant d'afficher les routes.
  */
  if (loading) {
    return null;
  }

  /*
    MODIFICATION :
    si l'utilisateur est connecté mais que son profil est incomplet,
    on bloque tout sauf /profil.
  */
  if (user && !isProfileComplete && location.pathname !== "/profil") {
    return <Navigate to="/profil" replace />;
  }

  return children;
}

function ProfileCompletionBanner() {
  const { user, isProfileComplete, loading } = useAuth();
  const location = useLocation();

  /*
    MODIFICATION :
    la bannière s'affiche uniquement :
    - si connecté
    - si profil incomplet
    - sur la page /profil
  */
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
      {/* MODIFICATION :
          bannière informative globale sur /profil
      */}
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

        {/* MODIFICATION :
            toutes ces pages sont bloquées si profil incomplet
        */}
        <Route path="/tableau-de-bord" element={<DashboardPage />} />
        <Route path="/captures" element={<CatchesPage />} />
        <Route path="/captures/ajouter" element={<AddCatchPage />} />
        <Route path="/concours" element={<CompetitionsPage />} />
        <Route
          path="/concours/:competitionId"
          element={<CompetitionDetailsPage />}
        />

        {/* MODIFICATION :
            profil reste toujours accessible
        */}
        <Route path="/profil" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}