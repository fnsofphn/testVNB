import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import JSZip from 'jszip';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { SectionHeader } from '@/components/ui/Primitives';
import {
  getTodayTodoList,
  listProfiles,
  upsertTodayTodoList,
  type ProfileRow,
  type TodayTodoItemPayload,
  type TodayTodoSectionPayload,
} from '@/services/vcontent';

type TodoAccount = {
  id: string;
  name: string;
  role: string;
  email: string;
};

type TodoSection = {
  id: string;
  title: string;
} & TodayTodoSectionPayload;

type TodoItem = {
  id: string;
  sectionId: string;
  title: string;
  note: string;
  done: boolean;
} & TodayTodoItemPayload;

type TodoChecklist = {
  sections: TodoSection[];
  items: TodoItem[];
};

type TodoExportSection = TodoSection & {
  items: TodoItem[];
};

const STORAGE_KEY = 'vcontent.today.todo.v2';

const DEFAULT_SECTIONS: TodoSection[] = [
  { id: 'survey', title: '1.1. Sửa 03 khảo sát' },
  { id: 'game', title: '1.2. Sửa game và chạy thử' },
  { id: 'voice', title: '1.3. Liên hệ cộng tác viên thu voice' },
  { id: 'admin', title: '1.4. Điều phối / phát sinh' },
];

const FALLBACK_ACCOUNTS: TodoAccount[] = [
  { id: 'nam', name: 'Nam', role: 'PM', email: 'nam@vinabrain.local' },
  { id: 'huyen', name: 'Huyền Vũ', role: 'Specialist', email: 'huyen@vinabrain.local' },
  { id: 'hailt', name: 'Hải LT', role: 'Specialist', email: 'hailt@vinabrain.local' },
];

const DEFAULT_ITEMS: TodoItem[] = [
  { id: 'seed-1', sectionId: 'survey', title: 'Rà lại feedback/yêu cầu chỉnh sửa của 03 khảo sát.', note: '', done: false },
  { id: 'seed-2', sectionId: 'survey', title: 'Sửa khảo sát 01.', note: '', done: false },
  { id: 'seed-3', sectionId: 'survey', title: 'Sửa khảo sát 02.', note: '', done: false },
  { id: 'seed-4', sectionId: 'survey', title: 'Sửa khảo sát 03.', note: '', done: false },
  { id: 'seed-5', sectionId: 'survey', title: 'Kiểm tra logic câu hỏi, hướng trả lời và link khảo sát sau chỉnh sửa.', note: '', done: false },
  { id: 'seed-6', sectionId: 'survey', title: 'Gửi bản hoàn thiện để rà soát/chốt.', note: '', done: false },
  { id: 'seed-7', sectionId: 'game', title: 'Tổng hợp lỗi/feedback của 03 game.', note: '', done: false },
  { id: 'seed-8', sectionId: 'game', title: 'Sửa lỗi/feedback Game 01.', note: '', done: false },
  { id: 'seed-9', sectionId: 'game', title: 'Sửa lỗi/feedback Game 02.', note: '', done: false },
  { id: 'seed-10', sectionId: 'game', title: 'Sửa lỗi/feedback Game 03.', note: '', done: false },
  { id: 'seed-11', sectionId: 'game', title: 'Chạy thử từng game theo luồng người học.', note: '', done: false },
  { id: 'seed-12', sectionId: 'game', title: 'Ghi nhận lỗi còn lại và xử lý nhanh các lỗi phát sinh.', note: '', done: false },
  { id: 'seed-13', sectionId: 'game', title: 'Chốt bản chạy thử để team test/feedback.', note: '', done: false },
  { id: 'seed-14', sectionId: 'voice', title: 'Liên hệ CTV Voice 01.', note: '', done: false },
  { id: 'seed-15', sectionId: 'voice', title: 'Liên hệ CTV Voice 02.', note: '', done: false },
  { id: 'seed-16', sectionId: 'voice', title: 'Gửi script demo và yêu cầu kỹ thuật thu âm.', note: '', done: false },
  { id: 'seed-17', sectionId: 'voice', title: 'Yêu cầu mỗi CTV thu voice thử theo script.', note: '', done: false },
  { id: 'seed-18', sectionId: 'admin', title: 'Chị Hạnh gửi hỗ trợ phương án vận hành lớp HCMC.', note: '', done: false },
];

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function getVietnameseDateLabel(date: Date) {
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function makeStorageKey(accountId: string, dateKey: string) {
  return `${STORAGE_KEY}:${accountId}:${dateKey}`;
}

function loadChecklist(accountId: string, dateKey: string): TodoChecklist {
  if (typeof window === 'undefined') return { sections: [], items: [] };
  try {
    const raw = window.localStorage.getItem(makeStorageKey(accountId, dateKey));
    if (!raw) return { sections: [], items: [] };
    const parsed = JSON.parse(raw) as TodoChecklist | TodoItem[];
    if (Array.isArray(parsed)) return { sections: DEFAULT_SECTIONS, items: parsed };
    if (!parsed || !Array.isArray(parsed.sections) || !Array.isArray(parsed.items)) return { sections: [], items: [] };
    return parsed;
  } catch {
    return { sections: [], items: [] };
  }
}

function saveChecklist(accountId: string, dateKey: string, checklist: TodoChecklist) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(makeStorageKey(accountId, dateKey), JSON.stringify(checklist));
}

function mapProfileToAccount(profile: ProfileRow): TodoAccount {
  return {
    id: profile.id,
    name: profile.full_name || profile.email || profile.id,
    role: profile.title || profile.role || 'Account',
    email: profile.email || '',
  };
}

function makeNewItem(sectionId: string, index: number): TodoItem {
  return {
    id: `todo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sectionId,
    title: `Công việc mới ${index}`,
    note: '',
    done: false,
  };
}

function makeNewSection(index: number): TodoSection {
  return {
    id: `section-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: `Bảng ${index}`,
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'today-do-list';
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

function getExportSections(sections: TodoSection[], items: TodoItem[]): TodoExportSection[] {
  return sections.map((section) => ({
    ...section,
    items: items.filter((item) => item.sectionId === section.id),
  }));
}

function buildExportFileBase(account: TodoAccount | undefined, dateKey: string) {
  return sanitizeFileName(`today-do-${account?.name || 'account'}-${dateKey}`);
}

function buildWordDocumentXml(input: {
  account?: TodoAccount;
  dateLabel: string;
  sections: TodoExportSection[];
  completedCount: number;
  totalCount: number;
}) {
  const progress = input.totalCount ? Math.round((input.completedCount / input.totalCount) * 100) : 0;
  const rows = input.sections.map((section) => {
    const itemRows = section.items.length
      ? section.items.map((item, index) => `
        <w:tr>
          <w:tc><w:p><w:r><w:t>${item.done ? 'x' : ''}</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>${index + 1}</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>${escapeXml(item.title || '')}</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>${escapeXml(item.note || '')}</w:t></w:r></w:p></w:tc>
        </w:tr>`).join('')
      : `
        <w:tr>
          <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Chua co cong viec</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        </w:tr>`;

    return `
      <w:p>
        <w:pPr><w:spacing w:before="220" w:after="100"/></w:pPr>
        <w:r><w:rPr><w:b/><w:color w:val="5F4813"/></w:rPr><w:t>${escapeXml(section.title || 'Bảng công việc')}</w:t></w:r>
      </w:p>
      <w:tbl>
        <w:tblPr>
          <w:tblW w:w="5000" w:type="pct"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="6" w:space="0" w:color="D4AF37"/>
            <w:left w:val="single" w:sz="6" w:space="0" w:color="D4AF37"/>
            <w:bottom w:val="single" w:sz="6" w:space="0" w:color="D4AF37"/>
            <w:right w:val="single" w:sz="6" w:space="0" w:color="D4AF37"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9CBA0"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9CBA0"/>
          </w:tblBorders>
        </w:tblPr>
        <w:tr>
          <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Xong</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>STT</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Công việc chi tiết</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Ghi chú / kết quả</w:t></w:r></w:p></w:tc>
        </w:tr>
        ${itemRows}
      </w:tbl>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>CHECKLIST CÔNG VIỆC HÔM NAY</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="64748B"/></w:rPr><w:t>${escapeXml(input.dateLabel)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Account: </w:t></w:r>
      <w:r><w:t>${escapeXml(input.account?.name || 'Account')} - ${escapeXml(input.account?.role || '')}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Tiến độ: </w:t></w:r>
      <w:r><w:t>${progress}% (${input.completedCount}/${input.totalCount} xong)</w:t></w:r>
    </w:p>
    ${rows}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="900" w:right="720" w:bottom="900" w:left="720" w:header="450" w:footer="450" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function exportTodoToWord(input: {
  account?: TodoAccount;
  dateKey: string;
  dateLabel: string;
  sections: TodoExportSection[];
  completedCount: number;
  totalCount: number;
}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder('word')?.file('document.xml', buildWordDocumentXml(input));
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Today-do list</dc:title>
  <dc:creator>VContent</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`);
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>VContent</Application></Properties>`);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  downloadBlob(blob, `${buildExportFileBase(input.account, input.dateKey)}.docx`);
}

function buildPrintableTodoHtml(input: {
  account?: TodoAccount;
  dateLabel: string;
  sections: TodoExportSection[];
  completedCount: number;
  totalCount: number;
}) {
  const progress = input.totalCount ? Math.round((input.completedCount / input.totalCount) * 100) : 0;
  const sectionsHtml = input.sections.map((section) => {
    const itemRows = section.items.length
      ? section.items.map((item, index) => `
        <tr>
          <td class="center">${item.done ? 'x' : ''}</td>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(item.title || '')}</td>
          <td>${escapeHtml(item.note || '')}</td>
        </tr>`).join('')
      : '<tr><td></td><td></td><td>Chưa có công việc</td><td></td></tr>';

    return `
      <section>
        <h2>${escapeHtml(section.title || 'Bảng công việc')}</h2>
        <table>
          <thead><tr><th>Xong</th><th>STT</th><th>Công việc chi tiết</th><th>Ghi chú / kết quả</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </section>`;
  }).join('');

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Today-do list</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1f2937; font-family: Arial, sans-serif; font-size: 12px; }
    header { text-align: center; margin-bottom: 18px; }
    h1 { margin: 0 0 6px; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; letter-spacing: 0.04em; }
    .date { color: #64748b; font-style: italic; }
    .meta { display: flex; justify-content: space-between; gap: 16px; margin: 16px 0; padding: 10px 12px; border: 1px solid #d9cba0; background: #fffaf0; }
    section { break-inside: avoid; margin-top: 14px; }
    h2 { margin: 0; padding: 8px 10px; color: #5f4813; font-size: 14px; border: 1px solid #d4af37; border-bottom: 0; background: #fff8db; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d9cba0; padding: 7px; vertical-align: top; }
    th { background: #f5eed6; color: #5f4813; text-align: center; }
    th:nth-child(1), td:nth-child(1) { width: 42px; }
    th:nth-child(2), td:nth-child(2) { width: 42px; }
    th:nth-child(4), td:nth-child(4) { width: 30%; }
    .center { text-align: center; }
  </style>
</head>
<body>
  <header>
    <h1>CHECKLIST CÔNG VIỆC HÔM NAY</h1>
    <div class="date">${escapeHtml(input.dateLabel)}</div>
  </header>
  <div class="meta">
    <div><strong>Account:</strong> ${escapeHtml(input.account?.name || 'Account')} - ${escapeHtml(input.account?.role || '')}</div>
    <div><strong>Tiến độ:</strong> ${progress}% (${input.completedCount}/${input.totalCount} xong)</div>
  </div>
  ${sectionsHtml}
</body>
</html>`;
}

export function TodayTodoPage() {
  const profilesQuery = useQuery({ queryKey: ['profiles', 'today-todo'], queryFn: listProfiles });
  const accounts = useMemo<TodoAccount[]>(() => {
    const activeProfiles = (profilesQuery.data || [])
      .filter((profile: ProfileRow) => profile.active !== false && !['client', 'client_director', 'hoc_vien'].includes(String(profile.role || '')))
      .map(mapProfileToAccount);
    return activeProfiles.length ? activeProfiles : FALLBACK_ACCOUNTS;
  }, [profilesQuery.data]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [dateKey, setDateKey] = useState(() => formatDateKey(new Date()));
  const [loadedChecklistKey, setLoadedChecklistKey] = useState('');
  const [sections, setSections] = useState<TodoSection[]>([]);
  const [items, setItems] = useState<TodoItem[]>([]);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || accounts[0];
  const selectedDate = parseDateKey(dateKey);
  const remoteChecklistQuery = useQuery({
    queryKey: ['today-todo-list', selectedAccount?.id || '', dateKey],
    queryFn: () => getTodayTodoList(selectedAccount?.id || '', dateKey),
    enabled: Boolean(selectedAccount?.id),
    retry: 1,
  });
  const saveChecklistMutation = useMutation({
    mutationFn: upsertTodayTodoList,
  });
  const saveRemoteChecklist = saveChecklistMutation.mutate;

  useEffect(() => {
    if (!selectedAccountId && accounts[0]) setSelectedAccountId(accounts[0].id);
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    if (!selectedAccount) return;
    const storageKey = makeStorageKey(selectedAccount.id, dateKey);

    if (remoteChecklistQuery.isLoading) {
      setLoadedChecklistKey('');
      setSections([]);
      setItems([]);
      return;
    }

    if (remoteChecklistQuery.data) {
      setSections(remoteChecklistQuery.data.sections);
      setItems(remoteChecklistQuery.data.items);
      setLoadedChecklistKey(storageKey);
      saveChecklist(selectedAccount.id, dateKey, {
        sections: remoteChecklistQuery.data.sections,
        items: remoteChecklistQuery.data.items,
      });
      return;
    }

    const checklist = loadChecklist(selectedAccount.id, dateKey);
    setSections(checklist.sections);
    setItems(checklist.items);
    setLoadedChecklistKey(storageKey);
  }, [dateKey, remoteChecklistQuery.data, remoteChecklistQuery.error, remoteChecklistQuery.isLoading, selectedAccount]);

  useEffect(() => {
    if (!selectedAccount) return;
    if (loadedChecklistKey !== makeStorageKey(selectedAccount.id, dateKey)) return;
    const checklist = { sections, items };
    saveChecklist(selectedAccount.id, dateKey, checklist);

    if (!remoteChecklistQuery.data && items.length === 0) return;

    const saveTimer = window.setTimeout(() => {
      saveRemoteChecklist({
        accountProfileId: selectedAccount.id,
        dateKey,
        sections,
        items,
      });
    }, 550);

    return () => window.clearTimeout(saveTimer);
  }, [dateKey, items, loadedChecklistKey, remoteChecklistQuery.data, saveRemoteChecklist, sections, selectedAccount]);

  const completedCount = items.filter((item) => item.done).length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const remainingCount = Math.max(0, items.length - completedCount);
  const exportDateLabel = getVietnameseDateLabel(selectedDate);
  const exportSections = useMemo(() => getExportSections(sections, items), [items, sections]);
  const syncLabel = remoteChecklistQuery.isError || saveChecklistMutation.isError
    ? 'Lưu cục bộ'
    : remoteChecklistQuery.isLoading
      ? 'Đang tải'
      : saveChecklistMutation.isPending
        ? 'Đang đồng bộ'
        : 'Đã đồng bộ';

  function shiftDate(delta: number) {
    const next = parseDateKey(dateKey);
    next.setDate(next.getDate() + delta);
    setDateKey(formatDateKey(next));
  }

  function updateItem(itemId: string, patch: Partial<TodoItem>) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function updateSection(sectionId: string, patch: Partial<TodoSection>) {
    setSections((current) => current.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)));
  }

  function addSection() {
    const nextSection = makeNewSection(sections.length + 1);
    setSections((current) => [...current, nextSection]);
    setItems((current) => [...current, makeNewItem(nextSection.id, 1)]);
  }

  function addItem(sectionId: string) {
    const index = items.filter((item) => item.sectionId === sectionId).length + 1;
    setItems((current) => [...current, makeNewItem(sectionId, index)]);
  }

  function deleteItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  function resetTodayTemplate() {
    if (typeof window !== 'undefined' && !window.confirm('Nạp lại checklist mẫu cho account và ngày đang chọn?')) return;
    setSections(DEFAULT_SECTIONS);
    setItems(DEFAULT_ITEMS.map((item) => ({ ...item, id: `${item.id}-${Date.now()}` })));
  }

  async function handleExportWord() {
    await exportTodoToWord({
      account: selectedAccount,
      dateKey,
      dateLabel: exportDateLabel,
      sections: exportSections,
      completedCount,
      totalCount: items.length,
    });
  }

  function handleExportPdf() {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.alert('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép popup để xuất PDF.');
      return;
    }

    printWindow.document.write(buildPrintableTodoHtml({
      account: selectedAccount,
      dateLabel: exportDateLabel,
      sections: exportSections,
      completedCount,
      totalCount: items.length,
    }));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 120);
  }

  return (
    <div className="today-todo-page">
      <SectionHeader
        eye="Hệ thống"
        title="Today-do list"
        subtitle="Checklist công việc theo account và ngày làm việc."
        actions={
          <div className="action-row">
            <button className="btn btn-ghost today-todo-export-btn" type="button" onClick={handleExportWord}>
              <Download size={16} /> Word
            </button>
            <button className="btn btn-ghost today-todo-export-btn" type="button" onClick={handleExportPdf}>
              <FileText size={16} /> PDF
            </button>
            <button className="btn btn-ghost" type="button" onClick={resetTodayTemplate}>Nạp checklist mẫu</button>
            <button className="btn btn-primary" type="button" onClick={() => setDateKey(formatDateKey(new Date()))}>Hôm nay</button>
          </div>
        }
      />

      <div className="today-todo-shell">
        <main className="today-todo-paper">
          <div className="today-todo-paper-head">
            <div>
              <label className="today-todo-account-select">
                <span>Account</span>
                <select value={selectedAccount?.id || ''} onChange={(event) => setSelectedAccountId(event.target.value)}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} - {account.role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="today-todo-kicker">{selectedAccount?.name || 'Account'}</div>
              <h3>CHECKLIST CÔNG VIỆC HÔM NAY</h3>
              <p>{getVietnameseDateLabel(selectedDate)} · {syncLabel}</p>
            </div>
            <div className="today-todo-score">
              <strong>{progress}%</strong>
              <span>{completedCount}/{items.length} xong</span>
            </div>
          </div>

          <div className="today-todo-sections">
            {sections.map((section) => {
              const sectionItems = items.filter((item) => item.sectionId === section.id);
              return (
                <section className="today-todo-section" key={section.id}>
                  <div className="today-todo-section-head">
                    <input
                      className="today-todo-section-title"
                      value={section.title}
                      onChange={(event) => updateSection(section.id, { title: event.target.value })}
                      placeholder="Tên bảng"
                    />
                  </div>
                  <table className="today-todo-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>STT</th>
                        <th>Công việc chi tiết</th>
                        <th>Ghi chú / kết quả</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionItems.map((item, index) => (
                        <tr key={item.id} className={item.done ? 'is-done' : ''}>
                          <td>
                            <button className="today-todo-check" type="button" onClick={() => updateItem(item.id, { done: !item.done })}>
                              {item.done ? <Check size={14} /> : null}
                            </button>
                          </td>
                          <td>{index + 1}</td>
                          <td>
                            <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                          </td>
                          <td>
                            <input value={item.note} onChange={(event) => updateItem(item.id, { note: event.target.value })} />
                          </td>
                          <td>
                            <button className="today-todo-delete" type="button" onClick={() => deleteItem(item.id)} aria-label="Xóa công việc">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="today-todo-add-row">
                        <td colSpan={4}></td>
                        <td>
                          <button className="today-todo-add-inline" type="button" onClick={() => addItem(section.id)} aria-label="Thêm công việc">
                            <Plus size={15} />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              );
            })}
            <button className="today-todo-add-table" type="button" onClick={addSection}>
              <Plus size={16} /> Thêm bảng
            </button>
          </div>
        </main>

        <aside className="today-todo-calendar">
          <div className="today-todo-calendar-glass">
            <div className="today-todo-calendar-top">
              <button type="button" onClick={() => shiftDate(-1)} aria-label="Ngày trước"><ChevronLeft size={18} /></button>
              <CalendarDays size={22} />
              <button type="button" onClick={() => shiftDate(1)} aria-label="Ngày sau"><ChevronRight size={18} /></button>
            </div>
            <div className="today-todo-day">{selectedDate.getDate()}</div>
            <div className="today-todo-month">
              {selectedDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
            </div>
            <input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value || formatDateKey(new Date()))} />
            <div className="today-todo-calendar-stats">
              <div><strong>{remainingCount}</strong><span>việc còn lại</span></div>
              <div><strong>{completedCount}</strong><span>đã hoàn thành</span></div>
            </div>
            <div className="today-todo-pro-tip">
              <strong>Đề xuất vận hành</strong>
              <span>Chốt 3 việc quan trọng trước 10:00, ghi kết quả cuối ngày và chuyển việc tồn sang ngày mai.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
