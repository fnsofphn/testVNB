import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, ExternalLink, Eye, PauseCircle, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminLikeRole } from '@/data/vcontent';
import {
  buildGamePublicUrl,
  getDefaultGameCatalog,
  getGameCatalogEntry,
  loadGameCatalog,
  normalizeGameCatalogEntry,
  saveGameCatalog,
  type GameCatalogEntry,
} from '@/lib/gameCatalog';
import {
  buildPlxLeaderboard,
  buildPlxPersonalLeaderboard,
  clearPlxGameSession,
  deletePlxGameParticipants,
  deletePlxGameRuns,
  listPlxGameRuns,
  type PlxGameRunRow,
} from '@/lib/plxGame';

type GameCatalogPageProps = {
  gameId: string | null;
};

type LiveState = 'idle' | 'loading' | 'live' | 'offline' | 'error';

function toneForStatus(status: GameCatalogEntry['status']) {
  if (status === 'published') return 'success';
  if (status === 'ready') return 'violet';
  return 'warning';
}

function labelForStatus(status: GameCatalogEntry['status']) {
  if (status === 'published') return 'Đang bật';
  if (status === 'ready') return 'Sẵn sàng';
  return 'Bản nháp';
}

function isPlxGameId(gameId: string | null | undefined) {
  return /^plx-\d+(?:-[a-z0-9-]+)?$/i.test(String(gameId || '').trim());
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function emptyEntry(entry: GameCatalogEntry): GameCatalogEntry {
  return normalizeGameCatalogEntry(entry);
}

function ResultMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="game-metric">
      <div className="game-metric-label">{label}</div>
      <div className="game-metric-value">{value}</div>
      <div className="game-metric-sub">{sub}</div>
    </div>
  );
}

export function GameCatalogPage({ gameId }: GameCatalogPageProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const refreshRunsRef = useRef<null | (() => Promise<void>)>(null);
  const [catalog, setCatalog] = useState<GameCatalogEntry[]>(() => loadGameCatalog());
  const [draft, setDraft] = useState<GameCatalogEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [runs, setRuns] = useState<PlxGameRunRow[]>([]);
  const [liveState, setLiveState] = useState<LiveState>('idle');
  const [isResetting, setIsResetting] = useState(false);
  const [isPreviewLoaded, setIsPreviewLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | GameCatalogEntry['status']>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const canEditCatalog = isAdminLikeRole(profile?.role);
  const canResetCatalogResults = canEditCatalog;

  useEffect(() => {
    saveGameCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    if (!catalog.length) setCatalog(getDefaultGameCatalog());
  }, [catalog.length]);

  const selected = useMemo(() => (gameId ? getGameCatalogEntry(gameId, catalog) || null : null), [catalog, gameId]);
  const selectedDraft = draft || (selected ? emptyEntry(selected) : null);
  const selectedIsPlxGame = isPlxGameId(selected?.id);
  const selectedIsPlxIndividualGame = selected?.id === 'plx-01-ca-nhan';
  const selectedUsesRealtimeResults = selectedIsPlxGame || selected?.resultMode !== 'session';
  const publicUrl = selected ? buildGamePublicUrl(selected.publicSlug || selected.id) : '';
  const publicRankUrl = selected ? `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}view=rank` : '';
  const personalLeaderboard = useMemo(() => buildPlxPersonalLeaderboard(runs), [runs]);
  const groupLeaderboard = useMemo(() => buildPlxLeaderboard(runs), [runs]);
  const resultStats = useMemo(() => {
    const totalRuns = runs.length;
    const uniquePlayers = new Set(runs.map((run) => String(run.player_name || '').trim()).filter(Boolean)).size;
    const averageScore = totalRuns ? Math.round(runs.reduce((sum, run) => sum + (Number(run.total_score) || 0), 0) / totalRuns) : 0;
    const latestRunAt = runs[0]?.created_at ? new Date(runs[0].created_at).toLocaleString('vi-VN') : '-';
    return { totalRuns, uniquePlayers, averageScore, latestRunAt };
  }, [runs]);
  const filteredCatalog = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return catalog.filter((entry) => {
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (!term) return true;
      return [entry.id, entry.title, entry.projectName, entry.owner, entry.publicSlug].some((value) =>
        String(value || '').toLowerCase().includes(term),
      );
    });
  }, [catalog, searchTerm, statusFilter]);

  useEffect(() => {
    if (!selected) {
      setNotice(null);
      setDraft(null);
      setIsEditing(false);
      setRuns([]);
      setLiveState('idle');
      return;
    }
    setNotice(null);
    setDraft(emptyEntry(selected));
    setIsEditing(false);
    setIsPreviewLoaded(false);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id) return undefined;
    if (!selectedUsesRealtimeResults) {
      refreshRunsRef.current = null;
      setRuns([]);
      setLiveState('idle');
      return undefined;
    }

    let cancelled = false;
    const refreshRuns = async () => {
      try {
        if (!cancelled) setLiveState('loading');
        const rows = await listPlxGameRuns(selected.id);
        if (!cancelled) {
          setRuns(rows);
          setLiveState('live');
        }
      } catch (error) {
        console.warn('Failed to load game runs', error);
        if (!cancelled) setLiveState('error');
      }
    };

    refreshRunsRef.current = refreshRuns;
    void refreshRuns();

    const polling = window.setInterval(() => void refreshRuns(), 15000);

    return () => {
      cancelled = true;
      refreshRunsRef.current = null;
      window.clearInterval(polling);
    };
  }, [selected?.id, selectedUsesRealtimeResults]);

  useEffect(() => {
    if (!selected?.id || !selectedUsesRealtimeResults) return undefined;

    const selectedGameId = selected.id;
    const onResultMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; gameId?: string } | null;
      if (!data || !['plx-result-ready', 'game-result-ready'].includes(String(data.type)) || data.gameId !== selectedGameId) return;
      void refreshRunsRef.current?.();
    };

    const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${selectedGameId}-results`) : null;
    const onBroadcast = (event: MessageEvent) => {
      const data = event.data as { type?: string; gameId?: string } | null;
      if (!data || !['plx-result-ready', 'game-result-ready'].includes(String(data.type)) || data.gameId !== selectedGameId) return;
      void refreshRunsRef.current?.();
    };

    window.addEventListener('message', onResultMessage);
    broadcast?.addEventListener('message', onBroadcast);

    return () => {
      window.removeEventListener('message', onResultMessage);
      broadcast?.removeEventListener('message', onBroadcast);
      broadcast?.close();
    };
  }, [selected?.id, selectedUsesRealtimeResults]);

  const updateDraft = (patch: Partial<GameCatalogEntry>) => {
    setDraft((current) => (current ? normalizeGameCatalogEntry({ ...current, ...patch }) : current));
  };

  const commitDraft = () => {
    if (!canEditCatalog) {
      setNotice('Tài khoản này chỉ được vận hành kết quả, không được sửa nội dung game.');
      setIsEditing(false);
      return;
    }
    if (!selectedDraft) return;
    setCatalog((current) => current.map((entry) => (entry.id === selectedDraft.id ? normalizeGameCatalogEntry(selectedDraft) : entry)));
    setNotice(`Đã cập nhật ${selectedDraft.id}.`);
    setIsEditing(false);
  };

  const copyLink = async (entry: GameCatalogEntry) => {
    const link = buildGamePublicUrl(entry.publicSlug || entry.id);
    try {
      await navigator.clipboard.writeText(link);
      setNotice(`Đã copy link ${entry.id}.`);
    } catch {
      setNotice(`Link ${entry.id}: ${link}`);
    }
  };

  const toggleEntryStatus = (entry: GameCatalogEntry) => {
    if (!canEditCatalog) {
      setNotice('Tài khoản này không có quyền bật hoặc tắt phát hành game.');
      return;
    }
    const nextStatus: GameCatalogEntry['status'] = entry.status === 'published' ? 'ready' : 'published';
    setCatalog((current) => current.map((item) => (item.id === entry.id ? normalizeGameCatalogEntry({ ...item, status: nextStatus }) : item)));
    setNotice(`${entry.id} chuyển sang ${labelForStatus(nextStatus)}.`);
  };

  const resetEntryResults = async (entry: GameCatalogEntry) => {
    if (!canResetCatalogResults) {
      setNotice('Reset toàn cục chỉ dành cho quản trị nội dung; quản trị đào tạo phải reset trong đúng lớp.');
      return;
    }
    if (isResetting) return;
    if (entry.resultMode === 'session') {
      setNotice('Game này giữ bảng xếp hạng trong phiên chơi; dùng “Lượt mới” trong game hoặc tải lại trang để bắt đầu bảng mới.');
      return;
    }
    const confirmed = window.confirm(`Xóa toàn bộ kết quả đã ghi của ${entry.id.toUpperCase()}?`);
    if (!confirmed) return;

    setIsResetting(true);
    try {
      await deletePlxGameRuns(entry.id);
      if (isPlxGameId(entry.id)) {
        await deletePlxGameParticipants(entry.id);
        clearPlxGameSession(entry.id);
      }
      if (selected?.id === entry.id) setRuns([]);
      setNotice(`Đã reset kết quả ${entry.id}.`);
    } catch (error) {
      console.error('Failed to reset game results', error);
      setNotice(`Không thể reset kết quả ${entry.id}. Kiểm tra quyền delete trên Supabase.`);
    } finally {
      setIsResetting(false);
    }
  };

  const selectGame = (entry: GameCatalogEntry) => {
    setNotice(null);
    setIsEditing(false);
    setIsPreviewLoaded(false);
    setDraft(emptyEntry(entry));
    navigate(`/v-gamification/${entry.id}`);
  };

  const goToCatalog = () => {
    setNotice(null);
    setIsEditing(false);
    setDraft(null);
    navigate('/v-gamification');
  };

  return (
    <>
      <SectionHeader
        eye="V-gamification"
        title="V-gamification"
        subtitle="Quản lý game, phát hành link public và theo dõi kết quả theo đúng chế độ vận hành của từng game."
      />

      <div className="vsurvey-brand-panel vgamification-brand-panel">
        <div className="vsurvey-brand-lockup">
          <div className="vgamification-brand-logo">VG</div>
          <div>
            <strong>V-gamification</strong>
            <span>Bảng điều khiển game, link public và kết quả tổng hợp trong hệ sinh thái Vinabrain.</span>
          </div>
        </div>
      </div>

      <div className="vsurvey-module-layout vgamification-module-layout">
        <aside className="vsurvey-sidebar">
          <button className={!selected ? 'is-active' : ''} type="button" onClick={goToCatalog}>
            Danh sách game
          </button>
          <button
            className={selected ? 'is-active is-subscreen' : 'is-subscreen'}
            type="button"
            onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            disabled={!selected || !selectedUsesRealtimeResults}
          >
            Kết quả tổng hợp
          </button>
        </aside>

        <div className="vsurvey-module-main stack game-catalog-detail-stack">
          {!selected ? (
          <Card title="Danh sách game">
            <div className="form-grid vsurvey-table-filters">
              <label>
                <span>Trạng thái</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">Tất cả</option>
                  <option value="draft">Bản nháp</option>
                  <option value="ready">Sẵn sàng</option>
                  <option value="published">Đang bật</option>
                </select>
              </label>
              <label>
                <span>Tìm game</span>
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Mã, tên game, dự án, slug" />
              </label>
              <div className="vsurvey-table-meta">Hiển thị {filteredCatalog.length} game</div>
            </div>

            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table game-catalog-table vgamification-table">
                <thead>
                  <tr>
                    <th>Mã game</th>
                    <th>Tên game</th>
                    <th>Dự án</th>
                    <th>Lượt</th>
                    <th>Điểm TB</th>
                    <th>Trạng thái</th>
                    <th>Public</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((entry) => {
                    const rowRuns = entry.summary.plays;
                    const rowAverage = entry.summary.averageScore;
                    const entryPublicUrl = buildGamePublicUrl(entry.publicSlug || entry.id);
                    return (
                      <tr key={entry.id} onClick={() => selectGame(entry)}>
                        <td><strong>{entry.id}</strong><span>Công khai</span></td>
                        <td>{entry.title}</td>
                        <td>{entry.projectName}</td>
                        <td>{rowRuns || '-'}</td>
                        <td>{rowAverage || '-'}</td>
                        <td><Badge tone={toneForStatus(entry.status)}>{labelForStatus(entry.status)}</Badge></td>
                        <td>{entry.publicEmbedMode}</td>
                        <td>
                          <div className="production-plan-row-actions-icons" onClick={(event) => event.stopPropagation()}>
                            <button type="button" className="btn-icon-only" onClick={() => selectGame(entry)} aria-label={`Xem kết quả ${entry.id}`} title="Xem kết quả">
                              <Eye size={16} />
                            </button>
                            {canEditCatalog ? (
                              <button type="button" className="btn-icon-only" onClick={() => { selectGame(entry); setIsEditing(true); }} aria-label={`Sửa ${entry.id}`} title="Sửa">
                                <Pencil size={16} />
                              </button>
                            ) : null}
                            <button type="button" className="btn-icon-only" onClick={() => copyLink(entry)} aria-label={`Copy link ${entry.id}`} title="Copy link">
                              <Copy size={16} />
                            </button>
                            <a className="btn-icon-only" href={entryPublicUrl} target="_blank" rel="noreferrer" aria-label={`Mở link ${entry.id}`} title="Mở link">
                              <ExternalLink size={16} />
                            </a>
                            {canEditCatalog ? (
                              <button type="button" className="btn-icon-only" onClick={() => toggleEntryStatus(entry)} aria-label={`Đổi trạng thái ${entry.id}`} title="Bật/tắt public">
                                {entry.status === 'published' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                              </button>
                            ) : null}
                            {canResetCatalogResults && entry.resultMode === 'realtime' ? (
                              <button type="button" className="btn-icon-only danger" onClick={() => resetEntryResults(entry)} disabled={isResetting} aria-label={`Reset kết quả ${entry.id}`} title="Reset kết quả">
                                <Trash2 size={16} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredCatalog.length ? (
                    <tr>
                      <td colSpan={8} className="muted-text">Chưa có game phù hợp bộ lọc.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {notice ? <div className="muted-text game-catalog-notice">{notice}</div> : null}
          </Card>
          ) : null}

          {selected ? (
            <Card title={`${selected.id} - Cấu hình game`}>
              <div className="stack">
                <div className="game-detail-hero">
                  <div>
                    <div className="section-eye">Game catalog</div>
                    <h3 className="game-detail-title">{selected.title}</h3>
                    <div className="muted-text">{selected.description}</div>
                  </div>
                  <div className="game-detail-chip-row">
                    <Badge tone={toneForStatus(selected.status)}>{labelForStatus(selected.status)}</Badge>
                    <Badge tone="neutral">{selected.version}</Badge>
                    <Badge tone="neutral">{selected.publicEmbedMode}</Badge>
                    <Badge tone={selectedUsesRealtimeResults ? 'success' : 'neutral'}>{selectedUsesRealtimeResults ? 'Kết quả realtime' : 'Bảng điểm theo phiên'}</Badge>
                  </div>
                </div>

                <div className="action-row game-detail-actions">
                  {canEditCatalog ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setIsEditing((current) => !current)}>
                      {isEditing ? 'Đóng sửa' : 'Sửa nội dung'}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost" onClick={() => copyLink(selected)}>
                    Lấy link chạy
                  </button>
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    Mở link public
                  </a>
                  {selectedIsPlxGame ? (
                    <a href={publicRankUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                      Xem rank realtime
                    </a>
                  ) : null}
                  {canResetCatalogResults && selectedUsesRealtimeResults ? (
                    <>
                      <button type="button" className="btn btn-danger" onClick={() => resetEntryResults(selected)} disabled={isResetting}>
                        {isResetting ? 'Đang reset...' : 'Reset kết quả'}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        Tổng hợp kết quả
                      </button>
                    </>
                  ) : null}
                </div>

                {selected.notes ? (
                  <div className="game-operation-guide">
                    <div className="game-operation-guide-title">Hướng dẫn / ghi chú vận hành</div>
                    <div className="game-operation-guide-copy">{selected.notes}</div>
                  </div>
                ) : null}

                {canEditCatalog && isEditing && selectedDraft ? (
                  <div className="game-edit-panel">
                    <div className="form-grid">
                      <label>
                        <span>Tên game</span>
                        <input value={selectedDraft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
                      </label>
                      <label>
                        <span>Tên dự án</span>
                        <input value={selectedDraft.projectName} onChange={(event) => updateDraft({ projectName: event.target.value })} />
                      </label>
                      <label>
                        <span>Phụ trách</span>
                        <input value={selectedDraft.owner} onChange={(event) => updateDraft({ owner: event.target.value })} />
                      </label>
                      <label>
                        <span>Trạng thái</span>
                        <select value={selectedDraft.status} onChange={(event) => updateDraft({ status: event.target.value as GameCatalogEntry['status'] })}>
                          <option value="draft">Bản nháp</option>
                          <option value="ready">Sẵn sàng</option>
                          <option value="published">Đang bật</option>
                        </select>
                      </label>
                      <label>
                        <span>Phiên bản</span>
                        <input value={selectedDraft.version} onChange={(event) => updateDraft({ version: event.target.value })} />
                      </label>
                      <label>
                        <span>Slug public</span>
                        <input value={selectedDraft.publicSlug} onChange={(event) => updateDraft({ publicSlug: event.target.value })} />
                      </label>
                      <label>
                        <span>Kiểu nhúng</span>
                        <select value={selectedDraft.publicEmbedMode} onChange={(event) => updateDraft({ publicEmbedMode: event.target.value as GameCatalogEntry['publicEmbedMode'] })}>
                          <option value="vendor">vendor</option>
                          <option value="iframe">iframe</option>
                        </select>
                      </label>
                      <label className="full">
                        <span>URL nhúng public</span>
                        <input value={selectedDraft.publicEmbedUrl} onChange={(event) => updateDraft({ publicEmbedUrl: event.target.value })} />
                      </label>
                      <label className="full">
                        <span>Mô tả</span>
                        <textarea rows={3} value={selectedDraft.description} onChange={(event) => updateDraft({ description: event.target.value })} />
                      </label>
                      <label className="full">
                        <span>Ghi chú</span>
                        <textarea rows={3} value={selectedDraft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} />
                      </label>
                    </div>
                    <div className="action-row">
                      <button type="button" className="btn btn-danger" onClick={commitDraft}>
                        Lưu thay đổi
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="game-public-link-box">
                  <div className="game-public-link-main">
                    <div className="game-public-link-label">Link public</div>
                    <a href={publicUrl} target="_blank" rel="noreferrer" className="game-public-link">
                      {publicUrl}
                    </a>
                  </div>
                  <div className="game-public-qr" aria-label={`QR public link ${selected.title}`}>
                    <QRCodeSVG value={publicUrl} size={108} level="M" marginSize={2} />
                    <div className="game-public-qr-label">QR</div>
                  </div>
                </div>

                <div className="game-preview-shell">
                  <div className="game-preview-head">
                    <div>
                      <div className="game-preview-title">Preview public</div>
                      <div className="muted-text">Preview đang tạm dừng để giữ màn admin nhẹ và tải nhanh.</div>
                    </div>
                    <Badge tone={selected.publicEmbedMode === 'iframe' ? 'success' : 'warning'}>{selected.publicEmbedMode}</Badge>
                  </div>
                  <div className="game-preview-body">
                    {isPreviewLoaded ? (
                      <iframe
                        className="public-game-iframe"
                        title={selected.title}
                        src={selected.publicEmbedUrl || '/games/plx-01/index.html'}
                        allow="autoplay; fullscreen"
                        loading="lazy"
                      />
                    ) : (
                      <div className="game-preview-placeholder">
                        <div className="muted-text">Preview game đang tạm dừng.</div>
                        <button type="button" className="btn btn-ghost" onClick={() => setIsPreviewLoaded(true)}>
                          Tải preview
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {selected ? (
          <div className="stack" ref={summaryRef}>
            {selectedUsesRealtimeResults ? (
              <>
              <Card title="Tổng hợp kết quả">
                <div className="game-summary-grid">
                  <ResultMetric label="Lượt chạy" value={formatNumber(resultStats.totalRuns || selected.summary.plays)} sub="Tổng số kết quả đã ghi" />
                  <ResultMetric label="Người chơi" value={formatNumber(resultStats.uniquePlayers)} sub="Tên người/đội khác nhau" />
                  <ResultMetric label="Điểm TB" value={resultStats.averageScore ? formatNumber(resultStats.averageScore) : '-'} sub="Tính theo kết quả realtime" />
                  <ResultMetric label="Cập nhật cuối" value={resultStats.latestRunAt} sub="Realtime từ Supabase" />
                </div>
            </Card>

              <Card
                title="Bảng kết quả realtime"
                action={
                  <Badge tone={liveState === 'live' ? 'success' : liveState === 'loading' ? 'warning' : 'neutral'}>
                    {liveState === 'live' ? 'realtime' : liveState === 'loading' ? 'loading' : liveState}
                  </Badge>
                }
              >
                {personalLeaderboard.length ? (
                  <div className="plx-leaderboard-list">
                    {personalLeaderboard.slice(0, 20).map((item, index) => (
                      <div className="plx-leaderboard-row" key={`${item.playerName}-${item.groupName}`}>
                        <div className="plx-leaderboard-rank">#{index + 1}</div>
                        <div className="plx-leaderboard-main">
                          <div className="plx-leaderboard-title">{item.playerName}</div>
                          <div className="plx-leaderboard-sub">
                            {item.groupName} - {item.runCount} lượt - {item.latestRankLabel}
                          </div>
                        </div>
                        <div className="plx-leaderboard-score">
                          <div>{formatNumber(item.totalScore)}</div>
                          <div className="plx-leaderboard-score-sub">best {formatNumber(item.bestScore)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted-text">
                    {liveState === 'loading' ? 'Đang tải dữ liệu realtime...' : 'Chưa có lượt chơi nào được lưu.'}
                  </div>
                )}
              </Card>

              {!selectedIsPlxIndividualGame ? (
              <Card title="Bảng xếp hạng nhóm">
                {groupLeaderboard.length ? (
                  <div className="plx-leaderboard-list">
                    {groupLeaderboard.slice(0, 10).map((item, index) => (
                      <div className="plx-leaderboard-row" key={item.groupName}>
                        <div className="plx-leaderboard-rank">#{index + 1}</div>
                        <div className="plx-leaderboard-main">
                          <div className="plx-leaderboard-title">{item.groupName}</div>
                          <div className="plx-leaderboard-sub">
                            {item.memberCount} lượt - lần cuối {item.latestPlayerName}
                          </div>
                        </div>
                        <div className="plx-leaderboard-score">
                          <div>{formatNumber(item.totalScore)}</div>
                          <div className="plx-leaderboard-score-sub">best {formatNumber(item.bestScore)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted-text">Chưa có dữ liệu nhóm.</div>
                )}
              </Card>
              ) : null}
              </>
            ) : (
              <Card title="Kết quả theo phiên chơi">
                <div className="muted-text">
                  Game giữ bảng xếp hạng ngay trong phiên trên từng máy. Dùng “Lượt mới” để đổi tên nhóm và tiếp tục cộng vào bảng hiện tại; tải lại trang để bắt đầu một bảng mới.
                </div>
              </Card>
            )}
          </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
