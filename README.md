# StockOp - Reja Reja PWA

A secure, offline-capable Progressive Web App (PWA) for inventory management.

## Features
- **📦 Inventory Management**: Add, edit, delete, and track stock.
- **⚡ Offline Ready**: Works without internet via Service Worker.
- **📊 Dashboard**: Real-time stats and visual charts (Value by Category).
- **🔔 Notifications**: System alerts for low stock items.
- **🛡️ Secure**: Strict Content Security Policy (CSP), XSS protection, and secure CSV export.
- **🌍 Bilingual**: English & Swahili support.
- **📄 Reporting**: Export data to PDF and CSV.

## Installation
1.  **Hosting**: Upload the contents to any static host (Netlify, GitHub Pages, Vercel).
2.  **Local**: Open `index.html` in your browser.
3.  **Install**: Click the "Install App" button in the header (or browser menu) to add it to your Home Screen.

## Security Verification
This app adheres to a **Strict CSP** (No `unsafe-inline` scripts).
To verify:
1.  Open Developer Tools (F12).
2.  Check the Console. You should see a big red "STOP!" warning (security feature) but **NO** CSP violations.

## Development
- **No Build Step**: Just vanilla HTML, CSS, and JS.
- **Icons**: Uses Lucide Icons (via CDN).
- **PDFs**: Uses jsPDF (via CDN).

## License
MIT
