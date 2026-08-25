import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { ROLE_META, normalizeAppRole, type PageKey } from '@/data/vcontent';
import { useAuth } from '@/contexts/AuthContext';
import { formatAssignmentNotificationTitle, isAssignmentNotification } from '@/lib/notificationText';
import { listNotifications, markAllNotificationsRead, markNotificationRead, type NotificationRow } from '@/services/vcontent';

function setNotificationReadInCache(queryClient: QueryClient, notificationId: string, readAt: string) {
  queryClient.setQueriesData({ queryKey: ['notifications'] }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    return current.map((item) =>
      item && typeof item === 'object' && (item as NotificationRow).id === notificationId
        ? { ...item, read_at: readAt }
        : item,
    );
  });
}

function setAllNotificationsReadInCache(queryClient: QueryClient, readAt: string) {
  queryClient.setQueriesData({ queryKey: ['notifications'] }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    return current.map((item) => (item && typeof item === 'object' ? { ...item, read_at: (item as NotificationRow).read_at || readAt } : item));
  });
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getDisplayProductCodeFromId(productId: string, orderId: string) {
  const rawProductId = String(productId || '').trim();
  const rawOrderId = String(orderId || '').trim();
  const code =
    rawOrderId && rawProductId.toLowerCase().startsWith(`${rawOrderId.toLowerCase()}-`)
      ? rawProductId.slice(rawOrderId.length + 1)
      : rawProductId;
  return code
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function formatTopbarNotification(item: NotificationRow) {
  if (!isAssignmentNotification(item)) return { title: item.title, body: item.body };
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const productName = String(metadata.display_product_code || getDisplayProductCodeFromId(String(metadata.product_id || ''), String(metadata.order_id || '')) || '').trim();
  return {
    title: formatAssignmentNotificationTitle(item),
    body: productName ? `Thuộc sản phẩm ${productName}. Vui lòng kiểm tra.` : 'Vui lòng kiểm tra công việc được giao.',
  };
}

export function TopBar({ currentPage: _currentPage, title }: { currentPage: PageKey; title: string }) {
  const fallbackRole = 'admin';
  const { profile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'topbar', profile?.id || profile?.authUserId || 'anonymous'],
    queryFn: listNotifications,
    enabled: Boolean(profile?.id || profile?.authUserId),
    staleTime: 1000 * 30,
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (notificationId) => {
      setNotificationReadInCache(queryClient, notificationId, new Date().toISOString());
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      setAllNotificationsReadInCache(queryClient, new Date().toISOString());
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  function handleToggleNotifications() {
    setNotificationsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen && unreadCount && !markAllReadMutation.isPending) {
        markAllReadMutation.mutate();
      }
      return nextOpen;
    });
  }
  const effectiveRole = profile?.role ? normalizeAppRole(profile.role) : normalizeAppRole(fallbackRole);
  const displayName = profile?.fullName || 'T\u00e0i kho\u1ea3n';
  const displayTitle = _currentPage === 'profile' ? 'H\u1ed3 s\u01a1 c\u00e1 nh\u00e2n' : title;
  const profileLabel = 'H\u1ed3 s\u01a1 c\u00e1 nh\u00e2n';
  const signOutLabel = '\u0110\u0103ng xu\u1ea5t';
  const allNotifications = (notificationsQuery.data as NotificationRow[] | undefined) || [];
  const notifications = allNotifications.slice(0, 8);
  const unreadCount = allNotifications.filter((item) => !item.read_at).length || 0;

  useEffect(() => {
    if (!notificationsOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!notificationRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setNotificationsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen]);

  return (
    <header className="topbar">
      <div>
        <div className="topbar-eyebrow">PeopleOne / {displayTitle}</div>
        <h1 className="topbar-title">{displayTitle}</h1>
      </div>
      <div className="topbar-actions">
        <div className="topbar-control-cluster">
          <div className="topbar-notice-wrap" ref={notificationRef}>
            <button
              className="btn btn-ghost topbar-notice-link"
              type="button"
              aria-label="Thông báo"
              aria-expanded={notificationsOpen}
              onClick={handleToggleNotifications}
            >
              <Bell size={16} aria-hidden="true" />
              {unreadCount ? <span className="topbar-notice-count">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="topbar-notification-popover" role="dialog" aria-label="Thông báo hệ thống">
                <div className="topbar-notification-head">
                  <div>
                    <div className="topbar-notification-eyebrow">Thông báo</div>
                    <strong>Thông báo hệ thống</strong>
                  </div>
                  <button
                    className="topbar-notification-mark"
                    type="button"
                    onClick={() => markAllReadMutation.mutate()}
                    disabled={!unreadCount || markAllReadMutation.isPending}
                    title="Đánh dấu tất cả đã đọc"
                    aria-label="Đánh dấu tất cả đã đọc"
                  >
                    <CheckCheck size={16} />
                  </button>
                </div>
                <div className="topbar-notification-list">
                  {notificationsQuery.isLoading ? (
                    <div className="topbar-notification-empty">Đang tải thông báo...</div>
                  ) : notifications.length ? notifications.map((item) => {
                    const page = (item.link_page || 'notifications') as PageKey;
                    const displayNotice = formatTopbarNotification(item);
                    return (
                      <div className={`topbar-notification-item${item.read_at ? '' : ' unread'}`} key={item.id}>
                        <div className="topbar-notification-main">
                          <strong>{displayNotice.title}</strong>
                          <p>{displayNotice.body}</p>
                          <span>{item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '-'}</span>
                        </div>
                        <Link
                          className="btn btn-ghost btn-small"
                          to={`/${page}`}
                          onClick={() => {
                            if (!item.read_at) markReadMutation.mutate(item.id);
                            setNotificationsOpen(false);
                          }}
                        >
                          Mở
                        </Link>
                      </div>
                    );
                  }) : (
                    <div className="topbar-notification-empty">Chưa có thông báo mới.</div>
                  )}
                </div>
                <Link className="topbar-notification-footer" to="/notifications" onClick={() => setNotificationsOpen(false)}>
                  Xem tất cả thông báo
                </Link>
              </div>
            ) : null}
          </div>
          <button className="btn btn-ghost topbar-signout" type="button" onClick={() => void signOut()}>
            {signOutLabel}
          </button>
        </div>
        <Link className="topbar-avatar" to="/profile" aria-label={profileLabel}>
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt={displayName} className="topbar-avatar-image" />
          ) : (
            <span>{getInitials(displayName || ROLE_META[effectiveRole].label)}</span>
          )}
        </Link>
      </div>
    </header>
  );
}
