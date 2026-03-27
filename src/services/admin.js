import { supabase } from "../lib/supabase";

/*
  SERVICE ADMIN
  Centralise toutes les opérations admin :

  - stats globales
  - récupération globale des données
  - suppression multiple
  - bannissement utilisateur
*/

/*
  =========================
  STATS GLOBALES
  =========================
*/
export async function fetchAdminStats() {
  const [
    { count: catchesCount },
    { count: usersCount },
    { count: competitionsCount },
    { count: adminsCount },
    { count: bannedCount }
  ] = await Promise.all([
    supabase.from("catches").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("competitions").select("*", {
      count: "exact",
      head: true
    }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_banned", true)
  ]);

  return {
    catches: catchesCount || 0,
    users: usersCount || 0,
    competitions: competitionsCount || 0,
    admins: adminsCount || 0,
    banned: bannedCount || 0
  };
}

/*
  =========================
  RÉCUPÉRATION DONNÉES
  =========================
*/
export async function fetchAllUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, pseudo, email, nom, prenom, role, is_banned, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/*
  =========================
  SUPPRESSION MULTIPLE
  =========================
*/
export async function deleteMultipleCatches(catchIds) {
  if (!catchIds?.length) return;

  const { error } = await supabase
    .from("catches")
    .delete()
    .in("id", catchIds);

  if (error) throw error;
}

export async function deleteMultipleCompetitions(competitionIds) {
  if (!competitionIds?.length) return;

  const { error } = await supabase
    .from("competitions")
    .delete()
    .in("id", competitionIds);

  if (error) throw error;
}

/*
  =========================
  BANNISSEMENT UTILISATEUR
  =========================
*/
export async function banUser(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({
      is_banned: true,
      banned_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function unbanUser(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({
      is_banned: false,
      banned_at: null
    })
    .eq("id", userId);

  if (error) throw error;
}