export type GameCatalogEmbedMode = 'vendor' | 'iframe';
export type GameCatalogResultMode = 'realtime' | 'session';

export type GameCatalogStatus = 'draft' | 'ready' | 'published';

export type GameCatalogSummary = {
  plays: number;
  passRate: number;
  averageScore: number;
  lastRunAt: string;
};

export type GameCatalogEntry = {
  id: string;
  title: string;
  projectName: string;
  description: string;
  owner: string;
  status: GameCatalogStatus;
  version: string;
  publicSlug: string;
  publicEmbedMode: GameCatalogEmbedMode;
  publicEmbedUrl: string;
  resultMode: GameCatalogResultMode;
  notes: string;
  summary: GameCatalogSummary;
};

const GAME_CATALOG_STORAGE_KEY = 'vcontent.game-catalog.v1';

const DEFAULT_GAME_CATALOG: GameCatalogEntry[] = [
  {
    id: 'plx-01',
    title: 'PLX-01',
    projectName: 'Game PLX 01',
    description: 'Ban game dau tien cua nhom PLX, dung de host public va test flow nhung san pham tu project game plx 01.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'plx-01',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/plx-01/index.html?audio=20260514-ios-strong&cup=20260515-top1',
    resultMode: 'realtime',
    notes: 'Ban public hien tai chay bang embed local. Co the doi sang iframe khi co URL build tu project game plx 01.',
    summary: {
      plays: 128,
      passRate: 91,
      averageScore: 84,
      lastRunAt: '2026-04-23 09:30',
    },
  },
  {
    id: 'plx-01-ca-nhan',
    title: 'PLX-01 Cá nhân',
    projectName: 'Game PLX 01 Cá nhân',
    description: 'Ban ca nhan cua PLX-01, bo thiet lap nhom va ghi nhan ket qua theo tung hoc vien.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'plx-01-ca-nhan',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/plx-01-ca-nhan/index.html?audio=20260514-ios-strong&cup=20260515-top1&fb=20260610-mobile',
    resultMode: 'realtime',
    notes: 'Ban public ca nhan chay bang embed local, dung flow login va ranking theo hoc vien.',
    summary: {
      plays: 0,
      passRate: 0,
      averageScore: 0,
      lastRunAt: '-',
    },
  },
  {
    id: 'plx-02',
    title: 'PLX-02',
    projectName: 'Game PLX 02',
    description: 'Game so 2 trong catalog, dung lam ban mo rong sau khi PLX-01 san sang.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'plx-02',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/plx-02/index.html?ui=20260514-audio&audio=20260514-ios-strong&fb=20260610-mobile',
    resultMode: 'realtime',
    notes: 'Ban public chay bang embed local, dung chung flow login va ranking PLX.',
    summary: {
      plays: 0,
      passRate: 0,
      averageScore: 0,
      lastRunAt: '-',
    },
  },
  {
    id: 'plx-03',
    title: 'PLX-03',
    projectName: 'Game PLX 03',
    description: 'Ban du phong cho nhom PLX, de sap xep pipeline host ve sau.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'plx-03',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/plx-03/index.html?ui=20260514-audio&audio=20260514-ios-strong&fb=20260610-mobile-logo',
    resultMode: 'realtime',
    notes: 'Ban public chay bang embed local, dung chung flow login va ranking PLX.',
    summary: {
      plays: 0,
      passRate: 0,
      averageScore: 0,
      lastRunAt: '-',
    },
  },
  {
    id: 'vnpt-heart-01',
    title: 'VNPT HEART 01',
    projectName: 'VNPT HEART WS2',
    description: 'Game ca nhan ve 5 gia tri HEART, chuan muc hanh vi va ra quyet dinh trong tinh huong quan tri thuc te.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'vnpt-heart-01',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/vnpt-heart-01/index.html',
    resultMode: 'realtime',
    notes: 'Nguon build tu Project content/game/game vnpt/game 1. Game chay tinh huong ca nhan, co diem va leaderboard demo trong HTML.',
    summary: {
      plays: 0,
      passRate: 0,
      averageScore: 0,
      lastRunAt: '-',
    },
  },
  {
    id: 'vnpt-heart-02',
    title: 'VNPT HEART 02',
    projectName: 'Kiến trúc sư Văn hóa',
    description: 'Game doi ve 8 diem cham quan tri, thuc hanh chan doan va thiet ke hanh vi chuyen hoa van hoa.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'vnpt-heart-02',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/vnpt-heart-02/index.html',
    resultMode: 'realtime',
    notes: 'Nguon build tu Project content/game/game vnpt/game 2. Game chay theo doi, 8 tinh huong x 4 vong, co diem va leaderboard demo trong HTML.',
    summary: {
      plays: 0,
      passRate: 0,
      averageScore: 0,
      lastRunAt: '-',
    },
  },
  {
    id: 'vnpt-heart-03',
    title: 'VNPT HEART 03',
    projectName: 'Người ra quyết định VNPT',
    description: 'Game ra quyet dinh quan tri, cho hoc vien trai nghiem he qua cua tung lua chon trong 5 tinh huong kho.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'vnpt-heart-03',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/vnpt-heart-03/index.html',
    resultMode: 'realtime',
    notes: 'Nguon build tu Project content/game/game vnpt/game 3. Game ca nhan hoac doi, 5 tinh huong quyet dinh, co diem va leaderboard demo trong HTML.',
    summary: {
      plays: 0,
      passRate: 0,
      averageScore: 0,
      lastRunAt: '-',
    },
  },
  {
    id: 'evnspc-tnkh-01',
    title: 'EVNSPC TNKH 01',
    projectName: 'Điều hành & TNKH · Ca trực Trưởng Điện lực',
    description: 'Game nhóm gồm 8 tình huống điều hành thực tế của EVNSPC, cho thấy mỗi lựa chọn tác động ngay đến TNKH, thời gian xử lý và tải đội ngũ.',
    owner: 'PM gamification',
    status: 'ready',
    version: 'v1.0.0',
    publicSlug: 'evnspc-tnkh-01',
    publicEmbedMode: 'iframe',
    publicEmbedUrl: '/games/evnspc-tnkh-01/index.html',
    resultMode: 'realtime',
    notes: [
      'Nguồn game: project content/vgamification/dieu-hanh-tnkh.jsx.',
      "Mở đầu (3'): Chiếu màn intro, giải thích luật chơi — mỗi lựa chọn đẩy TNKH lên hoặc xuống ngay trước mắt, và các tình huống là điểm đau có thật của EVNSPC. Chia lớp thành các nhóm 6–8 học viên, mỗi nhóm một máy, đặt tên nhóm.",
      "Chơi (18'): Các nhóm tự chơi lần lượt 8 tình huống (~2 phút/tình huống gồm cả bàn bạc). Nhắc học viên đọc kỹ phản hồi sau mỗi lựa chọn — đó là nơi con số khảo sát xuất hiện. Nếu chơi lần lượt trên một máy chiếu chung, mỗi nhóm cử một người quyết định, cả lớp cùng thấy chỉ số đổi màu.",
      "Đúc kết (9'): Mở màn kết của 1–2 nhóm, dùng ngay bảng “Những chỗ cơ chế thắng sự vụ” làm chất liệu. Chốt quy luật lặp lại trong game: chủ động báo trước, chốt một đầu mối, đưa việc vào nhịp giao ban — gần như luôn làm TNKH tăng mà không tăng tải. Kết bằng thông điệp đỏ ở cuối màn: 10/10 điểm đau lớn nhất là hành vi & giao tiếp, nằm trong tầm quyết định điều hành của chính học viên.",
      'Vận hành nhiều nhóm: Bảng xếp hạng lưu realtime theo lớp/hoạt động khi game được gán vào VTraining. Nếu nhiều nhóm chơi lần lượt trên cùng một máy, dùng nút “Lượt mới” để đổi tên; mỗi lượt hoàn tất sẽ được lưu thành một kết quả trong rank chung của lớp. Nếu mỗi nhóm một máy riêng thì bảng rank vẫn gom theo cùng activity của lớp.',
      'Hiệu chỉnh điểm: Một ván theo cơ chế về quanh 95+; một ván thiên về sự vụ tụt dưới 60. Có thể điều chỉnh biên độ sau khi chạy thử thực tế.',
    ].join('\n\n'),
    summary: {
      plays: 0,
      passRate: 0,
      averageScore: 0,
      lastRunAt: '-',
    },
  },
];

function isBrowser() {
  return typeof window !== 'undefined';
}

function normalizeSummary(summary?: Partial<GameCatalogSummary> | null): GameCatalogSummary {
  return {
    plays: Math.max(0, Number(summary?.plays) || 0),
    passRate: Math.max(0, Math.min(100, Number(summary?.passRate) || 0)),
    averageScore: Math.max(0, Math.min(100, Number(summary?.averageScore) || 0)),
    lastRunAt: String(summary?.lastRunAt || '-'),
  };
}

export function buildGamePublicUrl(gameId: string) {
  const safeId = encodeURIComponent(gameId);
  if (!isBrowser()) return `/play/${safeId}`;
  return `${window.location.origin}/play/${safeId}`;
}

export function getDefaultGameCatalog() {
  return DEFAULT_GAME_CATALOG.map((entry) => ({ ...entry, summary: normalizeSummary(entry.summary) }));
}

export function normalizeGameCatalogEntry(entry: GameCatalogEntry): GameCatalogEntry {
  return {
    ...entry,
    id: String(entry.id || '').trim(),
    title: String(entry.title || '').trim(),
    projectName: String(entry.projectName || '').trim(),
    description: String(entry.description || '').trim(),
    owner: String(entry.owner || '').trim(),
    status: entry.status || 'draft',
    version: String(entry.version || '').trim() || 'v1.0.0',
    publicSlug: String(entry.publicSlug || entry.id || '').trim(),
    publicEmbedMode: entry.publicEmbedMode === 'iframe' ? 'iframe' : 'vendor',
    publicEmbedUrl: String(entry.publicEmbedUrl || '').trim(),
    resultMode: entry.resultMode === 'session' ? 'session' : 'realtime',
    notes: String(entry.notes || '').trim(),
    summary: normalizeSummary(entry.summary),
  };
}

const PLX_FEEDBACK_CACHE_KEYS: Record<string, string> = {
  'plx-01-ca-nhan': 'fb=20260610-mobile',
  'plx-02': 'fb=20260610-mobile',
  'plx-03': 'fb=20260610-mobile-logo',
};

function shouldRefreshDefaultPublicUrl(storedEntry: GameCatalogEntry, defaultEntry: GameCatalogEntry) {
  if (!storedEntry.publicEmbedUrl && defaultEntry.publicEmbedUrl) return true;
  const expectedCacheKey = PLX_FEEDBACK_CACHE_KEYS[defaultEntry.id];
  if (!expectedCacheKey) return false;

  const [storedPath] = storedEntry.publicEmbedUrl.split('?');
  const [defaultPath] = defaultEntry.publicEmbedUrl.split('?');
  return storedPath === defaultPath && !storedEntry.publicEmbedUrl.includes(expectedCacheKey);
}

export function loadGameCatalog() {
  if (!isBrowser()) return getDefaultGameCatalog();

  try {
    const raw = window.localStorage.getItem(GAME_CATALOG_STORAGE_KEY);
    if (!raw) return getDefaultGameCatalog();

    const parsed = JSON.parse(raw) as GameCatalogEntry[];
    const normalized = Array.isArray(parsed) ? parsed.map(normalizeGameCatalogEntry).filter((entry) => entry.id) : [];
    if (!normalized.length) return getDefaultGameCatalog();

    const byId = new Map(normalized.map((entry) => [entry.id, entry]));
    return getDefaultGameCatalog().map((defaultEntry) => {
      const storedEntry = byId.get(defaultEntry.id);
      if (!storedEntry) return defaultEntry;

      const shouldUseDefaultPublicUrl = shouldRefreshDefaultPublicUrl(storedEntry, defaultEntry);
      return {
        ...storedEntry,
        status: shouldUseDefaultPublicUrl && defaultEntry.status === 'ready' ? defaultEntry.status : storedEntry.status,
        version: shouldUseDefaultPublicUrl ? defaultEntry.version : storedEntry.version,
        publicEmbedUrl: shouldUseDefaultPublicUrl ? defaultEntry.publicEmbedUrl : storedEntry.publicEmbedUrl,
        notes: shouldUseDefaultPublicUrl && !storedEntry.notes ? defaultEntry.notes : storedEntry.notes,
        summary: normalizeSummary(storedEntry.summary),
      };
    });
  } catch {
    return getDefaultGameCatalog();
  }
}

export function saveGameCatalog(entries: GameCatalogEntry[]) {
  if (!isBrowser()) return;
  const normalized = entries.map(normalizeGameCatalogEntry);
  window.localStorage.setItem(GAME_CATALOG_STORAGE_KEY, JSON.stringify(normalized));
}

export function getGameCatalogEntry(gameId: string | null | undefined, entries?: GameCatalogEntry[]) {
  const catalog = entries || loadGameCatalog();
  const normalizedId = String(gameId || '').trim().toLowerCase();
  return catalog.find((entry) => entry.id.toLowerCase() === normalizedId || entry.publicSlug.toLowerCase() === normalizedId) || null;
}
