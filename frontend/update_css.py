import sys

with open('/opt/lampp/htdocs/MyProject/today/frontend/assets/css/style.css', 'r') as f:
    content = f.read()

marker = "/* ===================== ADMIN DASHBOARD ===================== */"
idx = content.find(marker)

if idx == -1:
    print("Marker not found!")
    sys.exit(1)

new_css = """/* ===================== ADMIN DASHBOARD ===================== */
.admin-page-wrapper {
    background: #f1f5f9;
    min-height: 100vh;
    margin: 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
}

/* TOP NAVBAR */
.admin-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 2rem;
    background: white;
    border-bottom: 1px solid #e2e8f0;
    position: sticky;
    top: 0;
    z-index: 1010;
    height: 64px;
}

.admin-topbar-left {
    display: flex;
    align-items: center;
    gap: 3rem;
}

.admin-logo {
    display: flex;
    align-items: center;
    gap: 1rem;
    cursor: pointer;
}

.admin-logo img {
    height: 32px;
}

.admin-search-wrap {
    display: flex;
    align-items: center;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.4rem 0.8rem;
    width: 350px;
    transition: all 0.2s;
}

.admin-search-wrap:focus-within {
    border-color: #cbd5e1;
    box-shadow: 0 0 0 2px rgba(128, 0, 0, 0.1);
    background: white;
}

.admin-search-wrap i {
    color: #94a3b8;
    width: 18px;
    height: 18px;
    margin-right: 0.5rem;
}

.admin-search-wrap input {
    border: none;
    background: transparent;
    outline: none;
    width: 100%;
    font-size: 0.9rem;
    color: #334155;
}

.admin-search-shortcut {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 0.1rem 0.3rem;
    font-size: 0.75rem;
    color: #94a3b8;
    font-weight: 600;
}

.admin-topbar-right {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.admin-icon-btn {
    background: transparent;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
}

.admin-icon-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
}

.admin-icon-btn.relative { position: relative; }
.admin-notification-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #ef4444;
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid white;
}

.admin-divider {
    width: 1px;
    height: 24px;
    background: #e2e8f0;
    margin: 0 0.5rem;
}

.admin-user-menu {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    padding: 0.3rem 0.5rem;
    border-radius: 8px;
    transition: background 0.2s;
}
.admin-user-menu:hover { background: #f8fafc; }

.admin-avatar {
    width: 36px;
    height: 36px;
    background: #f1f5f9;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--iuea-maroon);
    border: 1px solid #e2e8f0;
}

.admin-user-info {
    display: flex;
    flex-direction: column;
}
#adminUserName { font-weight: 600; font-size: 0.9rem; color: #0f172a; }
#adminRoleBadge { font-size: 0.75rem; color: #64748b; text-transform: capitalize; }


/* LAYOUT */
.admin-layout {
    display: flex;
    min-height: calc(100vh - 64px);
}

/* SIDEBAR */
.admin-sidebar {
    width: 260px;
    flex-shrink: 0;
    background: white;
    border-right: 1px solid #e2e8f0;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
}

.admin-sidebar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.admin-sidebar-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 0.75rem;
    margin-bottom: 0.25rem;
}

.admin-nav {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.admin-nav-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border: none;
    background: transparent;
    border-radius: 6px;
    text-align: left;
    font-size: 0.9rem;
    font-weight: 500;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
}

.admin-nav-btn i { width: 18px; height: 18px; color: #94a3b8; transition: color 0.2s; }
.admin-nav-btn:hover { background: #f8fafc; color: #0f172a; }
.admin-nav-btn:hover i { color: #475569; }

.admin-nav-btn.active {
    background: #fff1f2;
    color: var(--iuea-maroon);
    font-weight: 600;
}
.admin-nav-btn.active i { color: var(--iuea-maroon); }

.nav-badge {
    margin-left: auto;
    background: #e2e8f0;
    color: #475569;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-weight: 700;
}

/* MAIN CONTENT */
.admin-main {
    flex: 1;
    min-width: 0;
    padding: 2rem 3rem;
}

.admin-tab-content { display: none; }
.admin-tab-content.active { display: block; animation: fadeIn 0.3s ease; }

.admin-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 2rem;
}

.admin-panel-header h3 {
    font-size: 1.5rem;
    color: #0f172a;
    margin-bottom: 0.25rem;
    font-family: 'Plus Jakarta Sans', sans-serif;
}
.admin-panel-header p {
    color: #64748b;
    margin: 0;
    font-size: 0.95rem;
}

.admin-filters {
    display: flex;
    gap: 1rem;
    align-items: center;
}

/* WELCOME BANNER */
.admin-welcome-banner {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    border: 1px solid #e2e8f0;
    background-image: linear-gradient(to right, #ffffff, #fafafa);
}

.admin-welcome-content h2 {
    font-size: 1.75rem;
    color: #0f172a;
    margin-bottom: 0.5rem;
}
.admin-welcome-content p {
    color: #64748b;
    max-width: 600px;
    margin-bottom: 1.5rem;
}
.admin-welcome-actions {
    display: flex;
    gap: 1rem;
}

.admin-welcome-status {
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
}

.date-display {
    font-size: 1.1rem;
    font-weight: 600;
    color: #334155;
}

.platform-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #059669;
    font-weight: 500;
    background: #d1fae5;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
}

.status-dot {
    width: 8px;
    height: 8px;
    background: #10b981;
    border-radius: 50%;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
    70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* STATS GRID */
.admin-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.admin-stat-card-pro {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.admin-stat-card-pro:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border-color: #cbd5e1;
}

.admin-stat-card-pro.warning {
    background: #fef2f2;
    border-color: #fecaca;
}

.stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.stat-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
}

.stat-icon-wrap {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.stat-icon-wrap i { width: 18px; height: 18px; }

.bg-blue { background: #eff6ff; color: #3b82f6; }
.bg-purple { background: #f5f3ff; color: #8b5cf6; }
.bg-gold { background: #fefce8; color: #eab308; }
.bg-orange { background: #fff7ed; color: #f97316; }
.bg-teal { background: #f0fdfa; color: #14b8a6; }
.bg-green { background: #f0fdf4; color: #22c55e; }
.bg-maroon { background: #fff1f2; color: #e11d48; }
.bg-red { background: #fee2e2; color: #ef4444; }

.stat-value {
    font-size: 2rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1;
    font-family: 'Plus Jakarta Sans', sans-serif;
}

.stat-trend {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 500;
}
.stat-trend i { width: 14px; height: 14px; }
.stat-trend.positive { color: #10b981; }
.stat-trend.negative { color: #ef4444; }


/* GRIDS & PANELS */
.admin-dashboard-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.admin-chart-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.admin-sidebar-panels {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.admin-panel {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.admin-panel.p-0 { padding: 0; overflow: hidden; }

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
}

.panel-header h3 {
    font-size: 1.1rem;
    font-weight: 600;
    color: #0f172a;
    margin: 0;
}

/* LIVE FEED */
.activity-feed {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.activity-item {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
}

.activity-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.activity-icon i { width: 14px; height: 14px; }

.activity-details p {
    margin: 0;
    font-size: 0.9rem;
    color: #334155;
    line-height: 1.4;
}
.activity-details span {
    font-size: 0.75rem;
    color: #94a3b8;
}

/* FEATURED CONTENT */
.featured-content-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.featured-item {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem;
    border-radius: 8px;
    transition: background 0.2s;
    cursor: pointer;
}
.featured-item:hover { background: #f8fafc; }

.featured-info h4 {
    margin: 0;
    font-size: 0.9rem;
    color: #0f172a;
    line-height: 1.2;
}
.featured-info span {
    font-size: 0.75rem;
    color: #64748b;
}

/* TABLES */
.admin-table-modern {
    width: 100%;
    border-collapse: collapse;
}

.admin-table-modern th {
    background: #f8fafc;
    padding: 1rem 1.5rem;
    text-align: left;
    font-size: 0.8rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e2e8f0;
}

.admin-table-modern td {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #f1f5f9;
    font-size: 0.9rem;
    color: #334155;
    vertical-align: middle;
}

.admin-table-modern tr:last-child td { border-bottom: none; }
.admin-table-modern tr:hover td { background: #f8fafc; }

.user-cell {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.user-cell .avatar {
    width: 32px;
    height: 32px;
    background: #e2e8f0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
}
.user-cell .avatar i { width: 14px; height: 14px; }

.status-badge {
    display: inline-flex;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
}
.status-badge.active { background: #d1fae5; color: #059669; }
.status-badge.inactive { background: #f1f5f9; color: #64748b; }
.status-badge.pending { background: #fefce8; color: #ca8a04; }

.table-pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-top: 1px solid #e2e8f0;
    font-size: 0.85rem;
    color: #64748b;
}

.pagination-controls {
    display: flex;
    gap: 0.5rem;
}
.pagination-controls button {
    border: 1px solid #e2e8f0;
    background: white;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #475569;
}
.pagination-controls button:disabled { opacity: 0.5; cursor: not-allowed; }
.pagination-controls button:hover:not(:disabled) { background: #f1f5f9; }

/* FORMS & INPUTS */
.admin-select {
    padding: 0.5rem 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: white;
    font-size: 0.9rem;
    color: #334155;
    outline: none;
}

.admin-select-sm {
    padding: 0.25rem 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    font-size: 0.8rem;
    color: #64748b;
}

/* KANBAN */
.kanban-board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
}

.kanban-column {
    background: #f1f5f9;
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    height: 600px;
}

.kanban-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.kanban-header h4 {
    margin: 0;
    font-size: 0.95rem;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.kanban-header .badge {
    background: #cbd5e1;
    color: #334155;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-size: 0.75rem;
}

.kanban-cards {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    flex: 1;
}

.kanban-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
    border: 2px dashed #cbd5e1;
    border-radius: 8px;
    color: #94a3b8;
    font-size: 0.85rem;
}

/* Pending Item Cards for Kanban */
.pending-item {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: transform 0.2s;
    cursor: grab;
}
.pending-item:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }

.pending-item-img {
    width: 100%;
    height: 120px;
    object-fit: cover;
    border-radius: 4px;
}

.pending-item-info { flex: 1; }
.pending-item-title { font-weight: 600; color: #0f172a; font-size: 0.95rem; margin-bottom: 0.25rem; }
.pending-item-meta { font-size: 0.8rem; color: #64748b; line-height: 1.4; }

.pending-item-type {
    align-self: flex-start;
    background: #f1f5f9;
    color: #475569;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
}

.pending-item-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.5rem;
    border-top: 1px solid #f1f5f9;
    padding-top: 0.75rem;
}

.btn-approve, .btn-reject {
    padding: 0.4rem;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    transition: all 0.2s;
}

.btn-approve { background: #d1fae5; color: #059669; }
.btn-approve:hover { background: #10b981; color: white; }
.btn-reject { background: #fee2e2; color: #e11d48; }
.btn-reject:hover { background: #ef4444; color: white; }

/* UTILITIES */
.mb-4 { margin-bottom: 1rem; }
.mt-3 { margin-top: 0.75rem; }
.text-maroon { color: var(--iuea-maroon); }
.font-bold { font-weight: 700; }

.admin-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    color: #64748b;
}
.admin-empty-state .empty-icon {
    width: 64px;
    height: 64px;
    background: #f1f5f9;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.5rem;
    color: #94a3b8;
}
.admin-empty-state .empty-icon i { width: 32px; height: 32px; }
"""

content = content[:idx] + new_css

with open('/opt/lampp/htdocs/MyProject/today/frontend/assets/css/style.css', 'w') as f:
    f.write(content)

print("Updated style.css")
