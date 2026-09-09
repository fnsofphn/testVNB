import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { measureTelemetry, recordTelemetry } from '@/lib/telemetry';
import { getAuthRateLimitRetryDelayMs } from '@/lib/authLoginQueue';

export type AuthProfile = {
  id: string;
  authUserId: string | null;
  email: string | null;
  fullName: string;
  role: string;
  vbusinessRole: string | null;
  vplanningRoles: string[];
  vplanningDepartments: string[];
  vplanningOwnerIds: string[];
  companyId: string | null;
  organizationId: string | null;
  title: string | null;
  accessScope: string;
  phone: string | null;
  avatarUrl: string | null;
  studentClass: string | null;
  studentGroup: string | null;
  studentCode: string | null;
};

type AuthContextValue = {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<AuthProfile | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_SNAPSHOT_STORAGE_KEY = 'vcontent.auth.session-snapshot';
const AUTH_PROFILE_SNAPSHOT_STORAGE_KEY = 'vcontent.auth.profile-snapshot';
const SUPABASE_AUTH_STORAGE_KEY = 'vcontent.auth.token';
const LOGIN_THROTTLE_STORAGE_KEY = 'vcontent.auth.login-throttle';
const LOGIN_THROTTLE_WINDOW_MS = 60_000;
const LOGIN_THROTTLE_MAX_ATTEMPTS = 6;
const LOGIN_ALIASES: Record<string, string> = {
  fnsofphn: 'fnsofphn@vinabrain.local',
  plxceo: 'plxceo.username@vinabrain.com',
};

export function isInvalidAuthSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  return (
    normalized.includes('session from session_id claim in jwt does not exist') ||
    normalized.includes('invalid refresh token') ||
    normalized.includes('refresh token not found')
  );
}

function readSessionSnapshot(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function writeSessionSnapshot(session: Session | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      window.localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_SNAPSHOT_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore local persistence issues. Supabase storage remains the primary source.
  }
}

function isSameAuthUser(left: Session | null, right: Session | null) {
  return Boolean(left?.user?.id && right?.user?.id && left.user.id === right.user.id);
}

function isProfileForSession(profile: AuthProfile | null, session: Session | null) {
  if (!profile || !session?.user) return false;
  return Boolean(
    (profile.authUserId && profile.authUserId === session.user.id) ||
    (profile.email && session.user.email && profile.email.toLowerCase() === session.user.email.toLowerCase()),
  );
}

function readProfileSnapshot(session?: Session | null): AuthProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_PROFILE_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as AuthProfile;
    if (!snapshot?.id || !snapshot.role) return null;
    if (session && !isProfileForSession(snapshot, session)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function writeProfileSnapshot(profile: AuthProfile | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!profile) {
      window.localStorage.removeItem(AUTH_PROFILE_SNAPSHOT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_PROFILE_SNAPSHOT_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore local persistence issues. The database remains the source of truth.
  }
}

function clearPersistedAuthState() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_PROFILE_SNAPSHOT_STORAGE_KEY);
    window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    window.localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function assertLoginThrottle(email: string) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const key = normalizedEmail || 'unknown';
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOGIN_THROTTLE_STORAGE_KEY) || '{}') as Record<string, number[]>;
    const recent = (parsed[key] || []).filter((timestamp) => now - Number(timestamp) < LOGIN_THROTTLE_WINDOW_MS);
    if (recent.length >= LOGIN_THROTTLE_MAX_ATTEMPTS) {
      throw new Error('Ban dang dang nhap qua nhanh. Vui long doi khoang 1 phut roi thu lai.');
    }
    parsed[key] = [...recent, now];
    window.localStorage.setItem(LOGIN_THROTTLE_STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    if (error instanceof Error && error.message.includes('dang nhap qua nhanh')) throw error;
  }
}

function normalizeLoginIdentifier(value: string) {
  const trimmed = value.trim().toLowerCase();
  return LOGIN_ALIASES[trimmed] || trimmed;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthRateLimitError(error: unknown) {
  const candidate = error as { code?: string; status?: number; name?: string; message?: string } | null;
  const code = String(candidate?.code || '').toLowerCase();
  const status = Number(candidate?.status || 0);
  const message = candidate?.message ?? (error instanceof Error ? error.message : String(error || ''));
  const normalized = String(message).toLowerCase();
  if (code === 'over_request_rate_limit' || status === 429) return true;
  return normalized.includes('rate limit') || normalized.includes('too many requests') || normalized.includes('429');
}

function isAuthTransientError(error: unknown) {
  const candidate = error as { name?: string; status?: number; message?: string } | null;
  const status = Number(candidate?.status || 0);
  const normalized = String(candidate?.message || error || '').toLowerCase();
  return (
    candidate?.name === 'AuthRetryableFetchError' ||
    status === 0 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('connection') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  );
}

function isAuthBannedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  return normalized.includes('user is banned') || normalized.includes('user banned');
}

async function restoreVWorkLoginAccess(email: string) {
  const response = await fetch('/api/vwork-training-operations-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'RESTORE_LOGIN_ACCESS', email }),
  });
  if (!response.ok) throw new Error('Không thể mở lại đăng nhập VWork.');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadProfile(session: Session | null): Promise<AuthProfile | null> {
  if (!supabase || !session?.user) return null;
  const metadata = session.user.user_metadata || {};

  const { data, error } = await supabase
    .from('vcontent_profiles')
    .select('id,email,full_name,role,vbusiness_role,vplanning_roles,vplanning_departments,vplanning_owner_ids,company_id,organization_id,title,access_scope,auth_user_id,student_class,student_group,student_code')
    .eq('auth_user_id', session.user.id)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let hasTrainingClass = data.role === 'hoc_vien';
  if (!hasTrainingClass) {
    const byProfile = await supabase
      .from('vcontent_training_class_students')
      .select('id')
      .eq('profile_id', data.id)
      .limit(1);
    if (byProfile.error) throw byProfile.error;
    hasTrainingClass = Boolean(byProfile.data?.length);
  }
  if (!hasTrainingClass && (session.user.email || data.email)) {
    const byEmail = await supabase
      .from('vcontent_training_class_students')
      .select('id')
      .eq('email', String(session.user.email || data.email).trim().toLowerCase())
      .limit(1);
    if (byEmail.error) throw byEmail.error;
    hasTrainingClass = Boolean(byEmail.data?.length);
  }
  const role = hasTrainingClass ? 'hoc_vien' : data.role;

  return {
    id: data.id,
    authUserId: data.auth_user_id || session.user.id,
    email: session.user.email || data.email,
    fullName: data.full_name || session.user.email || data.email || 'Tài khoản',
    role,
    vbusinessRole: data.vbusiness_role || null,
    vplanningRoles: Array.isArray(data.vplanning_roles) ? data.vplanning_roles : [],
    vplanningDepartments: Array.isArray(data.vplanning_departments) ? data.vplanning_departments : [],
    vplanningOwnerIds: Array.isArray(data.vplanning_owner_ids) ? data.vplanning_owner_ids : [],
    companyId: data.company_id,
    organizationId: data.organization_id,
    title: data.title,
    accessScope: data.access_scope,
    phone: typeof metadata.phone === 'string' ? metadata.phone : null,
    avatarUrl: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
    studentClass: data.student_class || null,
    studentGroup: data.student_group || null,
    studentCode: data.student_code || null,
  };
}

async function trySelfLinkProfile(session: Session | null): Promise<boolean> {
  if (!session?.access_token || !session.user?.email) return false;
  try {
    const response = await fetch('/api/self-link-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: session.user.email,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(() => readSessionSnapshot());
  const [profile, setProfile] = useState<AuthProfile | null>(() => readProfileSnapshot(readSessionSnapshot()));
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(true);
  const authReadyRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<AuthProfile | null>(null);
  const authEventVersionRef = useRef(0);
  const loadingCycleRef = useRef(0);
  const loadingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadingWatchdog = () => {
    if (loadingWatchdogRef.current) {
      clearTimeout(loadingWatchdogRef.current);
      loadingWatchdogRef.current = null;
    }
  };

  const beginLoadingCycle = (source: string) => {
    loadingCycleRef.current += 1;
    const cycle = loadingCycleRef.current;
    loadingRef.current = true;
    setLoading(true);
    clearLoadingWatchdog();
    loadingWatchdogRef.current = setTimeout(() => {
      if (loadingCycleRef.current !== cycle) return;
      recordTelemetry('auth.loading.watchdog_released', { source, cycle });
      loadingRef.current = false;
      authReadyRef.current = true;
      setLoading(false);
      loadingWatchdogRef.current = null;
    }, 15000);
    return cycle;
  };

  const finishLoadingCycle = (cycle: number) => {
    if (loadingCycleRef.current !== cycle) return;
    clearLoadingWatchdog();
    loadingRef.current = false;
    authReadyRef.current = true;
    setLoading(false);
  };

  const shouldBlockForAuthEvent = (event: string, nextSession: Session | null) => {
    if (!authReadyRef.current) return true;
    if (loadingRef.current) return true;
    if (!sessionRef.current) return true;
    if (!nextSession) return event === 'SIGNED_OUT';
    return false;
  };

  const getPreservedProfile = (targetSession: Session | null) => {
    if (!targetSession) return null;
    if (isProfileForSession(profileRef.current, targetSession)) return profileRef.current;
    return readProfileSnapshot(targetSession);
  };

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    sessionRef.current = session;
    writeSessionSnapshot(session);
  }, [session]);

  useEffect(() => {
    profileRef.current = profile;
    if (profile) {
      writeProfileSnapshot(profile);
    } else if (!sessionRef.current) {
      writeProfileSnapshot(null);
    }
  }, [profile]);

  useEffect(
    () => () => {
      clearLoadingWatchdog();
    },
    [],
  );

  useEffect(() => {
    if (!supabase) {
      clearLoadingWatchdog();
      loadingRef.current = false;
      authReadyRef.current = true;
      setLoading(false);
      return;
    }

    const client = supabase;
    let active = true;
    const bootstrap = async () => {
      const bootstrapVersion = authEventVersionRef.current;
      const loadingCycle = beginLoadingCycle('bootstrap');
      const persistedSnapshot = readSessionSnapshot();
      recordTelemetry('auth.bootstrap.requested');
      try {
        const result = await measureTelemetry(
          'auth.bootstrap.get_session',
          {},
          () =>
            withTimeout(
              client.auth.getSession(),
              8000,
              { data: { session: null }, error: null } as Awaited<ReturnType<typeof client.auth.getSession>>,
            ),
        );
        if (!active) return;
        if (authEventVersionRef.current !== bootstrapVersion) {
          recordTelemetry('auth.bootstrap.ignored_stale_result');
          finishLoadingCycle(loadingCycle);
          return;
        }
        if (result.error) {
          recordTelemetry('auth.bootstrap.error', { message: result.error.message });
          if (isInvalidAuthSessionError(result.error)) {
            clearPersistedAuthState();
            setSession(null);
            setProfile(null);
            finishLoadingCycle(loadingCycle);
            return;
          }
          setSession(null);
          setProfile(null);
          finishLoadingCycle(loadingCycle);
          return;
        }
        const resolvedSession = result.data.session;
        setSession(resolvedSession);
        try {
          let nextProfile = await measureTelemetry(
            'auth.bootstrap.load_profile',
            { has_session: Boolean(resolvedSession) },
            () => withTimeout(loadProfile(resolvedSession), 8000, null),
          );
          if (!nextProfile && resolvedSession?.user?.email) {
            const linked = await measureTelemetry(
              'auth.bootstrap.self_link_profile',
              {},
              () => withTimeout(trySelfLinkProfile(resolvedSession), 8000, false),
            );
            if (linked) {
              nextProfile = await measureTelemetry(
                'auth.bootstrap.reload_profile',
                {},
                () => withTimeout(loadProfile(resolvedSession), 8000, null),
              );
            }
          }
          if (active && authEventVersionRef.current === bootstrapVersion) {
            setProfile(nextProfile ?? getPreservedProfile(resolvedSession));
          }
        } catch (error) {
          if (active && authEventVersionRef.current === bootstrapVersion) {
            if (isInvalidAuthSessionError(error)) {
              clearPersistedAuthState();
              setSession(null);
              setProfile(null);
              return;
            }
            setProfile(getPreservedProfile(resolvedSession));
          }
        } finally {
          if (active) finishLoadingCycle(loadingCycle);
        }
      } catch (error) {
        if (!active) return;
        if (authEventVersionRef.current !== bootstrapVersion) {
          recordTelemetry('auth.bootstrap.failed_stale_result');
          finishLoadingCycle(loadingCycle);
          return;
        }
        recordTelemetry('auth.bootstrap.failed');
        if (isInvalidAuthSessionError(error)) {
          clearPersistedAuthState();
          setSession(null);
          setProfile(null);
          finishLoadingCycle(loadingCycle);
          return;
        }
        setSession(null);
        setProfile(null);
        finishLoadingCycle(loadingCycle);
      }
    };

    void bootstrap();

    const { data: subscription } = client.auth.onAuthStateChange(async (event, nextSession) => {
      if (!active) return;
      authEventVersionRef.current += 1;
      const eventVersion = authEventVersionRef.current;
      recordTelemetry('auth.state_change.received', {
        event,
        event_version: eventVersion,
        has_session: Boolean(nextSession),
      });

      if (!nextSession) {
        if (event === 'SIGNED_OUT') {
          loadingCycleRef.current += 1;
          clearLoadingWatchdog();
          loadingRef.current = false;
          authReadyRef.current = true;
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const shouldBlock = shouldBlockForAuthEvent(event, nextSession);
        const loadingCycle = shouldBlock ? beginLoadingCycle(`auth-state:${event}:recover`) : null;
        try {
          const result = await measureTelemetry(
            'auth.state_change.recover_session',
            { event },
            () =>
              withTimeout(
                client.auth.getSession(),
                8000,
                { data: { session: null }, error: null } as Awaited<ReturnType<typeof client.auth.getSession>>,
              ),
          );
          if (!active) return;
          if (authEventVersionRef.current !== eventVersion) return;

          const resolvedSession = result.error ? sessionRef.current : result.data.session;
          const shouldPreserveCurrentProfile = isSameAuthUser(sessionRef.current, resolvedSession) && Boolean(profileRef.current);
          setSession(resolvedSession);
          if (!resolvedSession) {
            setProfile(null);
            if (loadingCycle !== null) finishLoadingCycle(loadingCycle);
            return;
          }

          let nextProfile = await measureTelemetry(
            'auth.state_change.load_profile',
            { event },
            () => withTimeout(loadProfile(resolvedSession), 8000, shouldPreserveCurrentProfile ? profileRef.current : null),
          );
          if (!nextProfile && resolvedSession.user?.email) {
            const linked = await measureTelemetry(
              'auth.state_change.self_link_profile',
              { event },
              () => withTimeout(trySelfLinkProfile(resolvedSession), 8000, false),
            );
            if (linked) {
              nextProfile = await measureTelemetry(
                'auth.state_change.reload_profile',
                { event },
                () => withTimeout(loadProfile(resolvedSession), 8000, shouldPreserveCurrentProfile ? profileRef.current : null),
              );
            }
          }
          if (active && authEventVersionRef.current === eventVersion) {
            setProfile(nextProfile ?? (shouldPreserveCurrentProfile ? profileRef.current : getPreservedProfile(resolvedSession)));
          }
        } catch (error) {
          if (active && authEventVersionRef.current === eventVersion) {
            if (isInvalidAuthSessionError(error)) {
              clearPersistedAuthState();
              setSession(null);
              setProfile(null);
              return;
            }
            setSession((current) => current);
            setProfile((current) => current);
          }
        } finally {
          if (active && loadingCycle !== null) finishLoadingCycle(loadingCycle);
        }
        return;
      }

      const shouldBlock = shouldBlockForAuthEvent(event, nextSession);
      const loadingCycle = shouldBlock ? beginLoadingCycle(`auth-state:${event}:next-session`) : null;
      const shouldPreserveCurrentProfile = isSameAuthUser(sessionRef.current, nextSession) && Boolean(profileRef.current);
      setSession(nextSession);
      try {
        let nextProfile = await measureTelemetry(
          'auth.state_change.next_profile',
          { event },
          () => withTimeout(loadProfile(nextSession), 8000, shouldPreserveCurrentProfile ? profileRef.current : null),
        );
        if (!nextProfile && nextSession.user?.email) {
          const linked = await measureTelemetry(
            'auth.state_change.next_self_link_profile',
            { event },
            () => withTimeout(trySelfLinkProfile(nextSession), 8000, false),
          );
          if (linked) {
            nextProfile = await measureTelemetry(
              'auth.state_change.next_reload_profile',
              { event },
              () => withTimeout(loadProfile(nextSession), 8000, shouldPreserveCurrentProfile ? profileRef.current : null),
            );
          }
        }
        if (active && authEventVersionRef.current === eventVersion) {
          setProfile(nextProfile ?? (shouldPreserveCurrentProfile ? profileRef.current : getPreservedProfile(nextSession)));
        }
      } catch (error) {
        if (active && authEventVersionRef.current === eventVersion) {
          if (isInvalidAuthSessionError(error)) {
            clearPersistedAuthState();
            setSession(null);
            setProfile(null);
            return;
          }
          setProfile(shouldPreserveCurrentProfile ? profileRef.current : getPreservedProfile(nextSession));
        }
      } finally {
        if (active && loadingCycle !== null) finishLoadingCycle(loadingCycle);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      signIn: async (email, password) => {
        if (!supabase) throw new Error('Supabase client is not configured.');
        const loginEmail = normalizeLoginIdentifier(email);
        assertLoginThrottle(loginEmail);
        const loadingCycle = beginLoadingCycle('sign-in');
        try {
          authEventVersionRef.current += 1;
          profileRef.current = null;
          writeProfileSnapshot(null);
          setProfile(null);

          let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | null = null;
          let lastSignInError: unknown = null;
          let restoredBannedLogin = false;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const result = await supabase.auth.signInWithPassword({ email: loginEmail, password });
            if (!result.error) {
              data = result.data;
              lastSignInError = null;
              break;
            }
            lastSignInError = result.error;
            if (!restoredBannedLogin && isAuthBannedError(result.error)) {
              await restoreVWorkLoginAccess(loginEmail);
              restoredBannedLogin = true;
              continue;
            }
            const isRateLimited = isAuthRateLimitError(result.error);
            const isTransient = isAuthTransientError(result.error);
            if ((!isRateLimited && !isTransient) || attempt === 2) break;
            const delayMs = isRateLimited
              ? getAuthRateLimitRetryDelayMs(attempt, { identity: loginEmail })
              : 250 * (attempt + 1);
            recordTelemetry(isRateLimited ? 'auth.sign_in.rate_limit_retry' : 'auth.sign_in.transient_retry', {
              attempt: attempt + 1,
              delay_ms: delayMs,
            });
            await wait(delayMs);
          }
          if (lastSignInError) throw lastSignInError;
          const nextSession = data?.session || null;
          if (nextSession) {
            sessionRef.current = nextSession;
            setSession(nextSession);
            let nextProfile = await loadProfile(nextSession);
            if (!nextProfile && nextSession.user?.email) {
              const linked = await trySelfLinkProfile(nextSession);
              if (linked) {
                nextProfile = await loadProfile(nextSession);
              }
            }
            setProfile(nextProfile ?? getPreservedProfile(nextSession));
          }
          finishLoadingCycle(loadingCycle);
        } catch (error) {
          finishLoadingCycle(loadingCycle);
          throw error;
        }
      },
      signOut: async () => {
        try {
          if (supabase) {
            const { error } = await supabase.auth.signOut();
            if (error) {
              recordTelemetry('auth.sign_out.error', { message: error.message });
            }
          }
        } catch (error) {
          recordTelemetry('auth.sign_out.failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          authEventVersionRef.current += 1;
          loadingCycleRef.current += 1;
          clearLoadingWatchdog();
          sessionRef.current = null;
          profileRef.current = null;
          loadingRef.current = false;
          authReadyRef.current = true;
          clearPersistedAuthState();
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
      },
      refreshProfile: async () => {
        const nextProfile = await loadProfile(session);
        const fallbackProfile = getPreservedProfile(session);
        setProfile(nextProfile ?? fallbackProfile);
        return nextProfile ?? fallbackProfile;
      },
    }),
    [loading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
