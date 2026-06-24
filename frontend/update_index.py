import sys

with open('/opt/lampp/htdocs/MyProject/today/frontend/index.html', 'r') as f:
    content = f.read()

start_marker = "<!-- ADMIN DASHBOARD PAGE -->"
end_marker = "<!-- Global Modals & Notifications -->"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Markers not found!")
    sys.exit(1)

new_admin_content = """<!-- ADMIN DASHBOARD PAGE -->
    <div id="admin-dashboard" class="page-section admin-page-wrapper">
        <header class="admin-topbar">
            <div class="admin-topbar-left">
                <div class="admin-logo" onclick="navigateTo('home')">
                    <img src="assets/images/iuea-logo.png" alt="IUEA Logo">
                </div>
                <div class="admin-search-wrap">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search users, content, or settings...">
                    <span class="admin-search-shortcut">⌘K</span>
                </div>
            </div>
            
            <div class="admin-topbar-right">
                <button class="admin-icon-btn"><i data-lucide="plus"></i> Create</button>
                <div class="admin-divider"></div>
                <button class="admin-icon-btn relative">
                    <i data-lucide="bell"></i>
                    <span class="admin-notification-badge">3</span>
                </button>
                <button onclick="navigateTo('home')" class="admin-icon-btn" title="View Public Site"><i data-lucide="external-link"></i></button>
                <div class="admin-user-menu" onclick="logout()">
                    <div class="admin-avatar"><i data-lucide="user"></i></div>
                    <div class="admin-user-info">
                        <span id="adminUserName">Admin</span>
                        <span id="adminRoleBadge" class="admin-role-badge">Super Admin</span>
                    </div>
                </div>
            </div>
        </header>

        <div class="admin-layout">
            <!-- Sidebar -->
            <aside class="admin-sidebar">
                <div class="admin-sidebar-section">
                    <div class="admin-sidebar-label">Main Menu</div>
                    <nav class="admin-nav">
                        <button class="admin-nav-btn active" onclick="showAdminTab('overview', this)"><i data-lucide="layout-dashboard"></i> Dashboard</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('approvals', this)"><i data-lucide="check-square"></i> Approvals <span class="nav-badge" id="nav-pending-badge">0</span></button>
                        <button class="admin-nav-btn" onclick="showAdminTab('users', this)" id="sidebarUsersBtn"><i data-lucide="users"></i> Users</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('analytics', this)"><i data-lucide="bar-chart-2"></i> Analytics</button>
                    </nav>
                </div>
                
                <div class="admin-sidebar-section">
                    <div class="admin-sidebar-label">Modules</div>
                    <nav class="admin-nav">
                        <button class="admin-nav-btn" onclick="showAdminTab('content', this)"><i data-lucide="file-text"></i> News</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('content', this)"><i data-lucide="calendar"></i> Events</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('content', this)"><i data-lucide="lightbulb"></i> Innovations</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('content', this)"><i data-lucide="rocket"></i> Startups</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('content', this)"><i data-lucide="graduation-cap"></i> Alumni</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('content', this)"><i data-lucide="microscope"></i> Research</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('content', this)"><i data-lucide="building-2"></i> Tech Park</button>
                        <button class="admin-nav-btn" onclick="showAdminTab('donations', this)"><i data-lucide="heart"></i> Donations</button>
                    </nav>
                </div>
                
                <div class="admin-sidebar-section" style="margin-top:auto">
                    <nav class="admin-nav">
                        <button class="admin-nav-btn" onclick="showAdminTab('settings', this)"><i data-lucide="settings"></i> Settings</button>
                    </nav>
                </div>
            </aside>

            <!-- Main Content -->
            <main class="admin-main">
                
                <!-- OVERVIEW TAB -->
                <div id="admin-tab-overview" class="admin-tab-content active">
                    
                    <!-- Section 1: Welcome Banner -->
                    <div class="admin-welcome-banner">
                        <div class="admin-welcome-content">
                            <h2 id="adminWelcomeTitle">Welcome back, Super Admin</h2>
                            <p>Manage the entire IUEA Today ecosystem from one central hub. Here's what's happening today.</p>
                            <div class="admin-welcome-actions">
                                <button class="btn-primary" onclick="showAdminTab('approvals')">Review Pending</button>
                                <button class="btn-secondary" style="color:var(--iuea-gray); border-color:rgba(255,255,255,0.5)">View Reports</button>
                            </div>
                        </div>
                        <div class="admin-welcome-status">
                            <div class="date-display" id="adminDateDisplay">Loading date...</div>
                            <div class="platform-status"><span class="status-dot"></span> All Systems Operational</div>
                        </div>
                    </div>

                    <!-- Section 2: Analytics Cards -->
                    <div class="admin-stats-grid" id="adminStatsGrid">
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Total Users</span>
                                <div class="stat-icon-wrap bg-blue"><i data-lucide="users"></i></div>
                            </div>
                            <div class="stat-value" id="stat-users-num">—</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +12% this month</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Alumni</span>
                                <div class="stat-icon-wrap bg-purple"><i data-lucide="graduation-cap"></i></div>
                            </div>
                            <div class="stat-value" id="stat-alumni-num">—</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +4% this month</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Innovations</span>
                                <div class="stat-icon-wrap bg-gold"><i data-lucide="lightbulb"></i></div>
                            </div>
                            <div class="stat-value" id="stat-innovations-num">—</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +8% this month</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Startups</span>
                                <div class="stat-icon-wrap bg-orange"><i data-lucide="rocket"></i></div>
                            </div>
                            <div class="stat-value" id="stat-startups-num">—</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +15% this month</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Research Papers</span>
                                <div class="stat-icon-wrap bg-teal"><i data-lucide="microscope"></i></div>
                            </div>
                            <div class="stat-value">342</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +2% this month</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Events</span>
                                <div class="stat-icon-wrap bg-green"><i data-lucide="calendar"></i></div>
                            </div>
                            <div class="stat-value" id="stat-events-num">—</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +5% this month</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Donations</span>
                                <div class="stat-icon-wrap bg-maroon"><i data-lucide="heart"></i></div>
                            </div>
                            <div class="stat-value" id="stat-donations-num">—</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +22% this month</div>
                        </div>
                        <div class="admin-stat-card-pro warning">
                            <div class="stat-header">
                                <span class="stat-title">Pending Approvals</span>
                                <div class="stat-icon-wrap bg-red"><i data-lucide="clock"></i></div>
                            </div>
                            <div class="stat-value" id="stat-pending-num">—</div>
                            <div class="stat-trend negative"><i data-lucide="alert-circle"></i> Requires attention</div>
                        </div>
                    </div>

                    <!-- Layout Grid for Charts and Feed -->
                    <div class="admin-dashboard-grid">
                        
                        <!-- Section 3: Charts -->
                        <div class="admin-chart-section">
                            <div class="admin-panel">
                                <div class="panel-header">
                                    <h3>User Growth</h3>
                                    <select class="admin-select-sm"><option>Last 30 Days</option><option>This Year</option></select>
                                </div>
                                <div class="chart-container" style="position: relative; height:250px; width:100%">
                                    <canvas id="userGrowthChart"></canvas>
                                </div>
                            </div>
                            <div class="admin-panel">
                                <div class="panel-header">
                                    <h3>Content Activity</h3>
                                    <select class="admin-select-sm"><option>Last 7 Days</option><option>This Month</option></select>
                                </div>
                                <div class="chart-container" style="position: relative; height:250px; width:100%">
                                    <canvas id="contentActivityChart"></canvas>
                                </div>
                            </div>
                        </div>

                        <!-- Section 4 & 6: Feed and Featured -->
                        <div class="admin-sidebar-panels">
                            
                            <div class="admin-panel">
                                <div class="panel-header">
                                    <h3>Live Activity</h3>
                                    <button class="btn-text"><i data-lucide="refresh-cw"></i></button>
                                </div>
                                <div class="activity-feed">
                                    <div class="activity-item">
                                        <div class="activity-icon bg-gold"><i data-lucide="lightbulb"></i></div>
                                        <div class="activity-details">
                                            <p><strong>John Doe</strong> submitted an innovation</p>
                                            <span>2 mins ago</span>
                                        </div>
                                    </div>
                                    <div class="activity-item">
                                        <div class="activity-icon bg-purple"><i data-lucide="graduation-cap"></i></div>
                                        <div class="activity-details">
                                            <p><strong>Sarah Smith</strong> joined alumni network</p>
                                            <span>15 mins ago</span>
                                        </div>
                                    </div>
                                    <div class="activity-item">
                                        <div class="activity-icon bg-maroon"><i data-lucide="heart"></i></div>
                                        <div class="activity-details">
                                            <p><strong>Anonymous</strong> donated $5,000</p>
                                            <span>1 hour ago</span>
                                        </div>
                                    </div>
                                    <div class="activity-item">
                                        <div class="activity-icon bg-teal"><i data-lucide="microscope"></i></div>
                                        <div class="activity-details">
                                            <p><strong>Dr. Okello</strong> uploaded a research paper</p>
                                            <span>3 hours ago</span>
                                        </div>
                                    </div>
                                    <div class="activity-item">
                                        <div class="activity-icon bg-orange"><i data-lucide="rocket"></i></div>
                                        <div class="activity-details">
                                            <p><strong>TechVision</strong> startup registered</p>
                                            <span>5 hours ago</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="admin-panel">
                                <div class="panel-header">
                                    <h3>Featured Content</h3>
                                </div>
                                <div class="featured-content-list">
                                    <div class="featured-item">
                                        <div class="featured-thumb" style="background:#f1f5f9;border-radius:4px;width:40px;height:40px"></div>
                                        <div class="featured-info">
                                            <h4>Annual Tech Summit 2026</h4>
                                            <span>1,240 views • Event</span>
                                        </div>
                                    </div>
                                    <div class="featured-item">
                                        <div class="featured-thumb" style="background:#f1f5f9;border-radius:4px;width:40px;height:40px"></div>
                                        <div class="featured-info">
                                            <h4>Solar Powered Irrigation System</h4>
                                            <span>980 views • Innovation</span>
                                        </div>
                                    </div>
                                    <div class="featured-item">
                                        <div class="featured-thumb" style="background:#f1f5f9;border-radius:4px;width:40px;height:40px"></div>
                                        <div class="featured-info">
                                            <h4>AI in African Agriculture</h4>
                                            <span>850 views • Research</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                        </div>
                    </div>
                </div>

                <!-- APPROVALS TAB -->
                <div id="admin-tab-approvals" class="admin-tab-content">
                    <div class="admin-panel-header">
                        <div>
                            <h3>Approval Center</h3>
                            <p>Review and manage community submissions.</p>
                        </div>
                        <div class="admin-filters">
                            <select class="admin-select"><option>All Types</option><option>Innovations</option><option>News</option></select>
                        </div>
                    </div>
                    
                    <div class="kanban-board">
                        <div class="kanban-column">
                            <div class="kanban-header">
                                <h4>Pending <span class="badge" id="kanban-pending-count">0</span></h4>
                            </div>
                            <div class="kanban-cards" id="pendingContentList">
                                <!-- Cards injected via JS -->
                            </div>
                        </div>
                        
                        <div class="kanban-column">
                            <div class="kanban-header">
                                <h4>Recently Approved</h4>
                            </div>
                            <div class="kanban-cards kanban-empty">
                                <p>Approved items appear here temporarily.</p>
                            </div>
                        </div>
                        
                        <div class="kanban-column">
                            <div class="kanban-header">
                                <h4>Rejected</h4>
                            </div>
                            <div class="kanban-cards kanban-empty">
                                <p>Rejected items appear here.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- USERS TAB -->
                <div id="admin-tab-users" class="admin-tab-content">
                    <div class="admin-panel-header">
                        <div>
                            <h3>User Directory</h3>
                            <p>Manage platform access and roles.</p>
                        </div>
                        <div class="admin-filters">
                            <div class="admin-search-wrap" style="width:250px">
                                <i data-lucide="search"></i>
                                <input type="text" placeholder="Search users...">
                            </div>
                            <button class="btn-primary"><i data-lucide="user-plus"></i> Invite User</button>
                        </div>
                    </div>
                    <div class="admin-panel p-0">
                        <table class="admin-table-modern">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Joined Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody"></tbody>
                        </table>
                        <div class="table-pagination">
                            <span>Showing 1-10 of <span id="userCount">0</span> users</span>
                            <div class="pagination-controls">
                                <button disabled><i data-lucide="chevron-left"></i></button>
                                <button><i data-lucide="chevron-right"></i></button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ANALYTICS TAB -->
                <div id="admin-tab-analytics" class="admin-tab-content">
                    <div class="admin-panel-header">
                        <div>
                            <h3>Platform Analytics</h3>
                            <p>Deep dive into platform engagement and growth.</p>
                        </div>
                        <div class="admin-filters">
                            <button class="btn-outline-small"><i data-lucide="download"></i> Export CSV</button>
                            <select class="admin-select"><option>Last 30 Days</option><option>This Year</option></select>
                        </div>
                    </div>
                    
                    <div class="admin-dashboard-grid">
                        <div class="admin-panel">
                            <div class="panel-header"><h3>Donation Trends</h3></div>
                            <div style="height:300px; width:100%"><canvas id="donationTrendChart"></canvas></div>
                        </div>
                        <div class="admin-panel">
                            <div class="panel-header"><h3>User Demographics</h3></div>
                            <div style="height:300px; display:flex; justify-content:center"><canvas id="userDemographicsChart"></canvas></div>
                        </div>
                    </div>
                </div>

                <!-- CONTENT TAB (Generic Placeholder) -->
                <div id="admin-tab-content" class="admin-tab-content">
                    <div class="admin-panel-header">
                        <div>
                            <h3>Content Management</h3>
                            <p>View, edit, and delete approved content across the platform.</p>
                        </div>
                        <button class="btn-primary"><i data-lucide="plus"></i> Create New</button>
                    </div>
                    <div class="admin-panel admin-empty-state">
                        <div class="empty-icon"><i data-lucide="database"></i></div>
                        <h3>Content Database</h3>
                        <p>Select a specific content module from the sidebar to manage items.</p>
                    </div>
                </div>

                <!-- DONATIONS TAB -->
                <div id="admin-tab-donations" class="admin-tab-content">
                    <div class="admin-panel-header">
                        <div>
                            <h3>Endowment & Donations</h3>
                            <p>Track funding and manage donor relations.</p>
                        </div>
                        <button class="btn-primary"><i data-lucide="download"></i> Export Report</button>
                    </div>
                    
                    <div class="admin-stats-grid" style="margin-bottom: 2rem;">
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Total Raised</span>
                                <div class="stat-icon-wrap bg-maroon"><i data-lucide="dollar-sign"></i></div>
                            </div>
                            <div class="stat-value">$3.2M</div>
                            <div class="stat-trend positive"><i data-lucide="trending-up"></i> +5% this month</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Monthly Raised</span>
                                <div class="stat-icon-wrap bg-green"><i data-lucide="trending-up"></i></div>
                            </div>
                            <div class="stat-value">$125K</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Top Donors</span>
                                <div class="stat-icon-wrap bg-gold"><i data-lucide="award"></i></div>
                            </div>
                            <div class="stat-value">42</div>
                        </div>
                        <div class="admin-stat-card-pro">
                            <div class="stat-header">
                                <span class="stat-title">Avg. Donation</span>
                                <div class="stat-icon-wrap bg-blue"><i data-lucide="pie-chart"></i></div>
                            </div>
                            <div class="stat-value">$850</div>
                        </div>
                    </div>
                    
                    <div class="admin-panel p-0">
                        <table class="admin-table-modern">
                            <thead>
                                <tr>
                                    <th>Donor</th>
                                    <th>Amount</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><div class="user-cell"><div class="avatar"><i data-lucide="user"></i></div><strong>John Doe</strong></div></td>
                                    <td style="font-weight:700; color:var(--iuea-maroon)">$5,000</td>
                                    <td>Today, 10:00 AM</td>
                                    <td><span class="status-badge active">Completed</span></td>
                                </tr>
                                <tr>
                                    <td><div class="user-cell"><div class="avatar"><i data-lucide="user"></i></div><strong>Sarah Smith</strong></div></td>
                                    <td style="font-weight:700; color:var(--iuea-maroon)">$10,000</td>
                                    <td>Yesterday</td>
                                    <td><span class="status-badge active">Completed</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- SETTINGS TAB -->
                <div id="admin-tab-settings" class="admin-tab-content">
                    <div class="admin-panel-header">
                        <div>
                            <h3>Platform Settings</h3>
                            <p>Configure global variables and university information.</p>
                        </div>
                        <button class="btn-primary">Save Changes</button>
                    </div>
                    
                    <div class="admin-dashboard-grid">
                        <div class="admin-panel">
                            <h3>University Information</h3>
                            <div class="form-group" style="margin-top:1rem">
                                <label>University Name</label>
                                <input type="text" value="International University of East Africa">
                            </div>
                            <div class="form-group">
                                <label>Motto</label>
                                <input type="text" value="Learning to Succeed">
                            </div>
                            <div class="form-group">
                                <label>Contact Email</label>
                                <input type="email" value="info@iuea.ac.ug">
                            </div>
                        </div>
                        <div class="admin-panel">
                            <h3>Branding</h3>
                            <div class="form-group" style="margin-top:1rem">
                                <label>Primary Color</label>
                                <div style="display:flex; gap:1rem; align-items:center;">
                                    <div style="background:#800000; width:30px; height:30px; border-radius:4px;"></div>
                                    <input type="text" value="#800000">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Accent Color</label>
                                <div style="display:flex; gap:1rem; align-items:center;">
                                    <div style="background:#cba052; width:30px; height:30px; border-radius:4px;"></div>
                                    <input type="text" value="#cba052">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    </div>
\n"""

content = content[:start_idx] + new_admin_content + end_marker + content[end_idx + len(end_marker):]

with open('/opt/lampp/htdocs/MyProject/today/frontend/index.html', 'w') as f:
    f.write(content)

print("Updated index.html")
