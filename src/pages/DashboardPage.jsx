import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchUserCatches } from "../services/catches";
import { fetchUserCompetitions } from "../services/competitions";

/*
  MODIFICATION :
  Le dashboard utilise maintenant les vraies données Supabase
  au lieu des données de démonstration.

  MODIFICATION ADMIN :
  - retrait des compteurs globaux sur cette page
  - retrait des cartes d’administration dispersées
  - le dashboard redevient une page utilisateur classique
  - l’administration complète est centralisée sur /admin
*/

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, user, isAdmin } = useAuth();
  const [catchCount, setCatchCount] = useState(0);
  const [competitionCount, setCompetitionCount] = useState(0);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        if (!user?.id) {
          setCatchCount(0);
          setCompetitionCount(0);
          return;
        }

        /*
          MODIFICATION ADMIN :
          retour à un comportement normal :
          le dashboard affiche toujours les données personnelles.
        */
        const [catches, competitions] = await Promise.all([
          fetchUserCatches(user.id),
          fetchUserCompetitions(user.id)
        ]);

        setCatchCount(catches.length);
        setCompetitionCount(competitions.length);
      } catch (error) {
        console.error("Erreur dashboard :", error.message);
      }
    }

    loadDashboardData();
  }, [user?.id]);

  return (
    <section>
      <h2 className="page-title">Tableau de bord</h2>
      <p className="page-description">
        {profile?.pseudo
          ? `Bienvenue ${profile.pseudo}`
          : `Bienvenue ${user?.email || ""}`}
      </p>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Mes captures</p>
          <p className="stat-card__value">{catchCount}</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Mes concours</p>
          <p className="stat-card__value">{competitionCount}</p>
        </div>
      </div>

      <div className="actions-grid">
        <div className="card">
          <h3 className="card-title">Ajouter une capture</h3>
          <p className="card-text">
            Enregistre une nouvelle prise avec espèce, longueur, photo, date et
            commentaire.
          </p>

          <div style={{ marginTop: "12px" }}>
            <button
              className="primary-button"
              onClick={() => navigate("/captures/ajouter")}
            >
              Nouvelle capture
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Consulter les captures</h3>
          <p className="card-text">
            Affiche toutes tes prises enregistrées dans l’application web.
          </p>

          <div style={{ marginTop: "12px" }}>
            <button
              className="secondary-button"
              onClick={() => navigate("/captures")}
            >
              Voir mes captures
            </button>
          </div>
        </div>
      </div>

      <div className="actions-grid">
        <div className="card">
          <h3 className="card-title">Mes concours</h3>
          <p className="card-text">
            Crée un concours, rejoins-en un avec un code et consulte leur
            détail.
          </p>

          <div style={{ marginTop: "12px" }}>
            <button
              className="secondary-button"
              onClick={() => navigate("/concours")}
            >
              Voir mes concours
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Mon profil</h3>
          <p className="card-text">
            Consulte et mets à jour tes informations personnelles.
          </p>

          <div style={{ marginTop: "12px" }}>
            <button
              className="secondary-button"
              onClick={() => navigate("/profil")}
            >
              Voir mon profil
            </button>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="card">
          <h3 className="card-title">Administration</h3>
          <p className="card-text">
            Tu as accès à l’espace d’administration centralisé pour gérer les
            utilisateurs, captures, concours et statistiques globales.
          </p>

          <div style={{ marginTop: "12px" }}>
            <button
              className="primary-button"
              onClick={() => navigate("/admin")}
            >
              Ouvrir l’administration
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3 className="card-title">État actuel</h3>
        <p className="card-text">
          Les captures sont maintenant branchées à Supabase. Le calcul exact du
          poids est géré selon le barème sélectionné.
        </p>
      </div>
    </section>
  );
}