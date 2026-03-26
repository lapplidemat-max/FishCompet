import { NavLink } from "react-router-dom";

const navItems = [
  {
    to: "/tableau-de-bord",
    label: "Accueil"
  },
  {
    to: "/captures",
    label: "Captures"
  },
  {
    to: "/concours",
    label: "Concours"
  },
  {
    to: "/profil",
    label: "Profil"
  }
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `bottom-nav__link ${isActive ? "bottom-nav__link--active" : ""}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}