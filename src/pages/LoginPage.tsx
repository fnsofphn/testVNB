import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, BrainCircuit, BriefcaseBusiness, Check, ClipboardList, Gamepad2, GraduationCap, LifeBuoy, Lock, MessageCircle, Radio, Sparkles, User, Wrench, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppSplash } from '@/components/system/AppSplash';
import { useToast } from '@/components/system/ToastProvider';
import { MotionSurface } from '@/components/ui/MotionSurface';
import { normalizeAppRole } from '@/data/vcontent';
import { getLearningLoginQueueDelayMs } from '@/lib/authLoginQueue';
import { getRumDurationMs, getRumStartedAt, reportVLearningRum } from '@/lib/rum';

const ECOSYSTEM_PRODUCT_ORDER = new Map(
  ['V-training', 'V-learning', 'V-content', 'V-Work', 'V-events', 'V-discussion'].map((name, index) => [name, index]),
);

const ecosystemProducts: Array<{
  name: string;
  label: string;
  description: string;
  href: string;
  Icon: LucideIcon;
  bridge?: boolean;
  external?: boolean;
}> = [
  {
    name: 'V-content',
    label: 'Sản xuất nội dung',
    description: 'Quản trị intake, storyboard, thiết kế, voice, video, SCORM và bàn giao.',
    href: '/vcontent',
    Icon: Sparkles,
  },
  {
    name: 'V-Work',
    label: 'Giao việc & đề xuất',
    description: 'Điều phối giao việc, đề xuất, phê duyệt và theo dõi tiến độ liên phòng ban.',
    href: '/vwork',
    Icon: ClipboardList,
  },
  {
    name: 'V-training',
    label: 'Vận hành đào tạo',
    description: 'Điều phối chương trình, lớp, giảng viên và hoạt động triển khai.',
    href: '/vtraining',
    Icon: GraduationCap,
  },
  {
    name: 'V-discussion',
    label: 'Thảo luận tương tác',
    description: 'Tổ chức thảo luận nhóm, sự kiện tương tác, chấm điểm và tổng hợp kết quả.',
    href: '/vdiscussion',
    Icon: MessageCircle,
  },
  {
    name: 'V-events',
    label: 'Live interaction',
    description: 'Tạo phiên tương tác realtime kiểu Mentimeter, học viên vào bằng mã, QR hoặc link.',
    href: '/v-events',
    Icon: Radio,
  },
  {
    name: 'V-Suite',
    label: 'Điều hành đào tạo end-to-end',
    description: 'Quản lý hợp đồng, chương trình, lớp, checklist, nhân sự, hậu cần, LMS, chi phí và nghiệm thu.',
    href: '/v-suite',
    Icon: ClipboardList,
  },
  {
    name: 'V-business',
    label: 'Quản trị kinh doanh',
    description: 'CRM, pipeline, báo giá, thầu, hợp đồng, tài chính, dự án và nhân sự.',
    href: '/vbusiness',
    Icon: BriefcaseBusiness,
    external: true,
  },
  {
    name: 'V-learning',
    label: 'Học tập số',
    description: 'Tổ chức khóa học, lớp học, học viên, bài học và tiến độ học tập.',
    href: '/vlearning',
    Icon: BookOpen,
  },
  {
    name: 'V-culture',
    label: '',
    description: 'Không gian triển khai working principles, workshop, coaching và tài liệu văn hóa.',
    href: '/vculture',
    Icon: BrainCircuit,
  },
  {
    name: 'V-gamification',
    label: 'Game hóa đào tạo',
    description: 'Triển khai game, leaderboard, nhiệm vụ và trải nghiệm tương tác.',
    href: '/v-gamification',
    Icon: Gamepad2,
  },
  {
    name: 'V-coaching',
    label: 'Coaching & mentoring',
    description: 'Theo dõi hành trình phát triển năng lực sau chương trình.',
    href: '/vcoaching',
    Icon: BrainCircuit,
  },
  {
    name: 'V-survey',
    label: 'Khảo sát & đánh giá',
    description: 'Tạo link khảo sát, thu phản hồi public và tổng hợp dữ liệu.',
    href: '/v-survey',
    Icon: ClipboardList,
  },
  {
    name: 'V-tools',
    label: 'Tiện ích AI',
    description: 'Turbo transcript, chuyển định dạng file và tạo ảnh qua worker nội bộ.',
    href: '/v-tools',
    Icon: Wrench,
  },
  {
    name: 'V-helpdesk',
    label: 'Hỗ trợ học viên',
    description: 'Tiếp nhận và xử lý yêu cầu hỗ trợ cho khảo sát, e-learning và lớp học trực tiếp.',
    href: '/v-helpdesk',
    Icon: LifeBuoy,
  },
].sort(
  (left, right) =>
    (ECOSYSTEM_PRODUCT_ORDER.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
    (ECOSYSTEM_PRODUCT_ORDER.get(right.name) ?? Number.MAX_SAFE_INTEGER),
);

const heroImageUrl = '/assets/vinabrain-ai.jpg';
const cultureImageUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuApkcu7zMYBQ0wmABKCUyYK1sFKZ1tJXB2Phnhiiz2RIQWaYKX8LMpMTB4XkeQPFO6YeExMthsB1QtV3EEny8DYEhcKiM0X7Ftm7_szYFQB0vacSBR9ix7o577ozsgNAv90o4qQcoSpXVPvNZv2O9G0czThfsTao2uczS8R4JNWWe0Z7PqwQ0a3pIYOS9mk-dQfmurMQ6JqudTp4dYAbRhMxsTthX-6dmQaZbShrw1A90iOnepktO69my2VQr9an3oyWMN6Ylc3Seo';
const brandIconUrl = '/vinabrain-logo-transparent.png';
const STUDENT_ALLOWED_PRODUCTS = new Set(['V-training', 'V-coaching', 'V-learning', 'V-discussion']);
const ADMIN_ACCESS_REQUIRED_MESSAGE = 'Bạn cần có quyền quản trị để truy cập nội dung này';
const LOGIN_PENDING_MESSAGE = 'Đang đăng nhập, vui lòng chờ giây lát.';

function VinabrainBrandMark() {
  return (
    <span className="login-brand-mark" aria-hidden="true">
      <img src={brandIconUrl} alt="" />
    </span>
  );
}

function LoginFooter() {
  return (
    <footer className="login-footer">
      <div className="login-section-inner">
        <strong>Vinabrain</strong>
        <span>© 2026 Vinabrain. All rights reserved.</span>
      </div>
    </footer>
  );
}

function persistVUniversitySession(token: string, user?: unknown) {
  if (typeof window === 'undefined' || !token) return;

  window.localStorage.setItem(
    'account-store',
    JSON.stringify({
      state: {
        profile: {},
        autoRoutingToken: { token: null, expiredAt: null },
        isLoggedIn: true,
        token,
      },
      version: 0,
    }),
  );

  window.sessionStorage.setItem('auth_token', token);
  window.sessionStorage.setItem(
    'user_data',
    JSON.stringify({
      state: {
        user: user || null,
        token,
        isAuthenticated: true,
      },
      version: 0,
    }),
  );
  window.sessionStorage.setItem(
    'user-storage',
    JSON.stringify({
      state: {
        user: user || null,
      },
      version: 0,
    }),
  );
}

async function signInVUniversityWithVinabrain(vinabrainAccessToken: string) {
  const response = await fetch('/vuni-api/sso/vinabrain', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'x-vinabrain-token': vinabrainAccessToken,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Không mở được VUniversity bằng phiên Vinabrain.');
  }

  const data = await response.json();
  const token = data?.access_token;
  if (!token) throw new Error('VUniversity không trả token.');
  persistVUniversitySession(token, data?.user);
  return token;
}

function clearVUniversitySession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('account-store');
  window.sessionStorage.removeItem('auth_token');
  window.sessionStorage.removeItem('refresh_token');
  window.sessionStorage.removeItem('user_data');
  window.sessionStorage.removeItem('user-storage');
}

function appendBridgeToken(href: string, token: string) {
  if (!token || typeof window === 'undefined') return href;
  const isSuniPath = href.startsWith('/vtraining') || href.startsWith('/vdiscussion');
  const isLocalHost = /^(localhost|127\.0\.0\.1|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(window.location.hostname);
  const localSuniOrigin = `${window.location.protocol}//${window.location.hostname}:4173`;
  const url = new URL(href, isSuniPath && isLocalHost ? localSuniOrigin : window.location.origin);
  url.searchParams.set('auth_token', token);
  return url.toString();
}

function getSafeNextPath(search: string) {
  const next = new URLSearchParams(search).get('next');
  if (!next) return null;

  try {
    if (!next.startsWith('/') || next.startsWith('//')) return null;
    if (next === '/' || next.startsWith('/login')) return null;
    return next;
  } catch {
    return null;
  }
}

function getLoginProductByPath(path: string | null) {
  if (!path) return null;
  return ecosystemProducts.find((item) => path === item.href || path.startsWith(`${item.href}/`)) || null;
}

function getLoginInitial(name: string) {
  return String(name || 'H').trim().charAt(0).toUpperCase() || 'H';
}

function isPeopleOneEmail(value: string | null | undefined) {
  const email = String(value || '').trim().toLowerCase();
  const domain = email.includes('@') ? email.split('@').pop() : '';
  return ['peopleone.com', 'peopleone.com.vn', 'peopleone.vn'].includes(domain || '');
}

function waitWithLoginCountdown(delayMs: number, onTick: (seconds: number | null) => void) {
  if (delayMs <= 0) return Promise.resolve();
  const startedAt = Date.now();
  onTick(Math.max(1, Math.ceil(delayMs / 1000)));
  return new Promise<void>((resolve) => {
    const interval = window.setInterval(() => {
      const remainingMs = Math.max(0, delayMs - (Date.now() - startedAt));
      onTick(remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 1000)) : null);
    }, 250);
    window.setTimeout(() => {
      window.clearInterval(interval);
      onTick(null);
      resolve();
    }, delayMs);
  });
}

function getLoginErrorMessage(error: unknown) {
  const fallback = 'Đăng nhập thất bại. Vui lòng thử lại.';
  if (!(error instanceof Error)) return fallback;

  const normalized = error.message.toLowerCase();
  if (normalized.includes('invalid login credentials') || normalized.includes('invalid credentials')) {
    return 'Sai email hoặc mật khẩu. Vui lòng kiểm tra lại.';
  }
  if (normalized.includes('user is banned') || normalized.includes('user banned')) {
    return 'Tài khoản đang bị khóa đăng nhập. Vui lòng liên hệ quản trị viên VWork để được mở lại.';
  }

  return error.message || fallback;
}

export function LoginPage() {
  const { loading, session, profile, signIn, signOut } = useAuth();
  const { pushToast } = useToast();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [loginQueueSeconds, setLoginQueueSeconds] = useState<number | null>(null);

  const isSignedIn = Boolean(session);
  const canEnterWorkspace = isSignedIn && Boolean(profile);
  const isLoginPending = submitting || Boolean(loginQueueSeconds);
  const displayName = profile?.fullName || session?.user.email || 'Tài khoản';
  const initials = getLoginInitial(displayName);
  const isPeopleOneUser = isPeopleOneEmail(profile?.email || session?.user.email);
  const nextPath = getSafeNextPath(location.search);
  const loginProduct = getLoginProductByPath(nextPath);
  const isStudentRole = normalizeAppRole(profile?.role) === 'hoc_vien';

  function canOpenProduct(name: string) {
    if (isPeopleOneUser && name === 'V-Work') return true;
    return !isStudentRole || STUDENT_ALLOWED_PRODUCTS.has(name);
  }

  function notifyAdminRequired() {
    pushToast({ title: ADMIN_ACCESS_REQUIRED_MESSAGE, tone: 'warning', durationMs: 3600 });
  }

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const rumStartedAt = getRumStartedAt();
    setSubmitting(true);
    setError(null);
    setLoginQueueSeconds(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const queueDelayMs = normalizedEmail === 'admin@vinabrain.com' ? 0 : getLearningLoginQueueDelayMs(normalizedEmail, nextPath);
      await waitWithLoginCountdown(queueDelayMs, setLoginQueueSeconds);
      await signIn(email, password);
      void reportVLearningRum('login', getRumDurationMs(rumStartedAt), { scopeType: 'global' });
      setAuthPanelOpen(false);
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoginQueueSeconds(null);
      setSubmitting(false);
    }
  };

  const handleBridgeOpen = async (href: string) => {
    setError(null);

    try {
      let bridgeToken = '';
      if (session?.access_token) {
        bridgeToken = await signInVUniversityWithVinabrain(session.access_token);
      }
      window.location.href = bridgeToken ? appendBridgeToken(href, bridgeToken) : href;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không mở được module.');
      setAuthPanelOpen(true);
    }
  };

  if (session && !profile) {
    return <AppSplash />;
  }

  if (loading) {
    return <AppSplash />;
  }

  if (canEnterWorkspace && nextPath && (!loginProduct || canOpenProduct(loginProduct.name))) {
    return <Navigate to={nextPath} replace />;
  }

  if (!canEnterWorkspace && loginProduct) {
    const ProductIcon = loginProduct.Icon;
    return (
      <div className="module-login-shell">
        <Link className="module-login-home" to="/" aria-label="Vinabrain home">
          <VinabrainBrandMark />
          <span>Vinabrain</span>
        </Link>
        <main className="module-login-main">
          <div className="module-login-icon">
            <ProductIcon size={38} strokeWidth={2.1} />
          </div>
          <h1>{loginProduct.name}</h1>
          {loginProduct.label ? <h2>{loginProduct.label}</h2> : null}
          <form className="module-login-card" onSubmit={handleLoginSubmit}>
            <label className="module-login-field">
              <span><User size={28} strokeWidth={2.1} /></span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="text"
                placeholder="Tên đăng nhập"
                autoComplete="username"
              />
            </label>
            <label className="module-login-field">
              <span><Lock size={26} strokeWidth={2.1} /></span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Mật khẩu"
                autoComplete="current-password"
              />
            </label>
            {error ? <div className="login-error">{error}</div> : null}
            {loginQueueSeconds ? (
              <div className="login-status-info">{LOGIN_PENDING_MESSAGE}</div>
            ) : null}
            <button className={`module-login-submit${isLoginPending ? ' is-login-pending' : ''}`} type="submit" disabled={loading || submitting}>
              {loginQueueSeconds ? 'Đang đăng nhập...' : submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </main>
        <LoginFooter />
      </div>
    );
  }

  return (
    <div className="login-shell">
      <header className="login-nav">
        <div className="login-nav-inner">
          <a className="login-brand-row" href="#home" aria-label="Vinabrain home">
            <VinabrainBrandMark />
            <span>
              <span className="login-brand-name">Vinabrain</span>
              <span className="login-brand-domain">vinabrain.com.vn</span>
            </span>
          </a>
          <nav className="login-nav-links" aria-label="Vinabrain sections">
            <a href="#ecosystem">Hệ sinh thái</a>
            <a href="#culture">Văn hóa số</a>
          </nav>
          <div className="login-auth-cluster">
            {canEnterWorkspace ? (
              <>
                <button className="login-account-pill" type="button" onClick={() => setAuthPanelOpen((value) => !value)}>
                  <span>{initials}</span>
                  <strong>{displayName}</strong>
                </button>
                {authPanelOpen ? (
                  <div className="login-auth-popover">
                    {error ? <div className="login-error">{error}</div> : null}
                    <a className="login-primary-action full-width" href="#ecosystem" onClick={() => setAuthPanelOpen(false)}>
                      Chọn nhanh
                    </a>
                    <button
                      className="login-secondary-action login-signout-action full-width"
                      type="button"
                      onClick={() => {
                        clearVUniversitySession();
                        setAuthPanelOpen(false);
                        void signOut();
                      }}
                    >
                      Đăng xuất
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <button className="login-nav-action" type="button" onClick={() => setAuthPanelOpen((value) => !value)}>
                  Đăng nhập
                </button>
                {authPanelOpen ? (
                  <form className="login-auth-popover form-grid" onSubmit={handleLoginSubmit}>
                    <label className="full">
                      <span>Email / Tên đăng nhập</span>
                      <input value={email} onChange={(event) => setEmail(event.target.value)} type="text" placeholder="you@company.com" />
                    </label>
                    <label className="full">
                      <span>Mật khẩu</span>
                      <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="******" />
                    </label>
                    {error ? <div className="login-error">{error}</div> : null}
                    {loginQueueSeconds ? (
                      <div className="login-status-info">{LOGIN_PENDING_MESSAGE}</div>
                    ) : null}
                    <button className={`btn full-width ${isLoginPending ? 'login-submit-pending' : 'btn-danger'}`} type="submit" disabled={loading || submitting}>
                      {loginQueueSeconds ? 'Đang đăng nhập...' : submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="login-landing" id="home" aria-label="Vinabrain ecosystem">
          <div className="login-hero">
            <MotionSurface className="login-hero-copy">
              <div className="section-eye">Learning Intelligence Ecosystem</div>
              <h1 className="section-title">
                <span className="login-title-line">Kiến tạo tương lai số,</span>
                <span className="login-title-line login-title-accent">lan tỏa văn hóa công&nbsp;nghệ</span>
              </h1>
              <p>
                <span>Vinabrain đồng hành cùng doanh nghiệp trong hành trình chuyển đổi số, vận hành đào tạo</span>
                <span>và xây dựng văn hóa làm việc hiện đại thông qua các giải pháp phần mềm thông&nbsp;minh.</span>
              </p>
            </MotionSurface>

            <MotionSurface className="login-hero-actions" delay={120}>
              <a className="login-primary-action" href="#ecosystem">Khám phá hệ sinh thái <ArrowRight size={18} /></a>
              <a className="login-secondary-action" href="#culture">Tìm hiểu thêm</a>
            </MotionSurface>
          </div>

          <MotionSurface className="login-hero-visual" delay={180}>
            <img src={heroImageUrl} alt="Không gian làm việc hiện đại với màn hình dữ liệu số" />
            <div className="login-hero-badge">
              <Sparkles size={18} />
              <span>Tiêu chuẩn quốc tế</span>
            </div>
          </MotionSurface>


        </section>

        <section className="login-ecosystem-section" id="ecosystem">
          <div className="login-section-inner">
            <MotionSurface className="login-section-heading">
              <h2>Hệ sinh thái phần mềm Vinabrain</h2>
              <div />
            </MotionSurface>
            <div className="login-product-grid">
            {ecosystemProducts.map(({ name, label, description, href, Icon, bridge, external }, index) => {
              const allowedProduct = canOpenProduct(name);
              const content = (
                <>
                <div className="login-product-icon"><Icon size={18} strokeWidth={2.2} /></div>
                <div>
                  <h2>{name}</h2>
                  <strong>{label}</strong>
                  <p>{description}</p>
                </div>
                {canEnterWorkspace ? <span className="login-product-cta">Vào module <ArrowRight size={16} /></span> : null}
                </>
              );
              if (canEnterWorkspace && !allowedProduct) {
                return (
                  <MotionSurface as="button" className="login-product-card" delay={index * 70} key={name} type="button" onClick={notifyAdminRequired}>
                    {content}
                  </MotionSurface>
                );
              }
              if (canEnterWorkspace && name === 'V-Work') {
                return (
                  <MotionSurface as="button" className="login-product-card" delay={index * 70} key={name} type="button" onClick={() => window.location.assign('/vwork')}>
                    {content}
                  </MotionSurface>
                );
              }
              return bridge ? (
                <MotionSurface as="button" className="login-product-card" delay={index * 70} key={name} type="button" onClick={() => void handleBridgeOpen(href)}>{content}</MotionSurface>
              ) : external ? (
                <MotionSurface as="a" className="login-product-card" delay={index * 70} key={name} href={href}>{content}</MotionSurface>
              ) : (
                <MotionSurface as={Link} className="login-product-card" delay={index * 70} key={name} to={href}>{content}</MotionSurface>
              );
            })}
            </div>
          </div>
        </section>

        <section className="login-culture-section" id="culture">
          <div className="login-section-inner login-culture-grid">
            <MotionSurface className="login-culture-image">
              <img src={cultureImageUrl} alt="Nhóm chuyên gia trao đổi trong phòng họp công nghệ" />
            </MotionSurface>
            <MotionSurface className="login-culture-copy" delay={120}>
              <h2>Văn hóa số và định hướng công nghệ</h2>
              <div className="login-heading-line" />
              <p>
                Vinabrain không chỉ xây dựng phần mềm; chúng tôi định hình cách con người tương tác với công nghệ.
                Mỗi module được thiết kế để tối giản vận hành, tăng minh bạch dữ liệu và giữ trải nghiệm người dùng làm trung tâm.
              </p>
              <ul>
                {['Tối giản hóa quy trình phức tạp.', 'Đề cao tính nhân bản trong kỷ nguyên máy móc.', 'Xây dựng niềm tin thông qua minh bạch dữ liệu.'].map((item) => (
                  <li key={item}><span><Check size={16} /></span>{item}</li>
                ))}
              </ul>
            </MotionSurface>
          </div>
        </section>
      </main>

      <LoginFooter />
    </div>
  );
}
