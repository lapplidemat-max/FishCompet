// src/context/AuthContext.jsx

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { supabase } from "../lib/supabase";

/*
  MODIFICATIONS IMPORTANTES :
  - ajout gestion utilisateur banni
  - déconnexion automatique si is_banned = true
  - expose isBanned dans le contexte

  NOUVELLE CORRECTION :
  - protection contre les refreshProfile simultanés
  - évite les blocages de lock Supabase Auth
  - évite les mises à jour d'état après démontage
*/

const AuthContext = createContext(null);

function checkIsProfileComplete(profile) {
  if (!profile) return false;

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

function getUserRole(profile) {
  const rawRole = String(profile?.role || "user").trim().toLowerCase();
  return rawRole === "admin" ? "admin" : "user";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  /*
    MODIFICATION :
    évite les refresh simultanés qui peuvent bloquer Supabase Auth.
  */
  const isRefreshingProfileRef = useRef(false);

  /*
    MODIFICATION :
    garde l'état de montage pour éviter les setState après démontage.
  */
  const isMountedRef = useRef(true);

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
    /*
      MODIFICATION :
      si pas d'utilisateur, on vide le profil proprement.
    */
    if (!userId) {
      if (isMountedRef.current) {
        setProfile(null);
      }
      return null;
    }

    /*
      MODIFICATION CRITIQUE :
      empêche les appels concurrents à refreshProfile.
    */
    if (isRefreshingProfileRef.current) {
      return null;
    }

    isRefreshingProfileRef.current = true;

    try {
      const profileData = await fetchProfile(userId);

      /*
        🔥 MODIFICATION CRITIQUE :
        - si utilisateur banni → déconnexion immédiate
      */
      if (profileData?.is_banned) {
        console.warn("Utilisateur banni détecté → déconnexion");

        await supabase.auth.signOut();

        if (isMountedRef.current) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }

        return null;
      }

      if (isMountedRef.current) {
        setProfile(profileData);
      }

      return profileData;
    } catch (error) {
      console.error("Erreur refreshProfile :", error);
      return null;
    } finally {
      isRefreshingProfileRef.current = false;
    }
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
    isMountedRef.current = true;

    async function initializeAuth() {
      try {
        const {
          data: { session: initialSession }
        } = await supabase.auth.getSession();

        if (!isMountedRef.current) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);

        if (initialSession?.user?.id) {
          await refreshProfile(initialSession.user.id);
        } else if (isMountedRef.current) {
          setProfile(null);
        }
      } catch (error) {
        console.error("initializeAuth:error", error);

        if (!isMountedRef.current) return;

        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    }

    initializeAuth();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      /*
        MODIFICATION :
        sécurise les mises à jour si le composant est démonté.
      */
      if (!isMountedRef.current) {
        return;
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

      if (newSession?.user?.id) {
        await refreshProfile(newSession.user.id);
      } else if (isMountedRef.current) {
        setProfile(null);
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const isProfileComplete = useMemo(() => {
    return checkIsProfileComplete(profile);
  }, [profile]);

  const role = useMemo(() => {
    return getUserRole(profile);
  }, [profile]);

  const isAdmin = useMemo(() => {
    return role === "admin";
  }, [role]);

  /*
    🔥 NOUVEAU :
    expose état banni
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