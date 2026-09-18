"""Per-reviewer question/answer drafts, independent of unit reflection."""
import copy
from self_reflection import SCHEMA, check, text


def initial(version):
    return dict(revision=0, base_version=version, steps={s['id']: [
        dict(id=f"{s['id']}:{i}", question=q, answer='', rating='')
        for i, q in enumerate(s['checks'])] for s in SCHEMA})


def apply(record, body, actor_id, at):
    version = record['versions'][-1]['number']
    previous = record.get('expert_worksheets', {}).get(actor_id) or initial(version)
    check(type(body.get('revision')) is int and body['revision'] == previous['revision'],
          'Phiếu vừa thay đổi. Tải lại trước khi lưu.', 409)
    check(body.get('base_version') == version, 'Nguồn đã đổi. Tải lại để đối chiếu.', 409)
    check(record['status'] != 'complete', 'Hồ sơ đã hoàn tất, không thể sửa phiếu.', 409)
    step = body.get('step')
    check(isinstance(step, str) and step in previous['steps'], 'Bước không hợp lệ')
    questions = body.get('questions')
    check(isinstance(questions, list) and 1 <= len(questions) <= 50, 'Mỗi bước cần từ 1 đến 50 câu hỏi')
    clean, ids = [], set()
    for item in questions:
        check(isinstance(item, dict), 'Câu hỏi không hợp lệ')
        key = text(item.get('id'), 100)
        question = text(item.get('question'), 4000)
        check(key and key not in ids and question, 'Mã hoặc nội dung câu hỏi không hợp lệ')
        ids.add(key)
        rating = item.get('rating', '')
        check(rating in ('', 'clear', 'partial', 'missing', 'verify'), 'Đánh giá không hợp lệ')
        old = next((q for q in previous['steps'][step] if q['id'] == key), None)
        if old and old['question'] != question: rating = ''
        clean.append(dict(id=key, question=question, answer=text(item.get('answer', '')), rating=rating))
    updated = copy.deepcopy(previous)
    # Each save retains the previous step, including deleted questions and answers.
    updated.setdefault('history', []).append(dict(step=step, questions=copy.deepcopy(previous['steps'][step]),
        revision=previous['revision'], base_version=previous['base_version'], at=at))
    updated['steps'][step] = clean
    updated.update(revision=previous['revision']+1, base_version=version, updated_at=at)
    record.setdefault('expert_worksheets', {})[actor_id] = updated
