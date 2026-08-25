import { dehydrate, hydrate, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppShellProvider } from '@/contexts/AppShellContext';
import { isInvalidAuthSessionError, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/system/ToastProvider';
import { supabase } from '@/lib/supabaseClient';
import { recordTelemetry } from '@/lib/telemetry';
import {
  getRuntimeRealtimeMode,
  shouldUseFullDiscussionRealtime,
  shouldUseGlobalSuniRealtime,
} from '@/lib/runtimeLoadMode';

const QUERY_CACHE_STORAGE_KEY = 'vcontent.query-cache';
const QUERY_CACHE_MAX_AGE_MS = 1000 * 60 * 15;
const QUERY_CACHE_MAX_PERSIST_BYTES = 350 * 1024;
const QUERY_CACHE_PERSIST_DEBOUNCE_MS = 1200;

function shouldPersistQuery(queryKey: readonly unknown[]) {
  const rootKey = String(queryKey[0] || '');
  return rootKey === 'orders' || rootKey === 'notifications';
}

function QueryCachePersistence() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    try {
      const raw = window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt?: number; state?: unknown };
        if (!parsed?.savedAt || !parsed.state) {
          window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
        } else if (Date.now() - parsed.savedAt > QUERY_CACHE_MAX_AGE_MS) {
          window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
        } else {
          hydrate(queryClient, parsed.state);
          recordTelemetry('query_cache.restored', { age_ms: Date.now() - parsed.savedAt });
        }
      }
    } catch (error) {
      recordTelemetry('query_cache.restore_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    let saveTimer: number | null = null;
    let idleHandle: number | ReturnType<typeof setTimeout> | null = null;

    const cancelIdle = () => {
      if (idleHandle === null) return;
      if (typeof window.cancelIdleCallback === 'function' && typeof idleHandle === 'number') {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
      idleHandle = null;
    };

    const runPersistence = () => {
      try {
        const state = dehydrate(queryClient, {
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && shouldPersistQuery(query.queryKey),
        });
        const nextPayload = JSON.stringify({
          savedAt: Date.now(),
          state,
        });
        if (nextPayload.length > QUERY_CACHE_MAX_PERSIST_BYTES) {
          recordTelemetry('query_cache.persist_skipped', {
            reason: 'payload_too_large',
            bytes: nextPayload.length,
          });
          return;
        }
        window.localStorage.setItem(QUERY_CACHE_STORAGE_KEY, nextPayload);
      } catch (error) {
        recordTelemetry('query_cache.persist_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const scheduleIdlePersistence = () => {
      cancelIdle();
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(() => {
          runPersistence();
          idleHandle = null;
        }, { timeout: 1500 });
        return;
      }
      idleHandle = window.setTimeout(() => {
        runPersistence();
        idleHandle = null;
      }, 300);
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }

      saveTimer = window.setTimeout(() => {
        scheduleIdlePersistence();
      }, QUERY_CACHE_PERSIST_DEBOUNCE_MS);
    });

    return () => {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }
      cancelIdle();
      unsubscribe();
    };
  }, [queryClient]);

  return null;
}

function RealtimeQuerySync() {
  const queryClient = useQueryClient();
  const { loading, session } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (loading || !session) return undefined;
    if (!supabase) return undefined;
    if (getRuntimeRealtimeMode('global', 'hybrid') === 'off') return undefined;
    const client = supabase;

    let invalidateTimer: number | null = null;
    const scheduleInvalidate = () => {
      if (invalidateTimer) {
        window.clearTimeout(invalidateTimer);
      }
      invalidateTimer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
        void queryClient.invalidateQueries({ queryKey: ['input-items'] });
        void queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
        void queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
        void queryClient.invalidateQueries({ queryKey: ['activity-logs'] });
        void queryClient.invalidateQueries({ queryKey: ['profiles'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        void queryClient.invalidateQueries({ queryKey: ['elearning'] });
        void queryClient.invalidateQueries({ queryKey: ['suni'] });
      }, 150);
    };

    let channel = client
      .channel('vcontent-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_orders' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_products' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_tasks' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_input_items' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_storyboards' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_storyboard_reviews' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_slide_designs' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_slide_design_reviews' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_voice_overs' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_voice_reviews' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_video_edits' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_video_reviews' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_scorm_packages' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_scorm_reviews' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_activity_logs' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_notifications' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_profiles' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_courses' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_lessons' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_lesson_parts' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_course_lessons' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_lesson_progress' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_scorm_packages' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_scorm_attempts' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_clients' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_projects' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_classes' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_students' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_enrollments' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_eln_learning_results' }, scheduleInvalidate);
    if (shouldUseGlobalSuniRealtime()) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_programs' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_courses' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_program_courses' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_classes' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_class_students' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_class_discussions' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_course_agendas' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_materials' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_score_rules' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_class_activities' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_training_results' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_events' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_topics' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_participants' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_groups' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_group_members' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_sessions' }, scheduleInvalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_steps' }, scheduleInvalidate);
      if (shouldUseFullDiscussionRealtime()) {
        channel = channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_contributions' }, scheduleInvalidate)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_votes' }, scheduleInvalidate)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_chat_messages' }, scheduleInvalidate);
      }
    }
    channel.subscribe();

    return () => {
      if (invalidateTimer) {
        window.clearTimeout(invalidateTimer);
      }
      void client.removeChannel(channel);
    };
  }, [loading, location.pathname, queryClient, session?.user?.id]);

  return null;
}

function AuthQuerySync() {
  const queryClient = useQueryClient();
  const { loading, profile, session, signOut } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      queryClient.clear();
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
      }
      return;
    }

    if (!profile?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['profiles'] });
    void queryClient.invalidateQueries({ queryKey: ['input-items'] });
    void queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['elearning'] });
    void queryClient.invalidateQueries({ queryKey: ['suni'] });
  }, [loading, profile?.id, queryClient, session?.user?.id]);

  useEffect(() => {
    if (loading || !session) return undefined;
    let signingOut = false;
    return queryClient.getQueryCache().subscribe((event) => {
      const error = event.query?.state.error;
      if (!error || signingOut || !isInvalidAuthSessionError(error)) return;
      signingOut = true;
      void signOut();
    });
  }, [loading, queryClient, session, signOut]);

  return null;
}

function WorkspaceCodePreload() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    let idleHandle: number | ReturnType<typeof setTimeout> | null = null;

    const preload = () => {
      if (cancelled) return;
      const preloadChunk = (loader: () => Promise<unknown>, chunkName: string) => {
        loader().catch((error) => {
          recordTelemetry('workspace.preload_chunk_failed', {
            chunk: chunkName,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      };

      preloadChunk(() => import('@/pages/InputGatePages'), 'InputGatePages');
      preloadChunk(() => import('@/pages/ElearningPages'), 'ElearningPages');
      preloadChunk(() => import('@/pages/StoryboardStagePages'), 'StoryboardStagePages');
      preloadChunk(() => import('@/pages/GameCatalogPage'), 'GameCatalogPage');
      preloadChunk(() => import('@/pages/ProductionStagePages'), 'ProductionStagePages');
      preloadChunk(() => import('@/pages/OperationsPages'), 'OperationsPages');
      preloadChunk(() => import('@/pages/MyTasksBoardPage'), 'MyTasksBoardPage');
      preloadChunk(() => import('@/pages/VDiscussionEventsPage'), 'VDiscussionEventsPage');
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(
        () => {
          preload();
          idleHandle = null;
        },
        { timeout: 2000 },
      );
    } else {
      idleHandle = window.setTimeout(() => {
        preload();
        idleHandle = null;
      }, 300);
    }

    return () => {
      cancelled = true;
      if (idleHandle === null) return;
      if (typeof window.cancelIdleCallback === 'function' && typeof idleHandle === 'number') {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, []);

  return null;
}

export function WorkspaceAuthenticatedFrame() {
  return (
    <>
      <QueryCachePersistence />
      <RealtimeQuerySync />
      <AuthQuerySync />
      <ToastProvider>
        <AppShellProvider>
          <WorkspaceCodePreload />
          <Outlet />
        </AppShellProvider>
      </ToastProvider>
    </>
  );
}
