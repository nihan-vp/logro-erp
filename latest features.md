# Latest Added Features (Last 18 Hours)

The following core features, bug fixes, and responsive layout enhancements have been successfully added to LOGRO ERP:

## 1. Wages Payment Modal Overhaul
- **Optional Project & Task Selectors**: Added Project and Task selection dropdowns inside the **Request Wages Payment** popup.
- **Auto-Default Logic**: The selectors automatically identify the worker's first unpaid log in the selected period and pre-populate the defaults.
- **Cascading Filter**: The Task selector filters options based on the chosen Project and is disabled if no project is selected.
- **Responsive Layout**: Re-engineered the payout card structure on mobile to stack the amount and button vertically (`w-full`), while maintaining an inline layout (`sm:w-auto`) on larger screens.

## 2. Professional PDF Statement Generation (jsPDF Integration)
- **Direct PDF Export**: Integrated `jspdf` to compile and download high-quality, pixel-perfect A4 worker statements completely offline on the client side.
- **Visual Dotted Calendar**: Designed and drew the **Attendance Dotted Calendar Visualizer** directly onto the PDF canvas using vector drawing methods. Dots are filled with corresponding status colors (Green for Present, Blue for Half Day, Red for Absent, Zinc for No Log) with the day numbers centered. Includes a matching top legend.
- **Indian Rupee Formatting**: Formatted currency as `Rs.` to guarantee standard Helvetica font encoding compatibilities across all PDF viewers.
- **Robust Multi-Page Layout**: Automatically monitors page vertical heights during table compilation to add pages, reset headers, and draw page numbers (`Page X of Y`) to prevent overflow truncation.
- **Corporate Features**: Styled with the *Plus Jakarta Sans* font, highlight cards for total earnings/paid amounts, and formal signature authorization placeholders at the bottom.

## 3. Financial Breakdown & Calculation Fixes
- **Accurate Balance Calculation**: Resolved payment status tracking bugs. The `Remaining Due`, `Total Wage Earned`, and `Paid Amount` metrics now update instantly after payments, accounting for installment history items inside partially paid requests.
- **Payment Request Table Translation**: Converted the **Attendance & Wage Log Breakdown** section into **Wage Payment Requests** to track and display requests in the ledger.

## 4. UI/UX and Responsive Adjustments
- **Finance Hub Modal Responsiveness**: Enabled `max-h-[90vh]` and `overflow-y-auto` scrollbars on the Payment Request Status view popup to prevent modal truncation on small screen viewports.
- **Overview Calendar Centering**: Centered visualizer dots in the worker rosters list view.
- **Date boundary math**: Fixed local timezone date boundary offsets. Selecting a month (e.g. June) now correctly limits log queries from the 1st to the 30th without timezone shifts.
- **Clutter reduction**: Hid the unpaid days metrics block when count is 0 and added helpful status placeholder banners when no logs match the target query bounds.
