import assert from 'node:assert/strict';
import { assertInputDocumentAccess, validateUploadMetadata } from '../api/vwork-training-operations-file.js';

for (const [fileName, contentType] of [
  ['ke-hoach.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['minh-chung.zip', 'application/zip'],
  ['anh-ket-qua.png', 'image/png'],
  ['du-lieu.csv', 'text/csv'],
]) {
  assert.equal(validateUploadMetadata({ fileName, contentType, size: 1024, entityId: 'TASK-01' }).valid, true, `${fileName} should be accepted`);
}

for (const [fileName, contentType] of [
  ['payload.exe', 'application/octet-stream'],
  ['page.html', 'text/html'],
  ['vector.svg', 'image/svg+xml'],
  ['script.txt', 'application/javascript'],
]) {
  const result = validateUploadMetadata({ fileName, contentType, size: 1024, entityId: 'TASK-01' });
  assert.equal(result.valid, false, `${fileName} should be rejected`);
  assert.equal(result.code, 'TRAINING_OPERATIONS_UNSAFE_FILE');
}

assert.equal(validateUploadMetadata({ fileName: 'empty.pdf', contentType: 'application/pdf', size: 0, entityId: 'TASK-01' }).valid, false);
assert.equal(validateUploadMetadata({ fileName: 'missing-id.pdf', contentType: 'application/pdf', size: 1024, entityId: '' }).valid, false);

const scopedAdmin = {
  from(table) {
    assert.equal(table, 'vwork_training_operations_state');
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { payload: {
      inputs: [{ id: 'COURSE-01:D03', key: 'roster', courseId: 'COURSE-01' }],
      teamAssignments: [{ courseId: 'COURSE-01', accountId: 'member-01', accountEmail: 'member@peopleone.vn', status: 'ACTIVE' }],
    } }, error: null }) }) }) };
  },
};
await assertInputDocumentAccess(scopedAdmin, { id: 'member-01', email: 'member@peopleone.vn', full_name: 'Thành viên' }, 'member', 'COURSE-01:D03', 'roster');
await assert.rejects(
  () => assertInputDocumentAccess(scopedAdmin, { id: 'outside-01', email: 'outside@peopleone.vn', full_name: 'Ngoài khóa' }, 'member', 'COURSE-01:D03', 'roster'),
  (error) => error.status === 403,
);
await assert.rejects(
  () => assertInputDocumentAccess(scopedAdmin, { id: 'member-01', email: 'member@peopleone.vn', full_name: 'Thành viên' }, 'member', 'COURSE-01:D04', 'vlearning'),
  (error) => error.status === 404,
);

console.log('V-Work Training Operations upload metadata checks passed.');
