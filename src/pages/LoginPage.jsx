import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/*
  MODIFICATION :
  Page de connexion / inscription web.
  Pour aller vite, la même page gère :
  - connexion
  - création de compte

  NOUVELLES MODIFICATIONS :
  - si l'utilisateur est connecté mais son profil est incomplet,
    redirection vers /profil
  - après création de compte, message explicite pour compléter le profil
*/

const initialForm = {
  email: "",
  password: ""
};

export default function LoginPage() {
  const { user, signIn, signUp, loading, isProfileComplete } = useAuth();
  const [formData, setFormData] = useState(initialForm);
  const [mode, setMode] = useState("login");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  /*
    MODIFICATION :
    si connecté avec profil incomplet, on force l'accès à la page profil.
  */
  if (!loading && user && !isProfileComplete) {
    return <Navigate to="/profil" replace />;
  }

  if (!loading && user && isProfileComplete) {
    return <Navigate to="/tableau-de-bord" replace />;
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      if (mode === "login") {
        await signIn(formData.email, formData.password);
      } else {
        await signUp(formData.email, formData.password);
        setMessage(
          "Compte créé. Tu dois maintenant compléter ton profil avant d’utiliser l’application."
        );
      }
    } catch (error) {
      setMessage(error.message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "16px",
        background: "#f3f4f6"
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: "440px" }}>
        <h2 className="page-title" style={{ marginBottom: "8px" }}>
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h2>

        <p className="page-description">
          Accès sécurisé à la version web de L’appli de Mat.
        </p>

        <form className="form" onSubmit={handleSubmit}>
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
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              className="form-input"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          {message ? (
            <p
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#eef2ff"
              }}
            >
              {message}
            </p>
          ) : null}

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting
              ? "Traitement..."
              : mode === "login"
              ? "Se connecter"
              : "Créer le compte"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setMode((prev) => (prev === "login" ? "signup" : "login"))
            }
          >
            {mode === "login"
              ? "Créer un compte"
              : "J’ai déjà un compte"}
          </button>
        </form>
      </div>
    </section>
  );
}