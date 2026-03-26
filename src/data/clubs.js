/*
  MODIFICATION :
  Liste centralisée des clubs.
  Remplace ce tableau par la liste officielle complète de tes clubs.

  IMPORTANT :
  On garde ce fichier séparé pour pouvoir :
  - réutiliser les clubs ailleurs dans l'application
  - mettre à jour la liste facilement
  - éviter de dupliquer les données dans plusieurs composants
*/

export const CLUBS_OPTIONS = [
  "Aucun club",

  // A
  "Amicale des Pêcheurs Niçois (PACA)",
  "APCR (Occitanie)",
  "APLM Montalivet (Aquitaine)",
  "APSLP (Île-de-France)",
  "ASIO (PACA)",
  "ASPLH (Normandie)",
  "ATPBM (Pays de Loire)",

  // C
  "Calais Team Surfcasting (Hauts-de-France)",
  "CNGV (Pays de Loire)",

  // E
  "Empile Étaploise (Hauts-de-France)",

  // F
  "Fishing Club Merlimont (Hauts-de-France)",

  // G
  "Gaule Cheminote Dieppe (Normandie)",
  "Gaule Touquettoise (Hauts-de-France)",
  "Guidel Surfcasting Club (Bretagne)",
  "Gruissan SCC (Occitanie)",

  // L
  "Labenne Océan (Aquitaine)",
  "Lancer Blériotin (Hauts-de-France)",
  "Lancer Lourd Dacquois (Aquitaine)",
  "Les Anges de la Pêche (Bretagne)",
  "Les Marsouins de Calais (Hauts-de-France)",
  "Les Pêcheurs Bray Dunois (Hauts-de-France)",
  "Les Pêcheurs de la Warenne (Hauts-de-France)",
  "LCPA (Poitou-Charentes)",
  "Louvine SCC (Aquitaine)",

  // M
  "Marseillan Surfcasting (Occitanie)",
  "PMG Boulonnais (Hauts-de-France)",
  "SCC Mimizan (Aquitaine)",
  "SCC Bias (Aquitaine)",
  "SCC Biscarrosse (Aquitaine)",
  "SCC Dunkerque (Hauts-de-France)",
  "SCC Girondin (Aquitaine)",

  // O
  "Orphie Club Saint-Nazaire (Pays de Loire)",

  // S
  "Sports Loisir Culture Miramas (PACA)",
  "Surf Casting Club Berck (Hauts-de-France)",
  "Surfcasting Club de Caen (Normandie)",
  "Surfcasting Club Ghisonaccia (Corse)",
  "Surfcasting Club Montoirin (Pays de Loire)",

  // T
  "Team Corsica Fishing (Corse)",
  "Team Fishing Outrelois (Hauts-de-France)",
  "Team Fishing Saint-Nazaire (Pays de Loire)",
  "Team Surf Casting Côte d’Émeraude (Bretagne)",
  "Team Surfcasting Atlantique (Pays de Loire)",
  "Team Surfcasting Équihennoise (Hauts-de-France)",
  "Team Surfcasting Rochelais (Poitou-Charentes)",
  "Team Surfcasting Zone (Corse)"
].sort((a, b) => a.localeCompare(b, "fr"));
