const usersRoot = ['suni', 'users'] as const;

export const queries = {
  feature: 'shared.queries',
  users: () => usersRoot,
  customerUsers: () => [...usersRoot, 'customers'] as const,
  usersForHelpdesk: () => [...usersRoot, 'helpdesk'] as const,
} as const;
