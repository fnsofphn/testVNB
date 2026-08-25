import { queries } from './queries';

function assertJsonEqual(actual: unknown, expected: unknown, message: string) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}: expected ${expectedText}, got ${actualText}`);
  }
}

assertJsonEqual(queries.programs(), ['suni', 'training', 'programs'], 'programs query key');
assertJsonEqual(queries.programsForHelpdesk(), ['suni', 'training', 'programs', 'helpdesk'], 'helpdesk programs query key');
assertJsonEqual(queries.customerPrograms('profile-1'), ['suni', 'training', 'programs', 'customer', 'profile-1'], 'customer programs query key');
assertJsonEqual(queries.program('program-1'), ['suni', 'training', 'program', 'program-1'], 'program detail query key');
assertJsonEqual(queries.programCourses('program-1'), ['suni', 'training', 'courses', 'program', 'program-1'], 'program courses query key');
assertJsonEqual(queries.courses(), ['suni', 'training', 'courses'], 'courses query key');
assertJsonEqual(queries.customerCourses('profile-1'), ['suni', 'training', 'courses', 'customer', 'profile-1'], 'customer courses query key');
assertJsonEqual(queries.course('course-1'), ['suni', 'training', 'course', 'course-1'], 'course detail query key');
assertJsonEqual(queries.courseClasses('course-1'), ['suni', 'training', 'classes', 'course-1'], 'course classes query key');
assertJsonEqual(queries.agendas('course-1'), ['suni', 'training', 'agendas', 'course-1'], 'course agendas query key');
assertJsonEqual(queries.materials('course-1'), ['suni', 'training', 'materials', 'course-1'], 'course materials query key');
assertJsonEqual(queries.scoreRule('course-1'), ['suni', 'training', 'score-rule', 'course-1'], 'course score rule query key');
assertJsonEqual(queries.courseResults('course-1'), ['suni', 'training', 'course-results', 'course-1'], 'course results query key');
assertJsonEqual(queries.classes(), ['suni', 'training', 'classes'], 'classes query key');
assertJsonEqual(queries.classDetail('class-1'), ['suni', 'training', 'classes', 'class-1'], 'class detail query key');
assertJsonEqual(queries.classScoreSync('class-1'), ['suni', 'training', 'class', 'class-1'], 'class score sync compatibility query key');
assertJsonEqual(queries.classStudents('class-1'), ['suni', 'training', 'class-students', 'class-1'], 'class students query key');
assertJsonEqual(queries.customerClasses('profile-1'), ['suni', 'training', 'classes', 'customer', 'profile-1'], 'customer classes query key');
assertJsonEqual(queries.instructorClasses('profile-1'), ['suni', 'training', 'classes', 'instructor', 'profile-1'], 'instructor classes query key');
assertJsonEqual(queries.instructorLessonGrants('profile-1'), ['suni', 'training', 'instructor-lesson-grants', 'profile-1'], 'instructor lesson grant query key');
assertJsonEqual(queries.classInstructorAssignments('class-1'), ['suni', 'training', 'class-instructor-assignments', 'class-1'], 'class instructor assignments query key');
assertJsonEqual(queries.classDiscussions('class-1'), ['suni', 'training', 'class-discussions', 'class-1'], 'class discussions query key');
assertJsonEqual(queries.classMaterials('class-1', 'course-1', true), ['suni', 'training', 'materials', 'class-1', 'course-1', true], 'class materials query key');
assertJsonEqual(queries.classActivities('class-1'), ['suni', 'training', 'activities', 'class-1'], 'class activities query key');
assertJsonEqual(queries.classActivitiesForRole('class-1', true), ['suni', 'training', 'activities', 'class-1', true], 'class activities by role query key');
assertJsonEqual(queries.classResults('class-1'), ['suni', 'training', 'results', 'class-1'], 'class results query key');
assertJsonEqual(queries.classResultsForRole('class-1', 'profile-1', true), ['suni', 'training', 'results', 'class-1', 'profile-1', true], 'class results by role query key');
assertJsonEqual(queries.resultsRoot(), ['suni', 'training', 'results'], 'training results root query key');
assertJsonEqual(queries.classCustomerContacts('class-1'), ['suni', 'training', 'class-customer-contacts', 'class-1'], 'class customer contacts query key');
assertJsonEqual(queries.operationRoot(), ['suni', 'training', 'operation'], 'operation root query key');
assertJsonEqual(queries.operationUsers(), ['suni', 'training', 'operation', 'users'], 'operation users query key');
assertJsonEqual(queries.operationTasks('class-1'), ['suni', 'training', 'operation', 'tasks', 'class-1'], 'operation tasks query key');
assertJsonEqual(queries.operationChecklist('class-1'), ['suni', 'training', 'operation', 'checklist', 'class-1'], 'operation checklist query key');
assertJsonEqual(queries.operationEvidence('class-1'), ['suni', 'training', 'operation', 'evidence', 'class-1'], 'operation evidence query key');
assertJsonEqual(
  queries.studentClassesScoped('profile-1', 'a@example.com', 'HV001', 'C01', 'G01'),
  ['suni', 'training', 'classes', 'student', 'profile-1', 'a@example.com', 'HV001', 'C01', 'G01'],
  'student scoped classes query key',
);
assertJsonEqual(
  queries.studentClasses('profile-1', 'a@example.com', 'HV001'),
  ['suni', 'training', 'student-classes', 'profile-1', 'a@example.com', 'HV001'],
  'student classes query key',
);
assertJsonEqual(queries.customerResults('profile-1'), ['suni', 'training', 'customer-results', 'profile-1'], 'customer results query key');
assertJsonEqual(queries.customerResultsRoot(), ['suni', 'training', 'customer-results'], 'customer results root query key');
