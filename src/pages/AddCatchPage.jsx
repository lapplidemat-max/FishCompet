import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  calculateCatchWeight,
  validateLength
} from "../utils/weightCalculator";
import { createCatch, uploadCatchPhoto } from "../services/catches";
import {
  attachCatchToCompetition,
  fetchUserCompetitions,
  getCompetitionEntryDeadline,
  getCompetitionEntryStatus,
  isCompetitionEntryOpen
} from "../services/competitions";
import baremeAtlantique from "../data/bareme_atl.json";
import baremeMediterranee from "../data/bareme_med.json";

/*
  MODIFICATION :
  - ajout d'une liste déroulante concours
  - récupération des concours auxquels l'utilisateur participe
  - liaison automatique capture -> concours lors de l'enregistrement
  - blocage de l'ajout au concours hors fenêtre :
    début <= maintenant <= fin + délai de saisie
  - affichage du statut du concours dans la liste

  NOUVELLES MODIFICATIONS :
  - blocage de la page si le profil n'est pas complet
  - message clair demandant de compléter le profil
  - désactivation de l'enregistrement tant que le profil n'est pas complet

  NOUVELLES MODIFICATIONS LOCALISATION :
  - messages d'erreur plus précis sur la géolocalisation
  - timeout plus long pour iPhone
  - cache de position autorisé pour améliorer la compatibilité mobile
  - message explicite si le site n'est pas en contexte sécurisé

  NOUVELLE MODIFICATION :
  - ajout d'un bouton "Voir sur la carte"
    après récupération de la position
*/

const initialForm = {
  espece: "",
  longueurCm: "",
  photo: null,
  dateHeure: "",
  commentaire: "",
  zoneBareme: "atlantique",
  latitude: null,
  longitude: null,
  competitionId: ""
};

function getNowForDateTimeLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

/*
  MODIFICATION :
  Construit une URL Google Maps à partir des coordonnées.
*/
function buildMapsUrl(latitude, longitude) {
  if (latitude === null || longitude === null) {
    return "";
  }

  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export default function AddCatchPage() {
  const navigate = useNavigate();
  const { user, isProfileComplete } = useAuth();

  const [formData, setFormData] = useState({
    ...initialForm,
    dateHeure: getNowForDateTimeLocal()
  });
  const [submitting, setSubmitting] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [competitions, setCompetitions] = useState([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);

  /*
    MODIFICATION :
    Génération automatique de la liste des espèces
    selon le barème choisi.
  */
  const speciesList = useMemo(() => {
    const dataset =
      formData.zoneBareme === "mediterranee"
        ? baremeMediterranee
        : baremeAtlantique;

    return Object.keys(dataset).sort((a, b) => a.localeCompare(b, "fr"));
  }, [formData.zoneBareme]);

  /*
    MODIFICATION :
    Prévisualisation du poids calculé selon l'espèce,
    la longueur et le barème sélectionné.
  */
  const weightPreview = useMemo(() => {
    if (!formData.espece || !formData.longueurCm) {
      return {
        poidsG: null,
        error: null
      };
    }

    return calculateCatchWeight({
      espece: formData.espece,
      longueurCm: formData.longueurCm,
      zoneBareme: formData.zoneBareme
    });
  }, [formData.espece, formData.longueurCm, formData.zoneBareme]);

  /*
    MODIFICATION :
    URL de carte calculée à partir des coordonnées.
  */
  const mapsUrl = useMemo(() => {
    return buildMapsUrl(formData.latitude, formData.longitude);
  }, [formData.latitude, formData.longitude]);

  /*
    MODIFICATION :
    Chargement des concours auxquels l'utilisateur participe
    pour affichage dans la liste déroulante.
  */
  useEffect(() => {
    async function loadCompetitions() {
      try {
        if (!user?.id) {
          setCompetitions([]);
          return;
        }

        setCompetitionsLoading(true);
        const data = await fetchUserCompetitions(user.id);
        setCompetitions(data);
      } catch (error) {
        setMessage(
          error.message || "Erreur lors du chargement des concours."
        );
      } finally {
        setCompetitionsLoading(false);
      }
    }

    loadCompetitions();
  }, [user?.id]);

  function handleChange(event) {
    const { name, value, files } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: files ? files[0] : value
    }));
  }

  /*
    MODIFICATION :
    Ouvre la position dans Google Maps.
  */
  function handleOpenMap() {
    if (!mapsUrl) {
      return;
    }

    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  }

  /*
    MODIFICATION :
    Récupération optionnelle de la géolocalisation navigateur.
    Messages d'erreur détaillés pour mieux diagnostiquer iPhone / Android.
  */
  function handleUseLocation() {
    if (!isProfileComplete) {
      setMessage("Tu dois compléter ton profil avant d’ajouter une capture.");
      return;
    }

    /*
      MODIFICATION :
      La géolocalisation mobile fonctionne de façon fiable
      uniquement en contexte sécurisé (HTTPS) ou localhost.
    */
    const isSecureContextAllowed =
      window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isSecureContextAllowed) {
      setMessage(
        "La localisation nécessite une connexion sécurisée (HTTPS)."
      );
      return;
    }

    if (!navigator.geolocation) {
      setMessage("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }

    setGeoLoading(true);
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));

        /*
          MODIFICATION :
          Message clair de succès.
        */
        setMessage("Localisation récupérée.");
        setGeoLoading(false);
      },
      (error) => {
        /*
          MODIFICATION :
          Messages d'erreur précis selon le code retourné.
        */
        if (error?.code === 1) {
          setMessage("Accès à la localisation refusé.");
        } else if (error?.code === 2) {
          setMessage("Position indisponible.");
        } else if (error?.code === 3) {
          setMessage("Temps dépassé pour récupérer la localisation.");
        } else {
          setMessage("Impossible de récupérer la localisation.");
        }

        setGeoLoading(false);
      },
      {
        /*
          MODIFICATION :
          Réglages plus tolérants pour iPhone et mobile.
        */
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 300000
      }
    );
  }

  function getCompetitionStatusLabel(competition) {
    const status = getCompetitionEntryStatus(competition);

    if (status === "pas_commence") {
      return "Pas encore commencé";
    }

    if (status === "delai_saisie") {
      return "Délai de saisie en cours";
    }

    if (status === "termine") {
      return "Terminé";
    }

    if (status === "en_cours") {
      return "En cours";
    }

    return "Dates à vérifier";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      if (!user?.id) {
        throw new Error("Utilisateur introuvable.");
      }

      /*
        MODIFICATION :
        on bloque l'ajout tant que le profil obligatoire n'est pas complet.
      */
      if (!isProfileComplete) {
        throw new Error(
          "Tu dois compléter ton profil avant d’enregistrer une capture."
        );
      }

      const longueurCm = Number(formData.longueurCm);
      const validationError = validateLength(longueurCm);

      if (validationError) {
        throw new Error(validationError);
      }

      if (!formData.espece) {
        throw new Error("L’espèce est obligatoire.");
      }

      const selectedCompetition = competitions.find(
        (competition) => competition.id === formData.competitionId
      );

      /*
        MODIFICATION :
        Si un concours est choisi, on vérifie que la fenêtre de saisie est ouverte.
      */
      if (selectedCompetition && !isCompetitionEntryOpen(selectedCompetition)) {
        throw new Error(
          "Ce concours n’accepte pas de nouvelles prises à cette date."
        );
      }

      const weightResult = calculateCatchWeight({
        espece: formData.espece,
        longueurCm,
        zoneBareme: formData.zoneBareme
      });

      if (weightResult.error) {
        throw new Error(weightResult.error);
      }

      let photoUrl = null;

      if (formData.photo) {
        photoUrl = await uploadCatchPhoto({
          userId: user.id,
          file: formData.photo
        });
      }

      const payload = {
        user_id: user.id,
        espece: formData.espece,
        longueur_cm: longueurCm,
        poids_g: weightResult.poidsG,
        photo_url: photoUrl,
        date_heure: new Date(formData.dateHeure).toISOString(),
        latitude: formData.latitude,
        longitude: formData.longitude,
        commentaire: formData.commentaire?.trim() || null,
        zone_bareme: formData.zoneBareme,
        updated_at: new Date().toISOString()
      };

      /*
        MODIFICATION :
        Création réelle de la capture.
      */
      const createdCatch = await createCatch(payload);

      /*
        MODIFICATION :
        Si un concours est sélectionné, on lie automatiquement
        la capture au concours.
      */
      if (formData.competitionId) {
        await attachCatchToCompetition({
          competitionId: formData.competitionId,
          catchId: createdCatch.id,
          userId: user.id
        });
      }

      navigate("/captures");
    } catch (error) {
      setMessage(error.message || "Erreur lors de l’enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2 className="page-title">Ajouter une capture</h2>
      <p className="page-description">
        Enregistrement d’une capture avec calcul automatique du poids et
        affectation optionnelle à un concours.
      </p>

      {!isProfileComplete ? (
        <div className="card">
          <p className="card-text">
            Ton profil doit être complété avant d’ajouter une capture.
          </p>
          <p className="card-text">
            Va dans la page profil puis renseigne les champs obligatoires.
          </p>
        </div>
      ) : null}

      <div className="card">
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="zoneBareme">
                Barème
              </label>
              <select
                id="zoneBareme"
                name="zoneBareme"
                className="form-select"
                value={formData.zoneBareme}
                onChange={(event) => {
                  setFormData((prev) => ({
                    ...prev,
                    zoneBareme: event.target.value,
                    espece: ""
                  }));
                }}
                disabled={!isProfileComplete}
              >
                <option value="atlantique">Atlantique</option>
                <option value="mediterranee">Méditerranée</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="espece">
                Espèce
              </label>
              <select
                id="espece"
                name="espece"
                className="form-select"
                value={formData.espece}
                onChange={handleChange}
                required
                disabled={!isProfileComplete}
              >
                <option value="">Choisir une espèce</option>

                {speciesList.map((species) => (
                  <option key={species} value={species}>
                    {species}
                  </option>
                ))}
              </select>
              <p className="form-helper">
                La liste dépend du barème sélectionné.
              </p>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="longueurCm">
                Longueur (cm)
              </label>
              <input
                id="longueurCm"
                name="longueurCm"
                className="form-input"
                type="number"
                min="1"
                max="115"
                value={formData.longueurCm}
                onChange={handleChange}
                required
                disabled={!isProfileComplete}
              />
              <p className="form-helper">
                Longueur autorisée : de 1 à 115 cm.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="competitionId">
                Concours
              </label>
              <select
                id="competitionId"
                name="competitionId"
                className="form-select"
                value={formData.competitionId}
                onChange={handleChange}
                disabled={competitionsLoading || !isProfileComplete}
              >
                <option value="">Aucun concours</option>

                {competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {competition.name} — {getCompetitionStatusLabel(competition)}
                  </option>
                ))}
              </select>
              <p className="form-helper">
                Une prise ne peut compter que si le concours a commencé et si le
                délai de saisie n’est pas dépassé.
              </p>

              {formData.competitionId ? (
                (() => {
                  const selectedCompetition = competitions.find(
                    (competition) => competition.id === formData.competitionId
                  );

                  if (!selectedCompetition) {
                    return null;
                  }

                  return (
                    <p className="form-helper">
                      Début :{" "}
                      {selectedCompetition.start_date
                        ? new Date(
                            selectedCompetition.start_date
                          ).toLocaleString("fr-FR")
                        : "Non défini"}{" "}
                      | Fin :{" "}
                      {selectedCompetition.end_date
                        ? new Date(
                            selectedCompetition.end_date
                          ).toLocaleString("fr-FR")
                        : "Non définie"}{" "}
                      | Date limite de saisie :{" "}
                      {getCompetitionEntryDeadline(selectedCompetition)
                        ? getCompetitionEntryDeadline(
                            selectedCompetition
                          ).toLocaleString("fr-FR")
                        : "Non définie"}
                    </p>
                  );
                })()
              ) : null}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h3 className="card-title">Poids calculé</h3>
            <p className="card-text">
              {weightPreview.error
                ? weightPreview.error
                : weightPreview.poidsG !== null
                ? `${weightPreview.poidsG} g`
                : "Choisis une espèce et saisis une longueur."}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="dateHeure">
              Date / heure
            </label>
            <input
              id="dateHeure"
              name="dateHeure"
              className="form-input"
              type="datetime-local"
              value={formData.dateHeure}
              onChange={handleChange}
              required
              disabled={!isProfileComplete}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="photo">
              Photo
            </label>
            <input
              id="photo"
              name="photo"
              className="form-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleChange}
              disabled={!isProfileComplete}
            />
            <p className="form-helper">
              Optionnelle. Compatible mobile pour prise de photo directe.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Localisation</label>
            <button
              type="button"
              className="secondary-button"
              onClick={handleUseLocation}
              disabled={geoLoading || !isProfileComplete}
            >
              {geoLoading
                ? "Récupération..."
                : "Utiliser ma position actuelle"}
            </button>

            {formData.latitude !== null && formData.longitude !== null ? (
              <>
                <p className="form-helper">
                  Latitude : {formData.latitude} | Longitude : {formData.longitude}
                </p>

                {/* MODIFICATION :
                    bouton pour ouvrir la position récupérée sur la carte.
                */}
                <div style={{ marginTop: "8px" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleOpenMap}
                  >
                    Voir sur la carte
                  </button>
                </div>
              </>
            ) : (
              <p className="form-helper">Optionnelle.</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="commentaire">
              Commentaire
            </label>
            <textarea
              id="commentaire"
              name="commentaire"
              className="form-textarea"
              value={formData.commentaire}
              onChange={handleChange}
              disabled={!isProfileComplete}
            />
          </div>

          {message ? (
            <p
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: "12px",
                background:
                  message === "Localisation récupérée."
                    ? "#ecfdf5"
                    : "#fef2f2"
              }}
            >
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            className="primary-button"
            disabled={submitting || !isProfileComplete}
          >
            {submitting ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </section>
  );
}