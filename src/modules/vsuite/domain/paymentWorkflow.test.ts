import assert from 'node:assert/strict';
import {
  getNextPaymentStatus,
  getNextPlanStatus,
  getPaymentActionLabel,
  canActOnPaymentRequest,
  canCurrentProfileActOnPaymentRequest,
} from './paymentWorkflow';

assert.equal(getNextPaymentStatus('draft', 'submit'), 'submitted');
assert.equal(getNextPaymentStatus('submitted', 'accountant_review'), 'manager_approved');
assert.equal(getNextPaymentStatus('accountant_review', 'director_approve'), 'director_approved');
assert.equal(getNextPaymentStatus('accountant_review', 'manager_approve'), 'accountant_review');
assert.equal(getNextPaymentStatus('returned', 'accountant_review'), 'manager_approved');
assert.equal(getNextPaymentStatus('manager_approved', 'director_approve'), 'director_approved');
assert.equal(getNextPaymentStatus('director_approved', 'mark_paid'), 'paid');
assert.equal(getNextPaymentStatus('accountant_review', 'return'), 'returned');
assert.equal(getNextPaymentStatus('submitted', 'reject'), 'rejected');
assert.equal(getNextPaymentStatus('paid', 'submit'), 'paid');

assert.equal(canActOnPaymentRequest('vsuite_requester', 'draft', 'submit'), true);
assert.equal(canActOnPaymentRequest('vsuite_accountant', 'submitted', 'accountant_review'), true);
assert.equal(canActOnPaymentRequest('vsuite_manager', 'accountant_review', 'manager_approve'), false);
assert.equal(canActOnPaymentRequest('vsuite_director', 'accountant_review', 'director_approve'), true);
assert.equal(canActOnPaymentRequest('vsuite_director', 'manager_approved', 'director_approve'), true);
assert.equal(canActOnPaymentRequest('vsuite_treasurer', 'director_approved', 'mark_paid'), true);
assert.equal(canActOnPaymentRequest('vsuite_requester', 'manager_approved', 'director_approve'), false);

const paymentRequest = { status: 'director_approved' as const, requester_profile_id: 'requester-1' };
const director = { id: 'director-1', email: 'hailt@peopleone.com.vn', role: 'vsuite_admin', title: 'Giám đốc, toàn quyền' };
const accountant = { id: 'accountant-1', email: 'banguyen@peopleone.com.vn', role: 'specialist', title: 'Kế toán' };
const systemAdmin = { id: 'admin-1', email: 'admin@example.com', role: 'admin', title: 'System Administrator' };
const delegatedDirector = { id: 'delegate-1', email: 'delegate@example.com', role: 'specialist', title: 'Delegate' };
assert.equal(canCurrentProfileActOnPaymentRequest(director, paymentRequest, 'mark_paid'), false);
assert.equal(canCurrentProfileActOnPaymentRequest({ ...director, title: 'Giám đốc, Kế toán' }, paymentRequest, 'mark_paid'), false);
assert.equal(canCurrentProfileActOnPaymentRequest(accountant, paymentRequest, 'mark_paid'), true);
assert.equal(canCurrentProfileActOnPaymentRequest(systemAdmin, paymentRequest, 'mark_paid'), false);
assert.equal(canCurrentProfileActOnPaymentRequest(director, { ...paymentRequest, status: 'manager_approved' }, 'director_approve'), true);
assert.equal(canCurrentProfileActOnPaymentRequest(systemAdmin, { ...paymentRequest, status: 'manager_approved' }, 'director_approve'), false);
assert.equal(canCurrentProfileActOnPaymentRequest(delegatedDirector, { ...paymentRequest, status: 'manager_approved', delegated_approver_email: delegatedDirector.email }, 'director_approve'), true);
assert.equal(canCurrentProfileActOnPaymentRequest(delegatedDirector, { ...paymentRequest, status: 'manager_approved', delegated_approver_email: 'someone-else@example.com' }, 'director_approve'), false);
assert.equal(canCurrentProfileActOnPaymentRequest({ ...accountant, email: delegatedDirector.email }, { ...paymentRequest, status: 'manager_approved', delegated_approver_email: delegatedDirector.email }, 'director_approve'), true);

assert.equal(getPaymentActionLabel('director_approve'), 'Giám đốc duyệt');
assert.equal(getNextPlanStatus('draft', 'submit'), 'submitted');
assert.equal(getNextPlanStatus('submitted', 'approve'), 'approved');
assert.equal(getNextPlanStatus('submitted', 'reject'), 'rejected');

console.log('paymentWorkflow tests passed');
