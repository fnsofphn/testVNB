# Design QA — Course role assignment

## Visual truth

- Source: `D:\04. Code\Vwork\VWork-Van-Hanh-Gui-Sep-v2.html`, course team screen served locally at `http://127.0.0.1:4174/VWork-Van-Hanh-Gui-Sep-v2.html`.
- Implementation: `/vwork/training-operations?view=team&projectId=EVNSPC-2026&courseId=CX-FOUNDATION` served locally at `http://127.0.0.1:3000`.
- Captures: Codex in-app Browser captures (inline; the browser surface does not expose a screenshot file path).
- Desktop viewport: application browser viewport after clearing the temporary override (approximately 1265 × 710 in the captured frame).
- Mobile viewport: 390 × 844.
- Source and implementation were compared at the same page region: course access hero, role matrix, row actions, and assignment dialog.

## Iteration log

1. **P1 — fixed:** the implementation used one inline form and a flat assignment list, while the reference grouped accounts under five course roles. Replaced it with the course selector, role matrix, role status, per-role add action, removable account chips, and focused assignment dialog.
2. **P2 — fixed:** at the mobile breakpoint the full navigation occupied a two-column block above the workspace. Replaced it with a compact menu button, off-canvas navigation, backdrop close action, and horizontal role-table access.
3. **Final pass:** desktop and 390 × 844 mobile captures contain no remaining P0, P1, or P2 visual mismatch in the requested surface.

## Required surface checks

- Typography: existing VWork font scale and weights retained; course-access hierarchy matches the reference.
- Spacing/layout: hero, surface header, guidance note, table density, and modal spacing match the reference structure.
- Color: existing product design tokens retained; primary red, navy navigation, muted surfaces, and amber/green status treatments match the reference intent.
- Image assets: no unique reference image asset is used on this screen; the existing PeopleOne brand mark is retained.
- Copy: role names, role scope descriptions, status labels, and manager/approver guidance are aligned with the reference and feedback.
- Responsive behavior: desktop matrix and mobile off-canvas navigation verified; the matrix remains horizontally accessible on narrow screens.
- Interaction: global and per-row assign actions open the dialog; account removal remains connected to the existing confirmed domain command.

## Final result

**Passed.** No unresolved P0, P1, or P2 design issue remains in the requested course-role assignment flow. Local preview showed the expected Supabase-not-configured alert because production credentials are intentionally unavailable locally; this does not affect the visual-shell verification or the underlying production service integration.
