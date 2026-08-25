const trainingRoot = ['suni', 'training'] as const;
const programRoot = [...trainingRoot, 'program'] as const;
const programsRoot = [...trainingRoot, 'programs'] as const;
const courseRoot = [...trainingRoot, 'course'] as const;
const coursesRoot = [...trainingRoot, 'courses'] as const;
const classesRoot = [...trainingRoot, 'classes'] as const;
const classStudentsRoot = [...trainingRoot, 'class-students'] as const;
const agendasRoot = [...trainingRoot, 'agendas'] as const;
const materialsRoot = [...trainingRoot, 'materials'] as const;
const activitiesRoot = [...trainingRoot, 'activities'] as const;
const resultsRoot = [...trainingRoot, 'results'] as const;
const operationRoot = [...trainingRoot, 'operation'] as const;
const scoreRuleRoot = [...trainingRoot, 'score-rule'] as const;
const courseResultsRoot = [...trainingRoot, 'course-results'] as const;
const classDiscussionsRoot = [...trainingRoot, 'class-discussions'] as const;
const classCustomerContactsRoot = [...trainingRoot, 'class-customer-contacts'] as const;
const studentClassesRoot = [...trainingRoot, 'student-classes'] as const;
const customerResultsRoot = [...trainingRoot, 'customer-results'] as const;
const instructorLessonGrantsRoot = [...trainingRoot, 'instructor-lesson-grants'] as const;
const classInstructorAssignmentsRoot = [...trainingRoot, 'class-instructor-assignments'] as const;

export const queries = {
  feature: 'vtraining.queries',
  programs: () => programsRoot,
  programsForHelpdesk: () => [...programsRoot, 'helpdesk'] as const,
  customerPrograms: (profileId?: string | null) => [...programsRoot, 'customer', profileId] as const,
  program: (programId: string | null | undefined) => [...programRoot, programId] as const,
  programCourses: (programId: string | null | undefined) => [...coursesRoot, 'program', programId] as const,
  courses: () => coursesRoot,
  customerCourses: (profileId?: string | null) => [...coursesRoot, 'customer', profileId] as const,
  course: (courseId: string | null | undefined) => [...courseRoot, courseId] as const,
  courseClasses: (courseId: string | null | undefined) => [...classesRoot, courseId] as const,
  agendas: (ownerId: string | null | undefined) => [...agendasRoot, ownerId] as const,
  materials: (ownerId: string | null | undefined) => [...materialsRoot, ownerId] as const,
  scoreRule: (courseId: string | null | undefined) => [...scoreRuleRoot, courseId] as const,
  courseResults: (courseId: string | null | undefined) => [...courseResultsRoot, courseId] as const,
  classes: () => classesRoot,
  classDetail: (classId: string | null | undefined) => [...classesRoot, classId] as const,
  classScoreSync: (classId: string | null | undefined) => [...trainingRoot, 'class', classId] as const,
  classStudents: (classId: string | null | undefined, scope?: string | null) => [...classStudentsRoot, classId, scope || 'all'] as const,
  customerClasses: (profileId?: string | null) => [...classesRoot, 'customer', profileId] as const,
  instructorClasses: (profileId?: string | null) => [...classesRoot, 'instructor', profileId] as const,
  instructorLessonGrants: (profileId?: string | null) => [...instructorLessonGrantsRoot, profileId] as const,
  classInstructorAssignments: (classId: string | null | undefined) => [...classInstructorAssignmentsRoot, classId] as const,
  classDiscussions: (classId: string | null | undefined) => [...classDiscussionsRoot, classId] as const,
  classMaterials: (
    classId: string | null | undefined,
    courseId: string | null | undefined,
    isStudent: boolean,
  ) => [...materialsRoot, classId, courseId, isStudent] as const,
  classActivities: (classId: string | null | undefined) => [...activitiesRoot, classId] as const,
  classActivitiesForRole: (classId: string | null | undefined, isStudent: boolean) => [...activitiesRoot, classId, isStudent] as const,
  classResults: (classId: string | null | undefined) => [...resultsRoot, classId] as const,
  classResultsForRole: (
    classId: string | null | undefined,
    profileId: string | null | undefined,
    isStudent: boolean,
  ) => [...resultsRoot, classId, profileId, isStudent] as const,
  resultsRoot: () => resultsRoot,
  classCustomerContacts: (classId: string | null | undefined) => [...classCustomerContactsRoot, classId] as const,
  operationRoot: () => operationRoot,
  operationUsers: () => [...operationRoot, 'users'] as const,
  operationTasks: (classId: string | null | undefined) => [...operationRoot, 'tasks', classId] as const,
  operationChecklist: (classId: string | null | undefined) => [...operationRoot, 'checklist', classId] as const,
  operationEvidence: (classId: string | null | undefined) => [...operationRoot, 'evidence', classId] as const,
  studentClassesScoped: (
    profileId: string | null | undefined,
    email: string | null | undefined,
    studentCode: string | null | undefined,
    studentClass: string | null | undefined,
    studentGroup: string | null | undefined,
  ) => [...classesRoot, 'student', profileId, email, studentCode, studentClass, studentGroup] as const,
  studentClasses: (
    profileId: string | null | undefined,
    email: string | null | undefined,
    studentCode: string | null | undefined,
  ) => [...studentClassesRoot, profileId, email, studentCode] as const,
  customerResults: (profileId?: string | null) => [...customerResultsRoot, profileId] as const,
  customerResultsRoot: () => customerResultsRoot,
} as const;
