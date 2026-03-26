import { supabase } from "../lib/supabase";

/*
  SERVICE CONCOURS
  Ce fichier centralise toutes les opérations liées aux concours.

  MODIFICATIONS IMPORTANTES :
  - options de concours :
    participant_display_mode = 'pseudo' | 'nom_prenom'
    results_visibility = 'immediate' | 'hidden' | 'hourly'
  - ajout de results_released pour permettre au créateur
    de publier les résultats d'un concours masqué
  - ajout de start_date, end_date et grace_period_minutes
  - blocage des enregistrements hors fenêtre du concours
  - récupération du profil du créateur
  - chargement séparé des profils participants
  - chargement séparé des captures et profils
  - classement automatique avec gestion des ex aequo
  - récupération de sexe, categorie et club pour affichage concours
  - NOUVEAU :
    vérification commissaire / organisateur sur chaque prise du concours
  - CORRECTION :
    le classement utilise maintenant les métriques officielles
    après validation commissaire et ignore les prises refusées
*/

function generateCompetitionCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/*
  MODIFICATION :
  Affichage d'un profil selon le mode choisi par le concours.
*/
export function getDisplayNameFromProfile(profile, displayMode = "pseudo") {
  if (!profile) {
    return "Utilisateur";
  }

  if (displayMode === "nom_prenom") {
    const fullName = `${profile.prenom || ""} ${profile.nom || ""}`.trim();

    if (fullName) {
      return fullName;
    }
  }

  if (profile.pseudo) {
    return profile.pseudo;
  }

  if (profile.prenom || profile.nom) {
    return `${profile.prenom || ""} ${profile.nom || ""}`.trim();
  }

  return profile.email || "Utilisateur";
}

/*
  MODIFICATION :
  Retourne la date limite réelle de saisie d'un concours
  = end_date + grace_period_minutes
*/
export function getCompetitionEntryDeadline(competition) {
  if (!competition?.end_date) {
    return null;
  }

  const endDate = new Date(competition.end_date);

  if (Number.isNaN(endDate.getTime())) {
    return null;
  }

  const graceMinutes = Number(competition?.grace_period_minutes || 0);

  return new Date(endDate.getTime() + graceMinutes * 60 * 1000);
}

/*
  MODIFICATION :
  Vérifie si la saisie d'une prise dans le concours est autorisée.
  Fenêtre autorisée :
  - après start_date
  - jusqu'à end_date + grace_period_minutes
*/
export function isCompetitionEntryOpen(competition, now = new Date()) {
  if (!competition?.start_date || !competition?.end_date) {
    return false;
  }

  const startDate = new Date(competition.start_date);
  const deadline = getCompetitionEntryDeadline(competition);

  if (Number.isNaN(startDate.getTime()) || !deadline) {
    return false;
  }

  return now >= startDate && now <= deadline;
}

/*
  MODIFICATION :
  Retourne un statut lisible pour l'affichage.
*/
export function getCompetitionEntryStatus(competition, now = new Date()) {
  if (!competition?.start_date || !competition?.end_date) {
    return "dates_manquantes";
  }

  const startDate = new Date(competition.start_date);
  const endDate = new Date(competition.end_date);
  const deadline = getCompetitionEntryDeadline(competition);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    !deadline
  ) {
    return "dates_invalides";
  }

  if (now < startDate) {
    return "pas_commence";
  }

  if (now > deadline) {
    return "termine";
  }

  if (now > endDate && now <= deadline) {
    return "delai_saisie";
  }

  return "en_cours";
}

/*
  MODIFICATION :
  Libellé lisible pour le statut commissaire.
*/
export function getCommissionStatusLabel(status) {
  if (status === "validated") {
    return "Validée";
  }

  if (status === "corrected") {
    return "Corrigée";
  }

  if (status === "rejected") {
    return "Refusée";
  }

  return "En attente";
}

/*
  MODIFICATION :
  Retourne les métriques officielles d'une prise
  selon la validation commissaire.
*/
export function getOfficialCatchMetrics(entry) {
  if (!entry?.catches) {
    return null;
  }

  if (entry.commission_status === "rejected") {
    return null;
  }

  if (
    entry.commission_status === "validated" ||
    entry.commission_status === "corrected"
  ) {
    return {
      longueurCm: Number(
        entry.commission_validated_length_cm ?? entry.catches.longueur_cm ?? 0
      ),
      poidsG: Number(
        entry.commission_validated_weight_g ?? entry.catches.poids_g ?? 0
      )
    };
  }

  return {
    longueurCm: Number(entry.catches.longueur_cm ?? 0),
    poidsG: Number(entry.catches.poids_g ?? 0)
  };
}

export async function createCompetition({
  name,
  userId,
  participantDisplayMode = "pseudo",
  resultsVisibility = "immediate",
  startDate = null,
  endDate = null,
  gracePeriodMinutes = 30
}) {
  const code = generateCompetitionCode();

  const { data, error } = await supabase
    .from("competitions")
    .insert({
      name,
      code,
      creator_id: userId,
      participant_display_mode: participantDisplayMode,
      results_visibility: resultsVisibility,
      results_released: resultsVisibility === "immediate",
      start_date: startDate,
      end_date: endDate,
      grace_period_minutes: gracePeriodMinutes
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const { error: participantError } = await supabase
    .from("competition_participants")
    .insert({
      competition_id: data.id,
      user_id: userId
    });

  if (participantError) {
    throw participantError;
  }

  return data;
}

export async function joinCompetition({ code, userId }) {
  const normalizedCode = String(code || "").trim().toUpperCase();

  const { data: competition, error } = await supabase
    .from("competitions")
    .select("*")
    .eq("code", normalizedCode)
    .single();

  if (error || !competition) {
    throw new Error("Code concours invalide.");
  }

  const { error: joinError } = await supabase
    .from("competition_participants")
    .insert({
      competition_id: competition.id,
      user_id: userId
    });

  if (joinError) {
    if (joinError.code === "23505") {
      throw new Error("Tu participes déjà à ce concours.");
    }

    throw joinError;
  }

  return competition;
}

export async function fetchUserCompetitions(userId) {
  const { data, error } = await supabase
    .from("competition_participants")
    .select(`
      competition_id,
      competitions (
        id,
        name,
        code,
        creator_id,
        participant_display_mode,
        results_visibility,
        results_released,
        start_date,
        end_date,
        grace_period_minutes,
        created_at
      )
    `)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => row.competitions)
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function attachCatchToCompetition({
  competitionId,
  catchId,
  userId
}) {
  /*
    MODIFICATION :
    On vérifie que le concours accepte encore la saisie.
  */
  const competition = await fetchCompetitionById(competitionId);

  if (!isCompetitionEntryOpen(competition)) {
    throw new Error(
      "Ce concours n’accepte pas de nouvelles prises à cette date."
    );
  }

  const { data, error } = await supabase
    .from("competition_catches")
    .insert({
      competition_id: competitionId,
      catch_id: catchId,
      user_id: userId
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Cette capture est déjà enregistrée dans ce concours.");
    }

    throw error;
  }

  return data;
}

export async function fetchCompetitionById(competitionId) {
  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .select("*")
    .eq("id", competitionId)
    .single();

  if (competitionError) {
    throw competitionError;
  }

  /*
    MODIFICATION :
    Chargement séparé du profil du créateur.
  */
  const { data: creatorProfile, error: creatorError } = await supabase
    .from("profiles")
    .select("id, pseudo, email, nom, prenom, sexe, categorie, club")
    .eq("id", competition.creator_id)
    .maybeSingle();

  if (creatorError) {
    throw creatorError;
  }

  return {
    ...competition,
    creator_profile: creatorProfile || null
  };
}

export async function updateCompetitionResultsRelease({
  competitionId,
  resultsReleased
}) {
  /*
    MODIFICATION :
    Permet au créateur de publier les résultats.
  */
  const { data, error } = await supabase
    .from("competitions")
    .update({
      results_released: resultsReleased
    })
    .eq("id", competitionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchCompetitionParticipants(competitionId) {
  /*
    MODIFICATION :
    récupération des participants puis chargement des profils séparément
    pour éviter l'erreur de relation Supabase
  */
  const { data: participants, error: participantsError } = await supabase
    .from("competition_participants")
    .select("user_id, joined_at")
    .eq("competition_id", competitionId);

  if (participantsError) {
    throw participantsError;
  }

  const safeParticipants = participants || [];

  if (safeParticipants.length === 0) {
    return [];
  }

  const userIds = safeParticipants.map((participant) => participant.user_id);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, pseudo, email, nom, prenom, sexe, categorie, club")
    .in("id", userIds);

  if (profilesError) {
    throw profilesError;
  }

  const profilesMap = new Map(
    (profiles || []).map((profile) => [profile.id, profile])
  );

  return safeParticipants.map((participant) => ({
    ...participant,
    profiles: profilesMap.get(participant.user_id) || null
  }));
}

export async function fetchCompetitionCatches(competitionId) {
  /*
    MODIFICATION IMPORTANTE :
    on ne fait plus de relation directe competition_catches -> profiles
    car Supabase ne la résout pas dans le cache de schéma.
    On charge :
    1. les lignes competition_catches
    2. les catches
    3. les profiles
    puis on fusionne le tout côté code.
  */

  const { data: competitionCatchRows, error: rowsError } = await supabase
    .from("competition_catches")
    .select(`
      id,
      competition_id,
      catch_id,
      user_id,
      created_at,
      commission_status,
      commission_validated_length_cm,
      commission_validated_weight_g,
      commission_note,
      commission_validated_by,
      commission_validated_at
    `)
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: false });

  if (rowsError) {
    throw rowsError;
  }

  const safeRows = competitionCatchRows || [];

  if (safeRows.length === 0) {
    return [];
  }

  const catchIds = [
    ...new Set(safeRows.map((row) => row.catch_id).filter(Boolean))
  ];
  const userIds = [
    ...new Set(safeRows.map((row) => row.user_id).filter(Boolean))
  ];

  const [
    { data: catches, error: catchesError },
    { data: profiles, error: profilesError }
  ] = await Promise.all([
    supabase
      .from("catches")
      .select(`
        id,
        user_id,
        espece,
        longueur_cm,
        poids_g,
        photo_url,
        date_heure,
        commentaire,
        zone_bareme
      `)
      .in("id", catchIds),
    supabase
      .from("profiles")
      .select("id, pseudo, email, nom, prenom, sexe, categorie, club")
      .in("id", userIds)
  ]);

  if (catchesError) {
    throw catchesError;
  }

  if (profilesError) {
    throw profilesError;
  }

  const catchesMap = new Map(
    (catches || []).map((catchItem) => [catchItem.id, catchItem])
  );
  const profilesMap = new Map(
    (profiles || []).map((profile) => [profile.id, profile])
  );

  return safeRows.map((row) => ({
    ...row,
    catches: catchesMap.get(row.catch_id) || null,
    profiles: profilesMap.get(row.user_id) || null
  }));
}

/*
  MODIFICATION :
  Charge la fiche complète d'un participant dans un concours
  pour vérification commissaire / organisateur.
*/
export async function fetchCompetitionParticipantCatches(
  competitionId,
  participantUserId
) {
  const { data: rows, error: rowsError } = await supabase
    .from("competition_catches")
    .select(`
      id,
      competition_id,
      catch_id,
      user_id,
      created_at,
      commission_status,
      commission_validated_length_cm,
      commission_validated_weight_g,
      commission_note,
      commission_validated_by,
      commission_validated_at
    `)
    .eq("competition_id", competitionId)
    .eq("user_id", participantUserId)
    .order("created_at", { ascending: false });

  if (rowsError) {
    throw rowsError;
  }

  const safeRows = rows || [];

  const { data: participantProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, pseudo, email, nom, prenom, sexe, categorie, club")
    .eq("id", participantUserId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (safeRows.length === 0) {
    return {
      participantProfile: participantProfile || null,
      entries: []
    };
  }

  const catchIds = [
    ...new Set(safeRows.map((row) => row.catch_id).filter(Boolean))
  ];

  const { data: catches, error: catchesError } = await supabase
    .from("catches")
    .select(`
      id,
      user_id,
      espece,
      longueur_cm,
      poids_g,
      photo_url,
      date_heure,
      commentaire,
      zone_bareme
    `)
    .in("id", catchIds);

  if (catchesError) {
    throw catchesError;
  }

  const catchesMap = new Map(
    (catches || []).map((catchItem) => [catchItem.id, catchItem])
  );

  return {
    participantProfile: participantProfile || null,
    entries: safeRows.map((row) => ({
      ...row,
      catches: catchesMap.get(row.catch_id) || null,
      profiles: participantProfile || null
    }))
  };
}

/*
  MODIFICATION :
  Mise à jour commissaire / organisateur d'une prise.
*/
export async function updateCompetitionCatchCommission({
  competitionCatchId,
  commissionStatus,
  commissionValidatedLengthCm,
  commissionValidatedWeightG,
  commissionNote,
  commissionerUserId
}) {
  const payload = {
    commission_status: commissionStatus,
    commission_validated_length_cm:
      commissionValidatedLengthCm === "" ||
      commissionValidatedLengthCm === null ||
      commissionValidatedLengthCm === undefined
        ? null
        : Number(commissionValidatedLengthCm),
    commission_validated_weight_g:
      commissionValidatedWeightG === "" ||
      commissionValidatedWeightG === null ||
      commissionValidatedWeightG === undefined
        ? null
        : Number(commissionValidatedWeightG),
    commission_note: commissionNote?.trim() || null,
    commission_validated_by: commissionerUserId,
    commission_validated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("competition_catches")
    .update(payload)
    .eq("id", competitionCatchId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function compareRankingRows(a, b) {
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

function haveExactSameRankMetrics(a, b) {
  return (
    a.totalWeight === b.totalWeight &&
    a.fishCount === b.fishCount &&
    a.biggestCatch === b.biggestCatch
  );
}

export function buildCompetitionRanking({
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
      sexe: participant?.profiles?.sexe || "—",
      categorie: participant?.profiles?.categorie || "—",
      club: participant?.profiles?.club || "—",
      fishCount: 0,
      totalWeight: 0,
      biggestCatch: 0,
      catches: []
    });
  });

  (competitionCatches || []).forEach((entry) => {
    const catchData = entry?.catches;

    if (!catchData || !entry.user_id) {
      return;
    }

    if (!rowsByUserId.has(entry.user_id)) {
      rowsByUserId.set(entry.user_id, {
        userId: entry.user_id,
        displayName: getDisplayNameFromProfile(
          entry?.profiles,
          participantDisplayMode
        ),
        sexe: entry?.profiles?.sexe || "—",
        categorie: entry?.profiles?.categorie || "—",
        club: entry?.profiles?.club || "—",
        fishCount: 0,
        totalWeight: 0,
        biggestCatch: 0,
        catches: []
      });
    }

    /*
      MODIFICATION IMPORTANTE :
      le classement prend maintenant les valeurs officielles.
      - si la prise est refusée => elle ne compte pas
      - si la prise est corrigée/validée => on utilise les valeurs commissaire
      - sinon on utilise les valeurs d'origine
    */
    const officialMetrics = getOfficialCatchMetrics(entry);

    if (!officialMetrics) {
      return;
    }

    const weight = Number(officialMetrics.poidsG || 0);

    /*
      MODIFICATION :
      on conserve aussi dans catches les métriques officielles
      pour permettre un affichage cohérent côté UI.
    */
    const normalizedCatch = {
      ...catchData,
      longueur_cm: officialMetrics.longueurCm,
      poids_g: officialMetrics.poidsG,
      original_longueur_cm: catchData.longueur_cm,
      original_poids_g: catchData.poids_g,
      commission_status: entry.commission_status || "pending",
      commission_note: entry.commission_note || null,
      commission_validated_length_cm: entry.commission_validated_length_cm,
      commission_validated_weight_g: entry.commission_validated_weight_g,
      competition_catch_id: entry.id
    };

    const row = rowsByUserId.get(entry.user_id);

    row.fishCount += 1;
    row.totalWeight += weight;
    row.biggestCatch = Math.max(row.biggestCatch, weight);
    row.catches.push(normalizedCatch);
  });

  const sortedRows = Array.from(rowsByUserId.values()).sort(compareRankingRows);

  let previousRow = null;
  let previousRank = 0;

  return sortedRows.map((row, index) => {
    const currentPosition = index + 1;
    let rank = currentPosition;

    if (previousRow && haveExactSameRankMetrics(previousRow, row)) {
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