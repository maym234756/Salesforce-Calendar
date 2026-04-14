# Calendar Component Budgets

These are target line-count ceilings, not hard limits.

| Component | Target Max Lines |
|---|---:|
| teamCalendarBoard.js | 250 |
| teamCalendarBoard.html | 120 |
| calendarToolbar.js | 120 |
| calendarToolbar.html | 100 |
| calendarLegend.js | 40 |
| calendarLegend.html | 40 |
| calendarGrid.js | 140 |
| calendarGrid.html | 140 |
| calendarAgenda.js | 120 |
| calendarAgenda.html | 120 |
| calendarCreateModal.js | 80 |
| calendarCreateModal.html | 120 |
| calendarEventDrawer.js | 100 |
| calendarEventDrawer.html | 120 |
| calendarUtils.js | 220 |

## Rules
- Parent owns state and Apex calls.
- Child components render UI and emit events upward.
- Shared pure functions go in `calendarUtils.js`.
- If any file starts creeping over budget, split again.