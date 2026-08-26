# Design QA — VWork Training Operations

## Comparison target

- Source visual truth:
  - `C:\Users\admin\AppData\Local\Temp\codex-clipboard-8363aeb7-7eab-4d9f-aa8c-01033e78a395.png` (1847 × 846 px): current Work project layer.
  - `C:\Users\admin\AppData\Local\Temp\codex-clipboard-1e3bdca4-b905-4189-94e4-1d88224fe177.png` (1872 × 638 px): current Work class layer.
  - `C:\Users\admin\AppData\Local\Temp\codex-clipboard-e5896d0e-a052-4b3e-b801-3c9a4517766f.png` (3840 × 1080 px): current Overview calendar and broken task popup.
- Implementation screenshot: unavailable.
- Intended desktop viewport: 1920 × 1080 CSS px, device scale factor 1.
- Density normalization: not performed because no browser-rendered implementation screenshot was available.
- State: operations role; Overview calendar with task popup open, plus Work entry state without a selected class.

## Full-view comparison evidence

Blocked. The source screenshots were available, but the authenticated VWork route could not be captured locally in the same role, data, and popup state. A code-only or build-only comparison is not valid visual evidence.

## Focused region comparison evidence

Blocked for the same reason. The required focused regions are the hierarchy card above the calendar, the reduced-height calendar, and the task-preview checklist rows.

## Findings

- No visual fidelity finding is asserted without a rendered implementation capture.
- Static inspection confirms the popup checkbox now has an explicit 16 × 16 px control and a two-column checklist row, but this is not accepted as visual proof.
- Static inspection confirms the calendar height changed from 520 px to 350 px (approximately one-third reduction), but this is not accepted as visual proof.

## Comparison history

- Iteration 1: implementation completed and code/test/build checks passed. Visual comparison could not start because an authenticated, browser-rendered implementation capture in the matching state was unavailable.

## Implementation checklist

- Capture Overview at the same authenticated operations-role state and 1920 × 1080 viewport.
- Open a calendar task popup and compare checklist alignment against the supplied defect screenshot.
- Capture Work with no class in the URL and verify that the first visible layer is the class list.
- Re-run full-view and focused-region comparison; resolve any P0/P1/P2 finding before changing the final result.

## Required fidelity surfaces

- Fonts and typography: blocked pending rendered capture.
- Spacing and layout rhythm: blocked pending rendered capture.
- Colors and visual tokens: existing PeopleOne tokens were retained; visual confirmation is blocked.
- Image quality and asset fidelity: no new image assets were introduced.
- Copy and content: updated labels were checked statically; visual wrapping is blocked pending rendered capture.

## Final result

final result: blocked

Blocker: no authenticated browser-rendered screenshot of the local implementation in the matching VWork role, data, and popup state.
