"""Session coordination in the existing scoped, transactional record store."""
import copy
from datetime import datetime, timedelta


def handle(s, op, a, body):
    if op == 'coaching-sessions':
        return s.jsonify(sessions=[r for r in s.rows('coaching_session') if s.can(a,r)],
            experts=[r for r in s.rows('coach_profile') if s.can(a,r)])
    s.require(a, ('project','system','expert'))
    if op == 'coach-profile':
        s.require(a, ('project','system'))
        project = s.scoped(a,body.get('project'),'project')
        old = s.scoped(a,body['id'],'coach_profile') if body.get('id') else None
        if old and old['project'] != project['id']: raise s.Problem('Không chuyển hồ sơ sang dự án khác')
        if old and body.get('revision') != old.get('revision',0): raise s.Problem('Hồ sơ đã thay đổi',409)
        name = str(body.get('name','')).strip()
        if not name: raise s.Problem('Cần tên chuyên gia')
        r = dict(id=old['id'] if old else s.ident(),type='coach_profile',project=project['id'],name=name,
            specialty=str(body.get('specialty',''))[:4000],email=str(body.get('email',''))[:200],
            auth_id=str(body.get('auth_id',''))[:100],active=body.get('active') is not False,revision=(old or {}).get('revision',0)+1)
        s.put('coach_profile',r);s.audit(a,op,r);return s.jsonify(item=r)
    old = s.scoped(a,body['id'],'coaching_session') if body.get('id') else None
    if old and body.get('revision') != old['revision']: raise s.Problem('Phiên đã thay đổi. Tải lại trước khi lưu.',409)
    if op == 'coaching-session-save':
        s.require(a, ('project','system'))
        project=s.scoped(a,body.get('project'),'project')
        units=body.get('units')
        if not isinstance(units,list) or not units or len(units)>100 or not all(isinstance(x,str) for x in units):raise s.Problem('Chọn đơn vị trong phiên')
        for uid in units:
            unit=s.scoped(a,uid,'unit')
            if unit['project']!=project['id']:raise s.Problem('Đơn vị không cùng dự án')
        if old and old['project']!=project['id']:raise s.Problem('Không chuyển phiên sang dự án khác')
        name=str(body.get('name','')).strip()
        if not name:raise s.Problem('Cần tên phiên')
        r=copy.deepcopy(old) if old else dict(id=s.ident(),type='coaching_session',meetings=[],revision=0)
        r.update(project=project['id'],name=name,units=list(dict.fromkeys(units)),objective=str(body.get('objective',''))[:10000])
    else:
        if not old:raise s.Problem('Chọn phiên')
        r=copy.deepcopy(old)
        meeting=next((m for m in r['meetings'] if m['id']==body.get('meeting_id')),None)
        if op=='coaching-meeting-save':
            s.require(a, ('project','system'))
            if body.get('meeting_id') and not meeting:raise s.Problem('Buổi không tồn tại',404)
            expert=s.scoped(a,body.get('expert'),'coach_profile')
            if not expert['active'] or expert['project']!=r['project']:raise s.Problem('Chuyên gia không khả dụng trong dự án')
            try:
                start=datetime.fromisoformat(body['start']);duration=body['duration']
                if start.tzinfo is None or type(duration) is not int or not 15<=duration<=480:raise ValueError()
            except (ValueError,KeyError,TypeError):raise s.Problem('Ngày giờ hoặc thời lượng không hợp lệ')
            end=start+timedelta(minutes=duration)
            for session in s.rows('coaching_session'):
                for m in session['meetings']:
                    if m['id']==(meeting or {}).get('id') or m['expert']!=expert['id']:continue
                    other=datetime.fromisoformat(m['start'])
                    if start<other+timedelta(minutes=m['duration']) and end>other:raise s.Problem('Chuyên gia trùng lịch',409)
            link=str(body.get('link',''))
            if link and not link.startswith(('https://','http://')):raise s.Problem('Liên kết phòng không hợp lệ')
            name=str(body.get('name','')).strip()
            if not name:raise s.Problem('Cần tên buổi')
            if not meeting:
                meeting=dict(id=s.ident(),agenda=[],conclusion='',actions='',closed=False)
                r['meetings'].append(meeting)
            meeting.update(name=name,start=start.isoformat(),duration=duration,expert=expert['id'],assignee=expert['auth_id'],link=link,confirmation='pending')
        elif op in ('coaching-meeting-confirm','coaching-meeting-notes'):
            if not meeting:raise s.Problem('Buổi không tồn tại',404)
            if not a['super'] and a['role']=='expert' and meeting.get('assignee')!=a['assignment_actor']:raise s.Problem('Không được phân công',403)
            if op=='coaching-meeting-confirm':meeting['confirmation']='confirmed'
            else:
                if body.get('closed') is True and (not str(body.get('conclusion','')).strip() or not str(body.get('actions','')).strip()):raise s.Problem('Cần nhập kết luận và hành động trước khi chốt buổi')
                agenda=body.get('agenda',[])
                if not isinstance(agenda,list) or len(agenda)>30:raise s.Problem('Chương trình không hợp lệ')
                for x in agenda:
                    if not isinstance(x,dict) or type(x.get('minutes')) is not int or not 1<=x['minutes']<=480:raise s.Problem('Thời lượng mục không hợp lệ')
                meeting.update(agenda=[dict(name=str(x.get('name',''))[:500],minutes=x['minutes'],notes=str(x.get('notes',''))[:10000],done=x.get('done') is True) for x in agenda],
                    conclusion=str(body.get('conclusion',''))[:30000],actions=str(body.get('actions',''))[:30000],closed=body.get('closed') is True)
        else:raise s.Problem('Thao tác không hợp lệ')
    r['revision']+=1;s.put('coaching_session',r);s.audit(a,op,r);return s.jsonify(item=r)
