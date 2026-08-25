import { buildStudentClassOverview } from './classOverview';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const students = [
  { id: 's1', profileId: 'profile-1', email: 'test1@vinabrain.com', fullName: 'HV test 1', groupName: '1' },
  { id: 's2', profileId: 'profile-2', email: 'test2@vinabrain.com', fullName: 'HV test 2', groupName: '1' },
  { id: 's3', profileId: 'profile-3', email: 'test3@vinabrain.com', fullName: 'HV test 3', groupName: '2' },
  { id: 's4', profileId: 'profile-4', email: 'test4@vinabrain.com', fullName: 'HV test 4', groupName: '10' },
];

const overview = buildStudentClassOverview(students, {
  profileId: 'profile-2',
  email: 'test2@vinabrain.com',
});

assertEqual(overview.groupCount, 3, 'counts unique groups');
assertEqual(overview.myGroupName, '1', 'finds the current student group');
assertEqual(overview.myGroupMembers.length, 2, 'keeps only my group members');
assertEqual(overview.myGroupMembers[0]?.fullName, 'HV test 1', 'sorts members by name');
assertEqual(overview.myGroupMembers[1]?.fullName, 'HV test 2', 'includes current student');

const missing = buildStudentClassOverview(students, { profileId: 'missing', email: 'missing@example.com' });
assertEqual(missing.myGroupMembers.length, 0, 'missing student has no group members');
