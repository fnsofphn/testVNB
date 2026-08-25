import { ChangeEvent, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { downloadOrderImportTemplate, parseWorkbookToOrderPreview, type ImportedWorkbookPreview } from '@/lib/orderImport';
import {
  createClientOrder,
  createImportedOrders,
  normalizeOrderCodeFragment,
} from '@/services/vcontent';

type OrderType = 'E' | 'H' | 'G' | 'M';
type PriorityLevel = 'Cao' | 'Trung bình' | 'Thấp';

type ReferenceFileDraft = {
  id: string;
  file: File;
  category: string;
};

function sanitizeUtf8Text(value: string) {
  const normalized = String(value || '')
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  return new TextDecoder('utf-8', { fatal: false }).decode(new TextEncoder().encode(normalized));
}

function buildOrderCodeSuggestion(input: { title: string; client: string; projectCode: string; orderType: OrderType }) {
  const parts = [input.client, input.projectCode, input.title]
    .map((part) => normalizeOrderCodeFragment(part))
    .filter(Boolean)
    .join('_');
  const suffix = input.orderType === 'M' ? 'M' : input.orderType;
  return normalizeOrderCodeFragment(`${parts}_${suffix}`);
}

function buildOrderMetaIntakeNote(baseNote: string, files: ReferenceFileDraft[]) {
  const notes = sanitizeUtf8Text(baseNote.trim());
  if (!files.length) return notes;
  const fileSummary = files.map((item) => `- ${item.file.name}${item.category ? ` (${item.category})` : ''}`).join('\n');
  return [notes, notes ? '' : '(Không có ghi chú thủ công)', 'Tài liệu tham chiếu đính kèm:', fileSummary].join('\n');
}

async function requireActiveProfile(
  profile: ReturnType<typeof useAuth>['profile'],
  refreshProfile: ReturnType<typeof useAuth>['refreshProfile'],
) {
  let activeProfile = profile;
  if (!activeProfile) {
    activeProfile = await refreshProfile().catch(() => null);
  }

  if (!activeProfile) {
    throw new Error('Thiếu profile hiện tại. Hãy kiểm tra email, active profile và auth_user_id.');
  }

  return activeProfile;
}

export function ClientNewOrderPage() {
  const { profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('Trung bình');
  const [orderType, setOrderType] = useState<OrderType>('H');
  const [deadline, setDeadline] = useState(new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10));
  const [intakeNote, setIntakeNote] = useState('');
  const [plannedProductCount, setPlannedProductCount] = useState('1');
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFileDraft[]>([]);

  const [importDeadline, setImportDeadline] = useState(new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10));
  const [importPreview, setImportPreview] = useState<ImportedWorkbookPreview | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [parseError, setParseError] = useState('');

  const normalizedOrderCode = useMemo(() => normalizeOrderCodeFragment(orderCode), [orderCode]);
  const totalProducts = useMemo(() => Math.max(0, Math.floor(Number(plannedProductCount || 0))), [plannedProductCount]);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const activeProfile = await requireActiveProfile(profile, refreshProfile);

      return createClientOrder({
        title: sanitizeUtf8Text(title.trim()),
        deadline,
        client: sanitizeUtf8Text(clientName.trim() || activeProfile.fullName),
        companyId: activeProfile.companyId,
        createdByProfileId: activeProfile.id,
        bundleCounts: { eln: 0, video: 0, game: 0 },
        plannedProductCount: totalProducts,
        intakeNote: buildOrderMetaIntakeNote(intakeNote, referenceFiles),
        status: 'submitted',
        orderMeta: {
          utf8_guard: 'nfc-v1',
          display_order_code: normalizedOrderCode,
          project_code: normalizeOrderCodeFragment(projectCode),
          priority,
          order_type: orderType,
          total_products: totalProducts,
          reference_files: referenceFiles.map((item) => ({
            name: sanitizeUtf8Text(item.file.name),
            size: item.file.size,
            type: item.file.type || 'application/octet-stream',
            category: sanitizeUtf8Text(item.category),
            last_modified: item.file.lastModified,
          })),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setTitle('');
      setOrderCode('');
      setClientName('');
      setProjectCode('');
      setPriority('Trung bình');
      setOrderType('H');
      setDeadline(new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10));
      setIntakeNote('');
      setPlannedProductCount('1');
      setReferenceFiles([]);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importPreview) {
        throw new Error('Chưa có bản xem trước nhập dữ liệu.');
      }

      const activeProfile = await requireActiveProfile(profile, refreshProfile);
      return createImportedOrders({
        orders: importPreview.orders.map((order) => ({
          title: order.title,
          client: order.client,
          deadline: importDeadline,
          companyId: activeProfile.companyId,
          createdByProfileId: activeProfile.id,
          intakeNote: order.intakeNote,
          status: 'submitted',
          products: order.products.map((product) => ({
            module: product.module,
            sourceCode: product.sourceCode,
            detail: product.detail,
            productType: product.productType,
          })),
        })),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setParseError('');
    setImportPreview(null);
    setImportFileName(file?.name || '');

    if (!file) return;

    try {
      const preview = await parseWorkbookToOrderPreview(file);
      setImportPreview(preview);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error));
    }
  }

  function applyAiSuggestion() {
    const suggestion = buildOrderCodeSuggestion({
      title,
      client: clientName,
      projectCode,
      orderType,
    });
    setOrderCode(suggestion);
  }

  function handleOrderTypeChange(nextOrderType: OrderType) {
    setOrderType(nextOrderType);
  }

  function handleReferenceFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setReferenceFiles((current) => [
      ...current,
      ...files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        category: '',
      })),
    ]);

    event.currentTarget.value = '';
  }

  function removeReferenceFile(id: string) {
    setReferenceFiles((current) => current.filter((item) => item.id !== id));
  }

  return (
    <>
      <SectionHeader
        eye="Cổng khách hàng"
        title="Tạo đơn hàng mới"
      />

      <div className="content-grid two-column">
        <Card title="Thông tin đơn hàng">
          <div className="form-grid order-create-grid">
            <label className="full">
              <span>Tên đơn hàng</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Sản xuất video học liệu đào tạo CMHV HCMC"
              />
            </label>

            <label>
              <span>Mã đơn hàng</span>
              <input
                value={orderCode}
                onChange={(event) => setOrderCode(sanitizeUtf8Text(event.target.value))}
                placeholder="HCMC_CMHV_H"
              />
            </label>

            <label>
              <span>Thời hạn hoàn thành (dd/mm/yy)</span>
              <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            </label>

            <label>
              <span>Khách hàng</span>
              <input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="HCMC"
              />
            </label>

            <label>
              <span>Mã dự án</span>
              <input
                value={projectCode}
                onChange={(event) => setProjectCode(sanitizeUtf8Text(event.target.value))}
                placeholder="CMHV"
              />
            </label>

            <label>
              <span>Mức độ ưu tiên</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as PriorityLevel)}>
                <option value="Cao">Cao</option>
                <option value="Trung bình">Trung bình</option>
                <option value="Thấp">Thấp</option>
              </select>
            </label>

            <label>
              <span>Số lượng sản phẩm dự kiến</span>
              <input
                type="number"
                min="0"
                value={plannedProductCount}
                onChange={(event) => setPlannedProductCount(event.target.value.replace(/[^\d]/g, ''))}
              />
            </label>

            <label>
              <span>Loại</span>
              <select value={orderType} onChange={(event) => handleOrderTypeChange(event.target.value as OrderType)}>
                <option value="E">E</option>
                <option value="H">H</option>
                <option value="G">G</option>
                <option value="M">M</option>
              </select>
            </label>

            <div className="full stack compact">
              <div className="order-create-subheader">
                <strong>Thiết lập sản phẩm sau khi tạo đơn</strong>
              </div>
              <div className="subtle-text">
                Hệ thống chỉ ghi nhận đơn hàng vào màn Quản lý đơn hàng. Sau đó admin sẽ vào màn đó để thêm sản phẩm cụ thể trong đơn.
              </div>
            </div>

            <label className="full">
              <span>Ghi chú</span>
              <textarea
                value={intakeNote}
                onChange={(event) => setIntakeNote(event.target.value)}
                placeholder="Ví dụ: 3 video dùng voice thật; các video còn lại dùng voice AI; không dùng logo outro..."
              />
            </label>

            <div className="full stack compact">
              <div className="order-create-subheader">
                <strong>Tài liệu đính kèm & tham chiếu</strong>
                <label className="btn btn-ghost btn-small">
                  Tải tệp
                  <input type="file" multiple onChange={handleReferenceFileChange} style={{ display: 'none' }} />
                </label>
              </div>
              {referenceFiles.length ? (
                <div className="order-reference-list">
                  {referenceFiles.map((item) => (
                    <div key={item.id} className="order-reference-item">
                      <div>
                        <div className="fw6">{item.file.name}</div>
                        <div className="subtle-text">{Math.ceil(item.file.size / 1024)} KB</div>
                      </div>
                      <input
                        value={item.category}
                        onChange={(event) =>
                          setReferenceFiles((current) => current.map((row) => (row.id === item.id ? { ...row, category: event.target.value } : row)))
                        }
                        placeholder="Loại tài liệu (VD: ĐCNV/Brand/Tham chiếu)"
                      />
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => removeReferenceFile(item.id)}>
                        Xóa
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="subtle-text">Chưa có tài liệu đính kèm.</div>
              )}
            </div>
          </div>

          <div className="toolbar">
            <button
              className="btn btn-danger"
              onClick={() => createOrderMutation.mutate()}
              disabled={!title.trim() || !normalizedOrderCode || !deadline || !clientName.trim() || createOrderMutation.isPending}
            >
              {createOrderMutation.isPending ? 'Đang khởi chạy...' : 'Khởi chạy đơn hàng'}
            </button>
          </div>

          <div className="stack compact">
            {createOrderMutation.data ? <div className="bullet-item">Đơn vừa tạo: {createOrderMutation.data.orderId}</div> : null}
            {createOrderMutation.error ? <div className="bullet-item tone-danger">{String(createOrderMutation.error)}</div> : null}
          </div>
        </Card>

        <Card title="Hỗ trợ tạo đơn hàng">
          <div className="stack compact">
            <div className="bullet-item">
              <strong>Gợi ý tự động</strong>
              <div className="subtle-text">Pattern: [Khách hàng]_[Mã dự án]_[Loại]</div>
              <div className="subtle-text">Ví dụ: HCMC_CMHV_H</div>
              <div className="toolbar">
                <button type="button" className="btn btn-primary" onClick={applyAiSuggestion}>
                  Áp dụng
                </button>
              </div>
            </div>

            <div className="bullet-item">
              <strong>Hướng dẫn định dạng dữ liệu</strong>
              <ul className="order-help-list">
                <li>Tên đơn hàng nhập tay đầy đủ, dễ hiểu cho vận hành.</li>
                <li>Mã đơn hàng nên theo cấu trúc: [Khách hàng]_[Mã dự án]_[Loại].</li>
                <li>Số lượng sản phẩm chỉ là số lượng dự kiến để theo dõi đơn hàng.</li>
                <li>Sản phẩm cụ thể sẽ được admin thêm sau trong màn Quản lý đơn hàng.</li>
                <li>Luôn nhập Khách hàng và Mã dự án tách riêng để lọc báo cáo.</li>
                <li>Dùng Ghi chú để nêu yêu cầu voice/logo/outro/brand guideline.</li>
              </ul>
            </div>
          </div>

          <hr className="divider" />

          <div className="stack compact">
            <div className="toolbar">
              <button type="button" className="btn btn-ghost" onClick={downloadOrderImportTemplate}>
                Tải mẫu bảng tính
              </button>
            </div>

            <label>
              <span>Tệp nhập từ bảng tính</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleImportFileChange} />
            </label>
            <label>
              <span>Hạn cho các đơn nhập</span>
              <input type="date" value={importDeadline} onChange={(event) => setImportDeadline(event.target.value)} />
            </label>
            <label>
              <span>Tệp đang chọn</span>
              <input value={importFileName || '-'} readOnly />
            </label>

            {importPreview ? (
              <>
                <div className="bullet-item">Sheet: {importPreview.sheetName}</div>
                <div className="bullet-item">
                  Kết quả xem trước: {importPreview.orders.length} đơn / {importPreview.validRows} sản phẩm
                </div>
              </>
            ) : null}
            {parseError ? <div className="bullet-item tone-danger">{parseError}</div> : null}
            {importMutation.data ? (
              <div className="bullet-item">
                Đã nhập {importMutation.data.orderCount} đơn / {importMutation.data.productCount} sản phẩm.
              </div>
            ) : null}
            {importMutation.error ? <div className="bullet-item tone-danger">{String(importMutation.error)}</div> : null}

            <div className="toolbar">
              <button
                className="btn btn-primary"
                onClick={() => importMutation.mutate()}
                disabled={!importPreview || importPreview.validRows < 1 || importMutation.isPending}
              >
                {importMutation.isPending ? 'Đang nhập...' : 'Nhập thành đơn'}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
