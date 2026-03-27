import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { fetchUserCatches } from "../services/catches";

/*
  MODIFICATION :
  Le dashboard utilise maintenant les vraies captures Supabase
  au lieu des données de démonstration.
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
          return;
        }

        /*
          MODIFICATION ADMIN :
          - un admin voit les compteurs globaux
          - un utilisateur voit ses compteurs personnels
        */
        if (isAdmin) {
          const [
            { count: catchesCount, error: catchesError },
            { count: competitionsCount, error: competitionsError }
          ] = await Promise.all([
            supabase.from("catches").select("*", { count: "exact", head: true }),
            supabase.from("competitions").select("*", { count: "exact", head: true })
          ]);

          if (catchesError) {
            throw catchesError;
          }

          if (competitionsError) {
            throw competitionsError;
          }

          setCatchCount(catchesCount || 0);
          setCompetitionCount(competitionsCount || 0);
          return;
        }

        const catches = await fetchUserCatches(user.id);
        setCatchCount(catches.length);
      } catch (error) {
        console.error("Erreur dashboard :", error.message);
      }
    }

    loadDashboardData();
  }, [user?.id, isAdmin]);

  return (
    <section>
      <h2 className="page-title">Tableau de bord</h2>
      <p className="page-description">
        {profile?.pseudo
          ? `Bienvenue ${profile.pseudo}`
          : `Bienvenue ${user?.email || ""}`}
      </p>

      {isAdmin ? (
        <div className="card">
          <h3 className="card-title">Mode administrateur</h3>
          <p className="card-text">
            Tu as accès aux compteurs globaux et aux écrans de gestion complète
            des captures et des concours.
          </p>
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Captures enregistrées</p>
          <p className="stat-card__value">{catchCount}</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Concours actifs</p>
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

      {isAdmin ? (
        <div className="actions-grid">
          <div className="card">
            <h3 className="card-title">Administration des captures</h3>
            <p className="card-text">
              Consulte et supprime toutes les captures enregistrées.
            </p>

            <div style={{ marginTop: "12px" }}>
              <button
                className="primary-button"
                onClick={() => navigate("/captures")}
              >
                Gérer les captures
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Administration des concours</h3>
            <p className="card-text">
              Consulte tous les concours, ouvre leur détail et supprime-les si
              nécessaire.
            </p>

            <div style={{ marginTop: "12px" }}>
              <button
                className="secondary-button"
                onClick={() => navigate("/concours")}
              >
                Gérer les concours
              </button>
            </div>
          </div>
        </div>
      ) : null}

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