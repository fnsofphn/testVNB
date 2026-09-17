"""Template views and supplemental cells. No generated facts or separate source copies."""
import copy
import json
import re
from pathlib import Path
from documents import norm, blank

SCHEMA=json.loads(Path(__file__).with_name('form_schema.json').read_text('utf-8'))

def cell_key(table,row,column): return f'{table}:{row}:{column}'

def validate_cells(form,cells):
    if not isinstance(cells,dict) or len(cells)>5000: raise ValueError('Nội dung biểu mẫu không hợp lệ')
    for key,value in cells.items():
        if not isinstance(key,str) or not re.fullmatch(r'\d+:\d+:\d+',key): raise ValueError('Ô biểu mẫu không hợp lệ')
        t,r,c=map(int,key.split(':'))
        if t>=len(SCHEMA[form]['tables']): raise ValueError('Bảng không hợp lệ')
        table=SCHEMA[form]['tables'][t]
        if table['kind']=='static' or r<table['header'] or r>=200 or c>=len(table['rows'][0]): raise ValueError('Ô không được hiệu chỉnh')
        if table['kind']=='fields' and (c!=1 or r>=len(table['rows'])): raise ValueError('Không sửa nhãn biểu mẫu')
        if form=='02' and ((t==2 and r in (0,1)) or (t in (3,7) and c==0)): raise ValueError('Ô được quản lý từ hồ sơ sáng kiến')
        if form=='01' and (t==4 or(t==2 and r==0)): raise ValueError('Danh mục được tổng hợp từ sáng kiến')
        if not isinstance(value,str) or len(value)>30000: raise ValueError('Nội dung ô quá dài')
    return dict(cells)

def step_text(version,step):
    return version.get('revisions',{}).get(step,'\n\n'.join(b['text'] for bid in version.get('fields',{}).get(step,[]) for b in version['blocks'] if b['id']==bid))

def revisions(record,mode):
    version=record['versions'][-1]
    result=dict(version.get('revisions',{}))
    draft=record.get('self_reflection',{})
    stale=bool(draft) and draft['base_version']!=version['number'] and draft['status']!='accepted'
    if mode=='draft' and not stale and draft.get('status') in ('draft','returned','submitted'):
        for data in draft.get('steps',{}).values():
            if data.get('decision') in ('clarify','revise'): result.update(data.get('revisions',{}))
    return result,stale

def source_tables(file,records):
    blocks=list(file.get('unassigned',[]))
    for r in records:
        if file['id'] in r['files']:
            blocks.extend(b for b in r['versions'][-1]['blocks'] if b.get('file_id')==file['id'])
    tables={}
    for b in blocks:
        loc=b.get('locator',{})
        if not all(k in loc for k in ('table','row','column')):continue
        table=tables.setdefault((loc.get('page',0),loc['table']),{})
        table.setdefault(loc['row'],{})[loc['column']]=b['text']
    return [[[cells[c] for c in sorted(cells)] for _,cells in sorted(table.items())] for _,table in sorted(tables.items())]

def source_kind(tables):
    for rows in tables:
        text=norm(' '.join(' '.join(r) for r in rows))
        if 'ma sang kien/nhiem vu' in text and 'ten sang kien/nhiem vu' in text:return '02'
    for rows in tables:
        if any(len(r)>=7 and norm(r[0]) in ('ma','ma sk','ma sang kien') for r in rows):return '01'
    return None

def build(form,unit,records,files,mode='draft',record=None,master=None):
    schema=SCHEMA[form];values={};origins={};row_counts={};conflicts=[];locked=set()
    # Match field labels or table headers, never table numbers of an arbitrary upload.
    for f in files:
        if record and f['id'] not in record['files']:continue
        tables=source_tables(f,records)
        if source_kind(tables)!=form:continue
        for template in schema['tables']:
            ti=int(template['id']); rows=template['rows']
            if template['kind']=='static' or(form=='01' and ti==4):continue
            matched=[]
            if template['kind']=='fields':
                for ri,row in enumerate(rows):
                    if ri<template['header']:continue
                    for table in tables:
                        for src in table:
                            if len(src)==2 and norm(src[0])==norm(row[0]):matched.append((ri,1,src[1]))
            else:
                header=[norm(c) for c in rows[0]]
                for table in tables:
                    hi=next((i for i,r in enumerate(table) if [norm(c) for c in r]==header),None)
                    if hi is None:continue
                    for ri,row in enumerate(table[hi+1:200],1):
                        for ci,text in enumerate(row):matched.append((ri,ci,text))
            for ri,ci,text in matched:
                key=cell_key(ti,ri,ci)
                if blank(text) or (ri<len(rows) and ci<len(rows[ri]) and text==rows[ri][ci]):continue
                if key in values and values[key]!=text:
                    conflicts.append({'cell':key,'text':text,'file':f['name']});continue
                values[key]=text;origins[key]=f['name'];row_counts[str(ti)]=max(row_counts.get(str(ti),len(rows)),ri+1)
    def put(t,r,c,value,label='Nội dung tự soi đã lưu'):
        key=cell_key(t,r,c);values[key]=value;origins[key]=label;locked.add(key)
    stale=False
    if form=='02':
        v=record['versions'][-1];draft=record.get('self_reflection',{})
        rev,stale=revisions(record,mode)
        supplements=dict(v.get('form_cells',{}))
        if mode=='draft' and not stale and draft.get('status') in ('draft','returned','submitted'):supplements.update(draft.get('form_cells',{}))
        values.update(supplements)
        for key in supplements:origins[key]='Bổ sung của đơn vị'
        put(2,0,1,record.get('tracking_code') or record['code'],'Mã hệ thống')
        put(2,1,1,record['name'],'Hồ sơ sáng kiến')
        for step,target in {'1':(2,4,1),'2':(2,9,1),'3':(2,8,1),'4':(2,7,1),'7A':(3,1,2),'7B':(3,2,2),'7C':(3,3,2)}.items():
            if step in rev:put(*target,rev[step])
            elif not values.get(cell_key(*target)):
                source=step_text(v,step)
                if source:put(*target,source,'Nội dung hồ sơ đã tổng hợp từ nguồn')
        if '5' in rev:put(2,7,1,values.get('2:7:1','')+'\n\nĐối tượng bị ảnh hưởng: '+rev['5'])
        # Unstructured intervention/execution text is retained verbatim in its own action row.
        for step,title in [('6','Sáng kiến can thiệp'),('8','Thực thi và bằng chứng')]:
            if step in rev:
                ri=max(len(schema['tables'][4]['rows']),row_counts.get('4',0))
                put(4,ri,0,str(ri));put(4,ri,1,title+'\n'+rev[step]);row_counts['4']=ri+1
        history=[{'at':x.get('submitted_at'),'by':x.get('submitted_by'),'label':'Bản tự soi đã gửi','id':x.get('submission_id')} for x in record.get('self_submissions',[])]
        if draft.get('updated_at'):history.append({'at':draft['updated_at'],'by':draft.get('updated_by'),'label':'Lưu bản tự soi','id':'draft'})
    else:
        doc=master or {};supplements=doc.get('approved_cells',{})
        if mode=='draft':supplements=doc.get('cells',supplements)
        values.update(supplements)
        for key in supplements:origins[key]='Bổ sung cấp đơn vị'
        put(2,0,1,unit['name'],'Đơn vị')
        for ri,r in enumerate(records,1):
            rev,is_stale=revisions(r,mode);stale=stale or is_stale
            v=r['versions'][-1];draft=r.get('self_reflection',{})
            def text(step):return rev.get(step,step_text(v,step))
            source={}
            for b in v['blocks']:
                if b.get('label'):source.setdefault(norm(b['label']),[]).append(b['text'])
            def find(prefix):return '\n\n'.join(dict.fromkeys(t for label,texts in source.items() if label.startswith(prefix) for t in texts))
            row=[r.get('tracking_code') or r['code'],text('1'),text('3'),text('2'),text('6') or r['name'],find('lo trinh'),find('kpi, tieu chi'),find('owner'),find('nguon luc'),find('trang thai')]
            if '4' in rev or '5' in rev:row[2]+='\n\n'+'\n'.join(rev[s] for s in ('4','5') if s in rev)
            if '8' in rev:row[5]=rev['8']
            if any(s in rev for s in ('7A','7B','7C')):row[6]='\n\n'.join(label+': '+text(s) for s,label in [('7A','Hành vi'),('7B','Cơ chế'),('7C','Kết quả')])
            for ci,value in enumerate(row):put(4,ri,ci,value,'Tổng hợp từ '+(r.get('tracking_code') or r['code']))
        row_counts['4']=max(2,len(records)+1)
        history=[{'at':x['at'],'by':x['by'],'label':x['action'],'id':str(i)} for i,x in enumerate(doc.get('history',[]))]
    for key in values:
        t,r,_=key.split(':');row_counts[t]=max(row_counts.get(t,len(schema['tables'][int(t)]['rows'])),int(r)+1)
    return {'schema':schema,'values':values,'origins':origins,'rows':row_counts,'locked':list(locked),'conflicts':conflicts,'stale':stale,'history':history}
