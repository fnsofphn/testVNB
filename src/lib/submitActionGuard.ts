export type SubmitActionGuard = {
  run: <T>(key: string, action: () => Promise<T>) => Promise<T | null>;
  isPending: (key: string) => boolean;
};

export function createSubmitActionGuard(): SubmitActionGuard {
  const pendingKeys = new Set<string>();

  return {
    async run<T>(key: string, action: () => Promise<T>): Promise<T | null> {
      if (pendingKeys.has(key)) return null;
      pendingKeys.add(key);
      try {
        return await action();
      } finally {
        pendingKeys.delete(key);
      }
    },
    isPending(key: string) {
      return pendingKeys.has(key);
    },
  };
}
