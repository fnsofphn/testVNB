"""Approved mockup content; explicit replacement with an immutable backup."""
import copy
import json
from pathlib import Path
from self_reflection import check

SOURCE = json.loads(Path(__file__).with_name('approved_mockup.json').read_text('utf-8'))


def replace(record, index, expected_version, at):
    check(type(index) is int and 0 <= index < len(SOURCE['names']), 'Sáng kiến nguồn không hợp lệ')
    check(expected_version == record['versions'][-1]['number'], 'Hồ sơ đã đổi; tải lại trước khi ghi đè', 409)
    check(record['status'] not in ('submitted', 'complete') and record.get('self_reflection', {}).get('status') != 'submitted',
          'Cần xử lý bản đã nộp trước khi thay nội dung nguồn', 409)
    backup = copy.deepcopy({k:v for k,v in record.items() if k != 'approved_source_backups'})
    record.setdefault('approved_source_backups', []).append(dict(at=at, record=backup))
    steps = copy.deepcopy(SOURCE['steps'][index])
    blocks, fields = [], {k:[] for k in ('1','2','3','4','5','6','7A','7B','7C','8')}
    for number, step in enumerate(steps, 1):
        key = str(number) if number != 7 else '7B'
        for c, card in enumerate(step['cards']):
            if number == 7:
                title = card['title'].lower()
                key = '7A' if 'hành vi' in title else '7C' if 'kết quả' in title else '7B'
            for f, field in enumerate(card['fields']):
                bid = f'approved:{index}:{number}:{c}:{f}'
                blocks.append(dict(id=bid, text=field['text'], label=field.get('label') or card['title'],
                    file_name=card['source'], locator=dict(approved_initiative=index, step=number, card=c, field=f)))
                fields[key].append(bid)
    # Source cards remain exact; the review renders the three layers from those cards.
    record['versions'].append(dict(number=expected_version+1, at=at, blocks=blocks, fields=fields,
        revisions={}, confirmed=False, not_applicable=[]))
    record.update(name=SOURCE['names'][index], approved_source_index=index, approved_steps=steps,
        status='pending', released=False, locked_steps=[], released_steps=[], submitted_steps=[])
    for comment in record['comments']: comment['stale'] = True
    if record.get('self_reflection'):
        record.setdefault('self_archives', []).append(copy.deepcopy(record['self_reflection']))
        record.pop('self_reflection')
    record.pop('expert_worksheets', None)
    record.pop('unit_worksheets', None)
