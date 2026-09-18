"""Prepare canonical records only; no credentials, database connections or writes."""
import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'vcoaching'))
from approved_source import SOURCE, replace


def records():
    at = datetime.now(timezone.utc).isoformat()
    units = json.loads((ROOT / 'vcoaching/unit_catalog.json').read_text('utf-8'))
    unit = next(u for u in units if u['name'] == 'VNPT Quảng Trị')
    result = []
    for index, name in enumerate(SOURCE['names']):
        record = dict(id=f'vcoaching-approved-quang-tri-sk{index+1:02d}', type='initiative',
            project=unit['project'], unit=unit['id'], unit_name=unit['name'], source_unit_name=unit['name'],
            unit_type=unit['unit_type'], name=name, code=f'SK{index+1:02d}', files=[],
            forms=['master','detail'], issues=[], experts=[], status='pending', released=False,
            comments=[], responses=[], versions=[dict(number=0)], conversion_pending=False,
            test_fixture=False, approved_document_key=f'sk{index+1:02d}')
        replace(record, index, 0, at)
        # This is a new source record, not a replacement of a pre-existing initiative.
        record['versions'] = record['versions'][1:]
        record.pop('approved_source_backups')
        result.append(dict(id=record['id'],kind='initiative',data=record))
    result.append(dict(id=unit['id'],kind='unit',data=copy.deepcopy(unit)))
    return result


if __name__ == '__main__':
    print(json.dumps(records(), ensure_ascii=False))
