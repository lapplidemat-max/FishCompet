import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchUserCatches } from "../services/catches";

/*
  MODIFICATION :
  Le dashboard utilise maintenant les vraies captures Supabase
  au lieu des données de démonstration.
*/

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [catchCount, setCatchCount] = useState(0);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        if (!user?.id) {
          return;
        }

        const catches = await fetchUserCatches(user.id);
        setCatchCount(catches.length);
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
          <p className="stat-card__label">Captures enregistrées</p>
          <p className="stat-card__value">{catchCount}</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Concours actifs</p>
          <p className="stat-card__value">0</p>
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

      <div className="card">
        <h3 className="card-title">État actuel</h3>
        <p className="card-text">
          Les captures sont maintenant branchées à Supabase. Le calcul exact du
          poids sera finalisé dès ajout des barèmes JSON.
        </p>
      </div>
    </section>
  );
}