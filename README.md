# VContent 3.0

Repo moi cho VContent 3.0, di theo pattern cua `ecoteam`: Vite + React SPA + `api/` + `supabase/`.

## Cau truc

- `src/`: ung dung React
- `src/pages`: page-level screens
- `src/components`: UI va layout blocks
- `src/lib`: contract va utility chung
- `api/`: serverless endpoints cho Vercel
- `supabase/`: migrations va policy

## Chay local

```bash
npm install
npm run dev
```

Env local:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Build

```bash
npm run build
```

## Deploy

Repo nay deploy o root repo tren Vercel nhu mot Vite SPA.

## Nguyên tắc dữ liệu V-Work

- Không tạo hoặc chèn nội dung mock, sample, demo hay công việc giả vào trạng thái V-Work dùng chung.
- Trạng thái rỗng phải hiển thị dữ liệu thật với số lượng `0`; không tạo nội dung giả để lấp giao diện.
- Dữ liệu kiểm thử E2E phải được cô lập khỏi dữ liệu vận hành và dọn sạch sau khi kiểm thử.
