import { supabase } from "../lib/supabase";

/*
  SERVICE ADMIN
  Centralise toutes les opérations admin :

  - statistiques globales
  - récupération globale des utilisateurs
  - récupération globale des captures
  - récupération globale des concours
  - suppression multiple des captures
  - suppression multiple des concours
  - bannissement / débannissement d'un utilisateur

  IMPORTANT :
  - la sécurité réelle reste gérée par les policies Supabase
  - ce service ne fait qu'exposer les actions côté interface admin
*/

/*
  MODIFICATION ADMIN :
  statistiques globales du tableau de bord admin
*/
export async function fetchAdminGlobalStats() {
  const [
    { count: catchesCount, error: catchesError },
    { count: competitionsCount, error: competitionsError },
    { count: usersCount, error: usersError },
    { count: adminsCount, error: adminsError },
    { count: bannedUsersCount, error: bannedError }
  ] = await Promise.all([
    supabase.from("catches").select("*", { count: "exact", head: true }),
    supabase.from("competitions").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_banned", true)
  ]);

  if (catchesError) {
    throw catchesError;
  }

  if (competitionsError) {
    throw competitionsError;
  }

  if (usersError) {
    throw usersError;
  }

  if (adminsError) {
    throw adminsError;
  }

  if (bannedError) {
    throw bannedError;
  }

  return {
    catchesCount: catchesCount || 0,
    competitionsCount: competitionsCount || 0,
    usersCount: usersCount || 0,
    adminsCount: adminsCount || 0,
    bannedUsersCount: bannedUsersCount || 0
  };
}

/*
  MODIFICATION ADMIN :
  récupération de tous les utilisateurs
*/
export async function adminFetchAllUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, pseudo, email, nom, prenom, role, plan, is_banned, banned_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/*
  MODIFICATION ADMIN :
  récupération de toutes les captures
*/
export async function adminFetchAllCatches() {
  const { data, error } = await supabase
    .from("catches")
    .select(
      "id, user_id, espece, longueur_cm, poids_g, photo_url, date_heure, commentaire, zone_bareme, created_at"
    )
    .order("date_heure", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/*
  MODIFICATION ADMIN :
  récupération de tous les concours
*/
export async function adminFetchAllCompetitions() {
  const { data, error } = await supabase
    .from("competitions")
    .select(
      "id, name, code, creator_id, participant_display_mode, results_visibility, results_released, start_date, end_date, grace_period_minutes, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/*
  MODIFICATION ADMIN :
  suppression multiple des captures
*/
export async function adminDeleteManyCatches(catchIds) {
  const safeIds = Array.isArray(catchIds) ? catchIds.filter(Boolean) : [];

  if (safeIds.length === 0) {
    return;
  }

  const { error } = await supabase.from("catches").delete().in("id", safeIds);

  if (error) {
    throw error;
  }
}

/*
  MODIFICATION ADMIN :
  suppression multiple des concours
*/
export async function adminDeleteManyCompetitions(competitionIds) {
  const safeIds = Array.isArray(competitionIds)
    ? competitionIds.filter(Boolean)
    : [];

  if (safeIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("competitions")
    .delete()
    .in("id", safeIds);

  if (error) {
    throw error;
  }
}

/*
  MODIFICATION ADMIN :
  bannir / débannir un utilisateur
*/
export async function adminToggleUserBan({ userId, isBanned }) {
  if (!userId) {
    throw new Error("Utilisateur introuvable.");
  }

  const payload = {
    is_banned: Boolean(isBanned),
    banned_at: isBanned ? new Date().toISOString() : null
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}