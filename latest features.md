# Latest Added Features

The following core features, bug fixes, and UI enhancements have been added to LOGRO ERP:

## 1. Document Preview Modal (Projects)
- **Inline Preview Popup**: Replaced `window.open()` document viewing with a polished modal popup for previewing documents inside the Documents tab.
- **Image & PDF Support**: Renders images inline with `max-h-[60vh]` scaling and PDFs via an embedded iframe.
- **Fallback for Unsupported Types**: Displays a styled card with file icon, size, and type info for Word, ZIP, Excel, and other non-previewable formats, with a prominent download button.
- **Header with Download & Close**: Modal header shows document name, a download button, and a close button.

## 2. Tenant Storage Monitoring (Superadmin)
- **Per-Company Storage Stats**: New `GET /api/superadmin/companies/storage` endpoint aggregates `dbStats` (storageSize, dataSize, indexSize, objects, collections) for every tenant database.
- **Storage Column in Company Table**: Added a "Storage Used" column to the superadmin company registry table.
- **Color-Coded Usage Badges**: Storage size badges are color-coded: emerald (≤10 MB), amber (≤50 MB), rose (>50 MB), or zinc (0 B / unavailable).
- **Detail Subtext**: Shows data size and document count beneath the main badge when storage data is available.

## 3. Conditional Project Field in Cash Inflow (Accountant)
- **Credit Inflow Type**: When "Inflow Type" is set to "Credit", the "Project" dropdown is now hidden (no project association needed for credit entries).
- **Auto-Reset**: Selecting "Credit" clears any previously selected project to prevent stale data.

## 4. Dynamic Category Filter in Finance Hub
- **Auto-Populated Categories**: The Payment Requests category filter dropdown now dynamically populates from the actual unique categories present in the requests list (`Array.from(new Set(requests.map(r => r.category)))`), instead of a hardcoded static list.

## 5. Dashboard UI Tidy
- **Fixed Card Heights**: Active Tasks and Recent Expenses cards on the Admin Dashboard now use `!h-[300px]` instead of `min-h-[320px]` for consistent, compact sizing.

## 6. Projects Page Enhancements
- **Document Inline Preview Modal**: Full modal-based document preview with image/PDF rendering and fallback for unsupported types (see #1).
