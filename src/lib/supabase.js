import { createClient } from "@supabase/supabase-js";

/*
  MODIFICATION :
  Fichier central de connexion à Supabase.
  Toute l'application utilisera ce client unique.
*/

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variables Supabase manquantes. Vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);