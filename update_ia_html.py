import re

with open('frontend/index.html', 'r') as f:
    content = f.read()

# Define the new HTML
new_html = """    <div id="innovation-admin-dashboard" class="page-section admin-page-wrapper">
        <header class="admin-topbar">
            <div class="admin-topbar-left">
                <button type="button" class="admin-mobile-menu-toggle" aria-label="Toggle Menu" onclick="this.closest('.admin-page-wrapper').querySelector('.admin-sidebar').classList.toggle('open'); lucide.createIcons();">
                    <i data-lucide="menu"></i>
                </button>
                <div class="admin-logo" onclick="navigateTo('home')" title="Back to IUEA Today">
                    <img src="assets/images/iuea-logo.png" alt="IUEA Logo">
                </div>
            </div>

            <div class="admin-topbar-center">
                <div class="admin-search-wrap">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search innovations, startups…" aria-label="Search innovation admin dashboard">
                    <span class="admin-search-shortcut" aria-hidden="true">⌘K</span>
                </div>
            </div>

            <div class="admin-topbar-right">
                <button type="button" class="admin-btn-create" onclick="showCreateModal()">
                    <i data-lucide="plus"></i>
                    <span>Create</span>
                </button>
                <div class="admin-topbar-actions">
                    <div class="notify-wrap" data-notify-context="ia">
                        <button type="button" class="admin-icon-btn admin-icon-btn--notify notify-btn" aria-label="Notifications" aria-expanded="false">
                            <i data-lucide="bell"></i>
                            <span class="admin-notification-badge notify-badge" id="ia-notify-badge" style="display:none">0</span>
                        </button>
                        <div class="notify-dropdown" hidden>
                            <div class="notify-dropdown-header">
                                <h3>Notifications</h3>
                                <button type="button" class="notify-mark-all">Mark all read</button>
                            </div>
                            <div class="notify-dropdown-list" id="ia-notify-list"></div>
                            <div class="notify-dropdown-empty" hidden>
                                <i data-lucide="bell-off"></i>
                                <p>No notifications yet</p>
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="navigateTo('home')" class="admin-icon-btn" title="View Public Site" aria-label="View public site">
                        <i data-lucide="external-link"></i>
                    </button>
                </div>
                <div class="admin-topbar-divider" aria-hidden="true"></div>
                <div class="admin-user-area">
                    <div class="admin-user-menu" aria-label="Signed in innovation admin profile">
                        <div class="admin-avatar co-avatar" aria-hidden="true" style="background:linear-gradient(135deg,#800000,#b91c1c)"><i data-lucide="lightbulb"></i></div>
                        <div class="admin-user-info">
                            <span id="iaUserName" class="admin-user-name">Innovation Admin</span>
                            <span class="admin-role-badge" style="background:#fef2f2;color:#800000;border-color:#fecaca;">Innovation Admin</span>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <div class="admin-body">
            <aside class="admin-sidebar">
                <div class="admin-sidebar-section">
                    <div class="admin-sidebar-label">Main Menu</div>
                    <nav class="admin-nav">
                        <button class="admin-nav-btn ia-nav-btn active" onclick="showRoleTab('ia', 'overview', this)"><i data-lucide="layout-dashboard"></i> Overview</button>
                        <button class="admin-nav-btn ia-nav-btn" onclick="showRoleTab('ia', 'requests', this)"><i data-lucide="users"></i> Join Requests</button>
                        <button class="admin-nav-btn ia-nav-btn" onclick="showRoleTab('ia', 'messages', this)"><i data-lucide="message-circle"></i> Messages <span class="nav-badge nav-badge-unread" id="ia-nav-messages-badge" style="display:none">0</span></button>
                    </nav>
                </div>

                <div class="admin-sidebar-section">
                    <div class="admin-sidebar-label">Modules</div>
                    <nav class="admin-nav">
                        <button class="admin-nav-btn ia-nav-btn" data-module="innovations" onclick="loadInnovationsAdminModule(this, { targetId: 'iaContentArea', skipHeaderUpdate: true }); showRoleTab('ia', 'content', this)"><i data-lucide="lightbulb"></i> Innovations</button>
                    </nav>
                </div>

                <div class="admin-sidebar-section admin-sidebar-footer">
                    <div class="admin-sidebar-label">Account</div>
                    <nav class="admin-nav">
                        <button type="button" class="admin-nav-btn admin-nav-btn--danger" onclick="logout()" title="Sign out" aria-label="Sign out">
                            <i data-lucide="log-out"></i> Sign Out
                        </button>
                    </nav>
                </div>
            </aside>

            <main class="admin-content">
                <!-- OVERVIEW TAB -->
                <div class="admin-tab-content ia-tab active" id="ia-tab-overview" data-ia-tab="overview">
                    <div class="admin-panel-header">
                        <div class="admin-panel-header-text">
                            <h3>Dashboard Overview</h3>
                            <p>Welcome back! Here's what's happening with innovations and startups.</p>
                        </div>
                        <div class="admin-panel-header-actions">
                            <button class="btn-primary" onclick="showCreateModal()"><i data-lucide="plus"></i> New Project</button>
                        </div>
                    </div>
                    
                    <div class="admin-stats-grid">
                        <!-- Innovations block -->
                        <div class="admin-stat-card-pro co-stat-card" style="border-top:3px solid #800000">
                            <div class="stat-header">
                                <span class="stat-title">Innovations — Total</span>
                                <div class="stat-icon-wrap" style="background:#fef2f2;color:#800000"><i data-lucide="lightbulb"></i></div>
                            </div>
                            <div class="stat-value" id="ia-stat-inn-total">—</div>
                            <div class="stat-trend"><i data-lucide="database"></i> All submissions</div>
                        </div>
                        <div class="admin-stat-card-pro co-stat-card" style="border-top:3px solid #f59e0b">
                            <div class="stat-header">
                                <span class="stat-title">Innovations — Pending</span>
                                <div class="stat-icon-wrap" style="background:#fffbeb;color:#f59e0b"><i data-lucide="clock"></i></div>
                            </div>
                            <div class="stat-value" id="ia-stat-inn-pending">—</div>
                            <div class="stat-trend"><i data-lucide="clock"></i> Awaiting review</div>
                        </div>
                        <div class="admin-stat-card-pro co-stat-card" style="border-top:3px solid #22c55e">
                            <div class="stat-header">
                                <span class="stat-title">Innovations — Approved</span>
                                <div class="stat-icon-wrap" style="background:#f0fdf4;color:#22c55e"><i data-lucide="check-circle"></i></div>
                            </div>
                            <div class="stat-value" id="ia-stat-inn-approved">—</div>
                            <div class="stat-trend"><i data-lucide="check"></i> Live on platform</div>
                        </div>
                        <!-- Startups block -->
                        <div class="admin-stat-card-pro co-stat-card" style="border-top:3px solid #7c3aed">
                            <div class="stat-header">
                                <span class="stat-title">Startups — Total</span>
                                <div class="stat-icon-wrap" style="background:#faf5ff;color:#7c3aed"><i data-lucide="rocket"></i></div>
                            </div>
                            <div class="stat-value" id="ia-stat-st-total">—</div>
                            <div class="stat-trend"><i data-lucide="database"></i> All submissions</div>
                        </div>
                        <div class="admin-stat-card-pro co-stat-card" style="border-top:3px solid #f59e0b">
                            <div class="stat-header">
                                <span class="stat-title">Startups — Pending</span>
                                <div class="stat-icon-wrap" style="background:#fffbeb;color:#f59e0b"><i data-lucide="clock"></i></div>
                            </div>
                            <div class="stat-value" id="ia-stat-st-pending">—</div>
                            <div class="stat-trend"><i data-lucide="clock"></i> Awaiting review</div>
                        </div>
                        <div class="admin-stat-card-pro co-stat-card" style="border-top:3px solid #22c55e">
                            <div class="stat-header">
                                <span class="stat-title">Startups — Approved</span>
                                <div class="stat-icon-wrap" style="background:#f0fdf4;color:#22c55e"><i data-lucide="check-circle"></i></div>
                            </div>
                            <div class="stat-value" id="ia-stat-st-approved">—</div>
                            <div class="stat-trend"><i data-lucide="check"></i> Live on platform</div>
                        </div>
                    </div>
                </div>

                <!-- CONTENT TAB -->
                <div class="admin-tab-content ia-tab" id="ia-tab-content" data-ia-tab="content">
                    <div class="admin-panel-header">
                        <div class="admin-panel-header-text">
                            <h3>Manage Innovations</h3>
                            <p>Manage innovations, startups, and related news.</p>
                        </div>
                        <div class="admin-panel-header-actions" id="ia-content-actions">
                        </div>
                    </div>
                    <div id="iaContentArea"></div>
                </div>

                <!-- JOIN REQUESTS TAB -->
                <div class="admin-tab-content ia-tab" id="ia-tab-requests" data-ia-tab="requests">
                    <div class="admin-panel-header">
                        <div class="admin-panel-header-text">
                            <h3>Join Requests</h3>
                            <p>Review applications from students wanting to join the Innovation Team.</p>
                        </div>
                        <div class="admin-panel-header-actions">
                            <button class="btn-primary" onclick="iaLoadContent('requests')">
                                <i data-lucide="refresh-cw"></i> Refresh
                            </button>
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 2rem; padding: 1.5rem;">
                        <!-- Innovation Requests -->
                        <div>
                            <h3 style="margin-bottom: 0.75rem; font-size: 1.1rem; color: #334155;">Innovation Team Applications</h3>
                            <div class="ia-table-wrap">
                                <div id="ia-loading-innovation-requests" class="ia-loading-state" hidden>
                                    <i data-lucide="loader-2"></i>
                                    <p>Loading requests…</p>
                                </div>
                                <div id="ia-empty-innovation-requests" class="ia-empty-state" hidden>
                                    <div class="ia-empty-icon"><i data-lucide="inbox"></i></div>
                                    <p>No pending innovation team requests.</p>
                                </div>
                                <table class="ia-table" id="ia-table-innovation-requests">
                                    <thead>
                                        <tr>
                                            <th>Applicant</th>
                                            <th>Contact</th>
                                            <th>Date</th>
                                            <th class="ia-text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ia-tbody-innovation-requests"></tbody>
                                </table>
                            </div>
                        </div>
                        <!-- Startup Requests -->
                        <div>
                            <h3 style="margin-bottom: 0.75rem; font-size: 1.1rem; color: #334155;">Startup Incubation Applications</h3>
                            <div class="ia-table-wrap">
                                <div id="ia-loading-startup-requests" class="ia-loading-state" hidden>
                                    <i data-lucide="loader-2"></i>
                                    <p>Loading requests…</p>
                                </div>
                                <div id="ia-empty-startup-requests" class="ia-empty-state" hidden>
                                    <div class="ia-empty-icon"><i data-lucide="inbox"></i></div>
                                    <p>No pending startup incubation requests.</p>
                                </div>
                                <table class="ia-table" id="ia-table-startup-requests">
                                    <thead>
                                        <tr>
                                            <th>Applicant</th>
                                            <th>Contact</th>
                                            <th>Date</th>
                                            <th class="ia-text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ia-tbody-startup-requests"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MESSAGES TAB -->
                <div class="admin-tab-content ia-tab" id="ia-tab-messages" data-ia-tab="messages">
                    <div class="msg-layout">
                        <!-- Conversations List -->
                        <div class="msg-sidebar">
                            <div class="msg-header">
                                <h2 class="msg-title">Messages</h2>
                                <div class="msg-search-wrap">
                                    <i data-lucide="search"></i>
                                    <input type="text" class="msg-search-input" id="ia-msg-search" placeholder="Search contacts…">
                                </div>
                            </div>
                            <div class="msg-list" id="ia-msg-conversations">
                                <!-- Populated dynamically -->
                            </div>
                        </div>

                        <!-- Active Conversation Area -->
                        <div class="msg-main" id="ia-msg-main" style="display:none">
                            <div class="msg-main-header">
                                <div class="msg-main-user">
                                    <div class="msg-main-avatar" id="ia-msg-avatar"></div>
                                    <div>
                                        <h3 class="msg-main-name" id="ia-msg-name"></h3>
                                        <div class="msg-main-status" id="ia-msg-role"></div>
                                    </div>
                                </div>
                                <button type="button" class="admin-icon-btn" onclick="msgEl('ia','main').style.display='none'" aria-label="Close conversation">
                                    <i data-lucide="x"></i>
                                </button>
                            </div>
                            <div class="msg-thread" id="ia-msg-thread">
                                <!-- Messages injected here -->
                            </div>
                            <div class="msg-composer">
                                <input type="text" class="msg-input" id="ia-msg-input" placeholder="Type your message…">
                                <button type="button" class="msg-send-btn" id="ia-msg-send" aria-label="Send message">
                                    <i data-lucide="send"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Empty State -->
                        <div class="msg-empty-state" id="ia-msg-empty">
                            <div class="msg-empty-icon"><i data-lucide="message-square"></i></div>
                            <h3>Your Messages</h3>
                            <p>Select a conversation from the list or start a new one to begin chatting.</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </div>"""

# Replace the block
pattern = r'<div id="innovation-admin-dashboard" class="page-section admin-page-wrapper coordinator-dash" style="--co-accent:#800000;--co-accent-light:#fef2f2;--co-accent-mid:#fee2e2;">.*?</div>\n        </div>\n    </div>'
new_content = re.sub(pattern, new_html, content, flags=re.DOTALL)

with open('frontend/index.html', 'w') as f:
    f.write(new_content)

print("Replacement complete. Check the diff.")
