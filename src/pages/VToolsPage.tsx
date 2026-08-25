import { useMemo, useRef, useState } from 'react';
import { Download, FileAudio, FileSpreadsheet, FileType, ImagePlus, Mail, QrCode, WandSparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { Badge, Card } from '@/components/ui/Primitives';

type VToolTab = 'transcript' | 'converter' | 'image' | 'qr' | 'plx-email';

type TranscriptResult = {
  text?: string;
  subtitles?: { srt?: string; vtt?: string };
};

type PlxEmailRow = {
  index: string;
  group: string;
  fullName: string;
  unit: string;
  title: string;
  sourceEmail: string;
  generatedEmail: string;
  duplicateRank: number;
  duplicateTotal: number;
};

function workerBase() {
  return String(import.meta.env.VITE_VTOOLS_WORKER_ENDPOINT || 'http://127.0.0.1:8787').replace(/\/+$/, '');
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function normalizeVietnameseName(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeHeader(value: unknown) {
  return normalizeVietnameseName(String(value || ''));
}

function findColumnIndex(headers: unknown[], aliases: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader);
  return normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
}

function cellText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parsePlxRows(rawRows: unknown[][]): Omit<PlxEmailRow, 'generatedEmail' | 'duplicateRank' | 'duplicateTotal'>[] {
  const headerIndex = rawRows.findIndex((row) => row.some((cell) => ['hovaten', 'hoten', 'hotenhovaten'].includes(normalizeHeader(cell))));
  if (headerIndex < 0) throw new Error('Không tìm thấy cột Họ và tên trong file/bảng đầu vào.');

  const headers = rawRows[headerIndex] || [];
  const nameIndex = findColumnIndex(headers, ['HỌ VÀ TÊN', 'Họ tên', 'ho_ten', 'HOVATEN']);
  const groupIndex = findColumnIndex(headers, ['NHOM', 'NHÓM', 'nhom', 'group']);
  const emailIndex = findColumnIndex(headers, ['EMAIL', 'email']);
  const unitIndex = findColumnIndex(headers, ['ĐƠN VỊ CÔNG TÁC', 'don_vi', 'Đơn vị', 'don vi']);
  const titleIndex = findColumnIndex(headers, ['CHỨC VỤ', 'chuc_vu', 'Chức vụ']);
  const sttIndex = findColumnIndex(headers, ['STT', 'TT']);

  if (nameIndex < 0) throw new Error('Không tìm thấy cột Họ và tên trong file/bảng đầu vào.');

  return rawRows
    .slice(headerIndex + 1)
    .map((row, rowOffset) => ({
      index: cellText(sttIndex >= 0 ? row[sttIndex] : rowOffset + 1),
      group: cellText(groupIndex >= 0 ? row[groupIndex] : ''),
      fullName: cellText(row[nameIndex]),
      unit: cellText(unitIndex >= 0 ? row[unitIndex] : ''),
      title: cellText(titleIndex >= 0 ? row[titleIndex] : ''),
      sourceEmail: cellText(emailIndex >= 0 ? row[emailIndex] : ''),
    }))
    .filter((row) => row.fullName);
}

function buildPlxEmailRows(rows: Omit<PlxEmailRow, 'generatedEmail' | 'duplicateRank' | 'duplicateTotal'>[], keepExistingEmail: boolean) {
  const baseCounts = new Map<string, number>();
  rows.forEach((row) => {
    const base = normalizeVietnameseName(row.fullName);
    if (base) baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
  });

  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = normalizeVietnameseName(row.fullName);
    const duplicateTotal = baseCounts.get(base) || 0;
    const duplicateRank = (seen.get(base) || 0) + 1;
    seen.set(base, duplicateRank);
    const generatedEmail =
      keepExistingEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.sourceEmail)
        ? row.sourceEmail.toLowerCase()
        : `${base}${duplicateTotal > 1 ? duplicateRank : ''}@plx.com`;
    return { ...row, generatedEmail, duplicateRank, duplicateTotal };
  });
}

function rowsToCsv(rows: PlxEmailRow[]) {
  const headers = ['ho_ten', 'nhom', 'email', 'don_vi', 'chuc_vu'];
  const escapeCell = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => [row.fullName, row.group, row.generatedEmail, row.unit, row.title].map(escapeCell).join(',')),
  ].join('\r\n');
}

function downloadText(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function VToolsPage() {
  const [activeTab, setActiveTab] = useState<VToolTab>('transcript');
  const baseUrl = useMemo(workerBase, []);
  const qrSvgRef = useRef<SVGSVGElement | null>(null);

  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [transcriptLanguage, setTranscriptLanguage] = useState('vi');
  const [transcriptStatus, setTranscriptStatus] = useState('');
  const [transcriptResult, setTranscriptResult] = useState<TranscriptResult | null>(null);
  const [transcriptError, setTranscriptError] = useState('');

  const [convertFile, setConvertFile] = useState<File | null>(null);
  const [convertStatus, setConvertStatus] = useState('');
  const [convertError, setConvertError] = useState('');
  const [convertResult, setConvertResult] = useState<{ downloadUrl?: string; fileName?: string; previewText?: string } | null>(null);

  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStatus, setImageStatus] = useState('');
  const [imageError, setImageError] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [qrInput, setQrInput] = useState('https://www.vinabrain.com.vn/vtraining');
  const qrValue = qrInput.trim();
  const [plxEmailRows, setPlxEmailRows] = useState<PlxEmailRow[]>([]);
  const [plxEmailStatus, setPlxEmailStatus] = useState('');
  const [plxEmailError, setPlxEmailError] = useState('');
  const [plxEmailPaste, setPlxEmailPaste] = useState('');
  const [plxKeepExistingEmail, setPlxKeepExistingEmail] = useState(false);
  const plxEmailDuplicateGroups = useMemo(() => {
    const groups = new Set(plxEmailRows.filter((row) => row.duplicateTotal > 1).map((row) => normalizeVietnameseName(row.fullName)));
    return groups.size;
  }, [plxEmailRows]);
  const plxEmailUniqueEmails = useMemo(() => new Set(plxEmailRows.map((row) => row.generatedEmail)).size, [plxEmailRows]);
  const plxEmailPreviewRows = plxEmailRows.slice(0, 12);

  function downloadQrSvg() {
    if (!qrSvgRef.current || !qrValue) return;
    const svgText = new XMLSerializer().serializeToString(qrSvgRef.current);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vinabrain-qr-code.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function runTranscript() {
    if (!transcriptFile) return;
    setTranscriptStatus('Đang gửi file tới V-tools worker...');
    setTranscriptError('');
    setTranscriptResult(null);
    const formData = new FormData();
    formData.append('file', transcriptFile);
    formData.append('language', transcriptLanguage);
    try {
      const response = await fetch(`${baseUrl}/transcribe-gemini`, { method: 'POST', body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Transcript worker trả về lỗi.');
      setTranscriptResult(payload.result || null);
      setTranscriptStatus('Transcript hoàn tất.');
    } catch (error) {
      setTranscriptStatus('');
      setTranscriptError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runConvert() {
    if (!convertFile) return;
    setConvertStatus('Đang chuyển định dạng file...');
    setConvertError('');
    setConvertResult(null);
    const formData = new FormData();
    formData.append('file', convertFile);
    formData.append('target', 'docx');
    try {
      const response = await fetch(`${baseUrl}/convert-file`, { method: 'POST', body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không chuyển được file.');
      setConvertResult(payload.result || null);
      setConvertStatus('Đã tạo file Word.');
    } catch (error) {
      setConvertStatus('');
      setConvertError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runImageGeneration() {
    if (!imagePrompt.trim()) return;
    setImageStatus('Đang tạo ảnh bằng Gemini...');
    setImageError('');
    setImageDataUrl('');
    try {
      const response = await fetch(`${baseUrl}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không tạo được ảnh.');
      const mimeType = payload.result?.mimeType || 'image/png';
      const data = payload.result?.data || '';
      setImageDataUrl(`data:${mimeType};base64,${data}`);
      setImageStatus('Đã tạo ảnh.');
    } catch (error) {
      setImageStatus('');
      setImageError(error instanceof Error ? error.message : String(error));
    }
  }

  async function importPlxEmailWorkbook(file: File | null) {
    if (!file) return;
    setPlxEmailStatus('Đang đọc file Excel...');
    setPlxEmailError('');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const parsedRows = parsePlxRows(rawRows);
      const nextRows = buildPlxEmailRows(parsedRows, plxKeepExistingEmail);
      setPlxEmailRows(nextRows);
      setPlxEmailStatus(`Đã tạo ${nextRows.length} email từ sheet "${sheetName}".`);
    } catch (error) {
      setPlxEmailRows([]);
      setPlxEmailStatus('');
      setPlxEmailError(error instanceof Error ? error.message : 'Không đọc được file Excel.');
    }
  }

  function importPlxEmailPaste() {
    setPlxEmailError('');
    setPlxEmailStatus('');
    try {
      const rawRows = plxEmailPaste
        .split(/\r?\n/)
        .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
        .filter((row) => row.some(Boolean));
      const parsedRows = parsePlxRows(rawRows);
      const nextRows = buildPlxEmailRows(parsedRows, plxKeepExistingEmail);
      setPlxEmailRows(nextRows);
      setPlxEmailStatus(`Đã tạo ${nextRows.length} email từ dữ liệu dán.`);
    } catch (error) {
      setPlxEmailRows([]);
      setPlxEmailError(error instanceof Error ? error.message : 'Không đọc được dữ liệu dán.');
    }
  }

  function downloadPlxEmailCsv() {
    if (!plxEmailRows.length) return;
    downloadText(`\uFEFF${rowsToCsv(plxEmailRows)}`, 'plx_vtraining_emails.csv', 'text/csv;charset=utf-8');
  }

  function downloadPlxEmailXlsx() {
    if (!plxEmailRows.length) return;
    const importRows = plxEmailRows.map((row) => ({
      ho_ten: row.fullName,
      nhom: row.group,
      email: row.generatedEmail,
      don_vi: row.unit,
      chuc_vu: row.title,
    }));
    const duplicateRows = plxEmailRows
      .filter((row) => row.duplicateTotal > 1)
      .map((row) => ({
        STT: row.index,
        'HỌ VÀ TÊN': row.fullName,
        'ĐƠN VỊ CÔNG TÁC': row.unit,
        email_da_danh_so: row.generatedEmail,
      }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importRows), 'HocVien');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(duplicateRows), 'Email_Check');
    XLSX.writeFile(workbook, 'plx_vtraining_emails.xlsx');
  }

  return (
    <>
      <div className="vtools-layout">
        <aside className="vtools-sidebar" aria-label="Điều hướng V-tools">
          <div className="vtools-sidebar-brand">
            <span>VT</span>
            <div>
              <strong>V-Tools</strong>
              <small>Bảng điều hành</small>
            </div>
          </div>
          <p className="vtools-sidebar-label">Công cụ</p>
          <button className={activeTab === 'transcript' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('transcript')}>
            <FileAudio size={16} aria-hidden="true" />
            Turbo transcript
          </button>
          <button className={activeTab === 'converter' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('converter')}>
            <FileType size={16} aria-hidden="true" />
            Chuyển định dạng file
          </button>
          <button className={activeTab === 'image' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('image')}>
            <ImagePlus size={16} aria-hidden="true" />
            Tạo ảnh
          </button>
          <button className={activeTab === 'qr' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('qr')}>
            <QrCode size={16} aria-hidden="true" />
            QR code
          </button>
          <button className={activeTab === 'plx-email' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('plx-email')}>
            <Mail size={16} aria-hidden="true" />
            Email PLX
          </button>
          <div className="vtools-sidebar-foot">
            <span>Vinabrain</span>
            <small>Admin tổng</small>
          </div>
        </aside>

        <main className="vtools-main">
          <section className="vtools-work-hero">
            <div>
              <span>V-TOOLS · BỘ TIỆN ÍCH VẬN HÀNH</span>
              <h1>Công cụ nhanh cho admin đào tạo</h1>
              <p>Chuẩn hoá các thao tác lặp lại: transcript, chuyển định dạng, QR, tạo ảnh và xử lý danh sách học viên trước khi import vào VTraining.</p>
            </div>
          </section>

          {activeTab === 'transcript' ? (
            <Card title="Turbo transcript" action={<Badge tone="violet">Gemini API</Badge>}>
              <div className="utility-tool-card">
                <label className="utility-upload-zone">
                  <FileAudio size={24} aria-hidden="true" />
                  <span>{transcriptFile ? transcriptFile.name : 'Chọn file audio/video'}</span>
                  <small>MP3, WAV, M4A, MP4 hoặc WebM</small>
                  <input
                    type="file"
                    accept="audio/*,video/*"
                    onChange={(event) => {
                      setTranscriptFile(event.currentTarget.files?.[0] || null);
                      setTranscriptResult(null);
                      setTranscriptError('');
                      setTranscriptStatus('');
                    }}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    <span>Ngôn ngữ</span>
                    <select value={transcriptLanguage} onChange={(event) => setTranscriptLanguage(event.currentTarget.value)}>
                      <option value="vi">Tiếng Việt</option>
                      <option value="auto">Tự nhận diện</option>
                    </select>
                  </label>
                </div>
                <button className="btn btn-primary utility-open-link" type="button" disabled={!transcriptFile || Boolean(transcriptStatus && !transcriptResult)} onClick={runTranscript}>
                  Bắt đầu transcript
                </button>
                {transcriptStatus ? <div className="muted-text">{transcriptStatus}</div> : null}
                {transcriptError ? <div className="utility-error-note">{transcriptError}</div> : null}
                {transcriptResult?.text ? (
                  <div className="utility-result-box">
                    <strong>Kết quả transcript</strong>
                    <p>{transcriptResult.text}</p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {activeTab === 'converter' ? (
            <Card title="Chuyển PDF/file sang Word" action={<Badge tone="warning">DOCX chỉnh sửa được</Badge>}>
              <div className="utility-tool-card">
                <label className="utility-upload-zone">
                  <FileType size={24} aria-hidden="true" />
                  <span>{convertFile ? convertFile.name : 'Chọn file PDF hoặc tài liệu'}</span>
                  <small>Ưu tiên PDF. Worker dùng Gemini để trích xuất nội dung và tạo DOCX.</small>
                  <input
                    type="file"
                    accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,image/*"
                    onChange={(event) => {
                      setConvertFile(event.currentTarget.files?.[0] || null);
                      setConvertStatus('');
                      setConvertError('');
                      setConvertResult(null);
                    }}
                  />
                </label>
                <button className="btn btn-primary utility-open-link" type="button" disabled={!convertFile || Boolean(convertStatus && !convertResult)} onClick={runConvert}>
                  Chuyển sang Word
                </button>
                {convertStatus ? <div className="muted-text">{convertStatus}</div> : null}
                {convertError ? <div className="utility-error-note">{convertError}</div> : null}
                {convertResult?.downloadUrl ? (
                  <div className="action-row">
                    <a className="btn btn-primary" href={`${baseUrl}${convertResult.downloadUrl}`} target="_blank" rel="noreferrer">
                      Tải file Word
                    </a>
                  </div>
                ) : null}
                {convertResult?.previewText ? (
                  <div className="utility-result-box">
                    <strong>Xem trước nội dung</strong>
                    <p>{convertResult.previewText}</p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {activeTab === 'image' ? (
            <Card title="Tạo ảnh" action={<Badge tone="success">Gemini image</Badge>}>
              <div className="utility-tool-card">
                <label className="lecturer-bank-inline-field">
                  <span>Prompt tạo ảnh</span>
                  <textarea rows={6} value={imagePrompt} onChange={(event) => setImagePrompt(event.currentTarget.value)} placeholder="Mô tả ảnh cần tạo..." />
                </label>
                <button className="btn btn-primary utility-open-link" type="button" disabled={!imagePrompt.trim() || Boolean(imageStatus && !imageDataUrl)} onClick={runImageGeneration}>
                  <WandSparkles size={16} aria-hidden="true" />
                  Tạo ảnh
                </button>
                {imageStatus ? <div className="muted-text">{imageStatus}</div> : null}
                {imageError ? <div className="utility-error-note">{imageError}</div> : null}
                {imageDataUrl ? (
                  <div className="vtools-image-result">
                    <img src={imageDataUrl} alt="Ảnh đã tạo" />
                    <button className="btn btn-ghost" type="button" onClick={() => downloadDataUrl(imageDataUrl, 'vtools-generated-image.png')}>
                      Tải ảnh
                    </button>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {activeTab === 'qr' ? (
            <Card title="Tạo QR code" action={<Badge tone="success">Link truy cập nhanh</Badge>}>
              <div className="utility-tool-card">
                <label className="lecturer-bank-inline-field">
                  <span>Link cần tạo QR</span>
                  <input
                    value={qrInput}
                    onChange={(event) => setQrInput(event.currentTarget.value)}
                    placeholder="https://www.vinabrain.com.vn/vtraining"
                  />
                </label>
                <div className="vtools-qr-result">
                  {qrValue ? (
                    <>
                      <div className="vtools-qr-frame">
                        <QRCodeSVG ref={qrSvgRef} value={qrValue} size={220} level="M" marginSize={3} />
                      </div>
                      <div className="vtools-qr-meta">
                        <strong>QR code đã sẵn sàng</strong>
                        <span>{qrValue}</span>
                        <div className="action-row">
                          <button className="btn btn-primary" type="button" onClick={downloadQrSvg}>
                            Tải QR SVG
                          </button>
                          <button className="btn btn-ghost" type="button" onClick={() => void navigator.clipboard?.writeText(qrValue)}>
                            Copy link
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="notice">Dán link để tạo QR code.</div>
                  )}
                </div>
              </div>
            </Card>
          ) : null}

          {activeTab === 'plx-email' ? (
            <div className="vtools-plx-email-stack">
              <Card title="Tạo email PLX cho import VTraining" action={<Badge tone="warning">hovaten@plx.com</Badge>}>
                <div className="utility-tool-card vtools-brand-card vtools-brand-card-plx">
                  <div className="vtools-brand-card-copy">
                    <span>Petrolimex · VTraining import</span>
                    <p>
                      Tool tự chuẩn hoá họ tên tiếng Việt, bỏ dấu/khoảng trắng và đánh số những tên trùng nhau theo cùng một base email.
                    </p>
                  </div>
                  <div className="vtools-email-actions">
                    <label className="utility-upload-zone vtools-upload-compact">
                      <FileSpreadsheet size={24} aria-hidden="true" />
                      <span>Import Excel/CSV raw</span>
                      <small>Nhận cột HỌ VÀ TÊN, NHÓM, ĐƠN VỊ CÔNG TÁC, CHỨC VỤ, EMAIL nếu có.</small>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv,.tsv"
                        onChange={(event) => {
                          void importPlxEmailWorkbook(event.currentTarget.files?.[0] || null);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <label className="vtools-checkbox-option">
                      <input
                        type="checkbox"
                        checked={plxKeepExistingEmail}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setPlxKeepExistingEmail(checked);
                          if (plxEmailRows.length) {
                            const sourceRows = plxEmailRows.map((row) => ({
                              index: row.index,
                              group: row.group,
                              fullName: row.fullName,
                              unit: row.unit,
                              title: row.title,
                              sourceEmail: row.sourceEmail,
                            }));
                            setPlxEmailRows(buildPlxEmailRows(sourceRows, checked));
                          }
                        }}
                      />
                      <span>Giữ email hợp lệ đang có trong file nguồn</span>
                    </label>
                  </div>
                </div>
              </Card>

              <Card title="Dán danh sách raw" action={<Badge tone="violet">Preview trước khi xuất</Badge>}>
                <div className="utility-tool-card">
                  <label className="lecturer-bank-inline-field">
                    <span>Dữ liệu bảng</span>
                    <textarea
                      rows={8}
                      value={plxEmailPaste}
                      onChange={(event) => setPlxEmailPaste(event.currentTarget.value)}
                      placeholder={'STT\tNHÓM\tHỌ VÀ TÊN\tĐƠN VỊ CÔNG TÁC\tCHỨC VỤ\n1\t1\tNguyễn Văn A\tPetrolimex Hà Nội\tCửa hàng trưởng'}
                    />
                  </label>
                  <div className="action-row">
                    <button className="btn btn-primary" type="button" onClick={importPlxEmailPaste} disabled={!plxEmailPaste.trim()}>
                      Tạo preview email
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => setPlxEmailPaste('')} disabled={!plxEmailPaste.trim()}>
                      Xoá dữ liệu dán
                    </button>
                  </div>
                  {plxEmailStatus ? <div className="muted-text">{plxEmailStatus}</div> : null}
                  {plxEmailError ? <div className="utility-error-note">{plxEmailError}</div> : null}
                </div>
              </Card>

              {plxEmailRows.length ? (
                <Card title="Preview file import VTraining" action={<Badge tone="success">{plxEmailRows.length} học viên</Badge>}>
                  <div className="utility-tool-card">
                    <div className="vtools-email-summary">
                      <div>
                        <span>Dòng hợp lệ</span>
                        <strong>{plxEmailRows.length}</strong>
                      </div>
                      <div>
                        <span>Email duy nhất</span>
                        <strong>{plxEmailUniqueEmails}</strong>
                      </div>
                      <div>
                        <span>Nhóm tên trùng</span>
                        <strong>{plxEmailDuplicateGroups}</strong>
                      </div>
                    </div>
                    <div className="vtools-email-preview">
                      <table>
                        <thead>
                          <tr>
                            <th>STT</th>
                            <th>Nhóm</th>
                            <th>Họ và tên</th>
                            <th>Đơn vị</th>
                            <th>Email VTraining</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plxEmailPreviewRows.map((row) => (
                            <tr key={`${row.index}-${row.fullName}-${row.generatedEmail}`}>
                              <td>{row.index}</td>
                              <td>{row.group || '-'}</td>
                              <td>
                                <strong>{row.fullName}</strong>
                                {row.duplicateTotal > 1 ? <small>Trùng tên: {row.duplicateRank}/{row.duplicateTotal}</small> : null}
                              </td>
                              <td>{row.unit || '-'}</td>
                              <td>{row.generatedEmail}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {plxEmailRows.length > plxEmailPreviewRows.length ? (
                        <div className="vtools-email-preview-note">Đang hiển thị 12 dòng đầu; file xuất vẫn bao gồm toàn bộ {plxEmailRows.length} học viên.</div>
                      ) : null}
                    </div>
                    <div className="action-row">
                      <button className="btn btn-primary" type="button" onClick={downloadPlxEmailXlsx}>
                        <Download size={16} aria-hidden="true" />
                        Xuất Excel import VTraining
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={downloadPlxEmailCsv}>
                        Xuất CSV
                      </button>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
    </>
  );
}
