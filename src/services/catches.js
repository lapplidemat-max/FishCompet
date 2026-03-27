import { supabase } from "../lib/supabase";

/*
  MODIFICATION ADMIN :
  - ajout de fonctions admin
  - possibilité de récupérer toutes les captures
  - suppression globale (admin)
*/

export async function fetchUserCatches(userId) {
  const { data, error } = await supabase
    .from("catches")
    .select("*")
    .eq("user_id", userId)
    .order("date_heure", { ascending: false });

  if (error) throw error;
  return data || [];
}

/*
  MODIFICATION ADMIN :
  récupération de toutes les captures
*/
export async function fetchAllCatches() {
  const { data, error } = await supabase
    .from("catches")
    .select("*")
    .order("date_heure", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function uploadCatchPhoto({ userId, file }) {
  if (!file) return null;

  const extension = file.name?.split(".").pop()?.toLowerCase() || "jpg";

  const fileName = `${userId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${extension}`;

  const bucketName = "catch-photos";

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  return data?.publicUrl || null;
}

export async function createCatch(payload) {
  const { data, error } = await supabase
    .from("catches")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/*
  MODIFICATION ADMIN :
  suppression universelle (admin ou user)
*/
export async function deleteCatch(catchId) {
  const { error } = await supabase
    .from("catches")
    .delete()
    .eq("id", catchId);

  if (error) throw error;
}