import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import {
  listAccountManagerRecords,
  replaceAccountManagerRecords,
  type AccountManagerRecordInput,
  type AccountManagerRecordRow,
} from '@/services/vcontent';

type AccountFieldKey =
  | 'tt'
  | 'website'
  | 'purpose'
  | 'account'
  | 'password'
  | 'renewMonth'
  | 'renewYear'
  | 'paymentMethod'
  | 'paymentDeadline';

type AccountRecord = {
  id: string;
  tt: string;
  website: string;
  purpose: string;
  account: string;
  password: string;
  renewMonth: string;
  renewYear: string;
  paymentMethod: string;
  paymentDeadline: string;
};

type AccountDetailMode = 'view' | 'edit';

type AccountColumn = {
  key: AccountFieldKey;
  label: string;
  multiline?: boolean;
  colClassName: string;
};

const ACCOUNT_COLUMNS: AccountColumn[] = [
  { key: 'tt', label: 'TT', colClassName: 'account-col-tt' },
  { key: 'website', label: 'Website / Dịch vụ', multiline: true, colClassName: 'account-col-website' },
  { key: 'purpose', label: 'Mục tiêu sử dụng', multiline: true, colClassName: 'account-col-purpose' },
  { key: 'account', label: 'Tài khoản', multiline: true, colClassName: 'account-col-account' },
  { key: 'password', label: 'Password', multiline: true, colClassName: 'account-col-password' },
  { key: 'renewMonth', label: 'Gia hạn theo tháng', colClassName: 'account-col-month' },
  { key: 'renewYear', label: 'Gia hạn theo năm', colClassName: 'account-col-year' },
  { key: 'paymentMethod', label: 'Cách gia hạn, thanh toán', multiline: true, colClassName: 'account-col-payment' },
  { key: 'paymentDeadline', label: 'Thời hạn thanh toán', multiline: true, colClassName: 'account-col-deadline' },
];

function getAccountFieldLabel(field: AccountFieldKey) {
  switch (field) {
    case 'tt':
      return 'TT';
    case 'website':
      return 'Website / Dịch vụ';
    case 'purpose':
      return 'Mục tiêu sử dụng';
    case 'account':
      return 'Tài khoản';
    case 'password':
      return 'Password';
    case 'renewMonth':
      return 'Gia hạn theo tháng';
    case 'renewYear':
      return 'Gia hạn theo năm';
    case 'paymentMethod':
      return 'Cách gia hạn, thanh toán';
    case 'paymentDeadline':
      return 'Thời hạn thanh toán';
    default:
      return field;
  }
}

const DEFAULT_ACCOUNT_RECORDS: AccountRecord[] = [
  {
    id: 'acc-1',
    tt: '1',
    website: 'https://motionarray.com',
    purpose: 'Tải tài nguyên sử dụng (template, design, video, audio,…)',
    account: 'peopleone.share@gmail.com',
    password: '',
    renewMonth: '',
    renewYear: '',
    paymentMethod: 'Dùng đâu trả đó theo vngraphic',
    paymentDeadline: '',
  },
  {
    id: 'acc-2',
    tt: '2',
    website: 'https://vimeo.com',
    purpose: 'Sử dụng để lưu trữ video (gửi khách hàng, nền tảng phát ELN,…)',
    account: 'hailt@peopleone.com.vn',
    password: 'ppo@@@20232024',
    renewMonth: '',
    renewYear: '599$',
    paymentMethod: 'Dùng thẻ VISA',
    paymentDeadline: 'Gia hạn tiếp vào 1/3/2025',
  },
  {
    id: 'acc-3',
    tt: '3',
    website: 'https://drive.google.com',
    purpose: 'Sử dụng để lưu trữ dữ liệu',
    account: 'peopleone.share@gmail.com',
    password: 'Peopleone2015PPO',
    renewMonth: '',
    renewYear: '2225000',
    paymentMethod: '',
    paymentDeadline: 'Hết hạn vào 19/4/2025',
  },
  {
    id: 'acc-4',
    tt: '4',
    website: 'https://elements.envato.com',
    purpose: 'Tải tài nguyên sử dụng (template, design, video, audio,…)',
    account: 'peopleone.share@gmail.com',
    password: '',
    renewMonth: '',
    renewYear: '',
    paymentMethod: 'Dùng đâu trả đó theo vngraphic',
    paymentDeadline: '',
  },
  {
    id: 'acc-5',
    tt: '5',
    website: 'https://www.vyond.com',
    purpose: 'Để xây dựng video dựa trên nguồn tài nguyên có sẵn của Vyond',
    account: 'peopleone.share@gmail.com',
    password: '',
    renewMonth: '54$',
    renewYear: '649$',
    paymentMethod: '',
    paymentDeadline: '15/6/2023 đóng tài khoản',
  },
  {
    id: 'acc-6',
    tt: '6',
    website: 'https://www.freepik.com',
    purpose: 'Tải tài nguyên sử dụng (design, hình ảnh)',
    account: 'peopleone.share@gmail.com',
    password: '',
    renewMonth: 'Bình quản lý',
    renewYear: '108 euro/years',
    paymentMethod: '',
    paymentDeadline: 'Hết hạn vào 20/12/2024',
  },
  {
    id: 'acc-7',
    tt: '7',
    website: 'Máy chủ lưu trữ dữ liệu',
    purpose: 'Sử dụng để lưu trữ tài nguyên',
    account: 'P@ssword',
    password: '',
    renewMonth: '',
    renewYear: '',
    paymentMethod: '',
    paymentDeadline: '',
  },
  {
    id: 'acc-8',
    tt: '8',
    website: 'Mạng FPT',
    purpose: 'Chỉ sử dụng, không quản lý',
    account: 'huyenvu@peopleone.com.vn',
    password: '',
    renewMonth: '6,5 tháng',
    renewYear: '5280000',
    paymentMethod: '',
    paymentDeadline: 'Gia hạn tiếp vào 24/10/2024',
  },
  {
    id: 'acc-9',
    tt: '9',
    website: 'Zoom bản quyền (gói Pro)',
    purpose: 'Meeting, Đào tạo online',
    account: 'support@peopleone.com.vn',
    password: 'Peopleone2023',
    renewMonth: '3 tháng',
    renewYear: '',
    paymentMethod: 'Cập nhật báo giá',
    paymentDeadline: 'Đã hết hạn',
  },
  {
    id: 'acc-10',
    tt: '10',
    website: 'Email: support@peopleone.com.vn',
    purpose: 'Đăng nhập xác nhận khi zoom yêu cầu',
    account: 'support@peopleone.com.vn',
    password: 'Daotao2015',
    renewMonth: '',
    renewYear: '',
    paymentMethod: '',
    paymentDeadline: '',
  },
  {
    id: 'acc-11',
    tt: '11',
    website: 'Tài khoản adobe',
    purpose: '',
    account: '',
    password: '',
    renewMonth: '',
    renewYear: '',
    paymentMethod: 'Hiện tại không dùng',
    paymentDeadline: '',
  },
  {
    id: 'acc-12',
    tt: '12',
    website: 'Tài khoản vngraphic',
    purpose: 'Đăng nhập bằng email vudinhhuyenbk@gmail.com',
    account: 'Vudinhhuyenbk@gmail.com',
    password: 'vudinhhuyenbk100291',
    renewMonth: '',
    renewYear: '200000',
    paymentMethod: 'Dùng hết nạp tiếp',
    paymentDeadline: '',
  },
  {
    id: 'acc-13',
    tt: '13',
    website: 'Tài khoản Vbee',
    purpose: 'phamhoainamk54@gmail.com',
    account: 'Nam1997',
    password: '',
    renewMonth: '',
    renewYear: '990000',
    paymentMethod: '1 năm kể từ ngày 30/9',
    paymentDeadline: '',
  },
  {
    id: 'acc-14',
    tt: '14',
    website: 'Vimeo',
    purpose: '',
    account: 'hailt@peopleone.com.vn',
    password: 'pp1@@@digital',
    renewMonth: '',
    renewYear: '',
    paymentMethod: '',
    paymentDeadline: '',
  },
];

function cloneDefaultRecords() {
  return DEFAULT_ACCOUNT_RECORDS.map((record) => ({ ...record }));
}

function mapSupabaseRowToRecord(row: AccountManagerRecordRow): AccountRecord {
  return {
    id: row.id,
    tt: row.tt || '',
    website: row.website || '',
    purpose: row.purpose || '',
    account: row.account || '',
    password: row.password || '',
    renewMonth: row.renew_month || '',
    renewYear: row.renew_year || '',
    paymentMethod: row.payment_method || '',
    paymentDeadline: row.payment_deadline || '',
  };
}

function toReplacePayload(records: AccountRecord[]): AccountManagerRecordInput[] {
  return records.map((record, index) => ({
    id: record.id,
    tt: record.tt,
    website: record.website,
    purpose: record.purpose,
    account: record.account,
    password: record.password,
    renewMonth: record.renewMonth,
    renewYear: record.renewYear,
    paymentMethod: record.paymentMethod,
    paymentDeadline: record.paymentDeadline,
    sortIndex: index + 1,
  }));
}

function createNewRow(order: number): AccountRecord {
  return {
    id: `acc-new-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    tt: String(order),
    website: '',
    purpose: '',
    account: '',
    password: '',
    renewMonth: '',
    renewYear: '',
    paymentMethod: '',
    paymentDeadline: '',
  };
}

export function AccountManagerPage() {
  const queryClient = useQueryClient();
  const recordsQuery = useQuery({
    queryKey: ['account-manager-records'],
    queryFn: listAccountManagerRecords,
  });

  const [records, setRecords] = useState<AccountRecord[]>([]);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [detailMode, setDetailMode] = useState<AccountDetailMode>('view');

  const saveMutation = useMutation({
    mutationFn: replaceAccountManagerRecords,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account-manager-records'] });
      setDirty(false);
      setSavedAt(new Date().toLocaleString('vi-VN'));
      setFeedback('Da luu danh sach tai khoan len Supabase.');
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setFeedback(''), 2400);
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Lưu thất bại: ${message}`);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setFeedback(''), 3600);
      }
    },
  });

  useEffect(() => {
    if (dirty) return;
    if (!recordsQuery.data) return;
    if (recordsQuery.data.length) {
      setRecords(recordsQuery.data.map(mapSupabaseRowToRecord));
      return;
    }
    setRecords(cloneDefaultRecords());
  }, [recordsQuery.data, dirty]);

  const handleFieldChange = (recordId: string, field: AccountFieldKey, value: string) => {
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== recordId) return record;
        return { ...record, [field]: value };
      }),
    );
    setDirty(true);
  };

  const openDetail = (recordId: string, mode: AccountDetailMode) => {
    setSelectedRecordId(recordId);
    setDetailMode(mode);
  };

  const closeDetail = () => {
    setSelectedRecordId('');
    setDetailMode('view');
  };

  const handleAddRow = () => {
    const nextRow = createNewRow(records.length + 1);
    setRecords((current) => [...current, nextRow]);
    setDirty(true);
    openDetail(nextRow.id, 'edit');
  };

  const handleDeleteRow = (recordId: string) => {
    const target = records.find((record) => record.id === recordId);
    if (typeof window !== 'undefined') {
      const accepted = window.confirm(`Xóa ${target?.website || 'dòng tài khoản này'}?`);
      if (!accepted) return;
    }
    setRecords((current) => current.filter((record) => record.id !== recordId));
    if (selectedRecordId === recordId) closeDetail();
    setDirty(true);
  };

  const handleReloadDefault = () => {
    if (typeof window !== 'undefined') {
      const accepted = window.confirm('Nạp lại dữ liệu từ file gốc? Dữ liệu chưa lưu sẽ mất.');
      if (!accepted) return;
    }
    setRecords(cloneDefaultRecords());
    setDirty(true);
    setFeedback('Đã nạp lại dữ liệu gốc. Bấm "Lưu thay đổi" để đẩy lên Supabase.');
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setFeedback(''), 2400);
    }
  };

  const handleSyncFromSupabase = async () => {
    if (dirty && typeof window !== 'undefined') {
      const accepted = window.confirm('Ban co thay doi chua luu. Dong bo lai se mat thay doi nay. Tiep tuc?');
      if (!accepted) return;
    }
    setDirty(false);
    await queryClient.invalidateQueries({ queryKey: ['account-manager-records'] });
    setFeedback('Đã đồng bộ lại dữ liệu từ Supabase.');
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setFeedback(''), 2000);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(toReplacePayload(records));
  };

  const rowsWithPassword = records.filter((record) => Boolean(record.password.trim())).length;
  const rowsWithRenewInfo = records.filter(
    (record) => Boolean(record.renewMonth.trim()) || Boolean(record.renewYear.trim()) || Boolean(record.paymentDeadline.trim()),
  ).length;
  const saveStatusLabel = saveMutation.isPending ? 'Đang lưu' : dirty ? 'Chưa lưu' : 'Đã đồng bộ';
  const saveStatusTone = saveMutation.isPending || dirty ? 'warning' : 'success';
  const selectedRecord = records.find((record) => record.id === selectedRecordId) || null;
  const isDetailOpen = Boolean(selectedRecord);
  const isEditingDetail = detailMode === 'edit';

  return (
    <div className={`account-manager-page${isDetailOpen ? ' is-detail-open' : ''}`}>
      <SectionHeader
        eye="He thong"
        title="Quản lý tài khoản"
        actions={
          <div className="action-row">
            <button className="btn btn-ghost" onClick={() => void handleSyncFromSupabase()}>Dong bo tu Supabase</button>
            <button className="btn btn-ghost" onClick={handleReloadDefault}>Nạp dữ liệu gốc</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>Lưu thay đổi</button>
          </div>
        }
      />

      <div className="kpi-row small">
        <Kpi label="Tổng tài khoản" value={String(records.length)} sub="Theo file Tài khoản.xlsx" tone="warning" />
        <Kpi label="Dong co password" value={String(rowsWithPassword)} sub="Can theo doi bao mat" tone="danger" />
        <Kpi label="Dong co thong tin gia han" value={String(rowsWithRenewInfo)} sub="Dung cho nhac han thanh toan" tone="success" />
      </div>

      {recordsQuery.error ? (
        <div className="notice danger">
          {recordsQuery.error instanceof Error ? recordsQuery.error.message : 'Không tải được dữ liệu tài khoản từ Supabase.'}
        </div>
      ) : null}

      <Card title="Bảng website / dịch vụ" action={<Badge tone={saveStatusTone}>{saveStatusLabel}</Badge>}>
        {recordsQuery.isLoading && !records.length ? <div className="muted-text">Đang tải dữ liệu tài khoản...</div> : null}
        <div className="account-manager-table-wrap">
          <table className="data-table account-manager-table account-manager-summary-table">
            <thead>
              <tr>
                <th>Website / Dịch vụ</th>
                <th>Tài khoản</th>
                <th>Password</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="account-manager-summary-row" onClick={() => openDetail(record.id, 'view')}>
                  <td className="account-manager-primary-cell">{record.website || 'Chưa đặt tên'}</td>
                  <td>{record.account || '-'}</td>
                  <td>{record.password || '-'}</td>
                  <td>
                    <div className="production-plan-row-actions production-plan-row-actions-icons">
                      <button className="production-plan-icon-btn" type="button" title="Xem chi tiết" aria-label={`Xem chi tiết ${record.website || record.tt}`} onClick={(event) => { event.stopPropagation(); openDetail(record.id, 'view'); }}>
                        <Eye size={16} strokeWidth={1.9} />
                      </button>
                      <button className="production-plan-icon-btn" type="button" title="Chỉnh sửa" aria-label={`Chỉnh sửa ${record.website || record.tt}`} onClick={(event) => { event.stopPropagation(); openDetail(record.id, 'edit'); }}>
                        <Pencil size={16} strokeWidth={1.9} />
                      </button>
                      <button className="production-plan-icon-btn tone-danger" type="button" title="Xóa" aria-label={`Xóa ${record.website || record.tt}`} onClick={(event) => { event.stopPropagation(); handleDeleteRow(record.id); }}>
                        <Trash2 size={16} strokeWidth={1.9} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="account-manager-add-row">
                <td colSpan={4}>
                  <button type="button" className="account-manager-add-button" onClick={handleAddRow}>
                    <Plus size={18} strokeWidth={2} />
                    <span>Thêm website / dịch vụ</span>
                  </button>
                </td>
              </tr>
              {!records.length ? (
                <tr>
                  <td colSpan={4}>
                    <div className="muted-text">Chưa có dữ liệu. Bấm "Nạp dữ liệu gốc" rồi "Lưu thay đổi" để khởi tạo.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="muted-text">
          Du lieu luu truc tiep tren Supabase.
          {savedAt ? ` Lan luu gan nhat: ${savedAt}.` : ''}
        </div>
        {feedback ? <div className="muted-text">{feedback}</div> : null}
      </Card>
      {selectedRecord ? (
        <div className="production-plan-detail-page account-manager-detail-page">
          <div className="production-plan-detail-shell production-plan-modal-shell account-manager-detail-shell">
            <div className="results-modal-head">
              <h3>{isEditingDetail ? 'Chỉnh sửa tài khoản' : 'Chi tiết tài khoản'} · {selectedRecord.website || selectedRecord.tt}</h3>
              <div className="production-plan-modal-actions">
                {!isEditingDetail ? (
                  <button className="btn btn-primary production-plan-action-pill" onClick={() => setDetailMode('edit')}>Chỉnh sửa</button>
                ) : null}
                {isEditingDetail ? (
                  <button className="btn btn-primary production-plan-action-pill" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
                    {saveMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                ) : null}
                <button className="btn btn-ghost production-plan-action-pill" onClick={closeDetail}>Đóng</button>
              </div>
            </div>
            <div className="results-modal-body account-manager-detail-body">
              <div className="muted-text">Mã dòng: {selectedRecord.tt || '-'} · Trạng thái: {dirty ? 'Có thay đổi chưa lưu' : 'Đã đồng bộ'}</div>
              <div className="account-manager-detail-grid">
                {ACCOUNT_COLUMNS.map((column) => (
                  <label className="account-manager-detail-field" key={column.key}>
                    <span>{getAccountFieldLabel(column.key)}</span>
                    {column.multiline ? (
                      <textarea
                        className="account-manager-input account-manager-textarea"
                        value={selectedRecord[column.key]}
                        readOnly={!isEditingDetail}
                        onChange={(event) => handleFieldChange(selectedRecord.id, column.key, event.target.value)}
                      />
                    ) : (
                      <input
                        className="account-manager-input"
                        value={selectedRecord[column.key]}
                        readOnly={!isEditingDetail}
                        onChange={(event) => handleFieldChange(selectedRecord.id, column.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="production-plan-modal-actions">
                <button className="btn btn-danger production-plan-action-pill" onClick={() => handleDeleteRow(selectedRecord.id)}>
                  Xóa tài khoản
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
