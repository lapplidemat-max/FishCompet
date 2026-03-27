import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

/*
  MODIFICATION :
  Version stabilisée du contexte d'authentification.
  Objectif :
  - éviter le blocage infini sur "Chargement..."
  - ne pas dépendre du profil pour débloquer l'affichage
  - journaliser les étapes dans la console

  NOUVELLES MODIFICATIONS :
  - ajout d'une vérification de complétude du profil
  - expose isProfileComplete dans le contexte
  - permet de rediriger l'utilisateur vers /profil après création de compte

  NOUVELLES MODIFICATIONS ADMIN :
  - expose role dans le contexte
  - expose isAdmin pour activer les actions admin dans les pages
  - expose isBanned pour bloquer un utilisateur suspendu
*/

const AuthContext = createContext(null);

/*
  MODIFICATION :
  Vérifie si le profil obligatoire est complet.
  Champs obligatoires :
  - email
  - nom
  - prénom
  - date_naissance
  - pseudo
  - plan
  - code_postal
*/
function checkIsProfileComplete(profile) {
  if (!profile) {
    return false;
  }

  return Boolean(
    String(profile.email || "").trim() &&
      String(profile.nom || "").trim() &&
      String(profile.prenom || "").trim() &&
      String(profile.date_naissance || "").trim() &&
      String(profile.pseudo || "").trim() &&
      String(profile.plan || "").trim() &&
      String(profile.code_postal || "").trim()
  );
}

/*
  MODIFICATION ADMIN :
  Normalise le rôle chargé depuis le profil.
*/
function getUserRole(profile) {
  const rawRole = String(profile?.role || "user").trim().toLowerCase();

  return rawRole === "admin" ? "admin" : "user";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Erreur récupération profil :", error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Erreur fetchProfile :", error);
      return null;
    }
  }

  async function refreshProfile(userId) {
    if (!userId) {
      setProfile(null);
      return null;
    }

    const profileData = await fetchProfile(userId);
    setProfile(profileData);
    return profileData;
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      throw error;
    }

    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        console.log("initializeAuth:start");

        const {
          data: { session: initialSession }
        } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        console.log("initializeAuth:session", initialSession);

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        /*
          MODIFICATION :
          On débloque l'interface même si le profil est absent ou en erreur.
        */
        setLoading(false);

        if (initialSession?.user?.id) {
          await refreshProfile(initialSession.user.id);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("initializeAuth:error", error);

        if (!mounted) {
          return;
        }

        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    }

    initializeAuth();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log("onAuthStateChange", _event, newSession);

      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

      if (newSession?.user?.id) {
        refreshProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isProfileComplete = useMemo(() => {
    return checkIsProfileComplete(profile);
  }, [profile]);

  /*
    MODIFICATION ADMIN :
    expose le rôle utilisateur chargé depuis profiles.role.
  */
  const role = useMemo(() => {
    return getUserRole(profile);
  }, [profile]);

  /*
    MODIFICATION ADMIN :
    expose si l'utilisateur est administrateur.
  */
  const isAdmin = useMemo(() => {
    return role === "admin";
  }, [role]);

  /*
    MODIFICATION ADMIN :
    expose si l'utilisateur est banni.
  */
  const isBanned = useMemo(() => {
    return Boolean(profile?.is_banned);
  }, [profile]);

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      isProfileComplete,
      role,
      isAdmin,
      isBanned
    }),
    [
      session,
      user,
      profile,
      loading,
      isProfileComplete,
      role,
      isAdmin,
      isBanned
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }

  return context;
}