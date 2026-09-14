# Design QA — VWork feedback 11/09

- Source visual truth: `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-bb939e37-66eb-4a04-bb83-25db7050abce.png` and `D:\04. Code\Vwork\VWork-Van-Hanh-Gui-Sep-v2.html`
- Implementation: `http://127.0.0.1:4173/vwork/training-operations`
- Implementation screenshot evidence: browser-rendered Codex in-app browser captures recorded in the implementation task (desktop overview/table/calendar/structure/due/task detail and mobile overview/navigation). The browser surface does not expose a filesystem path for captures.
- Desktop viewport: 1265 × 713 CSS px, device scale factor 1
- Mobile viewport: 390 × 844 CSS px, device scale factor 1
- Source pixels: 1536 × 960; source includes browser chrome while implementation evidence uses the application viewport, so comparison was normalized by judging the shared app-content region.
- State: Operations overview with seed EVNSPC data; class TNKH01 filtered; calendar; inline course form; due groups; task detail; manager/member navigation; mobile menu.

## Full-view comparison evidence

The rendered implementation retains the reference composition and visual hierarchy: dark burgundy fixed navigation, white sticky top bar, pale workspace background, red section accents, compact KPI row, and expandable Project → Course → Class table. Feedback-driven deviations are intentional: the shared Project/Course/Class filters and Overview create/change actions are added above the KPI row.

## Focused region comparison evidence

- Overview: four KPI cards now match the reference count and proportions; project rows use blue, ended classes green, running classes blue, and upcoming classes yellow.
- Calendar: only mini-calendar/date selection remains as the date control; the selected class filters mini-calendar dots and primary calendar events together.
- Structure: Add Course opens a full-width inline form instead of the removed management popup.
- Due/task detail: overdue and upcoming sections are complete; the empty duplicate drawer was removed; the detail header contains task identity/status only; deadline is a date and no assignment controls appear in the due view.
- Mobile: filters stack vertically, KPI cards form a two-column grid, and the off-canvas menu remains operable without horizontal viewport overflow.

## Findings and iteration history

1. First pass — P2: an empty task drawer rendered above the due list when no task was selected. Fixed by using a single-column due layout until selection, then rendering the detail drawer. Post-fix capture shows the due list directly below the tracking tabs.
2. First pass — P2: the implementation had a fifth KPI card not present in the reference. Fixed by returning to the four reference KPIs while retaining input-version impact in the table-level alert model. Post-fix source inspection and responsive grid confirm four cards.
3. Final pass: no actionable P0/P1/P2 visual mismatches remain. Typography, spacing/rhythm, state colors, copy, control affordances, and mobile behavior are consistent with the reference and accepted feedback. No source imagery beyond the product wordmark/brand treatment required replacement.

## Primary interactions tested

- Expand project and course hierarchy.
- Filter to a single class and verify KPI/table/calendar scope changes.
- Switch table/calendar modes and select mini-calendar dates.
- Open Structure, project, and inline Add Course form.
- Open Due, verify overdue/upcoming grouping, and open task detail.
- Switch Operations → Manager → Member and verify role-specific navigation.
- Open and close the mobile off-canvas menu at 390 × 844.
- Browser console errors checked: none.

## Residual test constraint

The local environment has no Supabase client configuration, so browser QA used the module's seed fallback and could not persist server mutations. Domain/architecture checks cover the write contracts; production persistence still depends on the deployed environment variables.

final result: passed
