import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * Who is signed in to the account, from the Supabase session. Its own hook so both CloudProvider (sync) and
 * ProProvider (Pro follows the account) can read it. `ready` turns true once the stored session has been read,
 * at once when the build has no cloud settings.
 */
export function useSessionUser(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .catch((err) => console.warn('Budgy: reading the session failed', err))
      // Even without a stored session, whoever waits for it can go on as signed out.
      .finally(() => setReady(true));
    // Also fires SIGNED_OUT when the session ends elsewhere (account deleted on another phone,
    // refresh token revoked): the app just carries on offline with the data it has.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Same user, new token: keep the object so sync effects don't restart on every refresh.
      setUser((prev) => (session?.user && prev?.id === session.user.id ? prev : (session?.user ?? null)));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { user, ready };
}
