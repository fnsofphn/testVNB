import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Lock, Unlock } from 'lucide-react';

import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { queries } from '@/features/vtraining';
import {
  buildInstructorClassLessonTopics,
  normalizeClassLessonPlanTopics,
  type ClassLessonPlanTopic,
  type InstructorClassLessonTopic,
} from '@/features/vtraining/domain/instructorClassLessonPortal';
import { suniTrainingApi } from '@/lib/suni';

const LESSON_HTML_LOADERS = {
  '01': () => import('@/assets/giaoan/SoTay_GiangVien_CD01_UngDungAI_Full.html?raw'),
  '02a': () => import('@/assets/giaoan/SoTay_GiangVien_CD02a_NangCaoNangLucDieuHanh.html?raw'),
  '02b': () => import('@/assets/giaoan/SoTay_GiangVien_CD02b_DieuHanhNoiBo_TNKH.html?raw'),
  '03a': () => import('@/assets/giaoan/SoTay_GiangVien_CD03a_HuanLuyenNhanVien.html?raw'),
  '03b': () => import('@/assets/giaoan/SoTay_GiangVien_CD03b_KemCap_IDP.html?raw'),
} as const;

type ElectronicLessonPlanId = keyof typeof LESSON_HTML_LOADERS;

function normalizeTopicText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferElectronicLessonPlanId(topic: ClassLessonPlanTopic): ElectronicLessonPlanId | '' {
  const text = normalizeTopicText(`${topic.label || ''} ${topic.title || ''} ${topic.id || ''}`);
  if (/(cd|chuyen-de)?0?2a/.test(text) || text.includes('du-lieu') || text.includes('quan-tri-cong-viec')) return '02a';
  if (/(cd|chuyen-de)?0?2b/.test(text) || text.includes('tnkh') || text.includes('trai-nghiem-khach-hang')) return '02b';
  if (/(cd|chuyen-de)?0?3a/.test(text) || text.includes('huan-luyen-nhan-vien')) return '03a';
  if (/(cd|chuyen-de)?0?3b/.test(text) || text.includes('idp') || text.includes('kem-cap')) return '03b';
  if (text.includes('dinh-huong') || /(cd|chuyen-de)?0?1/.test(text) || text.includes('ung-dung-ai')) return '01';
  return '';
}

function TopicRow({ topic }: { topic: InstructorClassLessonTopic }) {
  const lessonHref = topic.canView && topic.lessonUrl ? topic.lessonUrl : undefined;
  return (
    <article className={`vtraining-class-topic-row ${topic.canView ? '' : 'is-locked'}`}>
      <div>
        <strong>{topic.title}</strong>
        <span>{topic.lessonUrl ? 'Giáo án điện tử đã được gắn' : 'Chưa có link giáo án điện tử'}</span>
      </div>
      {lessonHref ? (
        <a className="btn btn-primary btn-small" href={lessonHref} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} /> Mở giáo án
        </a>
      ) : (
        <Badge tone="neutral"><Lock size={13} /> Chưa gán</Badge>
      )}
    </article>
  );
}

export function InstructorClassLessonPlansPage() {
  const { classId = '', planId = '' } = useParams();
  const { profile } = useAuth();
  const [lessonPlanHtml, setLessonPlanHtml] = useState('');

  const classQuery = useQuery({
    queryKey: queries.classDetail(classId),
    queryFn: () => suniTrainingApi.getClass(classId),
    enabled: Boolean(classId),
  });
  const grantsQuery = useQuery({
    queryKey: queries.instructorLessonGrants(`${classId}:${profile?.id || ''}`),
    queryFn: () => suniTrainingApi.listInstructorLessonGrants({ classId, profileId: profile?.id }),
    enabled: Boolean(classId && profile?.id),
    staleTime: 60 * 1000,
  });
  const canViewClass = Boolean(classQuery.data && (
    classQuery.data.instructorId === profile?.id || classQuery.data.instructorIds?.includes(profile?.id || '')
  ));
  const lessonPlanTopics = useMemo(
    () => normalizeClassLessonPlanTopics(classQuery.data?.metadata?.lessonPlanTopics),
    [classQuery.data?.metadata],
  );
  const topics = useMemo(() => buildInstructorClassLessonTopics({
    classId,
    profileId: profile?.id,
    email: profile?.email,
    grants: grantsQuery.data || [],
    lessonPlanTopics,
  }), [classId, grantsQuery.data, lessonPlanTopics, profile?.email, profile?.id]);
  const activeTopicId = useMemo(() => {
    try {
      return decodeURIComponent(planId || '');
    } catch {
      return planId || '';
    }
  }, [planId]);
  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === activeTopicId) || null,
    [activeTopicId, topics],
  );
  const activeElectronicPlanId = activeTopic ? inferElectronicLessonPlanId(activeTopic) : '';

  useEffect(() => {
    let cancelled = false;
    setLessonPlanHtml('');
    if (!activeTopic || !activeTopic.canView || !activeElectronicPlanId) return () => { cancelled = true; };
    void LESSON_HTML_LOADERS[activeElectronicPlanId]().then((module) => {
      if (!cancelled) setLessonPlanHtml(module.default);
    });
    return () => {
      cancelled = true;
    };
  }, [activeElectronicPlanId, activeTopic]);

  if (!classId) return <Navigate to="/vtraining/classes" replace />;
  if (classQuery.isLoading) return <div className="vdiscussion-empty">Đang tải nội dung giảng dạy...</div>;
  if (!classQuery.data) return <div className="vdiscussion-empty">Không tìm thấy lớp đào tạo.</div>;
  if (!canViewClass) {
    return <div className="vdiscussion-empty"><strong>Chưa được gán lớp này</strong><span>Liên hệ quản lý đào tạo để được gán quyền giảng viên.</span></div>;
  }
  if (planId && grantsQuery.isLoading) return <div className="vdiscussion-empty">Đang kiểm tra quyền xem chuyên đề...</div>;
  if (planId && !activeTopic) return <div className="vdiscussion-empty">Không tìm thấy chuyên đề trong lessonplan của lớp.</div>;
  if (activeTopic && !activeTopic.canView) {
    return <div className="vdiscussion-empty"><strong>Chưa được gán chuyên đề này</strong><span>{activeTopic.title}</span></div>;
  }
  if (activeTopic) {
    return (
      <div className="suni-native-page vtraining-class-lesson-page">
        <SectionHeader
          eye="VTraining"
          title={activeTopic.title}
          actions={<a className="btn btn-ghost btn-small" href={`/vtraining/classes/${classId}/giaoan`}>Danh sách chuyên đề</a>}
        />
        {activeElectronicPlanId ? (
          <iframe
            title={`Giáo án ${activeTopic.label}`}
            srcDoc={lessonPlanHtml}
            sandbox="allow-scripts allow-same-origin"
            className="vtraining-lesson-plan-frame"
          />
        ) : activeTopic.lessonUrl ? (
          <Card title="Giáo án điện tử">
            <a className="btn btn-primary" href={activeTopic.lessonUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} /> Mở giáo án
            </a>
          </Card>
        ) : (
          <div className="vdiscussion-empty">Chuyên đề này chưa có link giáo án điện tử.</div>
        )}
      </div>
    );
  }

  return (
    <div className="suni-native-page vtraining-class-lesson-page">
      <SectionHeader
        eye="VTraining"
        title={classQuery.data.name || classQuery.data.code || 'Nội dung giảng dạy'}
      />

      <Card
        title="Lessonplan theo chuyên đề"
        action={<Badge tone="success"><Unlock size={13} /> {topics.filter((topic) => topic.canView).length}/{topics.length} được xem</Badge>}
      >
        <div className="vtraining-class-topic-list">
          {topics.map((topic) => <TopicRow key={topic.id} topic={topic} />)}
        </div>
      </Card>
    </div>
  );
}
