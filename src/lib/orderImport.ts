import * as XLSX from 'xlsx';

export type ImportedModuleCode = 'ELN' | 'VIDEO' | 'GAME';

export type ImportedProductDraft = {
  rowNumber: number;
  sourceCode: string;
  module: ImportedModuleCode;
  detail: string;
  productType: string;
  basket: string;
  priority: string;
  scriptStatus: string;
  productStatus: string;
};

export type ImportedOrderDraft = {
  title: string;
  client: string;
  baskets: string[];
  priorities: string[];
  bundleCounts: {
    eln: number;
    video: number;
    game: number;
  };
  products: ImportedProductDraft[];
  intakeNote: string;
};

export type ImportedWorkbookPreview = {
  fileName: string;
  sheetName: string;
  totalRows: number;
  validRows: number;
  ignoredRows: number;
  counts: {
    eln: number;
    video: number;
    game: number;
  };
  orders: ImportedOrderDraft[];
};

type RawWorkbookRow = {
  rowNumber: number;
  project: string;
  client: string;
  basket: string;
  priority: string;
  code: string;
  detail: string;
  productType: string;
  scriptStatus: string;
  productStatus: string;
};

function normalizeCell(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function mapWorkbookCodeToModule(code: string): ImportedModuleCode | null {
  const normalized = normalizeCell(code).toUpperCase();
  if (normalized.startsWith('HL')) return 'VIDEO';
  if (normalized.startsWith('ELN')) return 'ELN';
  if (normalized.startsWith('GAME')) return 'GAME';
  return null;
}

function toProductDraft(row: RawWorkbookRow): ImportedProductDraft | null {
  const module = mapWorkbookCodeToModule(row.code);
  if (!row.project || !row.client || !row.code || !row.detail || !module) {
    return null;
  }

  return {
    rowNumber: row.rowNumber,
    sourceCode: row.code.toUpperCase(),
    module,
    detail: row.detail,
    productType: row.productType,
    basket: row.basket,
    priority: row.priority,
    scriptStatus: row.scriptStatus,
    productStatus: row.productStatus,
  };
}

function buildOrderIntakeNote(order: ImportedOrderDraft, fileName: string) {
  const basketSummary = order.baskets.length ? order.baskets.join(', ') : '-';
  const prioritySummary = order.priorities.length ? order.priorities.join(', ') : '-';

  return [
    `Import từ file: ${fileName}`,
    `Nhóm nội dung: ${basketSummary}`,
    `Ưu tiên: ${prioritySummary}`,
    `Sản phẩm: ELN ${order.bundleCounts.eln} / VIDEO ${order.bundleCounts.video} / GAME ${order.bundleCounts.game}`,
  ].join('\n');
}

export async function parseWorkbookToOrderPreview(file: File): Promise<ImportedWorkbookPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Workbook khong co sheet hop le.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
  const rawRows: RawWorkbookRow[] = rows.slice(4).map((row, index) => ({
    rowNumber: index + 5,
    project: normalizeCell(row[1]),
    client: normalizeCell(row[2]),
    basket: normalizeCell(row[3]),
    priority: normalizeCell(row[4]),
    code: normalizeCell(row[5]),
    detail: normalizeCell(row[6]),
    productType: normalizeCell(row[7]),
    scriptStatus: normalizeCell(row[8]),
    productStatus: normalizeCell(row[9]),
  }));

  const validProducts = rawRows.map(toProductDraft).filter(Boolean) as ImportedProductDraft[];
  const groupedOrders = new Map<string, ImportedOrderDraft>();

  validProducts.forEach((product) => {
    const rawRow = rawRows.find((row) => row.rowNumber === product.rowNumber);
    if (!rawRow) return;

    const key = `${rawRow.project}__${rawRow.client}`;
    const existing =
      groupedOrders.get(key) ||
      ({
        title: rawRow.project,
        client: rawRow.client,
        baskets: [],
        priorities: [],
        bundleCounts: { eln: 0, video: 0, game: 0 },
        products: [],
        intakeNote: '',
      } satisfies ImportedOrderDraft);

    if (product.basket && !existing.baskets.includes(product.basket)) {
      existing.baskets.push(product.basket);
    }
    if (product.priority && !existing.priorities.includes(product.priority)) {
      existing.priorities.push(product.priority);
    }

    existing.products.push(product);
    if (product.module === 'ELN') existing.bundleCounts.eln += 1;
    if (product.module === 'VIDEO') existing.bundleCounts.video += 1;
    if (product.module === 'GAME') existing.bundleCounts.game += 1;

    groupedOrders.set(key, existing);
  });

  const orders = Array.from(groupedOrders.values())
    .map((order) => ({
      ...order,
      products: [...order.products].sort((a, b) => a.rowNumber - b.rowNumber),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'vi'));

  orders.forEach((order) => {
    order.intakeNote = buildOrderIntakeNote(order, file.name);
  });

  return {
    fileName: file.name,
    sheetName,
    totalRows: rawRows.length,
    validRows: validProducts.length,
    ignoredRows: rawRows.length - validProducts.length,
    counts: validProducts.reduce(
      (acc, product) => {
        if (product.module === 'ELN') acc.eln += 1;
        if (product.module === 'VIDEO') acc.video += 1;
        if (product.module === 'GAME') acc.game += 1;
        return acc;
      },
      { eln: 0, video: 0, game: 0 },
    ),
    orders,
  };
}

export function buildOrderImportTemplateWorkbook() {
  const rows = [
    ['VContent Import Template'],
    ['Huong dan', 'Nhap du lieu tu dong bat dau tu dong 5. Ma san pham phai bat dau bang ELN, HL hoac GAME.'],
    [],
    ['STT', 'Du an', 'Client', 'Basket', 'Priority', 'Ma', 'Noi dung chi tiet', 'Loai san pham', 'Tinh trang script', 'Tinh trang san pham'],
    [1, 'Chuong trinh onboarding sales', 'Cong ty ABC', 'Batch 01', 'High', 'ELN-001', 'Khoa hoc onboarding cho nhan vien moi', 'Course', 'Ready', 'New'],
    [2, 'Chuong trinh onboarding sales', 'Cong ty ABC', 'Batch 01', 'High', 'HL-001', 'Video gioi thieu van hoa cong ty', 'Video', 'Ready', 'New'],
    [3, 'Game ky nang ban hang', 'Cong ty XYZ', 'Batch Game', 'Medium', 'GAME-001', 'Mini game tinh huong cham soc khach hang', 'Game', 'Draft', 'New'],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 48 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ImportOrders');
  return workbook;
}

export function downloadOrderImportTemplate() {
  const workbook = buildOrderImportTemplateWorkbook();
  XLSX.writeFile(workbook, 'vcontent-order-import-template.xlsx');
}
