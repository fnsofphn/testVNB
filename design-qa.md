# Design QA — Quản trị khóa học VWork

## Comparison target

- Source visual truth: `C:\Users\admin\AppData\Local\Temp\codex-clipboard-b00af68d-c6f3-4fac-9dea-f3c038806634.png` (1552 × 884 px).
- Implementation URL: `http://localhost:3000/vwork/training-operations?view=structure`.
- Implementation screenshot: unavailable; the local route redirected to `/login?next=%2Fvwork%2Ftraining-operations`.
- Intended desktop viewport: current Codex in-app Browser viewport, device scale factor 1.
- Density normalization: not performed because no authenticated implementation capture was available.
- State: Quản lý vận hành, selected course, course administration panel.

## Full-view comparison evidence

Blocked. The reference screenshot opened successfully, but the matching local implementation state requires an authenticated VWork session. Build output or source inspection is not accepted as visual comparison evidence.

## Focused region comparison evidence

Blocked. The required focused regions are the course header/menu, team assignment card, add-course action, duplicate icon action, and duplicate-course form.

## Findings

- No visual mismatch is asserted without a browser-rendered implementation capture.
- Static implementation confirms that the lifecycle card was moved to an accessible administration menu.
- Static implementation confirms that Retrospective was removed from the current UI.
- Static implementation confirms that add course and CopyPlus duplicate actions share the existing PeopleOne control tokens.

## Comparison history

- Iteration 1: requested interaction and hierarchy changes implemented; domain tests, architecture checks, typecheck, and build passed. Visual comparison was blocked by the local authentication redirect.

## Implementation checklist

- Open the local route with an authenticated operations-role session.
- Verify the administration menu at desktop and mobile breakpoints.
- Open the duplicate-course form and verify CopyPlus affordance, labels, wrapping, focus order, and validation.
- Compare the rendered panel against the supplied screenshot and resolve any P0/P1/P2 issue.

## Required fidelity surfaces

- Fonts and typography: existing component typography retained; browser confirmation blocked.
- Spacing and layout rhythm: simplified from four cards to one primary team card plus compact actions; browser confirmation blocked.
- Colors and visual tokens: existing PeopleOne variables and control styles retained; browser confirmation blocked.
- Image quality and asset fidelity: no raster assets introduced; CopyPlus, MoreVertical, Plus, and X use the installed Lucide icon library.
- Copy and content: requested labels and feature removals verified statically; visual wrapping remains unverified.

## Final result

final result: blocked

Blocker: no authenticated browser-rendered screenshot of the local implementation in the matching VWork role and course state.
