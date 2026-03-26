import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section className="empty-state">
      <h2 className="empty-state__title">Page introuvable</h2>
      <p className="empty-state__text">
        La page demandée n’existe pas ou n’est pas encore disponible.
      </p>

      <div style={{ marginTop: "16px" }}>
        <Link to="/tableau-de-bord" className="primary-button">
          Retour à l’accueil
        </Link>
      </div>
    </section>
  );
}