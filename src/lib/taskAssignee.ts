import type { AuthProfile } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import type { ProfileRow, TaskRow } from '@/services/vcontent';

export type AssignableProfile = {
  profileId: string;
  accountId: string | null;
  email: string | null;
  fullName: string;
  role: string;
};

export function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

export function profileEmailMatches(profile: AuthProfile | null, email: string | null | undefined) {
  const currentEmail = normalizeEmail(profile?.email);
  const assignedEmail = normalizeEmail(email);
  return Boolean(currentEmail && assignedEmail && currentEmail === assignedEmail);
}

export function isSystemTestAssigneeProfile(profile: Pick<ProfileRow, 'id' | 'email' | 'full_name' | 'role'>) {
  const id = String(profile.id || '').trim().toLowerCase();
  const email = normalizeEmail(profile.email);
  const fullName = String(profile.full_name || '').trim().toLowerCase();
  const role = String(profile.role || '').trim().toLowerCase();
  const isE2eAdminName = fullName === 'e2e admin' || fullName === 'codex e2e admin';
  const isE2eAdminEmail = email.endsWith('.admin@e2e.local') || email.includes('e2e') && email.includes('.admin@');
  const isE2eAdminId = id.includes('e2e') && id.includes('admin');
  return role === 'admin' && (isE2eAdminName || isE2eAdminEmail || isE2eAdminId);
}

export function isProfileIdAssignedToCurrentProfile(
  profileId: string | null | undefined,
  profile: AuthProfile | null,
  profiles: ProfileRow[] = [],
) {
  if (!profileId || !profile) return false;
  const assignedProfile = profiles.find((entry) => entry.id === profileId);
  const assignedEmail = normalizeEmail(assignedProfile?.email);
  if (normalizeEmail(profile.email) && assignedEmail) return assignedEmail === normalizeEmail(profile.email);
  return profileId === profile.id;
}

export function toAssignableProfiles(
  profiles: ProfileRow[],
  allowedRoles?: string[],
) {
  return profiles
    .filter((entry) => entry.active)
    .filter((entry) => !isSystemTestAssigneeProfile(entry))
    .filter((entry) => !allowedRoles?.length || allowedRoles.includes(normalizeAppRole(entry.role)))
    .map(
      (entry): AssignableProfile => ({
        profileId: entry.id,
        accountId: entry.auth_user_id || null,
        email: normalizeEmail(entry.email) || null,
        fullName: entry.full_name,
        role: entry.role,
      }),
    );
}

export function findAssignableProfile(
  profiles: AssignableProfile[],
  profileId: string | null | undefined,
) {
  if (!profileId) return null;
  return profiles.find((entry) => entry.profileId === profileId) || null;
}

export function buildTaskAssigneePatch(profile: AssignableProfile | null) {
  return {
    assignee: profile?.fullName || null,
    assignee_profile_id: profile?.profileId || null,
    assignee_account_id: profile?.accountId || null,
  };
}

export function isTaskAssignedToCurrentProfile(
  task: TaskRow,
  profile: AuthProfile | null,
  profiles: ProfileRow[] = [],
) {
  if (!profile) return true;
  if (['admin', 'production_manager', 'pm'].includes(normalizeAppRole(profile.role))) return true;
  if (!task.assignee && !task.assignee_profile_id && !task.assignee_account_id) return true;
  const currentEmail = normalizeEmail(profile.email);
  const assignedProfile = profiles.find((entry) => entry.id === task.assignee_profile_id);
  if (currentEmail && normalizeEmail(assignedProfile?.email)) return normalizeEmail(assignedProfile?.email) === currentEmail;
  if (task.assignee_account_id && profile.authUserId) return task.assignee_account_id === profile.authUserId;
  if (task.assignee_profile_id) return task.assignee_profile_id === profile.id;
  return false;
}

export function isTaskExplicitlyAssignedToCurrentProfile(
  task: TaskRow | null | undefined,
  profile: AuthProfile | null,
  profiles: ProfileRow[] = [],
) {
  if (!task || !profile) return false;
  const currentEmail = normalizeEmail(profile.email);
  const assignedProfile = profiles.find((entry) => entry.id === task.assignee_profile_id);
  const assignedEmail = normalizeEmail(assignedProfile?.email);
  if (currentEmail && assignedEmail) return assignedEmail === currentEmail;
  if (task.assignee_account_id && profile.authUserId) return task.assignee_account_id === profile.authUserId;
  if (task.assignee_profile_id) return task.assignee_profile_id === profile.id;
  return false;
}
