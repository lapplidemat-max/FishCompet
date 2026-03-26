import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { getCategoryFromBirthDate } from "../utils/profileCategories";
import { CLUBS_OPTIONS } from "../data/clubs";

/*
  MODIFICATION :
  Cette page gère maintenant :
  - sexe : homme / femme
  - categorie : calculée automatiquement depuis la date de naissance
  - club : sélection via liste déroulante
  - affichage de la catégorie en lecture seule

  NOUVELLES MODIFICATIONS :
  - profil obligatoire après création de compte
  - message d'alerte tant que le profil n'est pas complet
  - contrôle renforcé des champs obligatoires
*/

const emptyProfile = {
  email: "",
  nom: "",
  prenom: "",
  date_naissance: "",
  pseudo: "",
  plan: "free",
  code_postal: "",
  sexe: "",
  categorie: "",
  club: "Aucun club"
};

export default function ProfilePage() {
  const { user, profile, refreshProfile, isProfileComplete } = useAuth();

  const initialValues = useMemo(() => {
    const derivedCategory = getCategoryFromBirthDate(
      profile?.date_naissance || ""
    );

    return {
      email: user?.email || profile?.email || "",
      nom: profile?.nom || "",
      prenom: profile?.prenom || "",
      date_naissance: profile?.date_naissance || "",
      pseudo: profile?.pseudo || "",
      plan: profile?.plan || "free",
      code_postal: profile?.code_postal || "",
      sexe: profile?.sexe || "",
      categorie: profile?.categorie || derivedCategory || "",
      club: profile?.club || "Aucun club"
    };
  }, [user, profile]);

  const [formData, setFormData] = useState(emptyProfile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData(initialValues);
  }, [initialValues]);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((prev) => {
      const updatedData = {
        ...prev,
        [name]: value
      };

      /*
        MODIFICATION :
        Si la date de naissance change, la catégorie
        se recalcule automatiquement.
      */
      if (name === "date_naissance") {
        updatedData.categorie = getCategoryFromBirthDate(value);
      }

      return updatedData;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user?.id) {
      alert("Utilisateur introuvable.");
      return;
    }

    setSaving(true);

    try {
      const computedCategory = getCategoryFromBirthDate(
        formData.date_naissance
      );

      if (!computedCategory) {
        throw new Error("La date de naissance est invalide.");
      }

      /*
        MODIFICATION :
        validation explicite des champs obligatoires.
      */
      if (!String(user.email || "").trim()) {
        throw new Error("L’email utilisateur est introuvable.");
      }

      if (!String(formData.nom || "").trim()) {
        throw new Error("Le nom est obligatoire.");
      }

      if (!String(formData.prenom || "").trim()) {
        throw new Error("Le prénom est obligatoire.");
      }

      if (!String(formData.date_naissance || "").trim()) {
        throw new Error("La date de naissance est obligatoire.");
      }

      if (!String(formData.pseudo || "").trim()) {
        throw new Error("Le pseudo est obligatoire.");
      }

      if (!String(formData.plan || "").trim()) {
        throw new Error("Le plan est obligatoire.");
      }

      if (!String(formData.code_postal || "").trim()) {
        throw new Error("Le code postal est obligatoire.");
      }

      const payload = {
        id: user.id,
        email: user.email,
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        date_naissance: formData.date_naissance,
        pseudo: formData.pseudo.trim(),
        plan: formData.plan,
        code_postal: formData.code_postal.trim(),
        sexe: formData.sexe || null,
        categorie: computedCategory,
        club: formData.club || "Aucun club",
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from("profiles").upsert(payload);

      if (error) {
        throw error;
      }

      await refreshProfile(user.id);

      /*
        MODIFICATION :
        On garde la catégorie recalculée localement après sauvegarde.
      */
      setFormData((prev) => ({
        ...prev,
        categorie: computedCategory
      }));

      alert("Profil mis à jour avec succès.");
    } catch (error) {
      alert(error.message || "Erreur lors de la sauvegarde du profil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="page-title">Mon profil</h2>
      <p className="page-description">
        Profil utilisateur connecté à la base Supabase.
      </p>

      {!isProfileComplete ? (
        <div className="card">
          <p className="card-text">
            Ton profil doit être complété avant d’utiliser l’application.
          </p>
          <p className="card-text">
            Champs obligatoires : email, nom, prénom, date de naissance, pseudo,
            plan, code postal.
          </p>
        </div>
      ) : null}

      <div className="card">
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                className="form-input"
                type="email"
                value={formData.email}
                readOnly
              />
              <p className="form-helper">
                L’email est géré par l’authentification.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pseudo">
                Pseudo
              </label>
              <input
                id="pseudo"
                name="pseudo"
                className="form-input"
                type="text"
                value={formData.pseudo}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="nom">
                Nom
              </label>
              <input
                id="nom"
                name="nom"
                className="form-input"
                type="text"
                value={formData.nom}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prenom">
                Prénom
              </label>
              <input
                id="prenom"
                name="prenom"
                className="form-input"
                type="text"
                value={formData.prenom}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="date_naissance">
                Date de naissance
              </label>
              <input
                id="date_naissance"
                name="date_naissance"
                className="form-input"
                type="date"
                value={formData.date_naissance}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="code_postal">
                Code postal
              </label>
              <input
                id="code_postal"
                name="code_postal"
                className="form-input"
                type="text"
                value={formData.code_postal}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="sexe">
                Sexe
              </label>
              <select
                id="sexe"
                name="sexe"
                className="form-select"
                value={formData.sexe}
                onChange={handleChange}
                required
              >
                <option value="">Choisir</option>
                <option value="homme">Homme</option>
                <option value="femme">Femme</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="categorie">
                Catégorie
              </label>
              <input
                id="categorie"
                name="categorie"
                className="form-input"
                type="text"
                value={formData.categorie}
                readOnly
              />
              <p className="form-helper">
                Calculée automatiquement depuis la date de naissance.
              </p>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="club">
                Club
              </label>
              <select
                id="club"
                name="club"
                className="form-select"
                value={formData.club}
                onChange={handleChange}
                required
              >
                {CLUBS_OPTIONS.map((clubName) => (
                  <option key={clubName} value={clubName}>
                    {clubName}
                  </option>
                ))}
              </select>
              <p className="form-helper">
                Liste déroulante des clubs. La liste complète pourra être mise à
                jour dans le fichier des clubs.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="plan">
                Plan
              </label>
              <select
                id="plan"
                name="plan"
                className="form-select"
                value={formData.plan}
                onChange={handleChange}
                required
              >
                <option value="free">free</option>
                <option value="premium">premium</option>
              </select>
            </div>
          </div>

          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Enregistrement..." : "Mettre à jour le profil"}
          </button>
        </form>
      </div>
    </section>
  );
}