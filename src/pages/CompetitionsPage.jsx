import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  createCompetition,
  fetchUserCompetitions,
  getCompetitionEntryDeadline,
  getCompetitionEntryStatus,
  joinCompetition
} from "../services/competitions";

/*
  MODIFICATION :
  Page concours :
  - création de concours avec options
  - mode d'affichage des participants : pseudo / nom prénom
  - visibilité des résultats : direct / masqué / horaire
  - ajout de la date/heure de début
  - ajout de la date/heure de fin
  - ajout du délai de saisie après la fin

  NOUVELLE MODIFICATION :
  - formulaire de création de concours masqué par défaut
  - ajout d'un bouton afficher / masquer la création
*/

function toDateTimeLocalString(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function getDefaultStartDateTimeLocal() {
  return toDateTimeLocalString(new Date());
}

function getDefaultEndDateTimeLocal() {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  return toDateTimeLocalString(date);
}

export default function CompetitionsPage() {
  const { user, isAdmin } = useAuth();

  const [competitions, setCompetitions] = useState([]);
  const [newCompetitionName, setNewCompetitionName] = useState("");
  const [participantDisplayMode, setParticipantDisplayMode] = useState("pseudo");
  const [resultsVisibility, setResultsVisibility] = useState("immediate");
  const [startDate, setStartDate] = useState(getDefaultStartDateTimeLocal());
  const [endDate, setEndDate] = useState(getDefaultEndDateTimeLocal());
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(30);
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");

  /*
    MODIFICATION :
    le formulaire de création est masqué par défaut
    pour éviter trop de scroll sur l'écran.
  */
  const [showCreateCompetitionForm, setShowCreateCompetitionForm] =
    useState(false);

  async function loadCompetitions() {
    try {
      if (!user?.id) {
        return;
      }

      /*
        MODIFICATION ADMIN :
        - un admin charge tous les concours
        - un utilisateur standard charge ses concours / concours rejoints
      */
      if (isAdmin) {
        const { data, error } = await supabase
          .from("competitions")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          throw error;
        }

        setCompetitions(data || []);
        return;
      }

      const data = await fetchUserCompetitions(user.id);
      setCompetitions(data);
    } catch (error) {
      setMessage(error.message || "Erreur lors du chargement des concours.");
    }
  }

  useEffect(() => {
    if (user?.id) {
      loadCompetitions();
    }
  }, [user?.id, isAdmin]);

  async function handleCreateCompetition(event) {
    event.preventDefault();
    setMessage("");

    try {
      if (!startDate) {
        throw new Error("La date de début du concours est obligatoire.");
      }

      if (!endDate) {
        throw new Error("La date de fin du concours est obligatoire.");
      }

      const parsedStartDate = new Date(startDate);
      const parsedEndDate = new Date(endDate);
      const parsedGraceMinutes = Number(gracePeriodMinutes);

      if (Number.isNaN(parsedStartDate.getTime())) {
        throw new Error("La date de début du concours est invalide.");
      }

      if (Number.isNaN(parsedEndDate.getTime())) {
        throw new Error("La date de fin du concours est invalide.");
      }

      if (parsedEndDate <= parsedStartDate) {
        throw new Error("La date de fin doit être après la date de début.");
      }

      if (!Number.isInteger(parsedGraceMinutes) || parsedGraceMinutes < 0) {
        throw new Error("Le délai de saisie doit être un nombre entier positif.");
      }

      await createCompetition({
        name: newCompetitionName.trim(),
        userId: user.id,
        participantDisplayMode,
        resultsVisibility,
        startDate: parsedStartDate.toISOString(),
        endDate: parsedEndDate.toISOString(),
        gracePeriodMinutes: parsedGraceMinutes
      });

      setNewCompetitionName("");
      setParticipantDisplayMode("pseudo");
      setResultsVisibility("immediate");
      setStartDate(getDefaultStartDateTimeLocal());
      setEndDate(getDefaultEndDateTimeLocal());
      setGracePeriodMinutes(30);

      /*
        MODIFICATION :
        on remasque le formulaire après création réussie
        pour garder une page compacte.
      */
      setShowCreateCompetitionForm(false);

      await loadCompetitions();
    } catch (error) {
      setMessage(error.message || "Erreur lors de la création du concours.");
    }
  }

  async function handleJoinCompetition(event) {
    event.preventDefault();
    setMessage("");

    try {
      await joinCompetition({
        code: joinCode,
        userId: user.id
      });

      setJoinCode("");
      await loadCompetitions();
    } catch (error) {
      setMessage(error.message || "Erreur lors de l’inscription au concours.");
    }
  }


  /*
    MODIFICATION ADMIN :
    suppression complète d’un concours avec nettoyage des tables de liaison.
  */
  async function handleDeleteCompetition(competitionId) {
    const confirmed = window.confirm(
      "Voulez-vous vraiment supprimer ce concours ?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");

      const { error: deleteCompetitionCatchesError } = await supabase
        .from("competition_catches")
        .delete()
        .eq("competition_id", competitionId);

      if (deleteCompetitionCatchesError) {
        throw deleteCompetitionCatchesError;
      }

      const { error: deleteParticipantsError } = await supabase
        .from("competition_participants")
        .delete()
        .eq("competition_id", competitionId);

      if (deleteParticipantsError) {
        throw deleteParticipantsError;
      }

      const { error: deleteCompetitionError } = await supabase
        .from("competitions")
        .delete()
        .eq("id", competitionId);

      if (deleteCompetitionError) {
        throw deleteCompetitionError;
      }

      await loadCompetitions();
    } catch (error) {
      setMessage(error.message || "Erreur lors de la suppression du concours.");
    }
  }

  function getResultsVisibilityLabel(value) {
    if (value === "hidden") {
      return "Résultats masqués";
    }

    if (value === "hourly") {
      return "Résultats actualisés toutes les heures";
    }

    return "Résultats en direct";
  }

  function getParticipantDisplayModeLabel(value) {
    return value === "nom_prenom"
      ? "Affichage nom prénom"
      : "Affichage pseudo";
  }

  function getCompetitionStatusLabel(competition) {
    const status = getCompetitionEntryStatus(competition);

    if (status === "pas_commence") {
      return "Pas encore commencé";
    }

    if (status === "delai_saisie") {
      return "Fin de pêche passée, délai de saisie en cours";
    }

    if (status === "termine") {
      return "Terminé";
    }

    if (status === "en_cours") {
      return "En cours";
    }

    return "Dates à vérifier";
  }

  return (
    <section>
      <h2 className="page-title">Concours</h2>
      <p className="page-description">
        Crée un concours, rejoins-en un avec un code, puis consulte son
        classement.
      </p>

      {isAdmin ? (
        <div className="card">
          <p className="card-text">
            Mode admin actif : cette page affiche tous les concours et autorise
            leur suppression.
          </p>
        </div>
      ) : null}

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: showCreateCompetitionForm ? "16px" : "0"
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            Créer un concours
          </h3>

          {/* MODIFICATION :
              bouton afficher / masquer la création de concours.
          */}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowCreateCompetitionForm((prev) => !prev)}
          >
            {showCreateCompetitionForm
              ? "Masquer la création"
              : "Afficher la création"}
          </button>
        </div>

        {showCreateCompetitionForm ? (
          <form onSubmit={handleCreateCompetition} className="form">
            <div className="form-group">
              <label className="form-label" htmlFor="newCompetitionName">
                Nom du concours
              </label>
              <input
                id="newCompetitionName"
                className="form-input"
                placeholder="Nom du concours"
                value={newCompetitionName}
                onChange={(event) => setNewCompetitionName(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="participantDisplayMode">
                Affichage des participants
              </label>
              <select
                id="participantDisplayMode"
                className="form-select"
                value={participantDisplayMode}
                onChange={(event) => setParticipantDisplayMode(event.target.value)}
              >
                <option value="pseudo">Afficher le pseudo</option>
                <option value="nom_prenom">Afficher nom prénom</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="resultsVisibility">
                Affichage des résultats
              </label>
              <select
                id="resultsVisibility"
                className="form-select"
                value={resultsVisibility}
                onChange={(event) => setResultsVisibility(event.target.value)}
              >
                <option value="immediate">Afficher les résultats en direct</option>
                <option value="hidden">Ne pas afficher les résultats</option>
                <option value="hourly">
                  Afficher les résultats avec actualisation horaire
                </option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="startDate">
                Date et heure de début
              </label>
              <input
                id="startDate"
                className="form-input"
                type="datetime-local"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="endDate">
                Date et heure de fin
              </label>
              <input
                id="endDate"
                className="form-input"
                type="datetime-local"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="gracePeriodMinutes">
                Délai de saisie après la fin (minutes)
              </label>
              <input
                id="gracePeriodMinutes"
                className="form-input"
                type="number"
                min="0"
                step="1"
                value={gracePeriodMinutes}
                onChange={(event) => setGracePeriodMinutes(event.target.value)}
                required
              />
              <p className="form-helper">
                Exemple : 30 minutes après le gong pour saisir les prises de fin
                de concours.
              </p>
            </div>

            <button className="primary-button" type="submit">
              Créer
            </button>
          </form>
        ) : (
          <p className="card-text">
            Le formulaire de création est masqué pour limiter le scroll.
          </p>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Rejoindre un concours</h3>

        <form onSubmit={handleJoinCompetition} className="form">
          <input
            className="form-input"
            placeholder="Code du concours"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            required
          />

          <button className="secondary-button" type="submit">
            Rejoindre
          </button>
        </form>
      </div>

      {message ? (
        <div className="card">
          <p className="card-text">{message}</p>
        </div>
      ) : null}

      <div className="card">
        <h3 className="card-title">Mes concours</h3>

        {competitions.length === 0 ? (
          <p className="card-text">Aucun concours pour le moment.</p>
        ) : (
          <div className="simple-list">
            {competitions.map((competition) => (
              <article key={competition.id} className="list-item">
                <h4 className="list-item__title">{competition.name}</h4>
                <p className="list-item__meta">Code : {competition.code}</p>
                <p className="list-item__meta">
                  {getParticipantDisplayModeLabel(
                    competition.participant_display_mode
                  )}
                </p>
                <p className="list-item__meta">
                  {getResultsVisibilityLabel(competition.results_visibility)}
                </p>
                <p className="list-item__meta">
                  Début :{" "}
                  {competition.start_date
                    ? new Date(competition.start_date).toLocaleString("fr-FR")
                    : "Non définie"}
                </p>
                <p className="list-item__meta">
                  Fin :{" "}
                  {competition.end_date
                    ? new Date(competition.end_date).toLocaleString("fr-FR")
                    : "Non définie"}
                </p>
                <p className="list-item__meta">
                  Délai de saisie : {competition.grace_period_minutes || 0} min
                </p>
                <p className="list-item__meta">
                  Date limite de saisie :{" "}
                  {getCompetitionEntryDeadline(competition)
                    ? getCompetitionEntryDeadline(competition).toLocaleString(
                        "fr-FR"
                      )
                    : "Non définie"}
                </p>
                <p className="list-item__meta">
                  Statut : {getCompetitionStatusLabel(competition)}
                </p>
                <p className="list-item__meta">
                  Créé le :{" "}
                  {new Date(competition.created_at).toLocaleString("fr-FR")}
                </p>

                {isAdmin ? (
                  <p className="list-item__meta">
                    Créateur : {competition.creator_id || "Non renseigné"}
                  </p>
                ) : null}

                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap"
                  }}
                >
                  <Link
                    to={`/concours/${competition.id}`}
                    className="primary-button"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: 1
                    }}
                  >
                    Voir le détail
                  </Link>

                  {isAdmin ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleDeleteCompetition(competition.id)}
                      style={{ flex: 1 }}
                    >
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}