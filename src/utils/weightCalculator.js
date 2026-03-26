import baremeAtlantique from "../data/bareme_atl.json";
import baremeMediterranee from "../data/bareme_med.json";

/*
  MODIFICATION :
  Ce fichier branche maintenant les vrais barèmes JSON Atlantique et Méditerranée.

  Règles gérées :
  - validation longueur entre 1 et 115 cm
  - recherche du poids exact dans le JSON si la longueur existe
  - Méditerranée : 1 à 11 cm = 1 g forcé
  - fallback "petites longueurs" si une longueur est absente du JSON
  - normalisation des noms d'espèces
  - gestion d'alias pour faire correspondre les espèces saisies aux clés des barèmes
*/

const ATLANTIQUE = "atlantique";
const MEDITERRANEE = "mediterranee";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/-/g, " ")
    .replace(/\(/g, " ")
    .replace(/\)/g, " ")
    .replace(/\./g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
  MODIFICATION :
  Dictionnaire d'alias métier.
  Clé = nom saisi normalisé
  Valeur = clé réelle du barème pour la zone concernée
*/
const ATLANTIQUE_ALIASES = {
  alose: "alose",
  anguille: "anguille",
  baliste: "baliste",
  bar: "bar franc",
  loup: "bar franc",
  "bar franc": "bar franc",
  "bar commun": "bar franc",
  "bar europeen": "bar franc",
  "bar européen": "bar franc",
  "bar mouchete": "bar mouchete",
  "bar moucheté": "bar mouchete",
  barbue: "barbue",
  bogue: "bogue",
  bonite: "bonite",
  cabillaud: "cabillaud",
  carrelet: "carrelet - plie - flet",
  plie: "carrelet - plie - flet",
  flet: "carrelet - plie - flet",
  chinchard: "chinchard",
  severeau: "chinchard",
  sévereau: "chinchard",
  congre: "congre",
  coquette: "coquette",
  daurade: "daurade royale",
  dorade: "daurade royale",
  "daurade royale": "daurade royale",
  "dorade royale": "daurade royale",
  demoiselle: "demoiselle",
  eperlan: "eperlan",
  éperlan: "eperlan",
  gobie: "gobie",
  "grande vive": "grande vive",
  vive: "vive",
  griset: "griset",
  grondin: "grondin",
  labre: "labre",
  lancon: "lançon",
  lançon: "lançon",
  liche: "liche",
  lieu: "lieu",
  limande: "limande",
  loche: "loche",
  maigre: "maigre",
  maquereau: "maquereau",
  merlan: "merlan",
  merlu: "merlan",
  morue: "morue",
  mulet: "mulet",
  oblade: "oblade",
  ombrine: "ombrine",
  corb: "ombrine",
  orphie: "orphie",
  roussette: "petite roussette",
  "petite roussette": "petite roussette",
  "raie aigle": "raie aigle (largeur)",
  "raie aigle largeur": "raie aigle (largeur)",
  "raie commune": "raie commune (largeur)",
  "raie commune largeur": "raie commune (largeur)",
  "raie pastenague": "raie pastenague (largeur)",
  "raie pastenague largeur": "raie pastenague (largeur)",
  "raie torpille": "raie torpille (largeur)",
  "raie torpille largeur": "raie torpille (largeur)",
  raye: "raye",
  rascasse: "rascasse",
  emissole: "requin émissole",
  émissole: "requin émissole",
  "requin emissole": "requin émissole",
  "requin émissole": "requin émissole",
  rouget: "rouget",
  sar: "sar",
  sars: "sar",
  saumon: "saumon",
  saupe: "saupe",
  serpenton: "serpenton",
  sole: "sole",
  tacaud: "tacaud",
  truite: "truite",
  turbot: "turbot",
  vielle: "vielle"
};

const MEDITERRANEE_ALIASES = {
  chinchard: "CHINCHARD SÉVEREAU",
  severeau: "CHINCHARD SÉVEREAU",
  sévereau: "CHINCHARD SÉVEREAU",
  maquereau: "MAQUEREAU",
  pagre: "PAGRE",
  sole: "SOLE",
  merlu: "MERLU",
  marbre: "MARBRÉ RAYÉ",
  marbré: "MARBRÉ RAYÉ",
  "marbre raye": "MARBRÉ RAYÉ",
  "marbré rayé": "MARBRÉ RAYÉ",
  sar: "TOUS SARS",
  sars: "TOUS SARS",
  "sar commun": "TOUS SARS",
  "sar tambour": "TOUS SARS",
  "sar a tete noire": "TOUS SARS",
  "sar à tete noire": "TOUS SARS",
  "daurade royale": "DAURADE ROYALE -GRISE",
  "dorade royale": "DAURADE ROYALE -GRISE",
  daurade: "DAURADE ROYALE -GRISE",
  dorade: "DAURADE ROYALE -GRISE",
  "dorade grise": "DAURADE ROYALE -GRISE",
  "daurade grise": "DAURADE ROYALE -GRISE",
  bar: "LOUP BAR",
  loup: "LOUP BAR",
  "bar franc": "LOUP BAR",
  "bar commun": "LOUP BAR",
  pageot: "TOUS PAGEOTS DORADES ROSES",
  pageots: "TOUS PAGEOTS DORADES ROSES",
  "dorade rose": "TOUS PAGEOTS DORADES ROSES",
  "dorades roses": "TOUS PAGEOTS DORADES ROSES",
  "pageot commun": "TOUS PAGEOTS DORADES ROSES",
  merou: "MÉROU CERNIER",
  mérou: "MÉROU CERNIER",
  cernier: "MÉROU CERNIER",
  anguille: "ANGUILLE CONGRE ORPHIE",
  congre: "ANGUILLE CONGRE ORPHIE",
  orphie: "ANGUILLE CONGRE ORPHIE",
  ombrine: "OMBRINE CORB",
  corb: "OMBRINE CORB",
  mulet: "MULET GRONDIN",
  grondin: "MULET GRONDIN",
  liche: "LICHE",
  roussette: "ROUSSETTE",
  rouget: "ROUGET BARBET",
  barbet: "ROUGET BARBET",
  "rouget barbet": "ROUGET BARBET",
  turbot: "TURBOT",
  maigre: "MAIGRE TRUITE SAUMON ALOSE",
  truite: "MAIGRE TRUITE SAUMON ALOSE",
  saumon: "MAIGRE TRUITE SAUMON ALOSE",
  alose: "MAIGRE TRUITE SAUMON ALOSE",
  bogue: "BOGUE",
  baliste: "BALISTE",
  oblade: "OBLADE",
  saupe: "SAUPE",
  serpenton: "SERPENTON (Murène de sable)",
  murene: "SERPENTON (Murène de sable)",
  murène: "SERPENTON (Murène de sable)",
  rascasse: "RASCASSE",
  callionyme: "CALLIONYME LYRE (Dragonnet)",
  dragonnet: "CALLIONYME LYRE (Dragonnet)",
  tassergal: "TASSERGAL",
  mendole: "MENDOLE",
  "raie bouclee": "RAIE BOUCLÉE",
  "raie bouclée": "RAIE BOUCLÉE",
  "raie torpille": "RAIE torpille",
  "raie pastenague": "RAIE pastenague",
  "raie commune": "RAIE commune",
  "raie aigle": "RAIE aigle",
  "ange de mer": "RAIE PASTENAGUE ANGE DE MER"
};

function getZoneDataset(zoneBareme) {
  return zoneBareme === MEDITERRANEE ? baremeMediterranee : baremeAtlantique;
}

function getZoneAliases(zoneBareme) {
  return zoneBareme === MEDITERRANEE
    ? MEDITERRANEE_ALIASES
    : ATLANTIQUE_ALIASES;
}

function buildNormalizedDataset(dataset) {
  const result = {};

  Object.keys(dataset).forEach((speciesKey) => {
    result[normalizeText(speciesKey)] = speciesKey;
  });

  return result;
}

const ATLANTIQUE_NORMALIZED_KEYS = buildNormalizedDataset(baremeAtlantique);
const MEDITERRANEE_NORMALIZED_KEYS = buildNormalizedDataset(baremeMediterranee);

function getNormalizedKeysMap(zoneBareme) {
  return zoneBareme === MEDITERRANEE
    ? MEDITERRANEE_NORMALIZED_KEYS
    : ATLANTIQUE_NORMALIZED_KEYS;
}

function resolveSpeciesKey(espece, zoneBareme) {
  const normalizedSpecies = normalizeText(espece);

  if (!normalizedSpecies) {
    return null;
  }

  const aliases = getZoneAliases(zoneBareme);
  const normalizedKeys = getNormalizedKeysMap(zoneBareme);

  // 1) correspondance exacte avec une clé normalisée du JSON
  if (normalizedKeys[normalizedSpecies]) {
    return normalizedKeys[normalizedSpecies];
  }

  // 2) correspondance via alias métier
  const aliasedKey = aliases[normalizedSpecies];
  if (aliasedKey) {
    return aliasedKey;
  }

  // 3) tentative "contient" pour certains libellés saisis
  const candidate = Object.keys(normalizedKeys).find(
    (key) =>
      key.includes(normalizedSpecies) || normalizedSpecies.includes(key)
  );

  if (candidate) {
    return normalizedKeys[candidate];
  }

  return null;
}

function getSmallLengthFallback(length, zoneBareme) {
  /*
    MODIFICATION :
    Règles petites longueurs.
    - Méditerranée : 1 à 11 cm = 1 g forcé
    - Fallback générique : si une longueur n'existe pas dans le JSON
      et qu'elle est entre 1 et 14, on force à 1 g
  */
  if (zoneBareme === MEDITERRANEE && length >= 1 && length <= 11) {
    return 1;
  }

  if (length >= 1 && length <= 14) {
    return 1;
  }

  return null;
}

export function validateLength(longueurCm) {
  const length = Number(longueurCm);

  if (!Number.isInteger(length) || length < 1 || length > 115) {
    return "Veuillez saisir une longueur entre 1 et 115 cm.";
  }

  return null;
}

export function getResolvedSpeciesLabel(espece, zoneBareme) {
  return resolveSpeciesKey(espece, zoneBareme);
}

export function calculateCatchWeight({ espece, longueurCm, zoneBareme }) {
  const length = Number(longueurCm);
  const validationError = validateLength(length);

  if (validationError) {
    return {
      poidsG: null,
      error: validationError,
      resolvedSpecies: null
    };
  }

  const dataset = getZoneDataset(zoneBareme);
  const resolvedSpecies = resolveSpeciesKey(espece, zoneBareme);

  if (!resolvedSpecies) {
    return {
      poidsG: null,
      error:
        "Espèce non reconnue dans le barème sélectionné. Vérifie le nom saisi.",
      resolvedSpecies: null
    };
  }

  const speciesTable = dataset[resolvedSpecies];

  if (!speciesTable) {
    return {
      poidsG: null,
      error:
        "Impossible de charger le barème de cette espèce dans la zone sélectionnée.",
      resolvedSpecies
    };
  }

  const exactWeight = speciesTable[String(length)];

  if (exactWeight !== undefined && exactWeight !== null) {
    return {
      poidsG: Number(exactWeight),
      error: null,
      resolvedSpecies
    };
  }

  const fallbackWeight = getSmallLengthFallback(length, zoneBareme);

  if (fallbackWeight !== null) {
    return {
      poidsG: fallbackWeight,
      error: null,
      resolvedSpecies
    };
  }

  return {
    poidsG: null,
    error:
      "Aucun poids trouvé pour cette longueur dans le barème sélectionné.",
    resolvedSpecies
  };
}