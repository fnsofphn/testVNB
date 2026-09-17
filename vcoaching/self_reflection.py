"""Eight-step reflection contract; persisted inside the existing initiative transaction."""
import copy
import json
from pathlib import Path

SCHEMA = json.loads(Path(__file__).with_name('self_reflection_schema.json').read_text('utf-8'))
FIELDS = {str(i): [str(i)] for i in range(1, 9)}
FIELDS['7'] = ['7A', '7B', '7C']
DECISIONS = ('keep', 'clarify', 'revise', 'verify', 'support')


class ReflectionError(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status


def check(condition, message, status=400):
    if not condition: raise ReflectionError(message, status)


def text(value, limit=30000):
    check(isinstance(value, str) and len(value) <= limit, 'Nội dung không hợp lệ hoặc quá dài')
    return value.strip()


def validate_step(step, raw, complete=False):
    check(isinstance(step, str) and step in FIELDS and isinstance(raw, dict), 'Bước tự soi không hợp lệ')
    schema = SCHEMA[int(step)-1]
    answers = raw.get('answers', {})
    check(isinstance(answers, dict) and set(answers) <= {str(i) for i in range(len(schema['checks']))}, 'Tiêu chí không hợp lệ')
    check(all(v in ('clear', 'partial', 'missing') for v in answers.values()), 'Mức tự đánh giá không hợp lệ')
    decision = raw.get('decision', '')
    check(decision in ('', *DECISIONS), 'Kết luận không hợp lệ')
    revisions = raw.get('revisions', {})
    check(isinstance(revisions, dict) and set(revisions) <= set(FIELDS[step]), 'Nội dung sửa không thuộc bước này')
    result = {k: text(raw.get(k, '')) for k in ('note', 'owner', 'due', 'evidence', 'feedback_reason')}
    result.update(answers=answers, decision=decision, revisions={k: text(v) for k,v in revisions.items()}, feedback=raw.get('feedback', ''), complete=complete)
    check(result['feedback'] in ('', 'agree', 'partial', 'disagree', 'discuss'), 'Phản hồi không hợp lệ')
    if complete:
        check(len(answers) == len(schema['checks']) and decision, 'Hãy trả lời đủ tiêu chí và chọn kết luận')
        if decision != 'keep': check(result['note'], 'Hãy ghi nội dung cần làm rõ, sửa, xác minh hoặc hỗ trợ')
        if decision in ('clarify', 'revise'):
            check(set(revisions) == set(FIELDS[step]) and all(result['revisions'].values()), 'Hãy nhập đầy đủ nội dung sau hiệu chỉnh')
        if decision in ('verify', 'support'): check(result['owner'] and result['due'], 'Cần người phụ trách và mốc kiểm chứng/hỗ trợ')
        if result['feedback'] in ('partial', 'disagree', 'discuss'): check(result['feedback_reason'], 'Cần lý do phản hồi với PeopleOne')
    return result


def apply(r, body, actor_id, at, new_id):
    action = body.get('action')
    current = r.get('self_reflection')
    version = r['versions'][-1]
    if action == 'submit' and current and current.get('request_id') == body.get('request_id') and current['status'] in ('submitted', 'accepted'):
        return
    check(body.get('base_version') == version['number'], 'Hồ sơ đã đổi phiên bản. Tải lại để đối chiếu trước khi lưu.', 409)
    check(body.get('revision') == (current or {}).get('revision', 0), 'Bản tự soi vừa được người khác cập nhật. Tải lại trước khi lưu.', 409)
    if action == 'restart':
        check(r['status'] not in ('submitted', 'complete'), 'Cần xử lý bản nộp hoặc mở lại hồ sơ trước khi bắt đầu đợt mới', 409)
        check(not current or current['status'] != 'submitted', 'Bản gửi đang chờ duyệt')
        if current: r.setdefault('self_archives', []).append(copy.deepcopy(current))
        r['self_reflection'] = dict(base_version=version['number'], revision=(current or {}).get('revision',0)+1, status='draft', steps={}, commitment={}, updated_at=at, updated_by=actor_id)
        return
    check(r['status'] not in ('submitted', 'complete'), 'Hồ sơ đang khóa; cần mở lại hoặc duyệt bản đã gửi', 409)
    check(not current or current['status'] in ('draft', 'returned'), 'Bản tự soi đã gửi; cần bắt đầu đợt mới hoặc được trả lại', 409)
    check(not current or current['base_version'] == version['number'], 'Nguồn đã đổi. Bắt đầu đợt tự soi mới để đối chiếu.', 409)
    draft = copy.deepcopy(current) if current else dict(base_version=version['number'], revision=0, status='draft', steps={}, commitment={})
    if action == 'save':
        step = body.get('step')
        draft['steps'][step] = validate_step(step, body.get('data'), body.get('complete') is True)
    elif action == 'commitment':
        check(isinstance(body.get('data'), dict), 'Cam kết không hợp lệ')
        draft['commitment'] = {k: text(body['data'].get(k, '')) for k in ('action', 'owner', 'due')}
    elif action == 'submit':
        check(set(draft['steps']) == set(FIELDS), 'Cần hoàn thành cả 8 bước trước khi gửi')
        for step, data in draft['steps'].items():
            check(data['complete'], 'Còn bước chưa hoàn thành')
            validate_step(step, data, True)
        check(all(draft['commitment'].get(k) for k in ('action', 'owner', 'due')), 'Cần lưu cam kết, người chịu trách nhiệm và thời hạn')
        request_id = text(body.get('request_id', ''), 100)
        check(bool(request_id), 'Thiếu mã lần gửi')
        draft.pop('review_reason', None)
        draft.update(status='submitted', submitted_at=at, submitted_by=actor_id, request_id=request_id, submission_id=new_id, schema_version=1, schema=copy.deepcopy(SCHEMA))
        r['status'] = 'submitted'
    else: raise ReflectionError('Thao tác tự soi không hợp lệ')
    draft.update(revision=draft['revision']+1, updated_at=at, updated_by=actor_id)
    if action == 'submit': r.setdefault('self_submissions', []).append(copy.deepcopy(draft))
    r['self_reflection'] = draft


def review(r, body, actor_id, at):
    draft = r.get('self_reflection', {})
    check(draft.get('status') == 'submitted' and body.get('submission_id') == draft.get('submission_id'), 'Bản gửi không còn chờ duyệt', 409)
    reason = text(body.get('reason', ''))
    check(bool(reason), 'Cần ghi lý do duyệt hoặc trả lại')
    check(body.get('decision') in ('accept', 'return'), 'Quyết định không hợp lệ')
    check(draft['base_version'] == r['versions'][-1]['number'], 'Nguồn đã đổi; cần đối chiếu lại bản gửi', 409)
    r.setdefault('self_reviews', []).append(dict(submission_id=draft['submission_id'], decision=body['decision'], reason=reason, by=actor_id, at=at))
    if body['decision'] == 'return':
        draft.update(status='returned', review_reason=reason, revision=draft['revision']+1)
        r['status'] = 'self_review'
        return
    version = copy.deepcopy(r['versions'][-1])
    for step, data in draft['steps'].items():
        if data['decision'] in ('clarify', 'revise'): version['revisions'].update(data['revisions'])
    version.update(number=version['number']+1, at=at, confirmed=False, self_submission_id=draft['submission_id'])
    r['versions'].append(version)
    # Compatibility with existing reports: only accepted edits enter responses.
    r.setdefault('responses', []).append(dict(id=draft['submission_id'], at=at, by=draft['submitted_by'], agreement='agree', reason=reason,
        revisions={k:v for data in draft['steps'].values() if data['decision'] in ('clarify','revise') for k,v in data['revisions'].items()},
        evidence='\n'.join(data['evidence'] for data in draft['steps'].values() if data['evidence']),
        support='\n'.join(data['note'] for data in draft['steps'].values() if data['decision']=='support'), self_rating={}, submitted=True))
    draft.update(status='accepted', review_reason=reason, revision=draft['revision']+1)
    r.update(status='rechecked', locked_steps=[], submitted_steps=list(k for fields in FIELDS.values() for k in fields))
    for comment in r['comments']: comment['stale'] = True
