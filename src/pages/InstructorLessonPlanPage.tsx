import { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole } from '@/data/vcontent';
import { queries } from '@/features/vtraining';
import {
  buildInstructorLessonPlanAccess,
  normalizeInstructorLessonPlanId,
  type InstructorLessonPlanId,
} from '@/features/vtraining/domain/instructorLessonAccess';
import { suniTrainingApi } from '@/lib/suni';

const LESSON_HTML_LOADERS: Record<InstructorLessonPlanId, () => Promise<{ default: string }>> = {
  '01': () => import('@/assets/giaoan/SoTay_GiangVien_CD01_UngDungAI_Full.html?raw'),
  '02a': () => import('@/assets/giaoan/SoTay_GiangVien_CD02a_NangCaoNangLucDieuHanh.html?raw'),
  '02b': () => import('@/assets/giaoan/SoTay_GiangVien_CD02b_DieuHanhNoiBo_TNKH.html?raw'),
  '03a': () => import('@/assets/giaoan/SoTay_GiangVien_CD03a_HuanLuyenNhanVien.html?raw'),
  '03b': () => import('@/assets/giaoan/SoTay_GiangVien_CD03b_KemCap_IDP.html?raw'),
};

export function InstructorLessonPlanPage() {
  const { planId } = useParams();
  const { profile } = useAuth();
  const currentPlanId = normalizeInstructorLessonPlanId(planId);
  const canManage = isTrainingAdminRole(profile?.role);
  const grantsQuery = useQuery({
    queryKey: queries.instructorLessonGrants(profile?.id || ''),
    queryFn: () => suniTrainingApi.listInstructorLessonGrants({ profileId: profile?.id }),
    enabled: Boolean(profile?.id) && !canManage,
    staleTime: 60 * 1000,
  });
  const lessonAccess = useMemo(() => {
    const access = buildInstructorLessonPlanAccess({
      profileId: profile?.id,
      email: profile?.email,
      classLessonGrants: grantsQuery.data || [],
    });
    return canManage ? access.map((item) => ({ ...item, canView: true })) : access;
  }, [canManage, grantsQuery.data, profile?.email, profile?.id]);
  const activePlan = lessonAccess.find((item) => item.id === currentPlanId) || lessonAccess[0];
  const canViewActivePlan = Boolean(activePlan?.canView);
  const [lessonPlanHtml, setLessonPlanHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLessonPlanHtml('');
    if (!canViewActivePlan || !activePlan) return () => { cancelled = true; };
    void LESSON_HTML_LOADERS[activePlan.id]().then((module) => {
      if (!cancelled) setLessonPlanHtml(module.default);
    });
    return () => {
      cancelled = true;
    };
  }, [activePlan, canViewActivePlan]);

  return (
    <div className="vtraining-lesson-plan-page">
      <div className="vtraining-lesson-plan-nav">
        {lessonAccess.map((item) => (
          <NavLink
            key={item.id}
            to={item.route}
            className={({ isActive }) => [
              'vtraining-lesson-plan-link',
              isActive ? 'is-active' : '',
              item.canView ? '' : 'is-locked',
            ].filter(Boolean).join(' ')}
          >
            <span>{item.label}</span>
            <small>{item.shortTitle}</small>
          </NavLink>
        ))}
      </div>
      {canViewActivePlan ? (
        <iframe
          title={`Giáo án giảng viên ${activePlan.label}`}
          srcDoc={lessonPlanHtml}
          sandbox="allow-scripts allow-same-origin"
          className="vtraining-lesson-plan-frame"
        />
      ) : (
        <main className="vtraining-lesson-plan-locked">
          <section>
            <span>VTraining</span>
            <h1>{activePlan.title}</h1>
            <p>Chuyên đề này chưa được gán quyền xem cho tài khoản của bạn.</p>
            <strong>{profile?.fullName || profile?.email || 'Giảng viên'}</strong>
          </section>
        </main>
      )}
    </div>
  );
}
