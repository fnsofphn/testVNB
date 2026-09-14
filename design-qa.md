# Design QA — VWork operations overview

## Visual truth

- Source visual: `D:\04. Code\Vwork\VWork-Van-Hanh-Gui-Sep-v2.html`, default `overview` state.
- Implementation: `http://127.0.0.1:3000/vwork/training-operations?view=overview&designPreview=1`.
- Evidence: source and implementation were captured together in the Codex in-app Browser. That browser surface provides inline images but does not expose a screenshot file path.
- Desktop comparison: 1280 × 720 CSS px, DPR 1.25, same browser and same collapsed-table state.
- Mobile check: 390 × 844 CSS px; off-canvas navigation, two-column KPI grid, responsive toolbar, and horizontally accessible hierarchy table.
- Source data is the HTML's fixed 11/09/2026 demonstration state. Implementation data is the existing VWork seed/production model, so KPI values and dates intentionally reflect current persisted data rather than copying mock values.

## Full-view comparison

The implementation now follows the reference composition in the same order: compact top bar, dark navigation, operations hero, five KPI cards, multi-level surface header, search/expand controls, Table/Calendar tabs, status summary, and collapsed project rows. Existing VWork colors, DM Sans typography, borders, radii, and status tokens are retained.

## Focused comparison

The hierarchy region was inspected separately because its dense columns and interactions are the acceptance-critical area. Column order, short dates, progress bars, multi-status warnings, project/course expansion, class navigation, and empty search feedback were checked. Project and course rows expand in place; selecting a class opens its scoped task list.

## Comparison history

1. **P1 — fixed:** production's default overview began with the old card hierarchy and global project/course/class selectors, missing the reference hero, KPI strip, and table surface. The global selectors and generic project header are now suppressed on overview, and the reference information architecture is implemented.
2. **P2 — fixed:** the first implementation pass used an oversized hero/KPI rhythm compared with the source. Hero height, heading scale, KPI padding, surface header height, workspace padding, radii, and vertical gaps were measured against the source and reduced to matching values.
3. **P2 — fixed:** the first table pass overflowed at the 1280 desktop comparison and truncated the project title. Column widths were rebalanced, short dates were adopted, titles can wrap, and simultaneous overdue/waiting/input-change alerts render as separate pills.
4. **Final pass:** source and implementation were captured together at 1280 × 720. No actionable P0, P1, or P2 visual mismatch remains in the requested overview surface.

## Required fidelity surfaces

- Fonts and typography: DM Sans/system fallback, optical weights, sizes, line heights, wrapping, and hierarchy match the source intent.
- Spacing and layout: 242 px desktop sidebar, 22 × 28 px overview workspace padding, 96 px hero, compact KPI cards, 76 px surface header, and table density align with the HTML reference.
- Colors and tokens: existing VWork red, dark burgundy navigation, navy copy, pale canvas, semantic green/blue/gray/red/amber/purple pills retained.
- Image and asset quality: this screen has no content imagery; the existing PeopleOne brand mark and Lucide chevrons are retained, with no generated or placeholder assets.
- Copy and content: overview labels, hierarchy instructions, KPI names, table columns, navigation labels, and Table/Calendar controls align with the reference. Only real data values differ by design.

## Interaction and runtime checks

- Project expand/collapse: passed.
- Course expand/collapse: passed.
- Class → scoped work navigation: passed.
- Table → Calendar → Table: passed.
- Search and no-results state: implemented.
- Browser console errors: none.
- Local-only Supabase configuration alert: expected because production credentials are not loaded into the isolated preview; it is not part of the deployed authenticated state.

## Final result

passed
