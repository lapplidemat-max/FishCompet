import { supabase } from "../lib/supabase";

/*
  MODIFICATION :
  Service central des captures.
  Il gère :
  - récupération des captures
  - ajout d'une capture
  - suppression d'une capture
  - upload photo

  MODIFICATION IMPORTANTE :
  - correction du nom du bucket Storage Supabase
  - le bucket réel est : catch-photos
  - Supabase est sensible à la casse
*/

export async function fetchUserCatches(userId) {
  const { data, error } = await supabase
    .from("catches")
    .select("*")
    .eq("user_id", userId)
    .order("date_heure", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function uploadCatchPhoto({ userId, file }) {
  if (!file) {
    return null;
  }

  const extension = file.name?.split(".").pop()?.toLowerCase() || "jpg";

  /*
    MODIFICATION :
    nom de fichier stocké dans un dossier userId.
  */
  const fileName = `${userId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${extension}`;

  /*
    MODIFICATION IMPORTANTE :
    le nom du bucket doit correspondre exactement
    au bucket visible dans Supabase : catch-photos
  */
  const bucketName = "catch-photos";

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) {
    throw uploadError;
  }

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

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteCatch(catchId, userId) {
  const { error } = await supabase
    .from("catches")
    .delete()
    .eq("id", catchId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}