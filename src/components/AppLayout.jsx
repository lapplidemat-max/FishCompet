import { Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import BottomNav from "./BottomNav";
import { useAuth } from "../context/AuthContext";

/*
  MODIFICATION :
  Ajout du bouton de déconnexion.

  NOUVELLES MODIFICATIONS :
  - bannière globale si profil incomplet
  - bouton rapide vers le profil
  - NOUVEAU :
    ajout d'un bouton "Contact" dans le bandeau du haut
    à côté de "Déconnexion"
  - formulaire de contact simple
  - envoi via mailto vers : lapplidemat@gmail.com
*/

const CONTACT_EMAIL = "lapplidemat@gmail.com";

export default function AppLayout() {
  const navigate = useNavigate();
  const { signOut, profile, user, isProfileComplete } = useAuth();

  /*
    MODIFICATION :
    état d'ouverture du formulaire de contact
  */
  const [showContactForm, setShowContactForm] = useState(false);

  /*
    MODIFICATION :
    état du formulaire de contact
  */
  const [contactForm, setContactForm] = useState({
    subject: "",
    message: ""
  });

  async function handleLogout() {
    try {
      await signOut();
      navigate("/connexion", { replace: true });
    } catch (error) {
      alert(error.message || "Erreur lors de la déconnexion.");
    }
  }

  /*
    MODIFICATION :
    mise à jour du formulaire de contact
  */
  function handleContactChange(event) {
    const { name, value } = event.target;

    setContactForm((prev) => ({
      ...prev,
      [name]: value
    }));
  }

  /*
    MODIFICATION :
    ouverture du client mail avec les données du formulaire
  */
  function handleSubmitContact(event) {
    event.preventDefault();

    const trimmedSubject = contactForm.subject.trim();
    const trimmedMessage = contactForm.message.trim();

    if (!trimmedSubject) {
      alert("Le sujet est obligatoire.");
      return;
    }

    if (!trimmedMessage) {
      alert("Le message est obligatoire.");
      return;
    }

    const senderLabel = profile?.pseudo
      ? `${profile.pseudo} (${user?.email || "email inconnu"})`
      : user?.email || "Utilisateur inconnu";

    const body = `Message depuis L’appli de Mat

Expéditeur : ${senderLabel}

Message :
${trimmedMessage}
`;

    const mailtoUrl = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      trimmedSubject
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailtoUrl;

    /*
      MODIFICATION :
      on referme et réinitialise le formulaire après déclenchement
    */
    setShowContactForm(false);
    setContactForm({
      subject: "",
      message: ""
    });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "flex-start"
          }}
        >
          <div>
            <h1 className="app-header__title">L’appli de Mat</h1>
            <p className="app-header__subtitle">
              {profile?.pseudo
                ? `Connecté en tant que ${profile.pseudo}`
                : user?.email || "Utilisateur connecté"}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent: "flex-end"
            }}
          >
            {/* MODIFICATION :
                bouton contact dans le bandeau du haut
            */}
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowContactForm(true)}
              style={{ width: "auto", minWidth: "120px" }}
            >
              Contact
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={handleLogout}
              style={{ width: "auto", minWidth: "120px" }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        {!isProfileComplete ? (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              borderRadius: "12px",
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412"
            }}
          >
            <p style={{ margin: 0, marginBottom: "8px" }}>
              Ton profil est incomplet. Certaines actions sont bloquées tant que
              les champs obligatoires ne sont pas remplis.
            </p>

            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate("/profil")}
              style={{ width: "auto" }}
            >
              Compléter mon profil
            </button>
          </div>
        ) : null}
      </header>

      {/* MODIFICATION :
          fenêtre simple de contact
      */}
      {showContactForm ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 1000
          }}
          onClick={() => setShowContactForm(false)}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "560px",
              maxHeight: "90vh",
              overflowY: "auto"
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                marginBottom: "16px"
              }}
            >
              <h3 className="card-title" style={{ margin: 0 }}>
                Contact
              </h3>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowContactForm(false)}
                style={{ width: "auto" }}
              >
                Fermer
              </button>
            </div>

            <p className="card-text">
              Ce formulaire prépare un email vers : {CONTACT_EMAIL}
            </p>

            <form className="form" onSubmit={handleSubmitContact}>
              <div className="form-group">
                <label className="form-label" htmlFor="contact-subject">
                  Sujet
                </label>
                <input
                  id="contact-subject"
                  name="subject"
                  className="form-input"
                  type="text"
                  value={contactForm.subject}
                  onChange={handleContactChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contact-message">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  className="form-textarea"
                  value={contactForm.message}
                  onChange={handleContactChange}
                  rows={8}
                  required
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap"
                }}
              >
                <button type="submit" className="primary-button">
                  Envoyer
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setContactForm({
                      subject: "",
                      message: ""
                    });
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <main className="app-main">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}