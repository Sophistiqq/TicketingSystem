# Plan: Comprehensive CSAT Improvements

This plan outlines the steps to transform the CSAT (Customer Satisfaction) feature into a robust analytical tool for MIS and an improved experience for users.

## Objective
- Provide deep analytical insights for MIS/Admin.
- Improve the feedback submission experience for users.
- Enable follow-up workflows for negative feedback.

## Key Files & Context
- `Backend/src/routes/csat.ts`: Main API logic for CSAT.
- `Frontend/src/lib/types.ts`: Shared types between frontend and backend.
- `Frontend/src/routes/staff/admin/CsatDashboard.svelte`: Admin view for CSAT metrics.
- `Frontend/src/routes/user/TicketDetail.svelte`: User view for submitting CSAT.
- `Frontend/src/routes/user/Profile.svelte`: User view for personal history.

## Implementation Steps

### Phase 1: Backend API Enhancements
1.  **Modify `/csat/stats`**:
    - Calculate **Trends**: Daily average rating for the last 30 days.
    - Calculate **Leaderboard**: Top 5 agents by average rating (min 3 responses).
    - Calculate **Dimension Breakdowns**: Average ratings grouped by `Department`, `RequestType`, and `Priority`.
    - Calculate **SLA Impact**: Average rating for tickets with `sla_breached: true` vs `false`.
2.  **Add `/csat/recent`**:
    - Fetch the latest 10 CSAT responses with comments, ticket titles, and requester names.
3.  **Add `/csat/my/requested`**:
    - Fetch CSAT responses submitted by the current user.
4.  **Add `/csat/:id/address`**:
    - Allow MIS/Admin to mark a CSAT as "addressed" by creating an AuditLog entry.

### Phase 2: Frontend Types Expansion
1.  Update `CSATStats` in `Frontend/src/lib/types.ts` to include the new analytical fields.
2.  Add `RecentCSAT` interface.

### Phase 3: Dashboard Overhaul
1.  **Trend Chart**: Implement a responsive SVG-based line chart showing rating trends.
2.  **Leaderboard**: Add a section highlighting top agents and those needing support.
3.  **Dimension Breakdown Cards**: Visual bars showing satisfaction across different ticket categories.
4.  **Feedback Stream**: A paginated list of recent comments with "Address" action for staff.

### Phase 4: Submission & UX Improvements
1.  **Refined UI**: Larger, interactive stars in `TicketDetail.svelte`.
2.  **Conditional Logic**: Make the comment field mandatory if rating is <= 2.
3.  **Quick Tags**: Add buttons for common feedback (e.g., "Fast", "Helpful", "Unclear").

### Phase 5: Profile History
1.  Add a "Feedback History" section to `Profile.svelte` showing a list of tickets the user has rated.

## Verification & Testing
- **Backend**: Unit tests for the stats calculation logic.
- **Frontend**: Manual verification of the new dashboard widgets and submission flow.
- **Integration**: Verify that submitting a 1-star rating triggers the mandatory comment and appears in the "needs attention" section of the dashboard.
