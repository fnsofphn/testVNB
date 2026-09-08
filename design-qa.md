# Design QA — Điều hướng phân tầng VWork

## Comparison target

- Current-state evidence: `C:\Users\admin\AppData\Local\Temp\codex-clipboard-c178fc55-2f91-4c09-b36e-007ff6c749dc.png` (1591 × 803 px).
- Requested flow: Dự án → Khóa học → Lớp → popup chi tiết.
- Implementation route: `/vwork/training-operations?view=structure`.
- Implementation screenshot: unavailable because the local route requires an authenticated VWork session.

## Audit finding

- The old course administration card and inline create form competed with the hierarchy browser.
- Global context selectors duplicated the same Project/Course/Class hierarchy on the structure screen.
- The generic `Thêm khóa học` label did not identify the parent project.

## Implemented structure

- The structure screen now starts with a project table containing all accessible projects.
- Selecting a project opens its course table; selecting a course opens only that course's classes.
- Selecting a class opens its details and task configuration in an accessible modal.
- `Thêm khóa học vào {projectCode}` opens a modal instead of an inline form.
- Course management and duplication remain row-level actions; `Ekip khóa học` is retained inside the course-management modal.
- The global context selectors are hidden only on this structure screen to avoid duplicate navigation.

## Verification

- Architecture assertions: passed.
- Domain tests: passed.
- API tests: passed.
- Typecheck: passed.
- Production build: passed.
- Authenticated visual and interaction comparison: blocked.

## Final result

final result: blocked

Blocker: an authenticated browser-rendered screenshot is required to validate layout, focus order, modal scrolling, and responsive behavior in the real VWork shell.
