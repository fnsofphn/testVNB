# Design QA — VWork feedback 11/09

- Source visual truth: `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-bb939e37-66eb-4a04-bb83-25db7050abce.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-c0b6574b-45e5-4954-9c0d-a585eec32ec7.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-cca31b99-b3d9-428f-895e-ccf7ed9cfa89.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-0d63c691-2e68-48f1-a59f-de3e37bec356.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-52170ef4-36a6-4d05-8987-5cfd08065adc.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-e8e0d649-19c3-434a-b632-b1d2e9668fd8.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-c58be1bc-2178-4fba-9b01-8a7fba3f2182.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-e5414bfc-2360-499c-a02d-913839434039.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-54dc7d61-7091-4c6c-b9a0-747307dcb06f.png`, and `D:\04. Code\Vwork\VWork-Van-Hanh-Gui-Sep-v2.html`
- Implementation: `http://127.0.0.1:4173/vwork/training-operations`
- Implementation screenshot evidence: browser-rendered Codex in-app browser captures recorded in the implementation task (desktop overview/table/calendar/structure/due/task detail and mobile overview/navigation). The browser surface does not expose a filesystem path for captures.
- Desktop viewport: 1265 × 713 CSS px, device scale factor 1
- Mobile/compact viewports: 390 × 844 and 820 × 844 CSS px; breakpoint boundary checked at 1100/1101 × 844; device scale factor 1
- Source pixels: 1536 × 960; source includes browser chrome while implementation evidence uses the application viewport, so comparison was normalized by judging the shared app-content region.
- State: Operations overview with expanded hierarchy; class TNKH01 work configuration, disable confirmation, direct task navigation; Content read-only configuration; compact 820 px configuration view.

## Full-view comparison evidence

The rendered implementation retains the reference composition and visual hierarchy: dark burgundy fixed navigation, white sticky top bar, pale workspace background, red section accents, compact KPI row, and expandable Project → Course → Class table. Feedback-driven deviations are intentional: the shared Project/Course/Class filters and Overview create/change actions are added above the KPI row.

## Focused region comparison evidence

- Overview: four KPI cards now match the reference count and proportions; project rows use blue, ended classes green, running classes blue, and upcoming classes yellow.
- Calendar: only mini-calendar/date selection remains as the date control; the selected class filters mini-calendar dots and primary calendar events together.
- Structure: Add Course opens a full-width inline form instead of the removed management popup.
- Due/task detail: overdue and upcoming sections are complete; the empty duplicate drawer was removed; the detail header contains task identity/status only; deadline is a date and no assignment controls appear in the due view.
- Mobile: filters stack vertically, KPI cards form a two-column grid, and the off-canvas menu remains operable without horizontal viewport overflow.
- Compact browser: at 820 px the persistent sidebar is replaced by the menu button, filters stack to a readable single column, KPIs remain two columns, and opening the menu produces the expected drawer/backdrop state.
- Hierarchy: dense decimal identifiers (`1.1`, `1.1.1`) are removed. Project, course, and class rows use distinct Lucide icons, disclosure controls, and increasing indentation to communicate the tree without competing with business codes.
- Class coverage: a high-contrast total-class badge is always visible before the state totals; project and course names carry compact class-count badges, so users no longer need to expand and count rows or read truncated metadata.
- Sidebar: the requested training-operation note, sync label, and logout button are absent; navigation keeps its original order and spacing.
- Role navigation: Operations retains Workspace, Work, and Management; Member verification shows only Workspace and Work (`Tổng quan`, `Việc của tôi`) and no Management heading or controls. Forbidden management routes are normalized back to Overview.
- Overdue drill-down: KPI, summary badge, and row alert are actionable and retain all/project/course/class scope in the URL. The final browser pass showed `30` on the KPI and exactly `30` rows in the `QUÁ HẠN` group; a deadline equal to today remains in `SẮP ĐẾN HẠN` on both surfaces.
- Class configuration: the modal now names its purpose, explains immediate persistence, labels task applicability, confirms destructive disable actions, exposes task status, and provides both row-level and footer navigation into the class work screen.
- Task deadline status: class rows and detail headers show the persisted workflow state first and an independent red `Quá hạn X ngày` badge beneath it. At the 14/09/2026 QA date, the 30/08/2026 task visibly showed `Chưa sẵn sàng` plus `Quá hạn 15 ngày` in both the row and drawer.

## Findings and iteration history

1. First pass — P2: an empty task drawer rendered above the due list when no task was selected. Fixed by using a single-column due layout until selection, then rendering the detail drawer. Post-fix capture shows the due list directly below the tracking tabs.
2. First pass — P2: the implementation had a fifth KPI card not present in the reference. Fixed by returning to the four reference KPIs while retaining input-version impact in the table-level alert model. Post-fix source inspection and responsive grid confirm four cards.
3. Compact-window pass — P1: widths from 761 px through the old tablet breakpoint kept a fixed 200 px sidebar, compressing the workspace and top bar into a miniature, hard-to-read layout. Fixed by moving the shell to off-canvas navigation through 1100 px, hiding secondary identity text through 1200 px, and applying stacked filters/two-column KPIs through 960 px. Post-fix captures at 820, 1100, and 1101 px show readable controls, no document overflow, correct breakpoint transitions, and an operable menu drawer.
4. Configuration pass — P1: the former “Chi tiết lớp” modal mixed read-only metrics with an unlabeled status mutation, so users could not tell whether it was for viewing or acting. Fixed with explicit configuration copy, applicability labels, auto-save disclosure, disable confirmation, read-only role treatment, and navigation to class work. Post-fix desktop and 820 px captures show the full flow and the confirmation state.
5. Hierarchy pass — P2: decimal numbering created visual noise and competed with actual project/course/class codes. Fixed by replacing nested numbers with semantic icons, disclosure controls, and indentation. Post-fix expanded-table capture clearly distinguishes all three levels.
6. Class-count pass — P2: after replacing decimal numbering, the number of classes was only inferable from status totals or truncated secondary copy. Fixed by adding a persistent `3 lớp` total badge and `3 lớp` badges on the project/course branches. Post-fix browser evidence confirms the counts remain visible in the collapsed project row and expanded course row.
7. Sidebar cleanup pass — P3: the requested training sync/logout note competed with navigation at the bottom of the sidebar. Removed the entire note without changing navigation or workspace state handling. Post-fix desktop and compact accessibility captures contain no note, sync label, or logout action.
8. Role-navigation pass — P1: hiding the Management group was not enough because a stale/direct URL could still briefly open a management tab for another role. Added one role-to-tab access rule used by initialization, role switching, and URL restoration. Post-fix Member browser evidence contains exactly two navigation groups and no Management controls.
9. Overdue pass — P1: Overview compared deadlines with the current timestamp while the detail list compared with the start of today, so a task due today appeared overdue only in the KPI. Both now compare ISO business dates. The drill-down persists its source scope in the URL and displays the matching scope label; post-fix evidence shows KPI `30`, summary `30`, and `30` detailed overdue rows.
10. Final pass: no actionable P0/P1/P2 visual mismatches remain. Typography and wrapping remain consistent with the existing product; spacing preserves the dense operations table rhythm; colors use existing semantic tokens; icons come from the installed Lucide library; copy now states purpose and consequences. No raster imagery is present in these two surfaces.
11. Deadline-state pass — P1: class detail exposed only workflow readiness, so the overdue summary could not be reconciled with individual tasks. Added a reusable two-line status stack across task rows, calendar agenda/preview, due lists, and drawer headers. Completed and cancelled tasks are explicitly exempt, and deadlines equal to today are not overdue. Post-fix desktop evidence shows `Chưa sẵn sàng` with `Quá hạn 15 ngày` on the 30/08/2026 task; the same pair remains readable at 820 × 844 with document width 805 px inside an 820 px viewport and no horizontal overflow.

## Primary interactions tested

- Expand project and course hierarchy.
- Filter to a single class and verify KPI/table/calendar scope changes.
- Switch table/calendar modes and select mini-calendar dates.
- Open Structure, project, and inline Add Course form.
- Open Due, verify overdue/upcoming grouping, and open task detail.
- Switch Operations → Manager → Member and verify role-specific navigation.
- Open and close the mobile off-canvas menu at 390 × 844.
- Verify off-canvas navigation and drawer/backdrop interaction at 820 × 844; verify breakpoint behavior at 1100/1101 × 844.
- Expand the icon-based Project → Course → Class tree and verify decimal hierarchy numbers are absent.
- Verify the total class badge and project/course class-count badges in collapsed and expanded states.
- Verify the removed sidebar note, sync status, and logout action do not render at desktop or compact widths.
- Switch Operations to Member and verify only Workspace and Work groups remain; verify Management is absent.
- Open the overdue KPI at all-project scope and verify the URL scope, visible scope label, overdue group count, and row count all match (`30`).
- Open class configuration, cancel a disable confirmation, open a task by name, and verify the resulting class/task route.
- Switch to Content and verify the configuration dialog has no applicability checkboxes and clearly says “Chế độ chỉ xem”.
- Verify workflow and deadline badges together in the TNKH01 task table and task drawer; verify overdue day counts (29/08 → 16 days, 30/08 → 15 days on 14/09/2026) and the DONE/CANCELLED exclusion rule in code guards.
- Browser console errors checked: none.

## Residual test constraint

The local environment has no Supabase client configuration, so browser QA used the module's seed fallback and could not persist server mutations. Domain/architecture checks cover the write contracts; production persistence still depends on the deployed environment variables.

final result: passed
