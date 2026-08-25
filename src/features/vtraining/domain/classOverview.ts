export type StudentClassOverviewStudent = {
  id: string;
  profileId?: string | null;
  email?: string | null;
  fullName: string;
  groupName?: string | null;
  studentCode?: string | null;
  department?: string | null;
  position?: string | null;
};

export type StudentClassOverviewViewer = {
  profileId?: string | null;
  email?: string | null;
};

export type StudentClassOverview = {
  groupCount: number;
  myGroupName: string;
  myGroupMembers: StudentClassOverviewStudent[];
};

function normalizeText(value: string | null | undefined) {
  return String(value || '').trim();
}

function normalizeEmail(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

export function buildStudentClassOverview(
  students: StudentClassOverviewStudent[],
  viewer: StudentClassOverviewViewer,
): StudentClassOverview {
  const groupNames = new Set(students.map((student) => normalizeText(student.groupName)).filter(Boolean));
  const viewerProfileId = normalizeText(viewer.profileId);
  const viewerEmail = normalizeEmail(viewer.email);
  const currentStudent = students.find((student) => {
    const studentProfileId = normalizeText(student.profileId);
    if (viewerProfileId && studentProfileId === viewerProfileId) return true;
    return Boolean(viewerEmail && normalizeEmail(student.email) === viewerEmail);
  });
  const myGroupName = normalizeText(currentStudent?.groupName);
  const myGroupMembers = myGroupName
    ? students
      .filter((student) => normalizeText(student.groupName) === myGroupName)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi', { numeric: true }))
    : [];

  return {
    groupCount: groupNames.size,
    myGroupName,
    myGroupMembers,
  };
}
