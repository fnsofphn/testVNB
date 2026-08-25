import { BookOpen, CalendarRange, ClipboardList, FileSpreadsheet, GraduationCap, Library, Users } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

const adminNavItems = [
  { layer: 'library', label: 'Thư viện', icon: Library },
  { layer: 'lesson', label: 'Tạo bài giảng', icon: BookOpen },
  { layer: 'course', label: 'Tạo khóa học', icon: GraduationCap },
  { layer: 'class', label: 'Tạo lớp học', icon: Users },
  { layer: 'deployment', label: 'Tạo đợt học', icon: CalendarRange },
  { layer: 'quiz', label: 'Đề kiểm tra E-learning', icon: ClipboardList },
  { layer: 'reports', label: 'Thống kê kết quả học', icon: FileSpreadsheet },
];

export function VLearningAdminNav() {
  const location = useLocation();
  const currentLayer = new URLSearchParams(location.search).get('layer') || 'library';

  return (
    <nav className="elearning-layer-nav" aria-label="Điều hướng quản trị VLearning">
      {adminNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.layer === 'library'
          ? location.pathname === '/vlearning'
          : location.pathname === '/vlearning/admin' && currentLayer === item.layer;
        return (
          <NavLink className={isActive ? 'is-active' : ''} key={item.layer} to={item.layer === 'library' ? '/vlearning' : `/vlearning/admin?layer=${item.layer}`}>
            <Icon size={16} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
