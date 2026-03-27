import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { deleteCatch, fetchUserCatches } from "../services/catches";

/*
  MODIFICATION :
  Cette page lit maintenant les vraies captures depuis Supabase.

  AJOUTS :
  - chargement réel
  - affichage photo si disponible
  - suppression d'une capture

  NOUVELLES MODIFICATIONS :
  - filtres client :
    > espèce
    > date
    > concours
    > lieu
  - récapitulatif des prises filtrées :
    > nombre de prises
    > poids total
    > nombre d'espèces
  - affichage enrichi concours / lieu si disponible dans les données

  DERNIÈRE MODIFICATION :
  - les filtres sont masqués par défaut
  - ajout d'un bouton afficher / masquer les filtres
*/

const ALL_FILTER_VALUE = "__all__";

function getCatchSpeciesLabel(catchItem) {
  return String(catchItem?.espece || "Espèce non renseignée").trim();
}

/*
  MODIFICATION :
  Récupère un libellé de concours de manière robuste selon les données disponibles.
*/
function getCatchCompetitionLabel(catchItem) {
  if (catchItem?.competition_name) {
    return String(catchItem.competition_name).trim();
  }

  if (catchItem?.competition?.name) {
    return String(catchItem.competition.name).trim();
  }

  if (catchItem?.concours_nom) {
    return String(catchItem.concours_nom).trim();
  }

  if (catchItem?.concours?.name) {
    return String(catchItem.concours.name).trim();
  }

  return "Sans concours";
}

/*
  MODIFICATION :
  Récupère un libellé de lieu de manière robuste selon les données disponibles.
*/
function getCatchLocationLabel(catchItem) {
  if (catchItem?.lieu) {
    return String(catchItem.lieu).trim();
  }

  if (catchItem?.location_name) {
    return String(catchItem.location_name).trim();
  }

  if (catchItem?.location_label) {
    return String(catchItem.location_label).trim();
  }

  if (catchItem?.localisation) {
    return String(catchItem.localisation).trim();
  }

  if (catchItem?.localisation_nom) {
    return String(catchItem.localisation_nom).trim();
  }

  if (catchItem?.location_text) {
    return String(catchItem.location_text).trim();
  }

  if (catchItem?.spot_name) {
    return String(catchItem.spot_name).trim();
  }

  /*
    MODIFICATION :
    fallback sur latitude / longitude si disponibles.
  */
  if (
    catchItem?.latitude !== undefined &&
    catchItem?.latitude !== null &&
    catchItem?.longitude !== undefined &&
    catchItem?.longitude !== null
  ) {
    return `${catchItem.latitude}, ${catchItem.longitude}`;
  }

  return "Lieu non renseigné";
}

/*
  MODIFICATION :
  Transforme une date ISO en valeur YYYY-MM-DD pour le filtre date.
*/
function toFilterDateValue(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function CatchesPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [catches, setCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  /*
    MODIFICATION :
    états de filtres.
  */
  const [selectedSpecies, setSelectedSpecies] = useState(ALL_FILTER_VALUE);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedCompetition, setSelectedCompetition] =
    useState(ALL_FILTER_VALUE);
  const [selectedLocation, setSelectedLocation] = useState(ALL_FILTER_VALUE);

  /*
    MODIFICATION :
    les filtres sont masqués par défaut pour limiter le scroll.
  */
  const [showFilters, setShowFilters] = useState(false);

  async function loadCatches() {
    try {
      if (!user?.id) {
        return;
      }

      setLoading(true);
      setMessage("");
      /*
        MODIFICATION ADMIN :
        - un admin charge toutes les captures
        - un utilisateur standard charge seulement ses captures
      */
      if (isAdmin) {
        const { data, error } = await supabase
          .from("catches")
          .select("*")
          .order("date_heure", { ascending: false });

        if (error) {
          throw error;
        }

        setCatches(data || []);
        return;
      }

      const data = await fetchUserCatches(user.id);
      setCatches(data || []);
    } catch (error) {
      setMessage(error.message || "Erreur lors du chargement des captures.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCatches();
  }, [user?.id, isAdmin]);

  async function handleDelete(catchId) {
    const confirmed = window.confirm(
      "Voulez-vous vraiment supprimer cette capture ?"
    );

    if (!confirmed) {
      return;
    }

    try {
      /*
        MODIFICATION ADMIN :
        - un admin peut supprimer n’importe quelle capture
        - on supprime aussi les liaisons concours associées
      */
      if (isAdmin) {
        const { error: deleteCompetitionLinksError } = await supabase
          .from("competition_catches")
          .delete()
          .eq("catch_id", catchId);

        if (deleteCompetitionLinksError) {
          throw deleteCompetitionLinksError;
        }

        const { error: deleteCatchError } = await supabase
          .from("catches")
          .delete()
          .eq("id", catchId);

        if (deleteCatchError) {
          throw deleteCatchError;
        }
      } else {
        await deleteCatch(catchId, user.id);
      }

      await loadCatches();
    } catch (error) {
      setMessage(error.message || "Erreur lors de la suppression.");
    }
  }

  /*
    MODIFICATION :
    options de filtres calculées depuis les captures réelles.
  */
  const speciesOptions = useMemo(() => {
    return Array.from(
      new Set(catches.map((catchItem) => getCatchSpeciesLabel(catchItem)))
    ).sort((a, b) => a.localeCompare(b, "fr"));
  }, [catches]);

  const competitionOptions = useMemo(() => {
    return Array.from(
      new Set(catches.map((catchItem) => getCatchCompetitionLabel(catchItem)))
    ).sort((a, b) => a.localeCompare(b, "fr"));
  }, [catches]);

  const locationOptions = useMemo(() => {
    return Array.from(
      new Set(catches.map((catchItem) => getCatchLocationLabel(catchItem)))
    ).sort((a, b) => a.localeCompare(b, "fr"));
  }, [catches]);

  /*
    MODIFICATION :
    application combinée des filtres.
  */
  const filteredCatches = useMemo(() => {
    return catches.filter((catchItem) => {
      const speciesLabel = getCatchSpeciesLabel(catchItem);
      const competitionLabel = getCatchCompetitionLabel(catchItem);
      const locationLabel = getCatchLocationLabel(catchItem);
      const catchDateValue = toFilterDateValue(catchItem?.date_heure);

      const speciesMatches =
        selectedSpecies === ALL_FILTER_VALUE ||
        speciesLabel === selectedSpecies;

      const dateMatches = !selectedDate || catchDateValue === selectedDate;

      const competitionMatches =
        selectedCompetition === ALL_FILTER_VALUE ||
        competitionLabel === selectedCompetition;

      const locationMatches =
        selectedLocation === ALL_FILTER_VALUE ||
        locationLabel === selectedLocation;

      return (
        speciesMatches && dateMatches && competitionMatches && locationMatches
      );
    });
  }, [
    catches,
    selectedSpecies,
    selectedDate,
    selectedCompetition,
    selectedLocation
  ]);

  /*
    MODIFICATION :
    récapitulatif des prises filtrées.
  */
  const recap = useMemo(() => {
    const catchesCount = filteredCatches.length;

    const totalWeight = filteredCatches.reduce((sum, catchItem) => {
      return sum + Number(catchItem?.poids_g || 0);
    }, 0);

    const speciesCount = new Set(
      filteredCatches.map((catchItem) => getCatchSpeciesLabel(catchItem))
    ).size;

    return {
      catchesCount,
      totalWeight,
      speciesCount
    };
  }, [filteredCatches]);

  function resetFilters() {
    setSelectedSpecies(ALL_FILTER_VALUE);
    setSelectedDate("");
    setSelectedCompetition(ALL_FILTER_VALUE);
    setSelectedLocation(ALL_FILTER_VALUE);
  }

  return (
    <section>
      <h2 className="page-title">Mes captures</h2>
      <p className="page-description">
        Liste réelle des captures enregistrées dans Supabase.
      </p>

      {isAdmin ? (
        <div className="card">
          <p className="card-text">
            Mode admin actif : cette page affiche toutes les captures et permet
            leur suppression globale.
          </p>
        </div>
      ) : null}

      <div className="card">
        <button
          className="primary-button"
          onClick={() => navigate("/captures/ajouter")}
        >
          Ajouter une capture
        </button>
      </div>

      {message ? (
        <div className="card">
          <p className="card-text">{message}</p>
        </div>
      ) : null}

      {/* MODIFICATION :
          bloc filtres captures avec affichage masqué par défaut.
      */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: showFilters ? "16px" : "0"
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            Filtres
          </h3>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowFilters((prev) => !prev)}
          >
            {showFilters ? "Masquer les filtres" : "Afficher les filtres"}
          </button>
        </div>

        {showFilters ? (
          <div className="form">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="filter-species">
                  Espèce
                </label>
                <select
                  id="filter-species"
                  className="form-select"
                  value={selectedSpecies}
                  onChange={(event) => setSelectedSpecies(event.target.value)}
                >
                  <option value={ALL_FILTER_VALUE}>Toutes les espèces</option>
                  {speciesOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="filter-date">
                  Date
                </label>
                <input
                  id="filter-date"
                  className="form-input"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="filter-competition">
                  Concours
                </label>
                <select
                  id="filter-competition"
                  className="form-select"
                  value={selectedCompetition}
                  onChange={(event) => setSelectedCompetition(event.target.value)}
                >
                  <option value={ALL_FILTER_VALUE}>Tous les concours</option>
                  {competitionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="filter-location">
                  Lieu
                </label>
                <select
                  id="filter-location"
                  className="form-select"
                  value={selectedLocation}
                  onChange={(event) => setSelectedLocation(event.target.value)}
                >
                  <option value={ALL_FILTER_VALUE}>Tous les lieux</option>
                  {locationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ alignSelf: "end" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={resetFilters}
              >
                Réinitialiser les filtres
              </button>
            </div>
          </div>
        ) : (
          <p className="card-text">
            Les filtres sont masqués pour limiter le scroll.
          </p>
        )}
      </div>

      {/* MODIFICATION :
          bloc récapitulatif des prises filtrées.
      */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Prises</p>
          <p className="stat-card__value">{recap.catchesCount}</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Poids total</p>
          <p className="stat-card__value">{recap.totalWeight} g</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Espèces</p>
          <p className="stat-card__value">{recap.speciesCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <p className="card-text">Chargement des captures...</p>
        </div>
      ) : catches.length === 0 ? (
        <div className="card empty-state">
          <h3 className="empty-state__title">Aucune capture</h3>
          <p className="empty-state__text">
            Commence par enregistrer ta première prise.
          </p>
        </div>
      ) : filteredCatches.length === 0 ? (
        <div className="card empty-state">
          <h3 className="empty-state__title">Aucun résultat</h3>
          <p className="empty-state__text">
            Aucune capture ne correspond aux filtres sélectionnés.
          </p>
        </div>
      ) : (
        <div className="simple-list">
          {filteredCatches.map((catchItem) => (
            <article key={catchItem.id} className="list-item">
              {catchItem.photo_url ? (
                <img
                  src={catchItem.photo_url}
                  alt={catchItem.espece}
                  style={{
                    width: "100%",
                    maxHeight: "220px",
                    objectFit: "cover",
                    borderRadius: "12px",
                    marginBottom: "12px"
                  }}
                />
              ) : null}

              <h3 className="list-item__title">{catchItem.espece}</h3>
              <p className="list-item__meta">
                Longueur : {catchItem.longueur_cm} cm
              </p>
              <p className="list-item__meta">
                Poids :{" "}
                {catchItem.poids_g !== null
                  ? `${catchItem.poids_g} g`
                  : "En attente du barème complet"}
              </p>
              <p className="list-item__meta">
                Zone : {catchItem.zone_bareme}
              </p>
              <p className="list-item__meta">
                Date : {new Date(catchItem.date_heure).toLocaleString("fr-FR")}
              </p>

              {isAdmin ? (
                <p className="list-item__meta">
                  Propriétaire : {catchItem.user_id || "Utilisateur inconnu"}
                </p>
              ) : null}

              {/* MODIFICATION :
                  affichage lieu si disponible.
              */}
              <p className="list-item__meta">
                Lieu : {getCatchLocationLabel(catchItem)}
              </p>

              {/* MODIFICATION :
                  affichage concours si disponible.
              */}
              <p className="list-item__meta">
                Concours : {getCatchCompetitionLabel(catchItem)}
              </p>

              <p className="list-item__meta">
                Commentaire : {catchItem.commentaire || "Aucun"}
              </p>

              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleDelete(catchItem.id)}
                >
                  Supprimer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}