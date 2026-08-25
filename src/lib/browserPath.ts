import { useSyncExternalStore } from 'react';

const NAVIGATION_EVENT = 'vcontent:navigation';
let historyPatched = false;

function getBrowserPathSnapshot() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function emitNavigationEvent() {
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function patchHistoryNavigation() {
  if (typeof window === 'undefined' || historyPatched) return;
  historyPatched = true;

  const patchMethod = (methodName: 'pushState' | 'replaceState') => {
    const original = window.history[methodName];
    window.history[methodName] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      emitNavigationEvent();
      return result;
    };
  };

  patchMethod('pushState');
  patchMethod('replaceState');
}

function subscribeBrowserPath(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  patchHistoryNavigation();
  window.addEventListener(NAVIGATION_EVENT, onStoreChange);
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener('hashchange', onStoreChange);

  return () => {
    window.removeEventListener(NAVIGATION_EVENT, onStoreChange);
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener('hashchange', onStoreChange);
  };
}

export function useBrowserPath() {
  return useSyncExternalStore(subscribeBrowserPath, getBrowserPathSnapshot, () => '/');
}

export function getPageIdFromBrowserPath(path: string) {
  return path.split(/[?#]/, 1)[0].split('/').filter(Boolean)[0] || 'dashboard';
}

export function getSecondSegmentFromBrowserPath(path: string) {
  return path.split(/[?#]/, 1)[0].split('/').filter(Boolean)[1] || null;
}
