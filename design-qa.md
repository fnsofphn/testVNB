# Design QA — VWork feedback 11/09

- Source visual truth: `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-bb939e37-66eb-4a04-bb83-25db7050abce.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-c0b6574b-45e5-4954-9c0d-a585eec32ec7.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-cca31b99-b3d9-428f-895e-ccf7ed9cfa89.png`, `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-0d63c691-2e68-48f1-a59f-de3e37bec356.png`, and `D:\04. Code\Vwork\VWork-Van-Hanh-Gui-Sep-v2.html`
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
- Class configuration: the modal now names its purpose, explains immediate persistence, labels task applicability, confirms destructive disable actions, exposes task status, and provides both row-level and footer navigation into the class work screen.

## Findings and iteration history

1. First pass — P2: an empty task drawer rendered above the due list when no task was selected. Fixed by using a single-column due layout until selection, then rendering the detail drawer. Post-fix capture shows the due list directly below the tracking tabs.
2. First pass — P2: the implementation had a fifth KPI card not present in the reference. Fixed by returning to the four reference KPIs while retaining input-version impact in the table-level alert model. Post-fix source inspection and responsive grid confirm four cards.
3. Compact-window pass — P1: widths from 761 px through the old tablet breakpoint kept a fixed 200 px sidebar, compressing the workspace and top bar into a miniature, hard-to-read layout. Fixed by moving the shell to off-canvas navigation through 1100 px, hiding secondary identity text through 1200 px, and applying stacked filters/two-column KPIs through 960 px. Post-fix captures at 820, 1100, and 1101 px show readable controls, no document overflow, correct breakpoint transitions, and an operable menu drawer.
4. Configuration pass — P1: the former “Chi tiết lớp” modal mixed read-only metrics with an unlabeled status mutation, so users could not tell whether it was for viewing or acting. Fixed with explicit configuration copy, applicability labels, auto-save disclosure, disable confirmation, read-only role treatment, and navigation to class work. Post-fix desktop and 820 px captures show the full flow and the confirmation state.
5. Hierarchy pass — P2: decimal numbering created visual noise and competed with actual project/course/class codes. Fixed by replacing nested numbers with semantic icons, disclosure controls, and indentation. Post-fix expanded-table capture clearly distinguishes all three levels.
6. Final pass: no actionable P0/P1/P2 visual mismatches remain. Typography and wrapping remain consistent with the existing product; spacing preserves the dense operations table rhythm; colors use existing semantic tokens; icons come from the installed Lucide library; copy now states purpose and consequences. No raster imagery is present in these two surfaces.

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
- Open class configuration, cancel a disable confirmation, open a task by name, and verify the resulting class/task route.
- Switch to Content and verify the configuration dialog has no applicability checkboxes and clearly says “Chế độ chỉ xem”.
- Browser console errors checked: none.

## Residual test constraint

The local environment has no Supabase client configuration, so browser QA used the module's seed fallback and could not persist server mutations. Domain/architecture checks cover the write contracts; production persistence still depends on the deployed environment variables.

final result: passed
