"""Unit-scoped reporting codes; source codes and record IDs remain unchanged."""
import re
from documents import norm


def assign_codes(records, units):
    names={u['id']:u['name'] for u in units}
    groups={}
    for record in records:
        if record.get('conversion_pending') and not record.get('tracking_code'):continue
        if record.get('merged_into') and not record.get('tracking_code'):continue
        groups.setdefault((record['project'],record['unit']),[]).append(record)
    for (_,unit),items in groups.items():
        # Legacy global numbers provide a deterministic migration order.
        def order(r):
            old=re.fullmatch(r'SK-(\d+)',r.get('tracking_code',''))
            return (0,int(old[1]),r['id']) if old else (1,0,r['id'])
        used={r['unit_sequence'] for r in items if isinstance(r.get('unit_sequence'),int) and r['unit_sequence']>0}
        number=max(used,default=0)
        for record in sorted(items,key=order):
            if not isinstance(record.get('unit_sequence'),int) or record['unit_sequence']<=0:
                if re.fullmatch(r'SK-\d+',record.get('tracking_code','')):
                    candidate=1
                    while candidate in used:candidate+=1
                else:candidate=number+1
                record['unit_sequence']=candidate;used.add(candidate);number=max(number,candidate)
            suffix=record.get('unit_code_suffix') or re.sub(r'[^a-z0-9]+','-',norm(names.get(unit) or record.get('unit_name') or unit)).strip('-')
            record['unit_code_suffix']=suffix
            record['tracking_code']=f"SK{record['unit_sequence']}-{suffix}"
    return records
