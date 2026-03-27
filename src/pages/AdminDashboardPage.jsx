import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  adminDeleteManyCatches,
  adminDeleteManyCompetitions,
  adminFetchAllCatches,
  adminFetchAllCompetitions,
  adminFetchAllUsers,
  adminToggleUserBan,
  fetchAdminGlobalStats
} from "../services/admin";

/*
  MODIFICATION ADMIN :
  - tableau de bord admin complet
  - statistiques globales : captures, utilisateurs, concours
  - suppression multiple des captures
  - suppression multiple des concours
  - bannissement / débannissement d'un utilisateur
  - accès réservé aux admins côté interface

  IMPORTANT :
  - les vraies autorisations restent gérées par les policies Supabase
  - cette page repose sur AuthContext -> isAdmin
  - cette page repose sur ../services/admin
*/

const TAB_STATS = "stats";
const TAB_USERS = "users";
const TAB_CATCHES = "catches";
const TAB_COMPETITIONS = "competitions";

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("fr-FR");
}

function getUserDisplayName(userItem) {
  if (userItem?.pseudo) {
    return userItem.pseudo;
  }

  const fullName = `${userItem?.prenom || ""} ${userItem?.nom || ""}`.trim();

  if (fullName) {
    return fullName;
  }

  return userItem?.email || "Utilisateur";
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { isAdmin, loading, user } = useAuth();

  const [activeTab, setActiveTab] = useState(TAB_STATS);
  const [stats, setStats] = useState({
    catchesCount: 0,
    competitionsCount: 0,
    usersCount: 0,
    adminsCount: 0,
    bannedUsersCount: 0
  });
  const [users, setUsers] = useState([]);
  const [catches, setCatches] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [selectedCatchIds, setSelectedCatchIds] = useState([]);
  const [selectedCompetitionIds, setSelectedCompetitionIds] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [message, setMessage] = useState("");

  async function loadAdminData() {
    try {
      setLoadingData(true);
      setMessage("");

      const [statsData, usersData, catchesData, competitionsData] =
        await Promise.all([
          fetchAdminGlobalStats(),
          adminFetchAllUsers(),
          adminFetchAllCatches(),
          adminFetchAllCompetitions()
        ]);

      setStats(statsData);
      setUsers(usersData);
      setCatches(catchesData);
      setCompetitions(competitionsData);
      setSelectedCatchIds([]);
      setSelectedCompetitionIds([]);
    } catch (error) {
      setMessage(error.message || "Erreur lors du chargement admin.");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
      return;
    }

    if (isAdmin) {
      loadAdminData();
    }
  }, [loading, isAdmin]);

  const canRenderAdmin = !loading && isAdmin;

  const selectedUsersCount = useMemo(() => users.filter((item) => item.is_banned).length, [users]);

  function handleToggleCatchSelection(catchId) {
    setSelectedCatchIds((prev) =>
      prev.includes(catchId)
        ? prev.filter((id) => id !== catchId)
        : [...prev, catchId]
    );
  }

  function handleToggleCompetitionSelection(competitionId) {
    setSelectedCompetitionIds((prev) =>
      prev.includes(competitionId)
        ? prev.filter((id) => id !== competitionId)
        : [...prev, competitionId]
    );
  }

  function handleSelectAllCatches() {
    if (selectedCatchIds.length === catches.length) {
      setSelectedCatchIds([]);
      return;
    }

    setSelectedCatchIds(catches.map((item) => item.id));
  }

  function handleSelectAllCompetitions() {
    if (selectedCompetitionIds.length === competitions.length) {
      setSelectedCompetitionIds([]);
      return;
    }

    setSelectedCompetitionIds(competitions.map((item) => item.id));
  }

  async function handleDeleteSelectedCatches() {
    if (selectedCatchIds.length === 0) {
      setMessage("Sélectionne au moins une capture.");
      return;
    }

    const confirmed = window.confirm(
      `Supprimer ${selectedCatchIds.length} capture(s) ?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyAction(true);
      await adminDeleteManyCatches(selectedCatchIds);
      setMessage("Captures supprimées avec succès.");
      await loadAdminData();
    } catch (error) {
      setMessage(error.message || "Erreur lors de la suppression des captures.");
    } finally {
      setBusyAction(false);
    }
  }

  async function handleDeleteSelectedCompetitions() {
    if (selectedCompetitionIds.length === 0) {
      setMessage("Sélectionne au moins un concours.");
      return;
    }

    const confirmed = window.confirm(
      `Supprimer ${selectedCompetitionIds.length} concours ? Cette action est définitive.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyAction(true);
      await adminDeleteManyCompetitions(selectedCompetitionIds);
      setMessage("Concours supprimés avec succès.");
      await loadAdminData();
    } catch (error) {
      setMessage(error.message || "Erreur lors de la suppression des concours.");
    } finally {
      setBusyAction(false);
    }
  }

  async function handleToggleBan(targetUser) {
    if (!targetUser?.id) {
      return;
    }

    if (user?.id === targetUser.id) {
      setMessage("Tu ne peux pas te bannir toi-même.");
      return;
    }

    const nextBannedState = !targetUser.is_banned;
    const confirmed = window.confirm(
      nextBannedState
        ? `Bannir ${getUserDisplayName(targetUser)} ?`
        : `Débannir ${getUserDisplayName(targetUser)} ?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyAction(true);
      await adminToggleUserBan({
        userId: targetUser.id,
        isBanned: nextBannedState
      });
      setMessage(
        nextBannedState
          ? "Utilisateur banni avec succès."
          : "Utilisateur débanni avec succès."
      );
      await loadAdminData();
    } catch (error) {
      setMessage(error.message || "Erreur lors de la mise à jour du bannissement.");
    } finally {
      setBusyAction(false);
    }
  }

  if (!canRenderAdmin) {
    return null;
  }

  return (
    <section>
      <h2 className="page-title">Administration</h2>
      <p className="page-description">
        Tableau de bord admin : statistiques globales, gestion des captures,
        des concours et des utilisateurs.
      </p>

      {message ? (
        <div className="card" style={{ background: "#fff7ed" }}>
          <p className="card-text" style={{ margin: 0 }}>
            {message}
          </p>
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Captures</p>
          <p className="stat-card__value">{stats.catchesCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Concours</p>
          <p className="stat-card__value">{stats.competitionsCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Utilisateurs</p>
          <p className="stat-card__value">{stats.usersCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Admins</p>
          <p className="stat-card__value">{stats.adminsCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Bannis</p>
          <p className="stat-card__value">{stats.bannedUsersCount}</p>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={activeTab === TAB_STATS ? "primary-button" : "secondary-button"}
            onClick={() => setActiveTab(TAB_STATS)}
          >
            Vue globale
          </button>
          <button
            type="button"
            className={activeTab === TAB_USERS ? "primary-button" : "secondary-button"}
            onClick={() => setActiveTab(TAB_USERS)}
          >
            Utilisateurs
          </button>
          <button
            type="button"
            className={activeTab === TAB_CATCHES ? "primary-button" : "secondary-button"}
            onClick={() => setActiveTab(TAB_CATCHES)}
          >
            Captures
          </button>
          <button
            type="button"
            className={activeTab === TAB_COMPETITIONS ? "primary-button" : "secondary-button"}
            onClick={() => setActiveTab(TAB_COMPETITIONS)}
          >
            Concours
          </button>
        </div>
      </div>

      {loadingData ? (
        <div className="card">
          <p className="card-text">Chargement des données admin...</p>
        </div>
      ) : null}

      {!loadingData && activeTab === TAB_STATS ? (
        <div className="actions-grid">
          <div className="card">
            <h3 className="card-title">Résumé</h3>
            <p className="card-text">
              {stats.usersCount} utilisateurs dont {stats.adminsCount} admin(s)
              et {stats.bannedUsersCount} compte(s) banni(s).
            </p>
            <p className="card-text">
              {stats.catchesCount} capture(s) enregistrée(s) et {stats.competitionsCount} concours.
            </p>
          </div>

          <div className="card">
            <h3 className="card-title">Raccourcis admin</h3>
            <p className="card-text">Utilise les onglets ci-dessus pour gérer rapidement l'application.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" className="secondary-button" onClick={() => setActiveTab(TAB_USERS)}>
                Gérer les utilisateurs
              </button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab(TAB_CATCHES)}>
                Gérer les captures
              </button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab(TAB_COMPETITIONS)}>
                Gérer les concours
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loadingData && activeTab === TAB_USERS ? (
        <div className="card">
          <h3 className="card-title">Utilisateurs ({users.length})</h3>
          <p className="form-helper" style={{ marginBottom: 16 }}>
            Comptes bannis actuellement : {selectedUsersCount}
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {users.map((userItem) => (
              <div
                key={userItem.id}
                className="card"
                style={{ margin: 0, border: userItem.is_banned ? "1px solid #ef4444" : undefined }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h4 className="card-title" style={{ marginBottom: 8 }}>
                      {getUserDisplayName(userItem)}
                    </h4>
                    <p className="card-text">Email : {userItem.email || "—"}</p>
                    <p className="card-text">Rôle : {userItem.role || "user"}</p>
                    <p className="card-text">Plan : {userItem.plan || "—"}</p>
                    <p className="card-text">Créé le : {formatDateTime(userItem.created_at)}</p>
                    <p className="card-text">
                      Statut : {userItem.is_banned ? "Banni" : "Actif"}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start" }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleToggleBan(userItem)}
                      disabled={busyAction || user?.id === userItem.id}
                    >
                      {userItem.is_banned ? "Débannir" : "Bannir"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!loadingData && activeTab === TAB_CATCHES ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 className="card-title">Captures ({catches.length})</h3>
              <p className="form-helper">Suppression multiple admin activée.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="secondary-button" onClick={handleSelectAllCatches}>
                {selectedCatchIds.length === catches.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleDeleteSelectedCatches}
                disabled={busyAction || selectedCatchIds.length === 0}
              >
                Supprimer la sélection ({selectedCatchIds.length})
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {catches.map((catchItem) => (
              <label key={catchItem.id} className="card" style={{ margin: 0, cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={selectedCatchIds.includes(catchItem.id)}
                    onChange={() => handleToggleCatchSelection(catchItem.id)}
                  />
                  <div>
                    <h4 className="card-title" style={{ marginBottom: 8 }}>
                      {catchItem.espece || "Espèce non renseignée"}
                    </h4>
                    <p className="card-text">Utilisateur : {catchItem.user_id}</p>
                    <p className="card-text">Longueur : {catchItem.longueur_cm ?? "—"} cm</p>
                    <p className="card-text">Poids : {catchItem.poids_g ?? "—"} g</p>
                    <p className="card-text">Date : {formatDateTime(catchItem.date_heure)}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {!loadingData && activeTab === TAB_COMPETITIONS ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 className="card-title">Concours ({competitions.length})</h3>
              <p className="form-helper">Suppression multiple admin activée.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="secondary-button" onClick={handleSelectAllCompetitions}>
                {selectedCompetitionIds.length === competitions.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleDeleteSelectedCompetitions}
                disabled={busyAction || selectedCompetitionIds.length === 0}
              >
                Supprimer la sélection ({selectedCompetitionIds.length})
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {competitions.map((competition) => (
              <label key={competition.id} className="card" style={{ margin: 0, cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={selectedCompetitionIds.includes(competition.id)}
                    onChange={() => handleToggleCompetitionSelection(competition.id)}
                  />
                  <div>
                    <h4 className="card-title" style={{ marginBottom: 8 }}>
                      {competition.name || "Concours sans nom"}
                    </h4>
                    <p className="card-text">Code : {competition.code || "—"}</p>
                    <p className="card-text">Créateur : {competition.creator_id || "—"}</p>
                    <p className="card-text">Début : {formatDateTime(competition.start_date)}</p>
                    <p className="card-text">Fin : {formatDateTime(competition.end_date)}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
