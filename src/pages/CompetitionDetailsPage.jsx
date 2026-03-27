import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useAuth } from "../context/AuthContext";
import {
  buildCompetitionRanking,
  fetchCompetitionById,
  fetchCompetitionCatches,
  fetchCompetitionParticipantCatches,
  fetchCompetitionParticipants,
  getCommissionStatusLabel,
  getCompetitionEntryDeadline,
  getCompetitionEntryStatus,
  getDisplayNameFromProfile,
  getOfficialCatchMetrics,
  updateCompetitionCatchCommission,
  updateCompetitionResultsRelease
} from "../services/competitions";

/*
  MODIFICATION :
  Page détail concours.
  Elle affiche :
  - le créateur du concours selon le mode choisi
  - la date de début du concours
  - la date de fin du concours
  - la date limite de saisie (fin + délai)
  - les statistiques rapides
  - le classement si autorisé
  - les captures du concours si autorisé
  - un bouton visible seulement par le créateur pour publier les résultats
    quand le concours est en mode "hidden" ET après la date limite de saisie
  - sexe, catégorie et club dans le classement
  - multi-filtres sur le classement : sexe + catégorie + club
  - outil organisateur / commissaire de vérification des fiches participant

  NOUVELLES MODIFICATIONS :
  - filtre rapide des prises participant par statut commissaire
  - bouton "Valider toutes les prises en attente"
  - boutons rapides par ligne : valider / refuser / corriger
  - affichage plus compact pour accélérer la vérification

  NOUVELLES MODIFICATIONS FICHE OFFICIELLE :
  - ajout d'une fiche type commissaire inspirée du modèle officiel FFPS
  - mapping basé sur les libellés réels des 2 barèmes de l'application
  - les espèces absentes du modèle officiel sont ajoutées dans les lignes vides
  - séparation automatique :
    > poissons >= 15 cm
    > poissons < 15 cm
    > grandes vives
  - prise en compte immédiate des brouillons commissaire non encore sauvegardés
  - pagination automatique sur plusieurs pages A4 si la liste est trop longue
  - ordre de saisie conservé sur la fiche commissaire
  - affichage "longueur (poidsg)" sur la fiche officielle
    ex : 32 (450g) • 28 (320g)

  NOUVELLE MODIFICATION ECRAN :
  - les listes de prises sont masquées par défaut pour éviter trop de scroll
  - ajout de boutons afficher / masquer pour :
    > captures du concours
    > prises du participant en vérification

  NOUVELLE MODIFICATION STATS :
  - la carte "Plus grosse prise" affiche maintenant :
    > l'espèce
    > le poids
    > la longueur

  NOUVELLE MODIFICATION EXPORT :
  - export direct en PDF avec jsPDF + html2canvas
  - plus de dépendance à window.print / popup
  - export avec :
    > classement général
    > meilleur de chaque catégorie
    > meilleure femme
    > bilan des prises
    > détail des espèces prises
*/

const ALL_FILTER_VALUE = "__all__";

const REVIEW_STATUS_FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "pending", label: "En attente" },
  { value: "validated", label: "Validées" },
  { value: "corrected", label: "Corrigées" },
  { value: "rejected", label: "Refusées" }
];

/*
  MODIFICATION :
  Lignes fixes de la fiche officielle.
*/
const OFFICIAL_SHEET_ROWS = [
  "BAR FRANC",
  "BAR MOUCHETÉ",
  "TURBOT ou BARBUE",
  "SOLE",
  "SAR",
  "RAYÉ",
  "GRISET",
  "DAURADE ROYALE",
  "MULET",
  "ORPHIE",
  "CARRELET ou FLET",
  "TRUITE ou SAUMON",
  "OMBRINE"
];

/*
  MODIFICATION :
  Mapping exact des espèces du barème Atlantique vers la fiche officielle.
  Les espèces sans ligne officielle ne sont PAS listées ici :
  elles seront envoyées vers les lignes supplémentaires.
*/
const ATLANTIQUE_SHEET_MAP = {
  "bar franc": "BAR FRANC",
  "bar mouchete": "BAR MOUCHETÉ",
  barbue: "TURBOT ou BARBUE",
  turbot: "TURBOT ou BARBUE",
  sole: "SOLE",
  sar: "SAR",
  raye: "RAYÉ",
  griset: "GRISET",
  "daurade royale": "DAURADE ROYALE",
  mulet: "MULET",
  orphie: "ORPHIE",
  "carrelet - plie - flet": "CARRELET ou FLET",
  truite: "TRUITE ou SAUMON",
  saumon: "TRUITE ou SAUMON",
  ombrine: "OMBRINE"
};

/*
  MODIFICATION :
  Mapping exact des espèces du barème Méditerranée vers la fiche officielle.
  IMPORTANT :
  certains libellés Méditerranée regroupent plusieurs espèces.
  Quand le groupe n'est pas une correspondance certaine avec une ligne officielle,
  on ne le mappe PAS ici pour éviter d'afficher une mauvaise ligne.
  Il apparaîtra donc en ligne supplémentaire sur la fiche.
*/
const MEDITERRANEE_SHEET_MAP = {
  "LOUP BAR": "BAR FRANC",
  SOLE: "SOLE",
  "TOUS SARS": "SAR",
  TURBOT: "TURBOT ou BARBUE"
};

const ATLANTIQUE = "atlantique";
const MEDITERRANEE = "mediterranee";

/*
  MODIFICATION :
  Capacités de pagination A4 de la fiche officielle.
  - la première page contient l'en-tête + le tableau principal + les blocs de bas de page
  - les pages suivantes servent à continuer la liste des espèces supplémentaires
*/
const MAX_TOTAL_ROWS_FIRST_PAGE = 17;
const MAX_TOTAL_ROWS_OTHER_PAGES = 22;

function buildCommissionDraft(entry) {
  return {
    commissionStatus: entry?.commission_status || "pending",
    commissionValidatedLengthCm:
      entry?.commission_validated_length_cm ??
      entry?.catches?.longueur_cm ??
      "",
    commissionValidatedWeightG:
      entry?.commission_validated_weight_g ?? entry?.catches?.poids_g ?? "",
    commissionNote: entry?.commission_note || ""
  };
}

/*
  MODIFICATION :
  Normalise les libellés d'espèces pour comparer proprement les variantes.
*/
function normalizeSpeciesLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
  MODIFICATION :
  Retourne le nom d'affichage de l'espèce pour une ligne supplémentaire.
  On conserve le libellé saisi par le pêcheur / le barème pour rester fidèle.
*/
function formatExtraSpeciesLabel(value) {
  return String(value || "Espèce non renseignée").trim();
}

/*
  MODIFICATION :
  Détecte la grande vive à partir des libellés réels du barème.
*/
function isGrandeViveSpecies(speciesName) {
  const normalized = normalizeSpeciesLabel(speciesName);

  return normalized === "grande vive" || normalized === "grandes vives";
}

/*
  MODIFICATION :
  Résout une espèce vers une ligne officielle en fonction du barème choisi.
  Si aucune correspondance sûre n'existe, retourne null pour l'envoyer
  vers les lignes supplémentaires de la fiche.
*/
function resolveOfficialSheetRow(speciesName, zoneBareme) {
  const rawSpecies = String(speciesName || "").trim();

  if (!rawSpecies) {
    return null;
  }

  const mapping =
    zoneBareme === MEDITERRANEE ? MEDITERRANEE_SHEET_MAP : ATLANTIQUE_SHEET_MAP;

  if (mapping[rawSpecies]) {
    return mapping[rawSpecies];
  }

  /*
    MODIFICATION :
    Sécurité supplémentaire sur quelques variantes utilisateur possibles.
  */
  const normalized = normalizeSpeciesLabel(rawSpecies);

  const fallbackAliases = {
    bar: "BAR FRANC",
    loup: "BAR FRANC",
    "bar franc": "BAR FRANC",
    "bar mouchete": "BAR MOUCHETÉ",
    barbue: "TURBOT ou BARBUE",
    turbot: "TURBOT ou BARBUE",
    sole: "SOLE",
    sar: "SAR",
    sars: "SAR",
    raye: "RAYÉ",
    griset: "GRISET",
    "daurade royale": "DAURADE ROYALE",
    "dorade royale": "DAURADE ROYALE",
    mulet: "MULET",
    orphie: "ORPHIE",
    carrelet: "CARRELET ou FLET",
    plie: "CARRELET ou FLET",
    flet: "CARRELET ou FLET",
    truite: "TRUITE ou SAUMON",
    saumon: "TRUITE ou SAUMON",
    ombrine: "OMBRINE"
  };

  return fallbackAliases[normalized] || null;
}

/*
  MODIFICATION :
  Formate l'affichage longueur + poids.
*/
function formatLengthWeightItem(item) {
  if (!item) {
    return "—";
  }

  return `${item.longueurCm} (${item.poidsG}g)`;
}

/*
  MODIFICATION :
  Prépare toutes les données de la fiche officielle.
*/
function buildOfficialSheetData({ entries, drafts }) {
  const officialRowsMap = new Map(
    OFFICIAL_SHEET_ROWS.map((label) => [label, []])
  );
  const extraRowsMap = new Map();
  const under15RowsMap = new Map();

  let measuredCount = 0;
  let measuredWeight = 0;
  let under15Count = 0;
  let under15Weight = 0;
  let grandeViveCount = 0;
  let grandeViveWeight = 0;
  let biggestFishWeight = 0;

  (entries || []).forEach((entry) => {
    const catchData = entry?.catches;

    if (!catchData) {
      return;
    }

    const draft = drafts?.[entry.id];
    const effectiveEntry = draft
      ? {
          ...entry,
          commission_status: draft.commissionStatus,
          commission_validated_length_cm: draft.commissionValidatedLengthCm,
          commission_validated_weight_g: draft.commissionValidatedWeightG,
          commission_note: draft.commissionNote
        }
      : entry;

    const officialMetrics = getOfficialCatchMetrics(effectiveEntry);

    /*
      MODIFICATION :
      Une prise refusée est exclue de la fiche officielle.
    */
    if (!officialMetrics) {
      return;
    }

    const speciesName = formatExtraSpeciesLabel(catchData.espece);
    const longueurCm = Number(officialMetrics.longueurCm || 0);
    const poidsG = Number(officialMetrics.poidsG || 0);
    const zoneBareme = catchData.zone_bareme || ATLANTIQUE;

    if (isGrandeViveSpecies(speciesName)) {
      grandeViveCount += 1;
      grandeViveWeight += 100;
      biggestFishWeight = Math.max(biggestFishWeight, 100);
      return;
    }

    if (longueurCm < 15) {
      const rowKey = speciesName;
      const currentRow = under15RowsMap.get(rowKey) || {
        label: speciesName,
        count: 0,
        totalWeight: 0
      };

      currentRow.count += 1;
      currentRow.totalWeight += poidsG;

      under15RowsMap.set(rowKey, currentRow);

      under15Count += 1;
      under15Weight += poidsG;
      biggestFishWeight = Math.max(biggestFishWeight, poidsG);
      return;
    }

    const officialRowLabel = resolveOfficialSheetRow(speciesName, zoneBareme);

    if (officialRowLabel && officialRowsMap.has(officialRowLabel)) {
      /*
        MODIFICATION IMPORTANTE :
        on conserve l'ordre de saisie, donc aucun tri sur les longueurs.
        On stocke maintenant longueur + poids pour l'affichage "32 (450g)".
      */
      officialRowsMap.get(officialRowLabel).push({
        longueurCm,
        poidsG
      });
    } else {
      /*
        MODIFICATION IMPORTANTE :
        les espèces supplémentaires gardent aussi l'ordre de saisie.
        On stocke maintenant longueur + poids.
      */
      const currentExtraRow = extraRowsMap.get(speciesName) || [];
      currentExtraRow.push({
        longueurCm,
        poidsG
      });
      extraRowsMap.set(speciesName, currentExtraRow);
    }

    measuredCount += 1;
    measuredWeight += poidsG;
    biggestFishWeight = Math.max(biggestFishWeight, poidsG);
  });

  /*
    MODIFICATION IMPORTANTE :
    on ne trie plus les longueurs.
    On restitue les lignes dans l'ordre réel de saisie.
  */
  const officialRows = OFFICIAL_SHEET_ROWS.map((label) => ({
    label,
    lengths: [...(officialRowsMap.get(label) || [])]
  }));

  /*
    MODIFICATION :
    on garde l'ordre d'apparition des espèces supplémentaires,
    donc on ne trie plus les lignes supplémentaires par ordre alphabétique.
  */
  const extraRows = Array.from(extraRowsMap.entries()).map(([label, lengths]) => ({
    label,
    lengths: [...lengths]
  }));

  /*
    MODIFICATION :
    pour les poissons < 15 cm, on garde aussi l'ordre d'apparition.
  */
  const under15Rows = Array.from(under15RowsMap.values());

  return {
    officialRows,
    extraRows,
    under15Rows,
    measuredCount,
    measuredWeight,
    under15Count,
    under15Weight,
    grandeViveCount,
    grandeViveWeight,
    totalFishCount: measuredCount + under15Count + grandeViveCount,
    totalWeight: measuredWeight + under15Weight + grandeViveWeight,
    biggestFishWeight
  };
}

/*
  MODIFICATION :
  Découpe la fiche officielle en plusieurs pages A4 si les lignes dépassent.
  - page 1 : lignes officielles + autant de lignes supplémentaires que possible
  - pages suivantes : uniquement suite des lignes supplémentaires
*/
function buildOfficialSheetPages(sheetData) {
  const officialRows = sheetData?.officialRows || [];
  const extraRows = sheetData?.extraRows || [];

  const firstPageRemainingExtraCapacity = Math.max(
    0,
    MAX_TOTAL_ROWS_FIRST_PAGE - officialRows.length
  );

  const firstPageExtraRows = extraRows.slice(0, firstPageRemainingExtraCapacity);
  const remainingExtraRows = extraRows.slice(firstPageRemainingExtraCapacity);

  const pages = [
    {
      pageNumber: 1,
      officialRows,
      extraRows: firstPageExtraRows,
      isFirstPage: true
    }
  ];

  for (
    let index = 0;
    index < remainingExtraRows.length;
    index += MAX_TOTAL_ROWS_OTHER_PAGES
  ) {
    pages.push({
      pageNumber: pages.length + 1,
      officialRows: [],
      extraRows: remainingExtraRows.slice(
        index,
        index + MAX_TOTAL_ROWS_OTHER_PAGES
      ),
      isFirstPage: false
    });
  }

  return pages;
}

/*
  MODIFICATION EXPORT :
  comparaison du classement officiel en reprenant la logique concours.
*/
function compareExportRankingRows(a, b) {
  if (b.totalWeight !== a.totalWeight) {
    return b.totalWeight - a.totalWeight;
  }

  if (a.fishCount !== b.fishCount) {
    return a.fishCount - b.fishCount;
  }

  if (b.biggestCatch !== a.biggestCatch) {
    return b.biggestCatch - a.biggestCatch;
  }

  return a.displayName.localeCompare(b.displayName, "fr");
}

function haveExactSameExportRankMetrics(a, b) {
  return (
    a.totalWeight === b.totalWeight &&
    a.fishCount === b.fishCount &&
    a.biggestCatch === b.biggestCatch
  );
}

/*
  MODIFICATION EXPORT :
  construit un classement officiel à partir des métriques commissaire.
*/
function buildOfficialCompetitionRanking({
  participants,
  competitionCatches,
  participantDisplayMode = "pseudo"
}) {
  const rowsByUserId = new Map();

  (participants || []).forEach((participant) => {
    rowsByUserId.set(participant.user_id, {
      userId: participant.user_id,
      displayName: getDisplayNameFromProfile(
        participant?.profiles,
        participantDisplayMode
      ),
      nom: participant?.profiles?.nom || "",
      prenom: participant?.profiles?.prenom || "",
      sexe: participant?.profiles?.sexe || "—",
      categorie: participant?.profiles?.categorie || "—",
      club: participant?.profiles?.club || "—",
      fishCount: 0,
      totalWeight: 0,
      biggestCatch: 0,
      speciesCounts: {},
      catches: []
    });
  });

  (competitionCatches || []).forEach((entry) => {
    const catchData = entry?.catches;
    const officialMetrics = getOfficialCatchMetrics(entry);

    if (!catchData || !entry.user_id || !officialMetrics) {
      return;
    }

    if (!rowsByUserId.has(entry.user_id)) {
      rowsByUserId.set(entry.user_id, {
        userId: entry.user_id,
        displayName: getDisplayNameFromProfile(
          entry?.profiles,
          participantDisplayMode
        ),
        nom: entry?.profiles?.nom || "",
        prenom: entry?.profiles?.prenom || "",
        sexe: entry?.profiles?.sexe || "—",
        categorie: entry?.profiles?.categorie || "—",
        club: entry?.profiles?.club || "—",
        fishCount: 0,
        totalWeight: 0,
        biggestCatch: 0,
        speciesCounts: {},
        catches: []
      });
    }

    const row = rowsByUserId.get(entry.user_id);
    const weight = Number(officialMetrics.poidsG || 0);
    const speciesName = formatExtraSpeciesLabel(catchData.espece);

    row.fishCount += 1;
    row.totalWeight += weight;
    row.biggestCatch = Math.max(row.biggestCatch, weight);
    row.speciesCounts[speciesName] = (row.speciesCounts[speciesName] || 0) + 1;
    row.catches.push({
      ...catchData,
      poids_officiel_g: weight,
      longueur_officielle_cm: Number(officialMetrics.longueurCm || 0)
    });
  });

  const sortedRows = Array.from(rowsByUserId.values()).sort(
    compareExportRankingRows
  );

  let previousRow = null;
  let previousRank = 0;

  return sortedRows.map((row, index) => {
    const currentPosition = index + 1;
    let rank = currentPosition;

    if (previousRow && haveExactSameExportRankMetrics(previousRow, row)) {
      rank = previousRank;
    }

    previousRow = row;
    previousRank = rank;

    return {
      ...row,
      rank
    };
  });
}

function formatSpeciesSummary(speciesCounts) {
  const entries = Object.entries(speciesCounts || {}).sort((a, b) =>
    a[0].localeCompare(b[0], "fr")
  );

  if (entries.length === 0) {
    return "—";
  }

  return entries.map(([species, count]) => `${count} ${species}`).join(", ");
}

/*
  MODIFICATION EXPORT :
  prépare toutes les données synthétiques du concours.
*/
function buildCompetitionExportData({
  competition,
  participants,
  competitionCatches
}) {
  const officialRanking = buildOfficialCompetitionRanking({
    participants,
    competitionCatches,
    participantDisplayMode: competition?.participant_display_mode || "pseudo"
  });

  const rankedRows = officialRanking.filter(
    (row) => row.fishCount > 0 || row.totalWeight > 0
  );

  const officialEntries = (competitionCatches || []).filter((entry) =>
    Boolean(getOfficialCatchMetrics(entry))
  );

  const totalFish = officialEntries.length;
  const totalWeight = officialEntries.reduce((sum, entry) => {
    const officialMetrics = getOfficialCatchMetrics(entry);
    return sum + Number(officialMetrics?.poidsG || 0);
  }, 0);

  const biggestCatchEntry = officialEntries.reduce(
    (max, entry) => {
      const catchData = entry?.catches;
      const officialMetrics = getOfficialCatchMetrics(entry);
      const weight = Number(officialMetrics?.poidsG || 0);

      if (weight > max.weight) {
        return {
          weight,
          length: Number(officialMetrics?.longueurCm || 0),
          species: formatExtraSpeciesLabel(catchData?.espece || "—")
        };
      }

      return max;
    },
    { weight: 0, length: 0, species: "—" }
  );

  const speciesCounts = officialEntries.reduce((accumulator, entry) => {
    const speciesName = formatExtraSpeciesLabel(entry?.catches?.espece || "—");
    accumulator[speciesName] = (accumulator[speciesName] || 0) + 1;
    return accumulator;
  }, {});

  const participantsCount = participants.length;
  const classifiedCount = rankedRows.length;
  const clubsRepresented = new Set(
    rankedRows.map((row) => row.club).filter((value) => value && value !== "—")
  ).size;

  const womenRows = rankedRows.filter((row) => row.sexe === "femme");
  const bestWoman = womenRows.length > 0 ? womenRows[0] : null;

  const bestByCategoryMap = new Map();
  rankedRows.forEach((row) => {
    if (
      row.categorie &&
      row.categorie !== "—" &&
      !bestByCategoryMap.has(row.categorie)
    ) {
      bestByCategoryMap.set(row.categorie, row);
    }
  });

  const bestByCategory = Array.from(bestByCategoryMap.entries())
    .map(([category, row]) => ({
      category,
      row
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "fr"));

  const womenCount = rankedRows.filter((row) => row.sexe === "femme").length;

  return {
    officialRanking,
    rankedRows,
    generalWinner: rankedRows[0] || null,
    bestWoman,
    bestByCategory,
    participantsCount,
    classifiedCount,
    clubsRepresented,
    womenCount,
    totalFish,
    totalWeight,
    biggestCatchEntry,
    speciesCounts,
    speciesSummary: formatSpeciesSummary(speciesCounts)
  };
}

/*
  MODIFICATION EXPORT :
  construit le HTML d'export du concours pour génération PDF.
*/
function buildCompetitionResultsExportHtml({
  competition,
  creatorName,
  exportData
}) {
  const competitionName = competition?.name || "Concours";
  const competitionCode = competition?.code || "—";
  const creatorLabel = creatorName || "—";
  const startDate = competition?.start_date
    ? new Date(competition.start_date).toLocaleString("fr-FR")
    : "Non définie";
  const endDate = competition?.end_date
    ? new Date(competition.end_date).toLocaleString("fr-FR")
    : "Non définie";

  const generalWinnerLabel = exportData.generalWinner
    ? `${exportData.generalWinner.displayName} — ${exportData.generalWinner.totalWeight} g`
    : "—";

  const bestWomanLabel = exportData.bestWoman
    ? `${exportData.bestWoman.displayName} — ${exportData.bestWoman.totalWeight} g`
    : "—";

  const biggestCatchLabel =
    exportData.biggestCatchEntry.weight > 0
      ? `${exportData.biggestCatchEntry.species} — ${exportData.biggestCatchEntry.weight} g — ${exportData.biggestCatchEntry.length} cm`
      : "—";

  const categoryRowsHtml =
    exportData.bestByCategory.length > 0
      ? exportData.bestByCategory
          .map(
            ({ category, row }) => `
              <tr>
                <td>${category}</td>
                <td>${row.displayName}</td>
                <td>${row.fishCount}</td>
                <td>${row.totalWeight} g</td>
              </tr>
            `
          )
          .join("")
      : `
          <tr>
            <td colspan="4">Aucune catégorie classée.</td>
          </tr>
        `;

  const rankingRowsHtml =
    exportData.officialRanking.length > 0
      ? exportData.officialRanking
          .map(
            (row) => `
              <tr>
                <td>${row.rank}</td>
                <td>${row.displayName}</td>
                <td>${row.club || "—"}</td>
                <td>${row.categorie || "—"}</td>
                <td>${row.sexe || "—"}</td>
                <td>${row.fishCount}</td>
                <td>${row.totalWeight} g</td>
                <td>${row.biggestCatch} g</td>
                <td>${formatSpeciesSummary(row.speciesCounts)}</td>
              </tr>
            `
          )
          .join("")
      : `
          <tr>
            <td colspan="9">Aucun classement disponible.</td>
          </tr>
        `;

  const speciesRowsHtml =
    Object.entries(exportData.speciesCounts)
      .sort((a, b) => a[0].localeCompare(b[0], "fr"))
      .map(
        ([species, count]) => `
          <tr>
            <td>${species}</td>
            <td>${count}</td>
          </tr>
        `
      )
      .join("") || `
        <tr>
          <td colspan="2">Aucune espèce comptabilisée.</td>
        </tr>
      `;

  return `
    <div
      id="competition-results-export"
      style="
        width: 1120px;
        background: #ffffff;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        padding: 24px;
      "
    >
      <div style="margin-bottom: 28px;">
        <h1 style="margin:0 0 8px 0; font-size:28px; font-weight:700;">
          Résultats du concours
        </h1>
        <p style="margin:0; font-size:14px; color:#4b5563;">
          ${competitionName} — Code : ${competitionCode}
        </p>

      {isAdmin ? (
        <div className="card">
          <p className="card-text">
            Mode admin actif : tu peux consulter, publier et contrôler ce
            concours même si tu n’en es pas le créateur.
          </p>
        </div>
      ) : null}
      </div>

      <div
        style="
          display:grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap:16px;
          margin-bottom:20px;
        "
      >
        <div
          style="
            border:1px solid #d1d5db;
            border-radius:12px;
            padding:14px;
            background:#fff;
          "
        >
          <h3 style="margin:0 0 10px 0; font-size:16px;">Informations concours</h3>
          <p style="margin:0 0 8px 0;"><strong>Créateur :</strong> ${creatorLabel}</p>
          <p style="margin:0 0 8px 0;"><strong>Début :</strong> ${startDate}</p>
          <p style="margin:0;"><strong>Fin :</strong> ${endDate}</p>
        </div>

        <div
          style="
            border:1px solid #d1d5db;
            border-radius:12px;
            padding:14px;
            background:#fff;
          "
        >
          <h3 style="margin:0 0 10px 0; font-size:16px;">Références</h3>
          <p style="margin:0 0 8px 0;"><strong>Participants :</strong> ${exportData.participantsCount}</p>
          <p style="margin:0 0 8px 0;"><strong>Classés :</strong> ${exportData.classifiedCount}</p>
          <p style="margin:0 0 8px 0;"><strong>Clubs représentés :</strong> ${exportData.clubsRepresented}</p>
          <p style="margin:0;"><strong>Femmes classées :</strong> ${exportData.womenCount}</p>
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap:12px;
          margin-bottom:20px;
        "
      >
        <div style="border:1px solid #d1d5db; border-radius:12px; padding:14px;">
          <div style="font-size:12px; text-transform:uppercase; color:#6b7280; margin-bottom:6px;">Prises</div>
          <div style="font-size:18px; font-weight:700;">${exportData.totalFish}</div>
        </div>

        <div style="border:1px solid #d1d5db; border-radius:12px; padding:14px;">
          <div style="font-size:12px; text-transform:uppercase; color:#6b7280; margin-bottom:6px;">Poids total</div>
          <div style="font-size:18px; font-weight:700;">${exportData.totalWeight} g</div>
        </div>

        <div style="border:1px solid #d1d5db; border-radius:12px; padding:14px;">
          <div style="font-size:12px; text-transform:uppercase; color:#6b7280; margin-bottom:6px;">Plus grosse prise</div>
          <div style="font-size:14px; font-weight:700;">${biggestCatchLabel}</div>
        </div>

        <div style="border:1px solid #d1d5db; border-radius:12px; padding:14px;">
          <div style="font-size:12px; text-transform:uppercase; color:#6b7280; margin-bottom:6px;">1er au général</div>
          <div style="font-size:14px; font-weight:700;">${generalWinnerLabel}</div>
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap:16px;
          margin-bottom:20px;
        "
      >
        <div
          style="
            border:1px solid #d1d5db;
            border-radius:12px;
            padding:14px;
            background:#fff;
          "
        >
          <h3 style="margin:0 0 10px 0; font-size:16px;">Récompenses</h3>
          <p style="margin:0 0 8px 0;"><strong>Meilleure femme :</strong> ${bestWomanLabel}</p>
          <p style="margin:0;"><strong>Espèces prises :</strong> ${exportData.speciesSummary}</p>
        </div>

        <div
          style="
            border:1px solid #d1d5db;
            border-radius:12px;
            padding:14px;
            background:#fff;
          "
        >
          <h3 style="margin:0 0 10px 0; font-size:16px;">Bilan prises</h3>
          <p style="margin:0 0 8px 0;"><strong>Nombre total :</strong> ${exportData.totalFish}</p>
          <p style="margin:0 0 8px 0;"><strong>Poids total :</strong> ${exportData.totalWeight} g</p>
          <p style="margin:0;"><strong>Résumé espèces :</strong> ${exportData.speciesSummary}</p>
        </div>
      </div>

      <div style="margin-bottom:22px;">
        <h2 style="margin:0 0 10px 0; font-size:22px;">Meilleur de chaque catégorie</h2>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Catégorie</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Participant</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Poissons</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Poids</th>
            </tr>
          </thead>
          <tbody>
            ${categoryRowsHtml}
          </tbody>
        </table>
      </div>

      <div style="margin-bottom:28px;">
        <h2 style="margin:0 0 10px 0; font-size:22px;">Bilan des espèces</h2>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Espèce</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Nombre</th>
            </tr>
          </thead>
          <tbody>
            ${speciesRowsHtml}
          </tbody>
        </table>
      </div>

      <div style="page-break-before:always; break-before:page; margin-top:16px;">
        <h2 style="margin:0 0 10px 0; font-size:22px;">Classement général</h2>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Rang</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Participant</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Club</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Catégorie</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Sexe</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Poissons</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Poids total</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Plus grosse prise</th>
              <th style="border:1px solid #cfd8e3; padding:8px; text-align:left; background:#f3f4f6;">Espèces prises</th>
            </tr>
          </thead>
          <tbody>
            ${rankingRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export default function CompetitionDetailsPage() {
  const { competitionId } = useParams();
  const { user, isAdmin } = useAuth();

  const [competition, setCompetition] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [competitionCatches, setCompetitionCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [publishingResults, setPublishingResults] = useState(false);
  const [exportingResults, setExportingResults] = useState(false);

  /*
    MODIFICATION :
    Etats de filtres pour le classement.
  */
  const [selectedSexe, setSelectedSexe] = useState(ALL_FILTER_VALUE);
  const [selectedCategorie, setSelectedCategorie] = useState(ALL_FILTER_VALUE);
  const [selectedClub, setSelectedClub] = useState(ALL_FILTER_VALUE);

  /*
    MODIFICATION :
    Etats de vérification organisateur.
  */
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [reviewParticipantProfile, setReviewParticipantProfile] =
    useState(null);
  const [reviewEntries, setReviewEntries] = useState([]);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSavingId, setReviewSavingId] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");

  /*
    MODIFICATION :
    filtre rapide sur les lignes de la fiche participant.
  */
  const [reviewStatusFilter, setReviewStatusFilter] = useState("all");

  /*
    MODIFICATION :
    masquer les listes de prises par défaut pour réduire le scroll.
  */
  const [showCompetitionCatches, setShowCompetitionCatches] = useState(false);
  const [showReviewEntries, setShowReviewEntries] = useState(false);

  useEffect(() => {
    async function loadCompetitionDetails() {
      try {
        setLoading(true);
        setMessage("");

        const [competitionData, participantsData, catchesData] =
          await Promise.all([
            fetchCompetitionById(competitionId),
            fetchCompetitionParticipants(competitionId),
            fetchCompetitionCatches(competitionId)
          ]);

        setCompetition(competitionData);
        setParticipants(participantsData);
        setCompetitionCatches(catchesData);
      } catch (error) {
        setMessage(error.message || "Erreur lors du chargement du concours.");
      } finally {
        setLoading(false);
      }
    }

    loadCompetitionDetails();
  }, [competitionId]);

  /*
    MODIFICATION :
    Classement général brut, sans filtre.
  */
  const ranking = useMemo(() => {
    return buildCompetitionRanking({
      participants,
      competitionCatches,
      participantDisplayMode: competition?.participant_display_mode || "pseudo"
    });
  }, [
    participants,
    competitionCatches,
    competition?.participant_display_mode
  ]);

  /*
    MODIFICATION EXPORT :
    préparation des données export concours.
  */
  const competitionExportData = useMemo(() => {
    if (!competition) {
      return null;
    }

    return buildCompetitionExportData({
      competition,
      participants,
      competitionCatches
    });
  }, [competition, participants, competitionCatches]);

  /*
    MODIFICATION :
    Options disponibles pour les filtres à partir du classement réel.
  */
  const sexeOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        ranking.map((row) => row.sexe).filter((value) => value && value !== "—")
      )
    );

    return values.sort((a, b) => a.localeCompare(b, "fr"));
  }, [ranking]);

  const categorieOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        ranking
          .map((row) => row.categorie)
          .filter((value) => value && value !== "—")
      )
    );

    return values.sort((a, b) => a.localeCompare(b, "fr"));
  }, [ranking]);

  const clubOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        ranking.map((row) => row.club).filter((value) => value && value !== "—")
      )
    );

    return values.sort((a, b) => a.localeCompare(b, "fr"));
  }, [ranking]);

  /*
    MODIFICATION :
    Application des filtres combinés.
  */
  const filteredRanking = useMemo(() => {
    return ranking.filter((row) => {
      const sexeMatches =
        selectedSexe === ALL_FILTER_VALUE || row.sexe === selectedSexe;

      const categorieMatches =
        selectedCategorie === ALL_FILTER_VALUE ||
        row.categorie === selectedCategorie;

      const clubMatches =
        selectedClub === ALL_FILTER_VALUE || row.club === selectedClub;

      return sexeMatches && categorieMatches && clubMatches;
    });
  }, [ranking, selectedSexe, selectedCategorie, selectedClub]);

  const stats = useMemo(() => {
    const catchesOnly = competitionCatches
      .map((entry) => entry.catches)
      .filter(Boolean);

    const totalCatches = catchesOnly.length;

    const totalWeight = catchesOnly.reduce((sum, catchItem) => {
      return sum + Number(catchItem.poids_g || 0);
    }, 0);

    /*
      MODIFICATION :
      la plus grosse prise retourne maintenant l'espèce, le poids et la longueur.
    */
    const biggestCatch = catchesOnly.reduce(
      (max, catchItem) => {
        const weight = Number(catchItem.poids_g || 0);

        if (weight > max.weight) {
          return {
            weight,
            espece: catchItem.espece || "—",
            longueurCm: Number(catchItem.longueur_cm || 0)
          };
        }

        return max;
      },
      {
        weight: 0,
        espece: "—",
        longueurCm: 0
      }
    );

    return {
      participantsCount: participants.length,
      totalCatches,
      totalWeight,
      biggestCatch
    };
  }, [participants, competitionCatches]);

  const creatorName = useMemo(() => {
    return getDisplayNameFromProfile(
      competition?.creator_profile,
      competition?.participant_display_mode || "pseudo"
    );
  }, [competition]);

  const isCreator = useMemo(() => {
    return (
      !!user?.id &&
      !!competition?.creator_id &&
      user.id === competition.creator_id
    );
  }, [user?.id, competition?.creator_id]);

  const entryDeadline = useMemo(() => {
    return getCompetitionEntryDeadline(competition);
  }, [competition]);

  /*
    MODIFICATION :
    Vérifie si le concours n'accepte plus de saisie.
  */
  const isCompetitionEntryClosed = useMemo(() => {
    if (!entryDeadline) {
      return false;
    }

    return new Date() > entryDeadline;
  }, [entryDeadline]);

  /*
    MODIFICATION :
    Les résultats sont visibles :
    - immédiatement si mode immediate
    - si results_released = true quand mode hidden
    - pour hourly on garde l'affichage visible, comme avant
  */
  const canShowResults = useMemo(() => {
    if (!competition) {
      return false;
    }

    if (competition.results_visibility === "hidden") {
      return competition.results_released === true;
    }

    return true;
  }, [competition]);

  /*
    MODIFICATION EXPORT :
    le créateur peut exporter même avant publication,
    les autres seulement si résultats visibles.
  */
  /*
    MODIFICATION ADMIN :
    l’admin a accès aux outils de gestion du concours
    comme le créateur.
  */
  const canManageCompetition = useMemo(() => {
    return isCreator || isAdmin;
  }, [isCreator, isAdmin]);

  const canExportResults = useMemo(() => {
    return canManageCompetition || canShowResults;
  }, [canManageCompetition, canShowResults]);

  const isHourlyVisibility = competition?.results_visibility === "hourly";

  const canCreatorPublishResults = useMemo(() => {
    return (
      canManageCompetition &&
      isCompetitionEntryClosed &&
      competition?.results_visibility === "hidden" &&
      competition?.results_released !== true
    );
  }, [
    canManageCompetition,
    isCompetitionEntryClosed,
    competition?.results_visibility,
    competition?.results_released
  ]);

  /*
    MODIFICATION :
    Liste des participants pour la fiche commissaire.
  */
  const reviewParticipantOptions = useMemo(() => {
    return participants
      .map((participant) => ({
        userId: participant.user_id,
        displayName: getDisplayNameFromProfile(
          participant?.profiles,
          competition?.participant_display_mode || "pseudo"
        ),
        sexe: participant?.profiles?.sexe || "—",
        categorie: participant?.profiles?.categorie || "—",
        club: participant?.profiles?.club || "—"
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
  }, [participants, competition?.participant_display_mode]);

  /*
    MODIFICATION :
    Chargement de la fiche du participant sélectionné.
  */
  useEffect(() => {
    async function loadParticipantReview() {
      try {
        if (!(isCreator || isAdmin) || !selectedParticipantId) {
          setReviewParticipantProfile(null);
          setReviewEntries([]);
          setReviewDrafts({});
          setReviewMessage("");
          setReviewStatusFilter("all");
          setShowReviewEntries(false);
          return;
        }

        setReviewLoading(true);
        setReviewMessage("");

        const data = await fetchCompetitionParticipantCatches(
          competitionId,
          selectedParticipantId
        );

        setReviewParticipantProfile(data.participantProfile || null);
        setReviewEntries(data.entries || []);

        const nextDrafts = {};
        (data.entries || []).forEach((entry) => {
          nextDrafts[entry.id] = buildCommissionDraft(entry);
        });
        setReviewDrafts(nextDrafts);

        /*
          MODIFICATION :
          on masque par défaut les prises détaillées à chaque changement de participant.
        */
        setShowReviewEntries(false);
      } catch (error) {
        setReviewMessage(
          error.message || "Erreur lors du chargement de la fiche participant."
        );
      } finally {
        setReviewLoading(false);
      }
    }

    loadParticipantReview();
  }, [competitionId, selectedParticipantId, isCreator, isAdmin]);

  /*
    MODIFICATION :
    Résumé officiel de la fiche participant selon validation commissaire.
  */
  const reviewOfficialSummary = useMemo(() => {
    const acceptedEntries = reviewEntries.filter(
      (entry) =>
        entry.commission_status === "validated" ||
        entry.commission_status === "corrected"
    );

    const officialMetrics = acceptedEntries
      .map((entry) => getOfficialCatchMetrics(entry))
      .filter(Boolean);

    const totalFish = officialMetrics.length;
    const totalWeight = officialMetrics.reduce(
      (sum, metric) => sum + Number(metric.poidsG || 0),
      0
    );
    const biggestCatch = officialMetrics.reduce(
      (max, metric) => Math.max(max, Number(metric.poidsG || 0)),
      0
    );

    const pendingCount = reviewEntries.filter(
      (entry) => entry.commission_status === "pending"
    ).length;

    const rejectedCount = reviewEntries.filter(
      (entry) => entry.commission_status === "rejected"
    ).length;

    const correctedCount = reviewEntries.filter(
      (entry) => entry.commission_status === "corrected"
    ).length;

    const validatedCount = reviewEntries.filter(
      (entry) => entry.commission_status === "validated"
    ).length;

    return {
      totalFish,
      totalWeight,
      biggestCatch,
      pendingCount,
      rejectedCount,
      correctedCount,
      validatedCount
    };
  }, [reviewEntries]);

  /*
    MODIFICATION :
    Données calculées de la fiche officielle avec les brouillons en cours.
  */
  const officialSheetData = useMemo(() => {
    return buildOfficialSheetData({
      entries: reviewEntries,
      drafts: reviewDrafts
    });
  }, [reviewEntries, reviewDrafts]);

  /*
    MODIFICATION :
    Pagination automatique en plusieurs feuilles A4.
  */
  const officialSheetPages = useMemo(() => {
    return buildOfficialSheetPages(officialSheetData);
  }, [officialSheetData]);

  /*
    MODIFICATION :
    filtre rapide sur les lignes de la fiche participant.
  */
  const filteredReviewEntries = useMemo(() => {
    if (reviewStatusFilter === "all") {
      return reviewEntries;
    }

    return reviewEntries.filter(
      (entry) => entry.commission_status === reviewStatusFilter
    );
  }, [reviewEntries, reviewStatusFilter]);

  async function handlePublishResults() {
    try {
      if (!competition?.id) {
        return;
      }

      setPublishingResults(true);
      setMessage("");

      const updatedCompetition = await updateCompetitionResultsRelease({
        competitionId: competition.id,
        resultsReleased: true
      });

      setCompetition((prev) => ({
        ...prev,
        ...updatedCompetition
      }));
    } catch (error) {
      setMessage(error.message || "Erreur lors de la publication des résultats.");
    } finally {
      setPublishingResults(false);
    }
  }

  /*
    MODIFICATION EXPORT :
    export direct PDF sans popup.
  */
  async function handleExportResults() {
    try {
      if (!competition || !competitionExportData) {
        return;
      }

      setExportingResults(true);
      setMessage("");

      const exportHtml = buildCompetitionResultsExportHtml({
        competition,
        creatorName,
        exportData: competitionExportData
      });

      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-20000px";
      container.style.top = "0";
      container.style.width = "1120px";
      container.style.background = "#ffffff";
      container.style.zIndex = "-1";
      container.innerHTML = exportHtml;

      document.body.appendChild(container);

      const exportElement = container.querySelector("#competition-results-export");

      if (!exportElement) {
        document.body.removeChild(container);
        throw new Error("Zone d’export introuvable.");
      }

      const canvas = await html2canvas(exportElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * usableWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      const safeCompetitionName = String(competition.name || "concours")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();

      pdf.save(`resultats-${safeCompetitionName || "concours"}.pdf`);
    } catch (error) {
      setMessage(error.message || "Erreur lors de l’export PDF.");
    } finally {
      setExportingResults(false);
    }
  }

  function getStatusLabel() {
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

  /*
    MODIFICATION :
    Permet de remettre les filtres à zéro.
  */
  function resetFilters() {
    setSelectedSexe(ALL_FILTER_VALUE);
    setSelectedCategorie(ALL_FILTER_VALUE);
    setSelectedClub(ALL_FILTER_VALUE);
  }

  /*
    MODIFICATION :
    Mise à jour locale des brouillons commissaire.
  */
  function handleReviewDraftChange(entryId, field, value) {
    setReviewDrafts((prev) => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [field]: value
      }
    }));
  }

  /*
    MODIFICATION :
    Sauvegarde commissaire d'une prise.
  */
  async function handleSaveCommission(entryId) {
    try {
      if (!user?.id) {
        return;
      }

      const draft = reviewDrafts[entryId];

      if (!draft) {
        return;
      }

      setReviewSavingId(entryId);
      setReviewMessage("");

      const updatedRow = await updateCompetitionCatchCommission({
        competitionCatchId: entryId,
        commissionStatus: draft.commissionStatus,
        commissionValidatedLengthCm: draft.commissionValidatedLengthCm,
        commissionValidatedWeightG: draft.commissionValidatedWeightG,
        commissionNote: draft.commissionNote,
        commissionerUserId: user.id
      });

      setReviewEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                ...updatedRow
              }
            : entry
        )
      );

      setCompetitionCatches((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                ...updatedRow
              }
            : entry
        )
      );

      setReviewMessage("Fiche mise à jour.");
    } catch (error) {
      setReviewMessage(error.message || "Erreur lors de la sauvegarde.");
    } finally {
      setReviewSavingId("");
    }
  }

  /*
    MODIFICATION :
    action rapide : valider une ligne.
  */
  async function handleQuickValidate(entry) {
    if (!user?.id || !entry?.id || !entry?.catches) {
      return;
    }

    const quickDraft = {
      commissionStatus: "validated",
      commissionValidatedLengthCm:
        entry.commission_validated_length_cm ?? entry.catches.longueur_cm ?? "",
      commissionValidatedWeightG:
        entry.commission_validated_weight_g ?? entry.catches.poids_g ?? "",
      commissionNote: entry.commission_note || ""
    };

    setReviewDrafts((prev) => ({
      ...prev,
      [entry.id]: quickDraft
    }));

    try {
      setReviewSavingId(entry.id);
      setReviewMessage("");

      const updatedRow = await updateCompetitionCatchCommission({
        competitionCatchId: entry.id,
        commissionStatus: "validated",
        commissionValidatedLengthCm: quickDraft.commissionValidatedLengthCm,
        commissionValidatedWeightG: quickDraft.commissionValidatedWeightG,
        commissionNote: quickDraft.commissionNote,
        commissionerUserId: user.id
      });

      setReviewEntries((prev) =>
        prev.map((currentEntry) =>
          currentEntry.id === entry.id
            ? {
                ...currentEntry,
                ...updatedRow
              }
            : currentEntry
        )
      );

      setCompetitionCatches((prev) =>
        prev.map((currentEntry) =>
          currentEntry.id === entry.id
            ? {
                ...currentEntry,
                ...updatedRow
              }
            : currentEntry
        )
      );

      setReviewMessage("Prise validée.");
    } catch (error) {
      setReviewMessage(error.message || "Erreur lors de la sauvegarde.");
    } finally {
      setReviewSavingId("");
    }
  }

  /*
    MODIFICATION :
    action rapide : refuser une ligne.
  */
  async function handleQuickReject(entry) {
    if (!user?.id || !entry?.id) {
      return;
    }

    const quickDraft = {
      commissionStatus: "rejected",
      commissionValidatedLengthCm: "",
      commissionValidatedWeightG: "",
      commissionNote: entry.commission_note || ""
    };

    setReviewDrafts((prev) => ({
      ...prev,
      [entry.id]: quickDraft
    }));

    try {
      setReviewSavingId(entry.id);
      setReviewMessage("");

      const updatedRow = await updateCompetitionCatchCommission({
        competitionCatchId: entry.id,
        commissionStatus: "rejected",
        commissionValidatedLengthCm: null,
        commissionValidatedWeightG: null,
        commissionNote: quickDraft.commissionNote,
        commissionerUserId: user.id
      });

      setReviewEntries((prev) =>
        prev.map((currentEntry) =>
          currentEntry.id === entry.id
            ? {
                ...currentEntry,
                ...updatedRow
              }
            : currentEntry
        )
      );

      setCompetitionCatches((prev) =>
        prev.map((currentEntry) =>
          currentEntry.id === entry.id
            ? {
                ...currentEntry,
                ...updatedRow
              }
            : currentEntry
        )
      );

      setReviewMessage("Prise refusée.");
    } catch (error) {
      setReviewMessage(error.message || "Erreur lors de la sauvegarde.");
    } finally {
      setReviewSavingId("");
    }
  }

  /*
    MODIFICATION :
    action rapide : préparer une correction automatique
    en basculant juste le statut sur "corrected".
  */
  function handleQuickPrepareCorrection(entry) {
    if (!entry?.id) {
      return;
    }

    setReviewDrafts((prev) => ({
      ...prev,
      [entry.id]: {
        ...buildCommissionDraft(entry),
        commissionStatus: "corrected"
      }
    }));
  }

  /*
    MODIFICATION :
    validation en masse des prises en attente.
  */
  async function handleValidateAllPending() {
    try {
      if (!user?.id) {
        return;
      }

      const pendingEntries = reviewEntries.filter(
        (entry) => entry.commission_status === "pending" && entry.catches
      );

      if (pendingEntries.length === 0) {
        setReviewMessage("Aucune prise en attente à valider.");
        return;
      }

      setReviewSavingId("bulk_pending");
      setReviewMessage("");

      const updatedRows = await Promise.all(
        pendingEntries.map((entry) =>
          updateCompetitionCatchCommission({
            competitionCatchId: entry.id,
            commissionStatus: "validated",
            commissionValidatedLengthCm:
              entry.commission_validated_length_cm ??
              entry.catches?.longueur_cm ??
              null,
            commissionValidatedWeightG:
              entry.commission_validated_weight_g ??
              entry.catches?.poids_g ??
              null,
            commissionNote: entry.commission_note || "",
            commissionerUserId: user.id
          })
        )
      );

      const updatedRowsMap = new Map(updatedRows.map((row) => [row.id, row]));

      setReviewEntries((prev) =>
        prev.map((entry) =>
          updatedRowsMap.has(entry.id)
            ? {
                ...entry,
                ...updatedRowsMap.get(entry.id)
              }
            : entry
        )
      );

      setCompetitionCatches((prev) =>
        prev.map((entry) =>
          updatedRowsMap.has(entry.id)
            ? {
                ...entry,
                ...updatedRowsMap.get(entry.id)
              }
            : entry
        )
      );

      setReviewDrafts((prev) => {
        const nextDrafts = { ...prev };

        pendingEntries.forEach((entry) => {
          nextDrafts[entry.id] = {
            commissionStatus: "validated",
            commissionValidatedLengthCm:
              entry.commission_validated_length_cm ??
              entry.catches?.longueur_cm ??
              "",
            commissionValidatedWeightG:
              entry.commission_validated_weight_g ??
              entry.catches?.poids_g ??
              "",
            commissionNote: entry.commission_note || ""
          };
        });

        return nextDrafts;
      });

      setReviewMessage("Toutes les prises en attente ont été validées.");
    } catch (error) {
      setReviewMessage(
        error.message || "Erreur lors de la validation en masse."
      );
    } finally {
      setReviewSavingId("");
    }
  }

  if (loading) {
    return (
      <section>
        <h2 className="page-title">Concours</h2>
        <p className="page-description">Chargement du concours...</p>
      </section>
    );
  }

  if (message) {
    return (
      <section>
        <h2 className="page-title">Concours</h2>
        <div className="card">
          <p className="card-text">{message}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="page-title">{competition?.name || "Détail concours"}</h2>
      <p className="page-description">
        Code : {competition?.code} | Créateur : {creatorName}
      </p>

      <div className="card">
        <p className="card-text">
          Début :{" "}
          {competition?.start_date
            ? new Date(competition.start_date).toLocaleString("fr-FR")
            : "Non défini"}
        </p>
        <p className="card-text">
          Fin :{" "}
          {competition?.end_date
            ? new Date(competition.end_date).toLocaleString("fr-FR")
            : "Non définie"}
        </p>
        <p className="card-text">
          Délai de saisie après la fin :{" "}
          {competition?.grace_period_minutes || 0} min
        </p>
        <p className="card-text">
          Date limite de saisie :{" "}
          {entryDeadline
            ? entryDeadline.toLocaleString("fr-FR")
            : "Non définie"}
        </p>
        <p className="card-text">Statut : {getStatusLabel()}</p>
      </div>

      {isHourlyVisibility ? (
        <div className="card">
          <p className="card-text">
            Les résultats de ce concours sont affichés avec une actualisation
            horaire.
          </p>
        </div>
      ) : null}

      {competition?.results_visibility === "hidden" &&
      !isCompetitionEntryClosed ? (
        <div className="card">
          <p className="card-text">
            Les résultats sont masqués jusqu’à la fin du concours et la fin du
            délai de saisie.
          </p>
        </div>
      ) : null}

      {canCreatorPublishResults ? (
        <div className="card">
          <h3 className="card-title">Publication des résultats</h3>
          <p className="card-text">
            Le concours est clôturé. En tant qu’administrateur ou créateur, tu peux maintenant
            publier les résultats.
          </p>

          <div style={{ marginTop: "12px" }}>
            <button
              type="button"
              className="primary-button"
              onClick={handlePublishResults}
              disabled={publishingResults}
            >
              {publishingResults ? "Publication..." : "Afficher les résultats"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Participants</p>
          <p className="stat-card__value">{stats.participantsCount}</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Captures</p>
          <p className="stat-card__value">{stats.totalCatches}</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Poids total</p>
          <p className="stat-card__value">{stats.totalWeight} g</p>
        </div>

        <div className="stat-card">
          <p className="stat-card__label">Plus grosse prise</p>
          <p className="stat-card__value">
            {stats.biggestCatch.weight > 0
              ? `${stats.biggestCatch.espece} — ${stats.biggestCatch.weight} g — ${stats.biggestCatch.longueurCm} cm`
              : "—"}
          </p>
        </div>
      </div>

      {canShowResults ? (
        <>
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "16px"
              }}
            >
              <h3 className="card-title" style={{ margin: 0 }}>
                Classement
              </h3>

              {canExportResults ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleExportResults}
                  disabled={exportingResults}
                >
                  {exportingResults
                    ? "Export en cours..."
                    : "Exporter les résultats"}
                </button>
              ) : null}
            </div>

            <div className="form" style={{ marginBottom: "16px" }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="ranking-filter-sexe">
                    Sexe
                  </label>
                  <select
                    id="ranking-filter-sexe"
                    className="form-select"
                    value={selectedSexe}
                    onChange={(event) => setSelectedSexe(event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>Tous</option>
                    {sexeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label
                    className="form-label"
                    htmlFor="ranking-filter-categorie"
                  >
                    Catégorie
                  </label>
                  <select
                    id="ranking-filter-categorie"
                    className="form-select"
                    value={selectedCategorie}
                    onChange={(event) =>
                      setSelectedCategorie(event.target.value)
                    }
                  >
                    <option value={ALL_FILTER_VALUE}>Toutes</option>
                    {categorieOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="ranking-filter-club">
                    Club
                  </label>
                  <select
                    id="ranking-filter-club"
                    className="form-select"
                    value={selectedClub}
                    onChange={(event) => setSelectedClub(event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>Tous les clubs</option>
                    {clubOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
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
            </div>

            {filteredRanking.length === 0 ? (
              <p className="card-text">
                Aucun participant ne correspond aux filtres sélectionnés.
              </p>
            ) : (
              <div className="simple-list">
                {filteredRanking.map((row) => (
                  <article key={row.userId} className="list-item">
                    <h4 className="list-item__title">
                      {row.rank}. {row.displayName}
                    </h4>
                    <p className="list-item__meta">Sexe : {row.sexe}</p>
                    <p className="list-item__meta">
                      Catégorie : {row.categorie}
                    </p>
                    <p className="list-item__meta">Club : {row.club}</p>
                    <p className="list-item__meta">
                      Poids total : {row.totalWeight} g
                    </p>
                    <p className="list-item__meta">
                      Nombre de poissons : {row.fishCount}
                    </p>
                    <p className="list-item__meta">
                      Plus grosse prise : {row.biggestCatch} g
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "12px"
              }}
            >
              <h3 className="card-title" style={{ margin: 0 }}>
                Captures du concours
              </h3>

              {/* MODIFICATION :
                  les captures du concours sont masquées par défaut.
              */}
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCompetitionCatches((prev) => !prev)}
              >
                {showCompetitionCatches
                  ? "Masquer les prises"
                  : `Afficher les prises (${competitionCatches.length})`}
              </button>
            </div>

            {!showCompetitionCatches ? (
              <p className="card-text">
                Les prises du concours sont masquées pour limiter le scroll.
              </p>
            ) : competitionCatches.length === 0 ? (
              <p className="card-text">
                Aucune capture n’est encore enregistrée dans ce concours.
              </p>
            ) : (
              <div className="simple-list">
                {competitionCatches.map((entry) => {
                  const catchData = entry.catches;

                  if (!catchData) {
                    return null;
                  }

                  const fisherName = getDisplayNameFromProfile(
                    entry.profiles,
                    competition?.participant_display_mode || "pseudo"
                  );

                  return (
                    <article key={entry.id} className="list-item">
                      {catchData.photo_url ? (
                        <img
                          src={catchData.photo_url}
                          alt={catchData.espece}
                          style={{
                            width: "100%",
                            maxHeight: "220px",
                            objectFit: "cover",
                            borderRadius: "12px",
                            marginBottom: "12px"
                          }}
                        />
                      ) : null}

                      <h4 className="list-item__title">{catchData.espece}</h4>
                      <p className="list-item__meta">Pêcheur : {fisherName}</p>
                      <p className="list-item__meta">
                        Longueur : {catchData.longueur_cm} cm
                      </p>
                      <p className="list-item__meta">
                        Poids : {catchData.poids_g} g
                      </p>
                      <p className="list-item__meta">
                        Date :{" "}
                        {new Date(catchData.date_heure).toLocaleString("fr-FR")}
                      </p>
                      <p className="list-item__meta">
                        Zone : {catchData.zone_bareme}
                      </p>
                      <p className="list-item__meta">
                        Commentaire : {catchData.commentaire || "Aucun"}
                      </p>
                      <p className="list-item__meta">
                        Statut commissaire :{" "}
                        {getCommissionStatusLabel(entry.commission_status)}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          <h3 className="card-title">Résultats</h3>
          <p className="card-text">
            Les résultats de ce concours sont actuellement masqués.
          </p>
        </div>
      )}

      {canManageCompetition ? (
        <div className="card">
          <h3 className="card-title">Vérification des fiches participants</h3>

          <div className="form">
            <div className="form-group">
              <label className="form-label" htmlFor="review-participant-select">
                Choisir un participant
              </label>
              <select
                id="review-participant-select"
                className="form-select"
                value={selectedParticipantId}
                onChange={(event) => setSelectedParticipantId(event.target.value)}
              >
                <option value="">Choisir un participant</option>
                {reviewParticipantOptions.map((participant) => (
                  <option key={participant.userId} value={participant.userId}>
                    {participant.displayName} — {participant.categorie} —{" "}
                    {participant.club}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {reviewLoading ? (
            <p className="card-text">Chargement de la fiche participant...</p>
          ) : null}

          {reviewMessage ? <p className="card-text">{reviewMessage}</p> : null}

          {reviewParticipantProfile ? (
            <>
              <div className="card" style={{ marginBottom: "16px" }}>
                <h4 className="card-title">
                  {getDisplayNameFromProfile(
                    reviewParticipantProfile,
                    competition?.participant_display_mode || "pseudo"
                  )}
                </h4>
                <p className="card-text">
                  Sexe : {reviewParticipantProfile.sexe || "—"}
                </p>
                <p className="card-text">
                  Catégorie : {reviewParticipantProfile.categorie || "—"}
                </p>
                <p className="card-text">
                  Club : {reviewParticipantProfile.club || "—"}
                </p>
              </div>

              {/* MODIFICATION :
                  fiche officielle commissaire avec pagination automatique A4
              */}
              <div className="card" style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: "16px"
                  }}
                >
                  <h4 className="card-title" style={{ margin: 0 }}>
                    Fiche officielle commissaire
                  </h4>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => window.print()}
                  >
                    Imprimer la fiche
                  </button>
                </div>

                {officialSheetPages.map((page, pageIndex) => (
                  <div
                    key={`official-sheet-page-${page.pageNumber}`}
                    style={{
                      border: "1px solid #d8dee6",
                      borderRadius: "16px",
                      padding: "16px",
                      background: "#fff",
                      marginBottom:
                        pageIndex < officialSheetPages.length - 1 ? "20px" : "0",
                      breakAfter:
                        pageIndex < officialSheetPages.length - 1 ? "page" : "auto",
                      pageBreakAfter:
                        pageIndex < officialSheetPages.length - 1 ? "always" : "auto"
                    }}
                  >
                    {page.isFirstPage ? (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "12px",
                            marginBottom: "16px"
                          }}
                        >
                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Concours du :{" "}
                              {competition?.start_date
                                ? new Date(
                                    competition.start_date
                                  ).toLocaleDateString("fr-FR")
                                : "Non défini"}
                            </p>
                            <p className="card-text">
                              Organisé par : {creatorName || "Non renseigné"}
                            </p>
                          </div>

                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px",
                              textAlign: "center",
                              fontWeight: "700"
                            }}
                          >
                            FICHE COMMISSAIRE
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "12px",
                            marginBottom: "16px"
                          }}
                        >
                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Nom : {reviewParticipantProfile.nom || "—"}
                            </p>
                            <p className="card-text">
                              Prénom : {reviewParticipantProfile.prenom || "—"}
                            </p>
                            <p className="card-text">
                              Club : {reviewParticipantProfile.club || "—"}
                            </p>
                          </div>

                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Catégorie : {reviewParticipantProfile.categorie || "—"}
                            </p>
                            <p className="card-text">Place N° : —</p>
                            <p className="card-text">
                              Page : {page.pageNumber}/{officialSheetPages.length}
                            </p>
                          </div>
                        </div>

                        <p
                          className="card-text"
                          style={{ textAlign: "center", fontWeight: 700 }}
                        >
                          Concours NO KILL, toutes les prises doivent être remises à
                          l&apos;eau
                        </p>
                        <p
                          className="card-text"
                          style={{ textAlign: "center", marginBottom: "12px" }}
                        >
                          Enregistrer ici les poissons (longueur en cm) au-delà de 15
                          cm
                        </p>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            marginBottom: "12px"
                          }}
                        >
                          <div>
                            <p className="card-text" style={{ fontWeight: 700 }}>
                              FICHE COMMISSAIRE — Suite des espèces
                            </p>
                            <p className="card-text">
                              Participant :{" "}
                              {getDisplayNameFromProfile(
                                reviewParticipantProfile,
                                competition?.participant_display_mode || "pseudo"
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="card-text">
                              Page : {page.pageNumber}/{officialSheetPages.length}
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    <div style={{ overflowX: "auto", marginBottom: "12px" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          minWidth: "720px"
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                border: "1px solid #cfd8e3",
                                padding: "8px",
                                textAlign: "left"
                              }}
                            >
                              Espèce
                            </th>
                            <th
                              style={{
                                border: "1px solid #cfd8e3",
                                padding: "8px",
                                textAlign: "left"
                              }}
                            >
                              Longueurs enregistrées
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {page.officialRows.map((row) => (
                            <tr key={`official-${page.pageNumber}-${row.label}`}>
                              <td
                                style={{
                                  border: "1px solid #cfd8e3",
                                  padding: "8px",
                                  fontWeight: "700"
                                }}
                              >
                                {row.label}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #cfd8e3",
                                  padding: "8px"
                                }}
                              >
                                {row.lengths.length > 0
                                  ? row.lengths
                                      .map((item) => formatLengthWeightItem(item))
                                      .join(" • ")
                                  : "—"}
                              </td>
                            </tr>
                          ))}

                          {page.extraRows.map((row) => (
                            <tr key={`extra-${page.pageNumber}-${row.label}`}>
                              <td
                                style={{
                                  border: "1px solid #cfd8e3",
                                  padding: "8px",
                                  fontWeight: "700"
                                }}
                              >
                                {row.label}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #cfd8e3",
                                  padding: "8px"
                                }}
                              >
                                {row.lengths.length > 0
                                  ? row.lengths
                                      .map((item) => formatLengthWeightItem(item))
                                      .join(" • ")
                                  : "—"}
                              </td>
                            </tr>
                          ))}

                          {page.isFirstPage
                            ? Array.from({
                                length: Math.max(
                                  0,
                                  MAX_TOTAL_ROWS_FIRST_PAGE -
                                    page.officialRows.length -
                                    page.extraRows.length
                                )
                              }).map((_, index) => (
                                <tr key={`blank-first-${index}`}>
                                  <td
                                    style={{
                                      border: "1px solid #cfd8e3",
                                      padding: "8px"
                                    }}
                                  >
                                    &nbsp;
                                  </td>
                                  <td
                                    style={{
                                      border: "1px solid #cfd8e3",
                                      padding: "8px"
                                    }}
                                  >
                                    &nbsp;
                                  </td>
                                </tr>
                              ))
                            : Array.from({
                                length: Math.max(
                                  0,
                                  MAX_TOTAL_ROWS_OTHER_PAGES - page.extraRows.length
                                )
                              }).map((_, index) => (
                                <tr key={`blank-next-${page.pageNumber}-${index}`}>
                                  <td
                                    style={{
                                      border: "1px solid #cfd8e3",
                                      padding: "8px"
                                    }}
                                  >
                                    &nbsp;
                                  </td>
                                  <td
                                    style={{
                                      border: "1px solid #cfd8e3",
                                      padding: "8px"
                                    }}
                                  >
                                    &nbsp;
                                  </td>
                                </tr>
                              ))}
                        </tbody>
                      </table>
                    </div>

                    {page.isFirstPage ? (
                      <>
                        <div
                          style={{
                            border: "1px solid #d8dee6",
                            borderRadius: "12px",
                            padding: "12px",
                            marginBottom: "12px"
                          }}
                        >
                          <p className="card-text" style={{ fontWeight: 700 }}>
                            GRANDE VIVE : ne pas mesurer, noter le nombre total
                          </p>
                          <p className="card-text">
                            Nombre : {officialSheetData.grandeViveCount}
                          </p>
                          <p className="card-text">
                            Forfait comptabilisé : {officialSheetData.grandeViveWeight} g
                          </p>
                        </div>

                        <div
                          style={{
                            border: "1px solid #d8dee6",
                            borderRadius: "12px",
                            padding: "12px",
                            marginBottom: "12px"
                          }}
                        >
                          <p className="card-text" style={{ fontWeight: 700 }}>
                            Poissons mesurés à moins de 15 cm
                          </p>

                          {officialSheetData.under15Rows.length === 0 ? (
                            <p className="card-text">Aucun poisson sous 15 cm.</p>
                          ) : (
                            <div style={{ overflowX: "auto" }}>
                              <table
                                style={{
                                  width: "100%",
                                  borderCollapse: "collapse",
                                  minWidth: "480px"
                                }}
                              >
                                <thead>
                                  <tr>
                                    <th
                                      style={{
                                        border: "1px solid #cfd8e3",
                                        padding: "8px",
                                        textAlign: "left"
                                      }}
                                    >
                                      Espèce
                                    </th>
                                    <th
                                      style={{
                                        border: "1px solid #cfd8e3",
                                        padding: "8px",
                                        textAlign: "left"
                                      }}
                                    >
                                      Nombre
                                    </th>
                                    <th
                                      style={{
                                        border: "1px solid #cfd8e3",
                                        padding: "8px",
                                        textAlign: "left"
                                      }}
                                    >
                                      Poids total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {officialSheetData.under15Rows.map((row) => (
                                    <tr key={`under15-${row.label}`}>
                                      <td
                                        style={{
                                          border: "1px solid #cfd8e3",
                                          padding: "8px"
                                        }}
                                      >
                                        {row.label}
                                      </td>
                                      <td
                                        style={{
                                          border: "1px solid #cfd8e3",
                                          padding: "8px"
                                        }}
                                      >
                                        {row.count}
                                      </td>
                                      <td
                                        style={{
                                          border: "1px solid #cfd8e3",
                                          padding: "8px"
                                        }}
                                      >
                                        {row.totalWeight} g
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "12px",
                            marginBottom: "12px"
                          }}
                        >
                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Poissons mesurés : {officialSheetData.measuredCount}
                            </p>
                            <p className="card-text">
                              Poids : {officialSheetData.measuredWeight} g
                            </p>
                          </div>

                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Poissons - 15 cm : {officialSheetData.under15Count}
                            </p>
                            <p className="card-text">
                              Poids : {officialSheetData.under15Weight} g
                            </p>
                          </div>

                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Grandes vives : {officialSheetData.grandeViveCount}
                            </p>
                            <p className="card-text">
                              Valeur : {officialSheetData.grandeViveWeight} g
                            </p>
                          </div>

                          <div
                            style={{
                              border: "2px solid #111827",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text" style={{ fontWeight: 700 }}>
                              TOTAL : {officialSheetData.totalWeight} g
                            </p>
                            <p className="card-text">
                              Nombre de poissons : {officialSheetData.totalFishCount}
                            </p>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "12px"
                          }}
                        >
                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Signature Commissaire : __________________
                            </p>
                          </div>

                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Signature Pêcheur : __________________
                            </p>
                          </div>

                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">
                              Plus gros poisson : {officialSheetData.biggestFishWeight} g
                            </p>
                          </div>

                          <div
                            style={{
                              border: "1px solid #d8dee6",
                              borderRadius: "12px",
                              padding: "12px"
                            }}
                          >
                            <p className="card-text">Classement : —</p>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <p className="stat-card__label">Poissons validés</p>
                  <p className="stat-card__value">
                    {reviewOfficialSummary.totalFish}
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-card__label">Poids officiel</p>
                  <p className="stat-card__value">
                    {reviewOfficialSummary.totalWeight} g
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-card__label">Plus grosse prise</p>
                  <p className="stat-card__value">
                    {reviewOfficialSummary.biggestCatch} g
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-card__label">En attente / Refusées</p>
                  <p className="stat-card__value">
                    {reviewOfficialSummary.pendingCount} /{" "}
                    {reviewOfficialSummary.rejectedCount}
                  </p>
                </div>
              </div>

              {/* MODIFICATION :
                  barre de contrôle rapide organisateur
              */}
              <div className="card" style={{ marginBottom: "16px" }}>
                <h4 className="card-title">Contrôle rapide</h4>

                <div className="form-row">
                  <div className="form-group">
                    <label
                      className="form-label"
                      htmlFor="review-status-filter"
                    >
                      Filtrer les prises
                    </label>
                    <select
                      id="review-status-filter"
                      className="form-select"
                      value={reviewStatusFilter}
                      onChange={(event) =>
                        setReviewStatusFilter(event.target.value)
                      }
                    >
                      {REVIEW_STATUS_FILTERS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ alignSelf: "end" }}>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleValidateAllPending}
                      disabled={reviewSavingId === "bulk_pending"}
                    >
                      {reviewSavingId === "bulk_pending"
                        ? "Validation..."
                        : "Valider toutes les prises en attente"}
                    </button>
                  </div>
                </div>

                <p className="card-text">
                  Validées : {reviewOfficialSummary.validatedCount} | Corrigées :{" "}
                  {reviewOfficialSummary.correctedCount} | En attente :{" "}
                  {reviewOfficialSummary.pendingCount} | Refusées :{" "}
                  {reviewOfficialSummary.rejectedCount}
                </p>
              </div>

              <div className="card" style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap"
                  }}
                >
                  <h4 className="card-title" style={{ margin: 0 }}>
                    Prises du participant
                  </h4>

                  {/* MODIFICATION :
                      les prises détaillées du participant sont masquées par défaut.
                  */}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowReviewEntries((prev) => !prev)}
                  >
                    {showReviewEntries
                      ? "Masquer les prises"
                      : `Afficher les prises (${filteredReviewEntries.length})`}
                  </button>
                </div>
              </div>

              {showReviewEntries ? (
                <div className="simple-list">
                  {filteredReviewEntries.length === 0 ? (
                    <p className="card-text">
                      Aucune prise ne correspond au filtre sélectionné.
                    </p>
                  ) : (
                    filteredReviewEntries.map((entry) => {
                      const catchData = entry.catches;

                      if (!catchData) {
                        return null;
                      }

                      const draft =
                        reviewDrafts[entry.id] || buildCommissionDraft(entry);

                      const officialMetrics = getOfficialCatchMetrics({
                        ...entry,
                        commission_status: draft.commissionStatus,
                        commission_validated_length_cm:
                          draft.commissionValidatedLengthCm,
                        commission_validated_weight_g:
                          draft.commissionValidatedWeightG
                      });

                      return (
                        <article key={entry.id} className="list-item">
                          {/* MODIFICATION :
                              zone compacte avec actions rapides
                          */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              flexWrap: "wrap",
                              marginBottom: "12px"
                            }}
                          >
                            <div>
                              <h4 className="list-item__title">
                                {catchData.espece}
                              </h4>
                              <p className="list-item__meta">
                                Longueur saisie : {catchData.longueur_cm} cm
                              </p>
                              <p className="list-item__meta">
                                Poids saisi : {catchData.poids_g} g
                              </p>
                              <p className="list-item__meta">
                                Date :{" "}
                                {new Date(catchData.date_heure).toLocaleString(
                                  "fr-FR"
                                )}
                              </p>
                              <p className="list-item__meta">
                                Statut actuel :{" "}
                                {getCommissionStatusLabel(
                                  entry.commission_status
                                )}
                              </p>

                              {officialMetrics ? (
                                <p className="list-item__meta">
                                  Valeur officielle en cours :{" "}
                                  {officialMetrics.longueurCm} cm /{" "}
                                  {officialMetrics.poidsG} g
                                </p>
                              ) : (
                                <p className="list-item__meta">
                                  Valeur officielle en cours : prise refusée
                                </p>
                              )}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                alignItems: "flex-start",
                                flexWrap: "wrap"
                              }}
                            >
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => handleQuickValidate(entry)}
                                disabled={reviewSavingId === entry.id}
                                title="Valider rapidement"
                              >
                                ✅ Valider
                              </button>

                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => handleQuickPrepareCorrection(entry)}
                                disabled={reviewSavingId === entry.id}
                                title="Préparer une correction"
                              >
                                ✏️ Corriger
                              </button>

                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => handleQuickReject(entry)}
                                disabled={reviewSavingId === entry.id}
                                title="Refuser rapidement"
                              >
                                ❌ Refuser
                              </button>
                            </div>
                          </div>

                          <div className="form" style={{ marginTop: "12px" }}>
                            <div className="form-group">
                              <label className="form-label">
                                Décision organisateur
                              </label>
                              <select
                                className="form-select"
                                value={draft.commissionStatus}
                                onChange={(event) =>
                                  handleReviewDraftChange(
                                    entry.id,
                                    "commissionStatus",
                                    event.target.value
                                  )
                                }
                              >
                                <option value="pending">En attente</option>
                                <option value="validated">Valider</option>
                                <option value="corrected">Corriger</option>
                                <option value="rejected">Refuser</option>
                              </select>
                            </div>

                            <div className="form-row">
                              <div className="form-group">
                                <label className="form-label">
                                  Longueur validée (cm)
                                </label>
                                <input
                                  className="form-input"
                                  type="number"
                                  value={draft.commissionValidatedLengthCm}
                                  onChange={(event) =>
                                    handleReviewDraftChange(
                                      entry.id,
                                      "commissionValidatedLengthCm",
                                      event.target.value
                                    )
                                  }
                                />
                              </div>

                              <div className="form-group">
                                <label className="form-label">
                                  Poids validé (g)
                                </label>
                                <input
                                  className="form-input"
                                  type="number"
                                  value={draft.commissionValidatedWeightG}
                                  onChange={(event) =>
                                    handleReviewDraftChange(
                                      entry.id,
                                      "commissionValidatedWeightG",
                                      event.target.value
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div className="form-group">
                              <label className="form-label">
                                Note organisateur
                              </label>
                              <textarea
                                className="form-textarea"
                                value={draft.commissionNote}
                                onChange={(event) =>
                                  handleReviewDraftChange(
                                    entry.id,
                                    "commissionNote",
                                    event.target.value
                                  )
                                }
                              />
                            </div>

                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => handleSaveCommission(entry.id)}
                              disabled={reviewSavingId === entry.id}
                            >
                              {reviewSavingId === entry.id
                                ? "Enregistrement..."
                                : "Enregistrer la décision"}
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              ) : (
                <p className="card-text">
                  Les prises détaillées du participant sont masquées pour limiter
                  le scroll.
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <Link
          to="/captures/ajouter"
          className="primary-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%"
          }}
        >
          Ajouter une capture à un concours
        </Link>
      </div>
    </section>
  );
}