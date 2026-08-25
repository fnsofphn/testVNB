import assert from 'node:assert/strict';
import { validateUploadMetadata } from '../api/vwork-training-operations-file.js';

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

console.log('V-Work Training Operations upload metadata checks passed.');
