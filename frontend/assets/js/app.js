const API_BASE_URL = (() => {
    const override = localStorage.getItem('IUEA_API_BASE');
    if (override && typeof override === 'string') {
        return override.replace(/\/$/, '');
    }
    const host = window.location.hostname || 'localhost';
    if (host.includes('ngrok-free.dev')) {
        return `https://${host}/MyProject/today/frontend/api`;
    }
    return `http://${host}:8001`;
})();

// Same-origin relative prefix for static media (Apache serves frontend/assets and frontend/uploads)
const FRONTEND_BASE = (() => {
    const path = window.location.pathname || '';
    const marker = '/frontend/';
    const idx = path.indexOf(marker);
    if (idx !== -1) return path.slice(0, idx + marker.length - 1);
    const dir = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '');
    return dir || '';
})();

/* =================== STATE =================== */
let currentUser = null;
let authToken = localStorage.getItem('jwt_token');

const HOME_NEWS_LIMIT = 6;
const INNOVATION_NEWS_LIMIT = 3;
const STARTUP_NEWS_LIMIT = 3;
const ALL_NEWS_LIMIT = 100;
const GENERAL_NEWS_LIST_QUERY = 'all=true&include_community=true';
const HOME_EVENTS_LIMIT = 6;
const ALL_EVENTS_LIMIT = 100;
const SECTION_PREVIEW_LIMIT = 3;
const SECTION_ALUMNI_NEWS_LIMIT = 3;
const SECTION_RESEARCH_PREVIEW_LIMIT = 3;
const SECTION_COMMUNITY_PREVIEW_LIMIT = 3;
const ENDOWMENT_NEWS_LIMIT = 3;
const COMMUNITY_NEWS_LIMIT = 3;
const ALL_ENDOWMENT_CAMPAIGNS_LIMIT = 100;
const ALL_RESEARCH_AREAS_LIMIT = 100;
const ALL_COMMUNITY_NEWS_LIMIT = 100;
const ALL_COMMUNITY_COMMITTEES_LIMIT = 100;
const ALL_COMMUNITY_INITIATIVES_LIMIT = 100;
const ALL_COMMUNITY_REPORTS_LIMIT = 100;
const PUBLIC_CONTENT_CACHE_TTL = 30000;
const OFFLINE_CACHE_STORAGE_KEY = 'iuea_offline_api_cache';
const OFFLINE_PUBLIC_SNAPSHOT_KEY = '__public_content_snapshot__';

const publicContentCache = {
    news: null,
    events: null,
    innovations: null,
    startups: null,
    innovationNews: null,
    startupNews: null,
    alumniNews: null,
    donations: null,
    donationTiers: null,
    endowmentStats: null,
    endowmentCampaigns: null,
    endowmentInfo: null,
    alumni: null,
    community: null,
    communityNews: null,
    researchAreas: null,
    publications: null,
    researchLabs: null,
    techPark: null,
    fetchedAt: 0
};
let publicContentFetchPromise = null;
let allNewsCache = null;
let allEventsCache = null;
let newsAllTypeFilter = null;
let allEndowmentCampaignsCache = null;
let allResearchAreasCache = null;
let allCommunityNewsCache = null;
let allCommunityCommitteesCache = null;
let allCommunityInitiativesCache = null;
let allCommunityReportsCache = null;
let publicFormsInitialized = false;
let savedContentKeys = new Set();
let followedContentKeys = new Set();
let userEngagementFetchPromise = null;
let userEngagementLoaded = false;
let offlineCacheServedCount = 0;
let offlineCacheLatestAt = 0;

const offlineCache = {
    _memory: null,

    _load() {
        if (this._memory) return this._memory;
        try {
            const raw = localStorage.getItem(OFFLINE_CACHE_STORAGE_KEY);
            this._memory = raw ? JSON.parse(raw) : {};
        } catch {
            this._memory = {};
        }
        return this._memory;
    },

    _persist() {
        try {
            localStorage.setItem(OFFLINE_CACHE_STORAGE_KEY, JSON.stringify(this._memory));
        } catch (e) {
            console.warn('Offline cache persist failed', e);
        }
    },

    get(endpoint) {
        const entry = this._load()[endpoint];
        if (!entry || entry.data === undefined) return null;
        return { data: entry.data, cachedAt: entry.cachedAt || 0 };
    },

    set(endpoint, data) {
        const store = this._load();
        store[endpoint] = { data, cachedAt: Date.now() };
        this._persist();
    }
};

function isOfflineCacheableEndpoint(endpoint) {
    if (!endpoint || endpoint.startsWith('/settings/hero-videos')) return false;
    const path = endpoint.split('?')[0];
    return path === '/settings/public'
        || path === '/content/feed'
        || path === '/content/events'
        || path === '/content/news'
        || path === '/content/innovations'
        || path === '/content/startups'
        || path === '/content/donations'
        || path === '/content/donation-tiers'
        || path === '/content/endowment-stats'
        || path === '/content/endowment-campaigns'
        || path === '/content/endowment-info'
        || path === '/content/alumni'
        || path === '/content/community'
        || path === '/content/research-areas'
        || path === '/content/publications'
        || path === '/content/research-labs'
        || path === '/content/tech-park';
}

function markOfflineCacheServed(cachedAt) {
    offlineCacheServedCount += 1;
    if (cachedAt) offlineCacheLatestAt = Math.max(offlineCacheLatestAt, cachedAt);
    updateOfflineCacheIndicator();
}

function formatRelativeCacheAge(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function ensureOfflineCacheIndicator() {
    let el = document.getElementById('offlineCacheIndicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'offlineCacheIndicator';
        el.className = 'offline-cache-indicator';
        el.hidden = true;
        el.setAttribute('role', 'status');
        const header = document.getElementById('publicHeader');
        if (header) header.insertAdjacentElement('afterend', el);
        else document.body.prepend(el);
    }
    return el;
}

function updateOfflineCacheIndicator() {
    const el = ensureOfflineCacheIndicator();
    if (isOfflineMode() || (!offlineCacheServedCount && !offlineCacheLatestAt)) {
        el.hidden = true;
        return;
    }
    const age = formatRelativeCacheAge(offlineCacheLatestAt);
    el.textContent = `Showing saved content${age ? ` · ${age}` : ''}`;
    el.hidden = false;
}

function persistPublicContentSnapshot() {
    if (publicContentCache.news == null) return;
    offlineCache.set(OFFLINE_PUBLIC_SNAPSHOT_KEY, { ...publicContentCache });
}

function hydratePublicContentFromOfflineCache() {
    const snap = offlineCache.get(OFFLINE_PUBLIC_SNAPSHOT_KEY);
    if (!snap?.data) return false;
    const d = snap.data;
    Object.keys(publicContentCache).forEach((key) => {
        if (d[key] != null) publicContentCache[key] = d[key];
    });
    markOfflineCacheServed(snap.cachedAt || d.fetchedAt || 0);
    return publicContentCache.news != null;
}

const OFFLINE_QUEUE_KEY = 'iuea_offline_queue';
const CACHED_USER_KEY = 'iuea_cached_user';

let isAppOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let offlineReplayInProgress = false;

function isOfflineMode() {
    return !isAppOnline;
}

function isNetworkFailure(status) {
    return status === 0;
}

function readOfflineQueue() {
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function cacheUserSession(user) {
    if (!user || !user.id) return;
    try {
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } catch (e) {
        console.warn('Could not cache user session:', e);
    }
}

function loadCachedUser() {
    try {
        const raw = localStorage.getItem(CACHED_USER_KEY);
        const user = raw ? JSON.parse(raw) : null;
        return user && user.id ? user : null;
    } catch {
        return null;
    }
}

function clearCachedUser() {
    localStorage.removeItem(CACHED_USER_KEY);
}

function classifyQueueableAction(endpoint, body) {
    if (endpoint === '/content/news' && body && (body.title || body.description)) {
        return { type: 'create_post', endpoint, body };
    }
    const alumniLike = endpoint.match(/^\/content\/alumni\/(\d+)\/like$/);
    if (alumniLike) {
        return { type: 'like', endpoint, body: {}, meta: { contentType: 'alumni', id: alumniLike[1] } };
    }
    const contentLike = endpoint.match(/^\/content\/([^/]+)\/(\d+)\/like$/);
    if (contentLike) {
        return { type: 'like', endpoint, body: {}, meta: { apiType: contentLike[1], id: contentLike[2] } };
    }
    const comment = endpoint.match(/^\/content\/([^/]+)\/(\d+)\/comment$/);
    if (comment && body?.message) {
        return { type: 'comment', endpoint, body, meta: { apiType: comment[1], id: comment[2] } };
    }
    return null;
}

function parseEngagementCountFromCard(type, id, iconName) {
    const card = document.querySelector(`.modern-card[data-content-type="${type}"][data-content-id="${id}"]`);
    if (!card) return null;
    const pill = card.querySelector(`.stat-pill i[data-lucide="${iconName}"]`)?.parentElement;
    if (!pill) return null;
    const match = pill.textContent.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function buildOptimisticQueueResponse(action) {
    if (action.type === 'like') {
        const type = action.meta?.contentType || action.meta?.apiType;
        const id = action.meta?.id;
        const current = parseEngagementCountFromCard(type, id, 'heart');
        return { likes: current !== null ? current + 1 : 1, queued: true };
    }
    if (action.type === 'comment') {
        return {
            id: `offline-${action.id}`,
            message: action.body.message,
            parent_id: action.body.parent_id || null,
            author_name: getUserDisplayName(currentUser) || 'You',
            created_at: new Date().toISOString(),
            queued: true
        };
    }
    if (action.type === 'create_post') {
        return { queued: true };
    }
    return { queued: true };
}

function enqueueOfflineAction(action) {
    const queue = readOfflineQueue();
    if (action.type === 'like' && action.meta) {
        const dup = queue.find(a =>
            a.type === 'like'
            && a.meta?.id === action.meta.id
            && (a.meta?.contentType || a.meta?.apiType) === (action.meta.contentType || action.meta.apiType)
        );
        if (dup) return dup;
    }
    const entry = {
        ...action,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString()
    };
    queue.push(entry);
    writeOfflineQueue(queue);
    return entry;
}

function tryQueueOfflinePost(endpoint, body) {
    const action = classifyQueueableAction(endpoint, body);
    if (!action) return null;
    return enqueueOfflineAction(action);
}

async function apiPostRaw(endpoint, body, requireAuth = true) {
    const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };
    if (requireAuth && authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { ok: res.ok, data: await parseApiResponse(res), status: res.status };
}

async function replayOfflineQueue() {
    if (offlineReplayInProgress || !isAppOnline) return;
    const queue = readOfflineQueue();
    if (!queue.length) return;

    offlineReplayInProgress = true;
    const failed = [];
    let synced = 0;

    for (const action of queue) {
        try {
            const res = await apiPostRaw(action.endpoint, action.body, action.type !== 'like' || Boolean(authToken));
            if (res.ok) {
                synced += 1;
            } else if (isNetworkFailure(res.status)) {
                failed.push(action);
            } else {
                console.warn('Dropped offline action after server rejection:', action, res.data);
            }
        } catch (e) {
            failed.push(action);
        }
    }

    writeOfflineQueue(failed);
    offlineReplayInProgress = false;

    if (synced > 0) {
        showToast(synced === 1 ? '1 offline action synced.' : `${synced} offline actions synced.`);
        invalidatePublicContentCache();
        loadInitialData({ forceRefresh: true });
    }
    if (failed.length > 0) {
        showToast(`${failed.length} action(s) still waiting to sync.`, 'info');
    }
}

function updateOfflineBanner() {
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.hidden = isAppOnline;
    document.body.classList.toggle('app-offline', !isAppOnline);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function applyOfflineAdminUI() {
    document.body.classList.toggle('app-offline', !isAppOnline);
}

function requireOnlineForAdmin(featureLabel = 'This action') {
    if (!isOfflineMode()) return true;
    showToast(`${featureLabel} requires an internet connection.`, 'error');
    return false;
}

function handleAppOnline() {
    if (isAppOnline) return;
    isAppOnline = true;
    updateOfflineBanner();
    showToast('Back online');
    replayOfflineQueue();
}

function handleAppOffline() {
    if (!isAppOnline) return;
    isAppOnline = false;
    updateOfflineBanner();
    showToast("You're offline — showing saved content", 'info');
}

function initOfflineSupport() {
    isAppOnline = navigator.onLine;
    updateOfflineBanner();
    applyOfflineAdminUI();
    window.addEventListener('online', () => {
        handleAppOnline();
        updateOfflineCacheIndicator();
    });
    window.addEventListener('offline', () => {
        handleAppOffline();
        updateOfflineCacheIndicator();
    });
}

/* =================== HELPERS =================== */
function formatApiDetail(detail, fallback = 'Request failed.') {
    if (!detail) return fallback;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        const msgs = detail.map(e => e.msg || e.message).filter(Boolean);
        if (msgs.length) return msgs.join('; ');
    }
    return fallback;
}

async function apiGet(endpoint) {
    const cacheable = isOfflineCacheableEndpoint(endpoint);
    if (isOfflineMode()) {
        if (cacheable) {
            const cached = offlineCache.get(endpoint);
            if (cached) {
                markOfflineCacheServed(cached.cachedAt);
                return cached.data;
            }
        }
        return [];
    }
    try {
        const headers = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
        headers['ngrok-skip-browser-warning'] = 'true';
        const res = await fetch(`${API_BASE_URL}${endpoint}`, { headers });
        if (res.status === 401) {
            if (isAppOnline) logout();
            return [];
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cacheable) offlineCache.set(endpoint, data);
        return data;
    } catch (e) {
        console.error('GET error:', endpoint, e);
        if (cacheable) {
            const cached = offlineCache.get(endpoint);
            if (cached) {
                markOfflineCacheServed(cached.cachedAt);
                return cached.data;
            }
        }
        return [];
    }
}

async function parseApiResponse(res) {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { detail: text };
    }
}

async function apiPost(endpoint, body, requireAuth = true) {
    const queueIfOffline = () => {
        const queued = tryQueueOfflinePost(endpoint, body);
        if (!queued) return null;
        return {
            ok: true,
            queued: true,
            status: 0,
            data: buildOptimisticQueueResponse(queued)
        };
    };

    if (isOfflineMode()) {
        const queuedRes = queueIfOffline();
        if (queuedRes) return queuedRes;
        return { ok: false, status: 0, data: { detail: 'You are offline. This action could not be saved.' } };
    }

    try {
        const res = await apiPostRaw(endpoint, body, requireAuth);
        if (!res.ok && isNetworkFailure(res.status)) {
            const queuedRes = queueIfOffline();
            if (queuedRes) return queuedRes;
        }
        return res;
    } catch (e) {
        console.error('POST error:', endpoint, e);
        const queuedRes = queueIfOffline();
        if (queuedRes) return queuedRes;
        return { ok: false, status: 0, data: { detail: e.message || 'Network error.' } };
    }
}

async function apiPut(endpoint, body = {}) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`, 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify(body)
        });
        return { ok: res.ok, data: await res.json() };
    } catch (e) { console.error('PUT error:', endpoint, e); return { ok: false }; }
}

async function apiDelete(endpoint) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}`, 'ngrok-skip-browser-warning': 'true' }
        });
        return { ok: res.ok, data: await res.json() };
    } catch (e) { console.error('DELETE error:', endpoint, e); return { ok: false }; }
}

async function apiPatch(endpoint, body = {}) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`, 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify(body)
        });
        return { ok: res.ok, data: await res.json() };
    } catch (e) { console.error('PATCH error:', endpoint, e); return { ok: false }; }
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').innerText = msg;
    toast.style.background = type === 'error'
        ? '#e74c3c'
        : type === 'info'
            ? '#475569'
            : 'var(--iuea-maroon)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function statHTML(icon, label) {
    return `<span class="stat-pill"><i data-lucide="${icon}" class="stat-icon"></i> <span>${label}</span></span>`;
}

function jsStringLiteral(value) {
    return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function authorChipHTML(authorId, authorName, contentType, contentId) {
    if (!authorId) return '';
    const name = (authorName || 'Community member').trim();
    const initial = msgInitials(name, '');
    const safeName = escapeHtml(name);
    const typeArg = contentType ? jsStringLiteral(contentType) : 'null';
    const idArg = contentId ? Number(contentId) : 'null';
    return `<button type="button" class="author-chip"
        onclick="event.stopPropagation(); openAuthorProfileModal(${authorId}, ${jsStringLiteral(name)}, ${typeArg}, ${idArg})"
        aria-label="View profile of ${safeName}">
        <span class="author-chip-avatar" aria-hidden="true">${initial}</span>
        <span class="author-chip-text">
            <span class="author-chip-label">Shared by</span>
            <span class="author-chip-name">${safeName}</span>
        </span>
    </button>`;
}

function cardAuthorRowHTML(authorId, authorName, contentType, contentId) {
    const chip = authorChipHTML(authorId, authorName, contentType, contentId);
    return chip ? `<div class="card-author-row">${chip}</div>` : '';
}

function refreshIconsIn(root) {
    if (typeof lucide === 'undefined') return;
    if (root && root instanceof Element) {
        lucide.createIcons({ root });
    } else {
        lucide.createIcons();
    }
}

function isPublicContentFresh() {
    return publicContentCache.fetchedAt > 0
        && (Date.now() - publicContentCache.fetchedAt) < PUBLIC_CONTENT_CACHE_TTL
        && publicContentCache.news !== null;
}

function invalidatePublicContentCache(keys = null) {
    if (!keys) {
        publicContentCache.news = null;
        publicContentCache.events = null;
        publicContentCache.innovations = null;
        publicContentCache.startups = null;
        publicContentCache.innovationNews = null;
        publicContentCache.startupNews = null;
        publicContentCache.alumniNews = null;
        publicContentCache.donations = null;
        publicContentCache.donationTiers = null;
        publicContentCache.endowmentStats = null;
        publicContentCache.endowmentCampaigns = null;
        publicContentCache.endowmentInfo = null;
        publicContentCache.alumni = null;
        publicContentCache.community = null;
        publicContentCache.communityNews = null;
        publicContentCache.researchAreas = null;
        publicContentCache.publications = null;
        publicContentCache.researchLabs = null;
        publicContentCache.techPark = null;
        publicContentCache.fetchedAt = 0;
        allNewsCache = null;
        allEventsCache = null;
        allEndowmentCampaignsCache = null;
        allResearchAreasCache = null;
        allCommunityNewsCache = null;
        allCommunityCommitteesCache = null;
        allCommunityInitiativesCache = null;
        allCommunityReportsCache = null;
    } else {
        keys.forEach(k => { publicContentCache[k] = null; });
        if (keys.includes('news')) allNewsCache = null;
        if (keys.includes('events')) allEventsCache = null;
        if (keys.includes('endowmentCampaigns')) allEndowmentCampaignsCache = null;
        if (keys.includes('researchAreas')) allResearchAreasCache = null;
        if (keys.includes('community') || keys.includes('communityNews')) {
            allCommunityNewsCache = null;
            allCommunityCommitteesCache = null;
            allCommunityInitiativesCache = null;
            allCommunityReportsCache = null;
        }
        publicContentCache.fetchedAt = 0;
    }
    publicContentFetchPromise = null;
}

function homeGridLoadingHTML(label) {
    return `<div class="grid-loading" aria-busy="true"><span class="grid-loading-spinner"></span><span>${label}</span></div>`;
}

function showHomeLoadingState() {
    const newsGrid = document.getElementById('newsGrid');
    const eventsGrid = document.getElementById('eventsGrid');
    const seeMoreWrap = document.getElementById('newsSeeMoreWrap');
    if (seeMoreWrap) seeMoreWrap.style.display = 'none';
    if (newsGrid && !newsGrid.children.length) {
        newsGrid.innerHTML = homeGridLoadingHTML('Loading latest updates…');
    }
    if (eventsGrid && !eventsGrid.children.length) {
        eventsGrid.innerHTML = homeGridLoadingHTML('Loading events…');
    }
}

/* =================== ROLE DASHBOARD MAP =================== */
const ROLE_DASHBOARD_MAP = {
    'registered_user':   'registered-user-dashboard',
    'donor_partner':     'donor-partner-dashboard',
    'coordinator':       'coordinator-dashboard',
    'content_editor':    'admin-dashboard',
    'super_admin':       'admin-dashboard',
    'admin':             'admin-dashboard'
};

const ASSIGNABLE_USER_ROLES = [
    'public_visitor',
    'registered_user',
    'donor_partner',
    'coordinator',
    'content_editor',
    'super_admin',
];

const REMOVED_ROLE_DASHBOARDS = ['student-innovator-dashboard', 'alumni-dashboard'];

const LEGACY_NOTIFY_CONTEXT_MAP = { si: 'ru', al: 'ru' };

function selectableRolesForUser(currentRole) {
    const roles = [...ASSIGNABLE_USER_ROLES];
    if (currentRole && !roles.includes(currentRole)) roles.push(currentRole);
    return roles;
}

function getDashboardForRole(role) {
    return ROLE_DASHBOARD_MAP[role] || null;
}

function getUserDisplayName(user) {
    if (!user) return null;
    const name = (user.name || '').trim();
    if (name) return name;
    const email = (user.email || '').trim();
    if (email) return email.split('@')[0];
    return null;
}

function formatRoleLabel(role) {
    if (!role) return '';
    return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getAdminMenuDisplayName(user) {
    const displayName = getUserDisplayName(user) || 'User';
    const roleLabel = formatRoleLabel(user?.role);
    if (roleLabel && displayName.localeCompare(roleLabel, undefined, { sensitivity: 'accent' }) === 0) {
        const email = (user.email || '').trim();
        if (email.includes('@')) {
            return email.split('@')[0]
                .replace(/[._-]+/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
        }
    }
    return displayName;
}

function navigateToDashboard() {
    if (!currentUser) { showAuthModal(); return; }
    const dashId = getDashboardForRole(currentUser.role);
    if (dashId) navigateTo(dashId);
    else navigateTo('home');
}

/* =================== NAVIGATION =================== */
function navigateTo(pageId) {
    if (REMOVED_ROLE_DASHBOARDS.includes(pageId)) {
        showToast('This dashboard is no longer available.', 'info');
        if (currentUser) navigateToDashboard();
        else navigateTo('home');
        return;
    }

    const isAdminDash = pageId === 'admin-dashboard';
    const isRoleDash  = Object.values(ROLE_DASHBOARD_MAP).includes(pageId) && pageId !== 'admin-dashboard';

    // Guard: admin-dashboard requires admin role
    if (isAdminDash && (!currentUser || !['super_admin', 'content_editor', 'admin'].includes(currentUser.role))) {
        showToast('Access denied.', 'error');
        showAuthModal();
        return;
    }

    // Guard: role dashboards require login
    if (isRoleDash && !currentUser) {
        showToast('Please sign in first.', 'error');
        showAuthModal();
        return;
    }

    // Guard: coordinator dashboard requires coordinator role
    if (pageId === 'coordinator-dashboard' && currentUser?.role !== 'coordinator') {
        showToast('Access denied.', 'error');
        if (currentUser) navigateToDashboard();
        else navigateTo('home');
        return;
    }

    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active-nav'));
    const page = document.getElementById(pageId);
    if (!page) {
        if (pageId === 'startups') {
            navigateToInnovationStartups();
            return;
        }
        if (pageId === 'events' || pageId === 'news') {
            navigateTo(pageId === 'events' ? 'events-all' : 'home');
            return;
        }
        console.warn('Unknown page:', pageId);
        showToast('That page is not available.', 'info');
        navigateTo('home');
        return;
    }
    page.classList.add('active');
    const link = document.querySelector(`.nav-links a[onclick="navigateTo('${pageId}')"]`);
    if (link) link.classList.add('active-nav');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (document.getElementById('navLinks').classList.contains('open')) toggleMobileNav();

    // Toggle public chrome visibility
    const applyBtn  = document.getElementById('fixedApplyBtn');
    const pubHeader = document.getElementById('publicHeader');
    const pubSearch = document.getElementById('publicSearch');
    const footer    = document.querySelector('footer');
    const isDash    = isAdminDash || isRoleDash;

    if (isDash) {
        if (pubHeader) pubHeader.style.display = 'none';
        if (pubSearch) pubSearch.style.display = 'none';
        if (footer)    footer.style.display    = 'none';
        if (applyBtn)  applyBtn.style.display  = 'none';
    } else {
        if (pubHeader) pubHeader.style.display = 'block';
        if (pubSearch) pubSearch.style.display = 'block';
        if (footer)    footer.style.display    = 'block';
        if (applyBtn)  applyBtn.style.display  = 'inline-flex';
    }

    if (isAdminDash) loadAdminDashboard();
    if (isRoleDash)  populateRoleDashboard(pageId);
    if (pageId === 'news-all') loadAllNewsPage();
    if (pageId === 'events-all') loadAllEventsPage();
    if (pageId === 'endowment-campaigns-all') loadAllEndowmentCampaignsPage();
    if (pageId === 'research-areas-all') loadAllResearchAreasPage();
    if (pageId === 'publications-all') loadAllPublicationsPage();
    if (pageId === 'research-labs-all') loadAllResearchLabsPage();
    if (pageId === 'community-news-all') loadAllCommunityNewsPage();
    if (pageId === 'community-committees-all') loadAllCommunityCommitteesPage();
    if (pageId === 'community-initiatives-all') loadAllCommunityInitiativesPage();
    if (pageId === 'community-reports-all') loadAllCommunityReportsPage();
    if (pageId === 'community') {
        loadHeroVideosForPublicPages().then(() => {
            const vid = document.getElementById('communityVideo');
            if (vid?.src) vid.play().catch(() => {});
        });
    }
}

function toggleMobileNav() {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;
    const isOpen = navLinks.classList.toggle('open');
    document.body.classList.toggle('nav-open', isOpen);
    const btn = document.querySelector('.mobile-menu-btn');
    if (btn) {
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        btn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    }
}

function switchTab(tabId, btn) {
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('innovations-panel').style.display = tabId === 'innovations' ? 'block' : 'none';
    document.getElementById('startups-panel').style.display = tabId === 'startups' ? 'block' : 'none';
}

function navigateToInnovationStartups() {
    navigateTo('innovation');
    setTimeout(() => {
        const btn = document.querySelector('#innovation .innovation-tab-btn[onclick*="startups"]');
        if (btn) switchTab('startups', btn);
    }, 120);
}

function showAdminTab(tabId, btn) {
    const dash = document.getElementById('admin-dashboard');
    if (!dash) return;

    dash.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
        const targetBtn = dash.querySelector(`.admin-nav-btn[onclick*="'${tabId}'"]`)
            || dash.querySelector(`.admin-nav-btn[data-module="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active');
    }

    dash.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`admin-tab-${tabId}`);
    if (tab) tab.classList.add('active');
    
    if (tabId === 'hero-videos') {
        loadHeroVideoSettings();
    }
    if (tabId === 'overview') {
        setTimeout(initAdminCharts, 50);
    }
    if (tabId === 'analytics') {
        const period = document.getElementById('analyticsPeriodSelect')?.value || '30d';
        loadAdminAnalytics(period).then(() => setTimeout(initAnalyticsCharts, 50));
    }
    if (tabId === 'messages') {
        initMessaging('admin');
    }
    if (tabId === 'settings') {
        loadAdminSettings();
    }
    lucide.createIcons();
}

function ensurePublicForm(type) {
    const container = document.getElementById(type + 'FormContainer');
    if (!container) return null;
    if (!container.innerHTML.trim()) {
        container.innerHTML = getFormHTML(type);
        refreshIconsIn(container);
    }
    return container;
}

function activateInnovationTabForForm(type) {
    const tabMap = { innovation: 'innovations', startup: 'startups' };
    const tabId = tabMap[type];
    if (!tabId) return;

    const innovationPage = document.getElementById('innovation');
    if (!innovationPage?.classList.contains('active')) return;

    const panelId = tabId === 'innovations' ? 'innovations-panel' : 'startups-panel';
    const panel = document.getElementById(panelId);
    if (panel && panel.style.display === 'none') {
        const tabBtn = innovationPage.querySelector(`.innovation-tab-btn[onclick*="'${tabId}'"]`);
        if (tabBtn) switchTab(tabId, tabBtn);
    }
}

function activateInnovationsTab() {
    const innovationPage = document.getElementById('innovation');
    if (!innovationPage) return;
    const innovationsPanel = document.getElementById('innovations-panel');
    if (!innovationsPanel || innovationsPanel.style.display !== 'none') return;
    const tabBtn = innovationPage.querySelector(`.innovation-tab-btn[onclick*="'innovations'"]`);
    if (tabBtn) switchTab('innovations', tabBtn);
}

function scrollToInnovationJoin() {
    const innovationPage = document.getElementById('innovation');
    if (innovationPage && !innovationPage.classList.contains('active')) {
        navigateTo('innovation');
        setTimeout(scrollToInnovationJoin, 300);
        return;
    }
    activateInnovationsTab();
    const section = document.getElementById('innovation-join-section');
    if (!section) return;
    requestAnimationFrame(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function closeForm(type) {
    const form = document.getElementById(type + 'FormContainer');
    if (form) form.classList.remove('show');
}

function toggleForm(type) {
    const form = ensurePublicForm(type);
    if (!form) return;

    activateInnovationTabForForm(type);
    form.classList.add('show');
    requestAnimationFrame(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

/* =================== CARD RENDERER =================== */
// Resolve stored media paths to loadable URLs.
// Images live under frontend/assets (Apache); hero videos under frontend/uploads symlink.
function resolveMediaUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    let path = trimmed;
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const parsed = new URL(trimmed);
            if (parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/uploads/')) {
                path = parsed.pathname;
            } else {
                return trimmed;
            }
        } catch {
            return trimmed;
        }
    }

    if (path.startsWith('/assets/') || path.startsWith('assets/')) {
        const rel = path.startsWith('/') ? path.slice(1) : path;
        return FRONTEND_BASE ? `${FRONTEND_BASE}/${rel}` : rel;
    }
    if (path.startsWith('/uploads/') || path.startsWith('uploads/')) {
        const rel = path.startsWith('/') ? path.slice(1) : path;
        return FRONTEND_BASE ? `${FRONTEND_BASE}/${rel}` : rel;
    }

    const assetsIdx = path.indexOf('/assets/');
    if (assetsIdx !== -1) {
        const rel = path.slice(assetsIdx + 1);
        return FRONTEND_BASE ? `${FRONTEND_BASE}/${rel}` : rel;
    }
    const uploadsIdx = path.indexOf('/uploads/');
    if (uploadsIdx !== -1) {
        const rel = path.slice(uploadsIdx + 1);
        return FRONTEND_BASE ? `${FRONTEND_BASE}/${rel}` : rel;
    }

    if (/^[^/?#]+\.(jpe?g|png|gif|webp|mp4|webm|ogg)$/i.test(path)) {
        const rel = `assets/images/${path}`;
        return FRONTEND_BASE ? `${FRONTEND_BASE}/${rel}` : rel;
    }

    return trimmed;
}

function kanbanItemImageRaw(item) {
    if (!item) return null;
    return item.image_url || item.image || item.profile_image || null;
}

function alumniDisplayName(item) {
    const name = `${item.first_name || ''} ${item.last_name || ''}`.trim();
    return name || item.title || item.name || 'Alumni Member';
}

function truncateText(text, max = 90) {
    if (!text) return '';
    return text.length > max ? `${text.substring(0, max)}...` : text;
}

function cardSocialLinksHTML() {
    return `
            <div class="social-links">
                <a href="#" aria-label="Twitter"><i data-lucide="twitter"></i></a>
                <a href="#" aria-label="Facebook"><i data-lucide="facebook"></i></a>
                <a href="#" aria-label="LinkedIn"><i data-lucide="linkedin"></i></a>
            </div>`;
}

function updateCardEngagementStat(contentType, contentId, icon, label) {
    document.querySelectorAll(`.modern-card[data-content-type="${contentType}"][data-content-id="${contentId}"]`).forEach(card => {
        const iconEl = card.querySelector(`.card-stats-row .stat-icon[data-lucide="${icon}"]`);
        if (!iconEl) return;
        const pill = iconEl.closest('.stat-pill');
        if (pill) pill.querySelector('span:last-child').textContent = label;
    });
}

const COMMENT_API_PATHS = {
    news: 'news',
    events: 'events',
    innovations: 'innovations',
    startups: 'startups',
    alumni: 'alumni',
    community: 'community',
    'research-areas': 'research-areas',
    publications: 'publications',
    'research-labs': 'research-labs',
    'tech-park': 'tech-park',
    techpark: 'techpark',
    'endowment-campaigns': 'endowment-campaigns',
};

function commentApiPath(contentType) {
    return COMMENT_API_PATHS[contentType] || contentType;
}

function cardCommentButton(contentType, id) {
    return `<button onclick="commentContent('${contentType}', ${id})"><i data-lucide="message-circle"></i> Comment</button>`;
}

function escapeJsString(str) {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '');
}

function cardShareButton(contentType, id, title, description) {
    const t = escapeJsString(title || 'Untitled');
    const d = escapeJsString(truncateText(description || '', 200));
    return `<button onclick="shareContent('${contentType}', ${id}, '${t}', '${d}')"><i data-lucide="share-2"></i> Share</button>`;
}

const CARD_DETAIL_INTERACTIVE_SELECTOR = [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    'video',
    'audio',
    '[controls]',
    '[contenteditable="true"]',
    '.card-actions',
    '.card-save-btn',
    '.card-badge',
    '.author-chip',
    '.social-links',
    '.share-platform-btn',
].join(',');

function savedKey(type, id) {
    return `${commentApiPath(type)}:${id}`;
}

function isContentSaved(type, id) {
    return savedContentKeys.has(savedKey(type, id));
}

function cardSaveButtonLabel(saved) {
    return saved ? 'Saved' : 'Save';
}

function cardSaveButtonHTML() {
    return `<i data-lucide="bookmark"></i>`;
}

function setCardSaveButtonState(btn, saved) {
    const label = cardSaveButtonLabel(saved);
    btn.classList.toggle('saved', saved);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.innerHTML = cardSaveButtonHTML();
}

function cardSaveButton(contentType, id) {
    const saved = isContentSaved(contentType, id);
    const label = cardSaveButtonLabel(saved);
    return `<button type="button" class="card-save-btn${saved ? ' saved' : ''}" data-save-type="${contentType}" data-save-id="${id}" aria-label="${label}" title="${label}" onclick="event.stopPropagation(); saveContent('${contentType}', ${id})">${cardSaveButtonHTML()}</button>`;
}

function updateSaveButton(type, id, saved) {
    document.querySelectorAll(`.card-save-btn[data-save-type="${type}"][data-save-id="${id}"]`).forEach(btn => {
        setCardSaveButtonState(btn, saved);
        refreshIconsIn(btn);
    });
}

function applySavedStateToCards(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const iconRoots = new Set();
    scope.querySelectorAll('.card-save-btn').forEach(btn => {
        const type = btn.dataset.saveType;
        const id = parseInt(btn.dataset.saveId, 10);
        if (!type || Number.isNaN(id)) return;
        setCardSaveButtonState(btn, isContentSaved(type, id));
        iconRoots.add(btn);
    });
    iconRoots.forEach(btn => refreshIconsIn(btn));
}

function followedKey(contentType, contentId) {
    return `${contentType}:${contentId}`;
}

function isContentFollowed(contentType, contentId) {
    return followedContentKeys.has(followedKey(contentType, contentId));
}

async function loadUserEngagementState() {
    if (!authToken || !currentUser) {
        savedContentKeys.clear();
        followedContentKeys.clear();
        userEngagementLoaded = false;
        applySavedStateToCards();
        return;
    }
    if (userEngagementFetchPromise) return userEngagementFetchPromise;

    userEngagementFetchPromise = (async () => {
        const [saved, followed] = await Promise.all([
            apiGet('/content/saved/ids'),
            apiGet('/content/followed/ids'),
        ]);

        savedContentKeys.clear();
        if (Array.isArray(saved)) {
            saved.forEach(({ content_type, content_id }) => {
                savedContentKeys.add(`${content_type}:${content_id}`);
            });
            const statSaved = document.getElementById('ru-stat-saved');
            if (statSaved) statSaved.textContent = saved.length;
        }

        followedContentKeys.clear();
        if (Array.isArray(followed)) {
            followed.forEach(({ content_type, content_id }) => {
                followedContentKeys.add(followedKey(content_type, content_id));
            });
            const statFollowed = document.getElementById('ru-stat-followed');
            if (statFollowed) statFollowed.textContent = followed.length;
        }

        applySavedStateToCards();
        userEngagementLoaded = true;
    })().finally(() => {
        userEngagementFetchPromise = null;
    });

    return userEngagementFetchPromise;
}

async function loadSavedContentIds() {
    return loadUserEngagementState();
}

async function saveContent(type, id) {
    if (!currentUser || !authToken) {
        showAuthModal();
        return;
    }
    const res = await apiPost('/content/save', {
        content_type: commentApiPath(type),
        content_id: id,
    });
    if (!res.ok) {
        const detail = res.data?.detail;
        const message = typeof detail === 'string' ? detail : 'Could not save this item';
        showToast(message, 'error');
        return;
    }
    const saved = !!res.data?.saved;
    const key = savedKey(type, id);
    if (saved) savedContentKeys.add(key);
    else savedContentKeys.delete(key);
    updateSaveButton(type, id, saved);
    showToast(saved ? 'Saved' : 'Removed from saved');
    const statEl = document.getElementById('ru-stat-saved');
    if (statEl && typeof res.data?.count === 'number') statEl.textContent = res.data.count;
}

function cardCommentsStat(item) {
    return statHTML('message-circle', `${item.comments_count || 0} comments`);
}

function createAlumniCard(item) {
    const title = alumniDisplayName(item);
    const role = (item.role || '').trim();
    const achievement = (item.achievement || '').trim();
    const desc = achievement || role || 'Member of the IUEA alumni network.';
    const imageUrl = resolveMediaUrl(item.image) || `https://picsum.photos/600/400?random=${item.id || 'alumni'}`;
    const badgeText = achievement
        ? truncateText(achievement, 35)
        : (role || 'Alumni');

    let stats = '';
    if (item.year) stats += statHTML('graduation-cap', `Class of ${item.year}`);
    else stats += statHTML('graduation-cap', 'IUEA Alumni');
    if (role && achievement) stats += statHTML('briefcase', role);
    stats += statHTML('heart', `${item.likes || 0} likes`);
    stats += cardCommentsStat(item);

    return `
    <div class="modern-card" data-content-type="alumni" data-content-id="${item.id}">
        <div class="card-media">
            <img class="card-image" src="${imageUrl}" alt="${title}" loading="lazy" decoding="async" width="600" height="400" onerror="this.src='https://picsum.photos/600/400?random=${item.id || 'alumni'}'">
            <span class="card-badge gold">${badgeText}</span>
            ${cardSaveButton('alumni', item.id)}
        </div>
        <div class="card-content">
            <h3>${title}</h3>
            <p>${truncateText(desc)}</p>
            <div class="card-stats-row">${stats}</div>
            <div class="card-actions">
                <button onclick="likeAlumni(${item.id})"><i data-lucide="heart"></i> Like</button>
                ${cardCommentButton('alumni', item.id)}
                ${cardShareButton('alumni', item.id, title, desc)}
            </div>
            ${cardSocialLinksHTML()}
        </div>
    </div>`;
}

function createEventCard(item) {
    const title = item.title || 'Untitled Event';
    const desc = item.description || item.location || item.category || '';
    const badge = item.category || 'Event';
    const imageUrl = resolveMediaUrl(item.image) || `https://picsum.photos/600/400?random=${item.id}`;
    const videoUrl = resolveMediaUrl(item.video);

    let stats = '';
    if (item.likes !== undefined) stats += statHTML('heart', `${item.likes || 0} likes`);
    stats += cardCommentsStat(item);
    if (item.date) stats += statHTML('calendar', item.date);
    if (item.location) stats += statHTML('map-pin', item.location);
    const authorRow = cardAuthorRowHTML(item.author_id, item.author_name, 'events', item.id);

    const mediaHTML = videoUrl
        ? `<video class="card-image" src="${videoUrl}" poster="${imageUrl}" controls style="object-fit:cover"></video>`
        : `<img class="card-image" src="${imageUrl}" alt="${title}" loading="lazy" decoding="async" width="600" height="400" onerror="this.src='https://picsum.photos/600/400?random=${item.id}'">`;

    return `
    <div class="modern-card" data-content-type="events" data-content-id="${item.id}">
        <div class="card-media">
            ${mediaHTML}
            <span class="card-badge" style="text-transform:capitalize">${badge}</span>
            ${cardSaveButton('events', item.id)}
        </div>
        <div class="card-content">
            <h3>${title}</h3>
            <p>${truncateText(desc)}</p>
            ${authorRow}
            <div class="card-stats-row">${stats}</div>
            <div class="card-actions">
                <button onclick="likeContent('events', ${item.id})"><i data-lucide="heart"></i> Like</button>
                ${cardCommentButton('events', item.id)}
                ${cardShareButton('events', item.id, title, desc)}
            </div>
        </div>
    </div>`;
}

const HOME_NEWS_SECTION_META = {
    campus: { label: 'Campus News', badgeClass: 'badge-campus', pageId: 'news-all', contentType: 'news' },
    innovation: { label: 'Innovation', badgeClass: 'badge-innovation', pageId: 'innovation', contentType: 'news' },
    startup: { label: 'Startup', badgeClass: 'badge-startup', pageId: 'innovation', startupTab: true, contentType: 'news' },
    alumni: { label: 'Alumni', badgeClass: 'badge-alumni', pageId: 'alumni', contentType: 'news' },
    community: { label: 'Community', badgeClass: 'badge-community', pageId: 'community', contentType: 'community' },
};

function resolveHomeNewsSection(item) {
    if (item?.source === 'community' || item?.source === 'commission') return 'community';
    const raw = String(item?.section || item?.news_type || item?.type || item?.badge || 'news').toLowerCase();
    if (raw === 'community' || raw === 'commission' || raw === 'community-news' || raw === 'commission-news') return 'community';
    if (raw === 'innovation' || raw === 'innovations') return 'innovation';
    if (raw === 'startup' || raw === 'startups') return 'startup';
    if (raw === 'alumni') return 'alumni';
    if (raw === 'news' || raw === 'campus' || raw === 'campus news') return 'campus';
    return 'campus';
}

function navigateToHomeNewsSection(sectionKey) {
    const meta = HOME_NEWS_SECTION_META[sectionKey] || HOME_NEWS_SECTION_META.campus;
    navigateTo(meta.pageId);
    if (meta.startupTab) {
        setTimeout(() => {
            const tabBtn = document.getElementById('innovation')?.querySelector(`.innovation-tab-btn[onclick*="'startups'"]`);
            if (tabBtn) switchTab('startups', tabBtn);
        }, 100);
    }
}

function handleHomeNewsCardClick(event, sectionKey) {
    if (event.target.closest('.card-actions, .card-save-btn, button, a, video, input, textarea, select')) return;
    event.stopPropagation();
    openCardDetailFromCard(event.currentTarget);
}

function createHomeNewsCard(item) {
    const sectionKey = resolveHomeNewsSection(item);
    const meta = HOME_NEWS_SECTION_META[sectionKey];
    const contentType = (item.source === 'community' || item.source === 'commission') ? 'community' : 'news';
    const title = item.title || 'Untitled';
    const desc = item.description || item.category || '';
    const imageUrl = resolveMediaUrl(item.image) || `https://picsum.photos/600/400?random=${item.id}`;
    const videoUrl = resolveMediaUrl(item.video);
    let stats = '';
    if (item.likes !== undefined) stats += statHTML('heart', `${item.likes} likes`);
    stats += cardCommentsStat(item);
    if (item.date) stats += statHTML('calendar', item.date);
    const authorRow = cardAuthorRowHTML(item.author_id, item.author_name, contentType, item.id);
    const mediaHTML = videoUrl
        ? `<video class="card-image" src="${videoUrl}" poster="${imageUrl}" controls style="object-fit:cover"></video>`
        : `<img class="card-image" src="${imageUrl}" alt="${title}" loading="lazy" decoding="async" width="600" height="400" onerror="this.src='https://picsum.photos/600/400?random=${item.id}'">`;
    const badgeHTML = `<span class="card-badge ${meta.badgeClass}" role="link" tabindex="0" onclick="event.stopPropagation(); navigateToHomeNewsSection('${sectionKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigateToHomeNewsSection('${sectionKey}');}">${meta.label}</span>`;

    return `
    <div class="modern-card home-news-card" data-content-type="${contentType}" data-content-id="${item.id}" data-home-section="${sectionKey}" onclick="handleHomeNewsCardClick(event, '${sectionKey}')">
        <div class="card-media">
            ${mediaHTML}
            ${badgeHTML}
            ${cardSaveButton(contentType, item.id)}
        </div>
        <div class="card-content">
            <h3>${title}</h3>
            <p>${truncateText(desc)}</p>
            ${authorRow}
            <div class="card-stats-row">${stats}</div>
            <div class="card-actions">
                <button type="button" onclick="event.stopPropagation(); likeContent('${contentType}', ${item.id})"><i data-lucide="heart"></i> Like</button>
                <button type="button" onclick="event.stopPropagation(); commentContent('${contentType}', ${item.id})"><i data-lucide="message-circle"></i> Comment</button>
                <button type="button" onclick="event.stopPropagation(); shareContent('${contentType}', ${item.id}, '${escapeJsString(title)}', '${escapeJsString(truncateText(desc || '', 200))}')"><i data-lucide="share-2"></i> Share</button>
            </div>
        </div>
    </div>`;
}

function createEndowmentCampaignCard(item) {
    const contentType = 'endowment-campaigns';
    const title = item.title || 'Untitled Campaign';
    const desc = item.description || '';
    const imageUrl = resolveMediaUrl(item.image) || `https://picsum.photos/600/400?random=${item.id}`;
    let stats = '';
    if (item.goal_amount) stats += statHTML('target', `Goal: ${item.goal_amount}`);
    if (item.raised_amount) stats += statHTML('trending-up', `Raised: ${item.raised_amount}`);
    if (item.likes !== undefined) stats += statHTML('heart', `${item.likes} likes`);

    return `
    <div class="modern-card" data-content-type="${contentType}" data-content-id="${item.id}">
        <div class="card-media">
            <img class="card-image" src="${imageUrl}" alt="${title}" loading="lazy" decoding="async" width="600" height="400" onerror="this.src='https://picsum.photos/600/400?random=${item.id}'">
            <span class="card-badge">Campaign</span>
        </div>
        <div class="card-content">
            <h3>${title}</h3>
            <p>${truncateText(desc)}</p>
            <div class="card-stats-row">${stats}</div>
            <div class="card-actions">
                <button onclick="likeContent('${contentType}', ${item.id})"><i data-lucide="heart"></i> Like</button>
                ${cardShareButton(contentType, item.id, title, desc)}
            </div>
        </div>
    </div>`;
}

function createCard(item, cardType) {
    if (cardType === 'alumni') return createAlumniCard(item);
    if (cardType === 'events') return createEventCard(item);
    if (cardType === 'endowment-campaigns') return createEndowmentCampaignCard(item);

    const contentType = cardType || item.type || 'news';
    const title = item.title || item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Untitled';
    let desc = item.description || item.achievement || item.role || item.category || item.focus || '';
    if (contentType === 'publications') {
        desc = [item.journal, item.year].filter(Boolean).join(' · ') || desc;
    }
    const badge = item.badge || item.type || item.category;
    const imageUrl = resolveMediaUrl(item.image) || `https://picsum.photos/600/400?random=${item.id}`;
    const videoUrl = resolveMediaUrl(item.video);
    let stats = '';
    if (item.likes !== undefined) stats += statHTML('heart', `${item.likes} likes`);
    stats += cardCommentsStat(item);
    if (item.director) stats += statHTML('user', `Dir: ${item.director}`);
    if (item.year) stats += statHTML('graduation-cap', `Class of ${item.year}`);
    if (item.date) stats += statHTML('calendar', item.date);
    if (item.authors) stats += statHTML('book-open', item.authors);
    const authorRow = cardAuthorRowHTML(item.author_id, item.author_name, contentType, item.id);

    const mediaHTML = videoUrl
        ? `<video class="card-image" src="${videoUrl}" poster="${imageUrl}" controls style="object-fit:cover"></video>`
        : `<img class="card-image" src="${imageUrl}" alt="${title}" loading="lazy" decoding="async" width="600" height="400" onerror="this.src='https://picsum.photos/600/400?random=${item.id}'">`;

    const badgeHTML = badge
        ? `<span class="card-badge" style="text-transform:capitalize">${badge}</span>`
        : '';

    return `
    <div class="modern-card" data-content-type="${contentType}" data-content-id="${item.id}">
        <div class="card-media">
            ${mediaHTML}
            ${badgeHTML}
            ${cardSaveButton(contentType, item.id)}
        </div>
        <div class="card-content">
            <h3>${title}</h3>
            <p>${truncateText(desc)}</p>
            ${authorRow}
            <div class="card-stats-row">${stats}</div>
            <div class="card-actions">
                <button onclick="likeContent('${contentType}', ${item.id})"><i data-lucide="heart"></i> Like</button>
                ${cardCommentButton(contentType, item.id)}
                ${cardShareButton(contentType, item.id, title, desc)}
            </div>
        </div>
    </div>`;
}

async function fetchAlumniNews(limit = SECTION_ALUMNI_NEWS_LIMIT + 1) {
    const news = await apiGet(`/content/news?type=alumni&limit=${limit}`).catch(() => []);
    return Array.isArray(news) ? news : [];
}

function renderAlumniSection(alumni, alumniNews) {
    renderSectionPreviewGrid(
        'alumniNewsFeature',
        alumniNews,
        SECTION_ALUMNI_NEWS_LIMIT,
        'alumniNewsSeeMoreWrap',
        null,
        'news',
        'No alumni news yet.'
    );
    const alumniFeed = document.getElementById('alumniFeed');
    if (alumniFeed) {
        alumniFeed.innerHTML = alumni.length
            ? alumni.map(a => createCard(a, 'alumni')).join('')
            : '<p style="color:var(--iuea-gray-light)">No alumni yet.</p>';
        refreshIconsIn(alumniFeed);
    }
    const alumniHL = document.getElementById('alumniHighlights');
    if (alumniHL) {
        alumniHL.innerHTML = alumni.length ? createCard(alumni[0], 'alumni') : '';
        refreshIconsIn(alumniHL);
    }
}

async function fetchHomeNewsFeed(limit = HOME_NEWS_LIMIT + 1) {
    const feed = await apiGet(`/content/feed?limit=${limit}&include_community=true`).catch(() => []);
    return Array.isArray(feed) ? feed : [];
}

async function fetchGeneralNews(limit) {
    const limitParam = limit != null ? `&limit=${limit}` : '';
    const news = await apiGet(`/content/news?${GENERAL_NEWS_LIST_QUERY}${limitParam}`).catch(() => []);
    return Array.isArray(news) ? news : [];
}

async function fetchInnovationNews(limit = INNOVATION_NEWS_LIMIT + 1) {
    const news = await apiGet(`/content/news?type=innovation&limit=${limit}`).catch(() => []);
    return Array.isArray(news) ? news : [];
}

async function fetchStartupNews(limit = STARTUP_NEWS_LIMIT + 1) {
    const news = await apiGet(`/content/news?type=startup&limit=${limit}`).catch(() => []);
    return Array.isArray(news) ? news : [];
}

function navigateToFilteredNews(type) {
    newsAllTypeFilter = type || null;
    navigateTo('news-all');
}

function resolveNewsCardType(item) {
    if (item?.source === 'community' || item?.source === 'commission' || item?.type === 'community-news' || item?.type === 'commission-news') return 'community';
    return 'news';
}

function renderHomeSection(news, events) {
    const newsList = Array.isArray(news) ? news : [];
    const hasMoreNews = newsList.length > HOME_NEWS_LIMIT;
    const homeNews = hasMoreNews ? newsList.slice(0, HOME_NEWS_LIMIT) : newsList;

    const newsGrid = document.getElementById('newsGrid');
    if (newsGrid) {
        newsGrid.innerHTML = homeNews.length
            ? homeNews.map(n => createHomeNewsCard(n)).join('')
            : '<p style="color:var(--iuea-gray-light)">No news yet.</p>';
        refreshIconsIn(newsGrid);
        if (savedContentKeys.size) applySavedStateToCards(newsGrid);
    }
    const seeMoreWrap = document.getElementById('newsSeeMoreWrap');
    if (seeMoreWrap) {
        seeMoreWrap.style.display = hasMoreNews ? '' : 'none';
        if (hasMoreNews) refreshIconsIn(seeMoreWrap);
    }
    const eventsList = Array.isArray(events) ? events : [];
    const hasMoreEvents = eventsList.length > HOME_EVENTS_LIMIT;
    const homeEvents = hasMoreEvents ? eventsList.slice(0, HOME_EVENTS_LIMIT) : eventsList;

    const eventsGrid = document.getElementById('eventsGrid');
    if (eventsGrid) {
        eventsGrid.innerHTML = homeEvents.length
            ? homeEvents.map(e => createEventCard(e)).join('')
            : '<p style="color:var(--iuea-gray-light)">No events yet.</p>';
        refreshIconsIn(eventsGrid);
        if (savedContentKeys.size) applySavedStateToCards(eventsGrid);
    }
    const eventsSeeMoreWrap = document.getElementById('eventsSeeMoreWrap');
    if (eventsSeeMoreWrap) {
        eventsSeeMoreWrap.style.display = hasMoreEvents ? '' : 'none';
        if (hasMoreEvents) refreshIconsIn(eventsSeeMoreWrap);
    }
}

function renderInnovationSection(innovations, startups, innovationNews, startupNews) {
    const innovNewsFeature = document.getElementById('innovationNewsFeature');
    if (innovNewsFeature) {
        const items = Array.isArray(innovationNews) ? innovationNews : [];
        const hasMoreInnovNews = items.length > INNOVATION_NEWS_LIMIT;
        const previewInnovNews = hasMoreInnovNews ? items.slice(0, INNOVATION_NEWS_LIMIT) : items;
        innovNewsFeature.innerHTML = previewInnovNews.length
            ? previewInnovNews.map(n => createCard(n, 'news')).join('')
            : '<p style="color:var(--iuea-gray-light)">No innovation news yet.</p>';
        refreshIconsIn(innovNewsFeature);
        if (savedContentKeys.size) applySavedStateToCards(innovNewsFeature);
    }
    const innovNewsSeeMoreWrap = document.getElementById('innovationNewsSeeMoreWrap');
    if (innovNewsSeeMoreWrap) {
        innovNewsSeeMoreWrap.style.display = (Array.isArray(innovationNews) && innovationNews.length > INNOVATION_NEWS_LIMIT) ? '' : 'none';
        if (innovationNews?.length > INNOVATION_NEWS_LIMIT) refreshIconsIn(innovNewsSeeMoreWrap);
    }
    const innovList = document.getElementById('innovationsList');
    if (innovList) {
        innovList.innerHTML = innovations.length
            ? innovations.map(i => createCard(i, 'innovations')).join('')
            : '<p style="color:var(--iuea-gray-light)">No innovations yet.</p>';
        refreshIconsIn(innovList);
    }
    const innovHL = document.getElementById('innovationHighlights');
    if (innovHL) {
        innovHL.innerHTML = innovations.length ? createCard(innovations[0], 'innovations') : '';
        refreshIconsIn(innovHL);
    }
    const startupList = document.getElementById('startupsList');
    if (startupList) {
        startupList.innerHTML = startups.length
            ? startups.map(s => createCard(s, 'startups')).join('')
            : '<p style="color:var(--iuea-gray-light)">No startups yet.</p>';
        refreshIconsIn(startupList);
    }
    const startupHL = document.getElementById('startupHighlights');
    if (startupHL) {
        startupHL.innerHTML = startups.length ? createCard(startups[0], 'startups') : '';
        refreshIconsIn(startupHL);
    }
    const startupNewsFeature = document.getElementById('startupNewsFeature');
    if (startupNewsFeature) {
        const items = Array.isArray(startupNews) ? startupNews : [];
        const hasMoreStartupNews = items.length > STARTUP_NEWS_LIMIT;
        const previewStartupNews = hasMoreStartupNews ? items.slice(0, STARTUP_NEWS_LIMIT) : items;
        startupNewsFeature.innerHTML = previewStartupNews.length
            ? previewStartupNews.map(n => createCard(n, 'news')).join('')
            : '<p style="color:var(--iuea-gray-light)">No startup news yet.</p>';
        refreshIconsIn(startupNewsFeature);
        if (savedContentKeys.size) applySavedStateToCards(startupNewsFeature);
    }
    const startupNewsSeeMoreWrap = document.getElementById('startupNewsSeeMoreWrap');
    if (startupNewsSeeMoreWrap) {
        startupNewsSeeMoreWrap.style.display = (Array.isArray(startupNews) && startupNews.length > STARTUP_NEWS_LIMIT) ? '' : 'none';
        if (startupNews?.length > STARTUP_NEWS_LIMIT) refreshIconsIn(startupNewsSeeMoreWrap);
    }
}

function renderDonationsSection(donations) {
    const donList = document.getElementById('donationsList');
    if (!donList) return;
    donList.innerHTML = donations.length ? donations.map(d => `
        <div class="supporter-card">
            <div class="supporter-header">
                <div class="supporter-avatar"><i data-lucide="heart"></i></div>
                <div><div class="supporter-name">${d.name}</div>${statHTML('dollar-sign', '$' + Number(d.amount).toLocaleString())}</div>
            </div>
            ${d.message ? `<div class="supporter-message">"${d.message}"</div>` : ''}
        </div>`).join('') : '<p style="color:var(--iuea-gray-light)">No donors yet.</p>';
    refreshIconsIn(donList);
}

const DEFAULT_ENDOWMENT_STATS = [
    { value: '10,000+', label: 'Students Supported' },
    { value: '$3.2M', label: 'Raised to Date' },
    { value: '500+', label: 'Scholarships Awarded' },
    { value: '50+', label: 'Research Labs' }
];

const DEFAULT_ENDOWMENT_INFO_TITLE = 'Investing in the Future of Africa — Through IUEA';
const DEFAULT_ENDOWMENT_INFO_DESC = `At the International University of East Africa (IUEA), we believe that the future of Africa will not be inherited, it will be built. Built by innovators, researchers, entrepreneurs, and leaders who understand the continent, its challenges, and its immense opportunities.\n\nYet, the scale of Africa's challenges demands more than tuition-funded education. It requires long-term, visionary investment.\nThis is the purpose of the IUEA Endowment.`;
const ENDOWMENT_INFO_EXCERPT_COUNT = 3;

const DEFAULT_ENDOWMENT_READ_MORE_EXTRA = `
<p>An endowment is not simply a donation. It is a strategic investment in sustained impact. It allows IUEA to plan beyond the present, to fund breakthrough research, to incubate transformative startups, and to ensure that no talented student is denied opportunity due to financial constraints.</p>
<h3 style="color:var(--iuea-maroon);margin:1.25rem 0 0.75rem;">Why Your Endowment Matters</h3>
<p>Africa stands at a critical turning point. With the world's youngest population, rapidly expanding markets, and accelerating technological adoption, the continent has the potential to redefine global innovation and economic growth.</p>
<p><strong>1. Research that Solves African Problems</strong><br>Many of Africa's most pressing challenges require solutions that are locally developed and contextually relevant.</p>
<p><strong>2. Startups that Create Jobs and Industries</strong><br>Africa's future will be driven by entrepreneurs who can transform ideas into scalable businesses.</p>
<p><strong>3. Scholarships that Unlock Human Potential</strong><br>By supporting scholarships, endowment partners ensure that talent, not circumstance, determines opportunity.</p>
<h3 style="color:var(--iuea-maroon);margin:1.25rem 0 0.75rem;">A Multiplier of Impact</h3>
<p>What makes an endowment powerful is its permanence. Unlike one-time donations, endowment funds are invested, with returns used year after year to support research, startups, and scholarships.</p>
<h3 style="color:var(--iuea-maroon);margin:1.25rem 0 0.75rem;">Join Us</h3>
<p>We invite you to be part of this journey. Because the future is not something we wait for. It is something we build together.</p>`;

let endowmentReadMoreCache = { title: '', image: '', body: '' };

const DEFAULT_DONATION_TIERS = [
    { name: 'Scholar', amount: '$1K', description: 'Annual scholarship', icon: 'book-open', featured: false },
    { name: 'Innovator', amount: '$5K', description: 'Fund a lab', icon: 'flask-conical', featured: false },
    { name: 'Leader', amount: '$10K', description: 'Name a scholarship', icon: 'award', featured: false },
    { name: 'Visionary', amount: '$25K+', description: 'Legacy gift', icon: 'landmark', featured: true }
];

function renderEndowmentStatsSection(stats) {
    const el = document.getElementById('endowmentStats');
    if (!el) return;
    const list = (Array.isArray(stats) && stats.length) ? stats : DEFAULT_ENDOWMENT_STATS;
    el.innerHTML = list.map(s => `
        <div style="background: white; border-radius: var(--radius-lg); padding: 2rem 1rem; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <div style="font-size: 2rem; font-weight: 800; color: var(--iuea-maroon); margin-bottom: 0.5rem;">${s.value}</div>
            <div style="font-size: 0.85rem; color: var(--iuea-gray); font-weight: 500;">${s.label}</div>
        </div>`).join('');
}

function formatEndowmentInfoParagraphs(desc) {
    return desc.split('\n').filter(Boolean).map(p => `<p style="margin-bottom:1rem;">${p}</p>`).join('');
}

function renderEndowmentInfoSection(items) {
    const el = document.getElementById('endowmentInfo');
    if (!el) return;
    const info = (Array.isArray(items) && items.length) ? items[0] : null;
    const usingDefault = !info;
    const title = info?.title || DEFAULT_ENDOWMENT_INFO_TITLE;
    const desc = info?.description || DEFAULT_ENDOWMENT_INFO_DESC;
    const image = resolveMediaUrl(info?.image) || 'https://picsum.photos/800/600?random=200';
    const paragraphs = desc.split('\n').filter(Boolean);
    const excerptParagraphs = paragraphs.slice(0, ENDOWMENT_INFO_EXCERPT_COUNT);
    const showReadMore = usingDefault || paragraphs.length > ENDOWMENT_INFO_EXCERPT_COUNT;
    endowmentReadMoreCache = {
        title,
        image,
        body: formatEndowmentInfoParagraphs(desc) + (usingDefault ? DEFAULT_ENDOWMENT_READ_MORE_EXTRA : '')
    };
    el.innerHTML = `
        <div class="endowment-info-block">
            <div class="endowment-info-media" style="background-image: url('${image}');"></div>
            <div class="endowment-info-body">
                <h2 class="endowment-info-title">${title}</h2>
                ${excerptParagraphs.map(p => `<p>${p}</p>`).join('')}
                ${showReadMore ? '<a href="#" class="endowment-info-link" onclick="showEndowmentReadMore(); return false;">Read more &rarr;</a>' : ''}
            </div>
        </div>`;
}

function showEndowmentReadMore() {
    const modal = document.getElementById('endowmentReadMoreModal');
    if (!modal) return;
    const titleEl = document.getElementById('endowmentReadMoreTitle');
    const bodyEl = document.getElementById('endowmentReadMoreBody');
    const imageEl = document.getElementById('endowmentReadMoreImage');
    if (titleEl) titleEl.textContent = endowmentReadMoreCache.title;
    if (bodyEl) bodyEl.innerHTML = endowmentReadMoreCache.body;
    if (imageEl) {
        if (endowmentReadMoreCache.image) {
            imageEl.src = endowmentReadMoreCache.image;
            imageEl.style.display = 'block';
        } else {
            imageEl.style.display = 'none';
        }
    }
    modal.classList.add('show');
    lucide.createIcons();
}

function closeEndowmentReadMoreModal() {
    document.getElementById('endowmentReadMoreModal')?.classList.remove('show');
}

function handleEndowmentReadMoreBackdrop(event) {
    if (event.target.id === 'endowmentReadMoreModal') closeEndowmentReadMoreModal();
}

function renderEndowmentCampaignSection(campaigns) {
    const el = document.getElementById('endowmentCampaign');
    if (!el) return;
    const items = Array.isArray(campaigns) ? campaigns : [];
    const seeMoreWrap = document.getElementById('endowmentCampaignSeeMoreWrap');
    if (!items.length) {
        el.innerHTML = '<p style="color:var(--iuea-gray-light)">No endowment news yet.</p>';
        refreshIconsIn(el);
        if (seeMoreWrap) seeMoreWrap.style.display = 'none';
        return;
    }
    const hasMore = items.length > ENDOWMENT_NEWS_LIMIT;
    const visible = hasMore ? items.slice(0, ENDOWMENT_NEWS_LIMIT) : items;
    el.innerHTML = visible.map(item => createCard(item, 'endowment-campaigns')).join('');
    refreshIconsIn(el);
    if (seeMoreWrap) {
        seeMoreWrap.style.display = hasMore ? '' : 'none';
        if (hasMore) refreshIconsIn(seeMoreWrap);
    }
}

function renderDonationTiersSection(tiers) {
    const el = document.getElementById('donationTiers');
    if (!el) return;
    const list = (Array.isArray(tiers) && tiers.length) ? tiers : DEFAULT_DONATION_TIERS;
    el.innerHTML = list.map(t => {
        const featured = t.featured;
        const iconStyle = featured ? 'color:var(--iuea-gold);background:rgba(203,160,82,0.1)' : '';
        const cardStyle = featured ? 'border-color:var(--iuea-gold)' : '';
        const titleStyle = featured ? 'color:var(--iuea-gold)' : '';
        const amountStyle = featured ? 'color:var(--iuea-gold)' : '';
        const btnClass = featured ? 'btn-gold' : '';
        return `
        <div class="tier-card" style="${cardStyle}">
            <div class="tier-icon" style="${iconStyle}"><i data-lucide="${t.icon || 'gift'}"></i></div>
            <h3 style="${titleStyle}">${t.name}</h3>
            <div class="tier-amount" style="${amountStyle}">${t.amount}</div>
            <p>${t.description || ''}</p>
            <button class="${btnClass}" onclick="toggleForm('donation')">Give Now</button>
        </div>`;
    }).join('');
    refreshIconsIn(el);
}

function renderEndowmentSection(data) {
    renderEndowmentStatsSection(data.endowmentStats);
    renderEndowmentInfoSection(data.endowmentInfo);
    renderEndowmentCampaignSection(data.endowmentCampaigns);
    renderDonationTiersSection(data.donationTiers);
    renderDonationsSection(data.donations || []);
}

function renderSectionPreviewGrid(containerId, items, limit, seeMoreWrapId, seeMorePage, cardType = 'news', emptyMessage = 'No items yet.') {
    const list = Array.isArray(items) ? items : [];
    const previewLimit = limit ?? SECTION_PREVIEW_LIMIT;
    const hasMore = list.length > previewLimit;
    const previewItems = hasMore ? list.slice(0, previewLimit) : list;

    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = previewItems.length
        ? previewItems.map(item => createCard(item, cardType)).join('')
        : `<p style="color:var(--iuea-gray-light)">${emptyMessage}</p>`;
    refreshIconsIn(el);
    if (savedContentKeys.size) applySavedStateToCards(el);

    const seeMoreWrap = document.getElementById(seeMoreWrapId);
    if (seeMoreWrap) {
        seeMoreWrap.style.display = hasMore ? '' : 'none';
        if (hasMore) {
            const link = seeMoreWrap.querySelector('.see-more-link');
            if (link && seeMorePage) {
                link.setAttribute('onclick', `navigateTo('${seeMorePage}'); return false;`);
            }
            refreshIconsIn(seeMoreWrap);
        }
    }
}

function renderGridCards(containerId, items, cardType, emptyMessage) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const list = Array.isArray(items) ? items : [];
    el.innerHTML = list.length
        ? list.map(item => createCard(item, cardType)).join('')
        : `<p style="color:var(--iuea-gray-light)">${emptyMessage}</p>`;
    refreshIconsIn(el);
}

function renderEventGridCards(containerId, items, emptyMessage) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const list = Array.isArray(items) ? items : [];
    el.innerHTML = list.length
        ? list.map(item => createEventCard(item)).join('')
        : `<p style="color:var(--iuea-gray-light)">${emptyMessage}</p>`;
    refreshIconsIn(el);
}

function isCommunityNewsItem(item) {
    const t = String(item?.type || 'news').toLowerCase();
    return t === 'news' || t === 'community-news' || t === 'commission-news';
}

function renderCommunitySection(items, communityNews) {
    const list = Array.isArray(items) ? items : [];
    const byType = (type) => list.filter(i => (i.type || 'news') === type);
    const newsItems = Array.isArray(communityNews) ? communityNews : list.filter(isCommunityNewsItem);
    const committees = byType('committee');
    const initiatives = byType('initiative');
    const reports = byType('report');

    renderSectionPreviewGrid(
        'communityNewsFeature',
        newsItems,
        SECTION_COMMUNITY_PREVIEW_LIMIT,
        'communityNewsSeeMoreWrap',
        'community-news-all',
        'community',
        'No community news yet.'
    );

    const communitySpotlight = document.getElementById('communitySpotlight');
    if (communitySpotlight) {
        communitySpotlight.innerHTML = committees.length
            ? createCard(committees[0], 'community')
            : '';
        refreshIconsIn(communitySpotlight);
    }

    const communityInitiativesFeed = document.getElementById('communityInitiativesFeed');
    if (communityInitiativesFeed) {
        communityInitiativesFeed.innerHTML = initiatives.length
            ? initiatives.map(i => createCard(i, 'community')).join('')
            : '<p style="color:var(--iuea-gray-light)">No initiatives yet.</p>';
        refreshIconsIn(communityInitiativesFeed);
    }

    const communityReportsFeed = document.getElementById('communityReportsFeed');
    if (communityReportsFeed) {
        communityReportsFeed.innerHTML = reports.length
            ? reports.map(r => createCard(r, 'community')).join('')
            : '<p style="color:var(--iuea-gray-light)">No reports yet.</p>';
        refreshIconsIn(communityReportsFeed);
    }

    const communityCommitteesFeed = document.getElementById('communityCommitteesFeed');
    if (communityCommitteesFeed) {
        communityCommitteesFeed.innerHTML = committees.length
            ? committees.map(c => createCard(c, 'community')).join('')
            : '<p style="color:var(--iuea-gray-light)">No committees listed yet.</p>';
        refreshIconsIn(communityCommitteesFeed);
    }
}

function renderResearchSection(areas, publications, labs) {
    renderSectionPreviewGrid(
        'researchAreasFeature',
        areas,
        SECTION_RESEARCH_PREVIEW_LIMIT,
        'researchAreasSeeMoreWrap',
        'research-areas-all',
        'research-areas',
        'No research areas yet.'
    );
    const pubList = Array.isArray(publications) ? publications : [];
    const labsList = Array.isArray(labs) ? labs : [];
    const researchSpotlight = document.getElementById('researchSpotlight');
    if (researchSpotlight) {
        researchSpotlight.innerHTML = labsList.length ? createCard(labsList[0], 'research-labs') : '';
        refreshIconsIn(researchSpotlight);
    }
    const researchPublicationsFeed = document.getElementById('researchPublicationsFeed');
    if (researchPublicationsFeed) {
        researchPublicationsFeed.innerHTML = pubList.length
            ? pubList.map(p => createCard(p, 'publications')).join('')
            : '<p style="color:var(--iuea-gray-light)">No publications yet.</p>';
        refreshIconsIn(researchPublicationsFeed);
    }
    const researchLabsFeed = document.getElementById('researchLabsFeed');
    if (researchLabsFeed) {
        researchLabsFeed.innerHTML = labsList.length
            ? labsList.map(l => createCard(l, 'research-labs')).join('')
            : '<p style="color:var(--iuea-gray-light)">No research labs yet.</p>';
        refreshIconsIn(researchLabsFeed);
    }
}

function renderTechParkSection(items) {
    renderGridCards('techparkGrid', items, 'tech-park', 'No Tech Park listings yet.');
}

function setupPublicForms() {
    if (publicFormsInitialized) return;
    publicFormsInitialized = true;
    ['innovation', 'startup', 'alumni', 'donation', 'research', 'community'].forEach(t => ensurePublicForm(t));
}

function renderDeferredPublicSections(data) {
    renderInnovationSection(
        data.innovations || [],
        data.startups || [],
        data.innovationNews || [],
        data.startupNews || []
    );
    renderAlumniSection(data.alumni || [], data.alumniNews || []);
    renderEndowmentSection(data);
    renderCommunitySection(data.community || [], data.communityNews || []);
    renderResearchSection(data.researchAreas || [], data.publications || [], data.researchLabs || []);
    renderTechParkSection(data.techPark || []);
    setupPublicForms();
}

function renderAllPublicSections(data) {
    renderHomeSection(data.news || [], data.events || []);
    renderDeferredPublicSections(data);
}

function scheduleDeferredPublicSections(data) {
    const run = () => renderDeferredPublicSections(data);
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 1200 });
    } else {
        setTimeout(run, 0);
    }
}

async function fetchPublicContent(forceRefresh = false) {
    if (!forceRefresh && isPublicContentFresh()) {
        return publicContentCache;
    }
    if (!forceRefresh && publicContentFetchPromise) {
        return publicContentFetchPromise;
    }

    publicContentFetchPromise = (async () => {
        if (!forceRefresh && !isPublicContentFresh()) {
            showHomeLoadingState();
        }

        const homePromise = Promise.all([
            fetchHomeNewsFeed(HOME_NEWS_LIMIT + 1),
            apiGet(`/content/events?limit=${HOME_EVENTS_LIMIT + 1}`)
        ]).then(([news, events]) => {
            publicContentCache.news = Array.isArray(news) ? news : [];
            publicContentCache.events = Array.isArray(events) ? events : [];
            publicContentCache.fetchedAt = Date.now();
            renderHomeSection(publicContentCache.news, publicContentCache.events);
            persistPublicContentSnapshot();
        });

        const restPromise = Promise.all([
            apiGet('/content/innovations'),
            apiGet('/content/startups'),
            fetchInnovationNews(INNOVATION_NEWS_LIMIT + 1),
            fetchStartupNews(STARTUP_NEWS_LIMIT + 1),
            fetchAlumniNews(SECTION_ALUMNI_NEWS_LIMIT + 1),
            apiGet('/content/donations'),
            apiGet('/content/donation-tiers'),
            apiGet('/content/endowment-stats'),
            apiGet(`/content/endowment-campaigns?limit=${ENDOWMENT_NEWS_LIMIT + 1}`),
            apiGet('/content/endowment-info'),
            apiGet('/content/alumni'),
            apiGet('/content/community'),
            apiGet(`/content/community?type=news&limit=${SECTION_COMMUNITY_PREVIEW_LIMIT + 1}`),
            apiGet('/content/research-areas'),
            apiGet('/content/publications'),
            apiGet('/content/research-labs'),
            apiGet('/content/tech-park'),
        ]).then(([innovations, startups, innovationNews, startupNews, alumniNews, donations, donationTiers, endowmentStats, endowmentCampaigns, endowmentInfo, alumni, community, communityNews, researchAreas, publications, researchLabs, techPark]) => {
            publicContentCache.innovations = Array.isArray(innovations) ? innovations : [];
            publicContentCache.startups = Array.isArray(startups) ? startups : [];
            publicContentCache.innovationNews = Array.isArray(innovationNews) ? innovationNews : [];
            publicContentCache.startupNews = Array.isArray(startupNews) ? startupNews : [];
            publicContentCache.alumniNews = Array.isArray(alumniNews) ? alumniNews : [];
            publicContentCache.donations = Array.isArray(donations) ? donations : [];
            publicContentCache.donationTiers = Array.isArray(donationTiers) ? donationTiers : [];
            publicContentCache.endowmentStats = Array.isArray(endowmentStats) ? endowmentStats : [];
            publicContentCache.endowmentCampaigns = Array.isArray(endowmentCampaigns) ? endowmentCampaigns : [];
            publicContentCache.endowmentInfo = Array.isArray(endowmentInfo) ? endowmentInfo : [];
            publicContentCache.alumni = Array.isArray(alumni) ? alumni : [];
            publicContentCache.community = Array.isArray(community) ? community : [];
            publicContentCache.communityNews = Array.isArray(communityNews) ? communityNews : [];
            publicContentCache.researchAreas = Array.isArray(researchAreas) ? researchAreas : [];
            publicContentCache.publications = Array.isArray(publications) ? publications : [];
            publicContentCache.researchLabs = Array.isArray(researchLabs) ? researchLabs : [];
            publicContentCache.techPark = Array.isArray(techPark) ? techPark : [];
            scheduleDeferredPublicSections(publicContentCache);
            persistPublicContentSnapshot();
        }).catch((e) => {
            console.error('Deferred public content fetch failed:', e);
        });

        await homePromise;
        restPromise.catch(() => {});
        return publicContentCache;
    })().finally(() => {
        publicContentFetchPromise = null;
    });

    return publicContentFetchPromise;
}

function renderNewsAll(news) {
    const el = document.getElementById('newsAllGrid');
    if (!el) return;
    const list = Array.isArray(news) ? news : [];
    el.innerHTML = list.length
        ? list.map(item => createCard(item, resolveNewsCardType(item))).join('')
        : '<p style="color:var(--iuea-gray-light)">No news yet.</p>';
    refreshIconsIn(el);
}

async function loadAllNewsPage(forceRefresh = false) {
    const grid = document.getElementById('newsAllGrid');
    if (!grid) return;

    const typeFilter = newsAllTypeFilter;
    newsAllTypeFilter = null;
    if (typeFilter) {
        grid.innerHTML = homeGridLoadingHTML('Loading news…');
        try {
            const news = await apiGet(`/content/news?type=${encodeURIComponent(typeFilter)}`);
            renderNewsAll(Array.isArray(news) ? news : []);
        } catch {
            grid.innerHTML = '<p style="color:var(--iuea-gray-light)">Could not load news. Please try again.</p>';
        }
        const page = document.getElementById('news-all');
        if (page) refreshIconsIn(page);
        return;
    }

    if (!forceRefresh && allNewsCache) {
        renderNewsAll(allNewsCache);
        return;
    }

    grid.innerHTML = homeGridLoadingHTML('Loading news…');
    try {
        let news = await fetchGeneralNews(ALL_NEWS_LIMIT);
        if (news.length >= ALL_NEWS_LIMIT) {
            const allNews = await fetchGeneralNews();
            if (allNews.length > news.length) {
                news = allNews;
            }
        }
        allNewsCache = news;
        renderNewsAll(allNewsCache);
    } catch {
        grid.innerHTML = '<p style="color:var(--iuea-gray-light)">Could not load news. Please try again.</p>';
    }
    const page = document.getElementById('news-all');
    if (page) refreshIconsIn(page);
}

async function loadAllEventsPage(forceRefresh = false) {
    const grid = document.getElementById('eventsAllGrid');
    if (!grid) return;

    if (!forceRefresh && allEventsCache) {
        renderEventGridCards('eventsAllGrid', allEventsCache, 'No events yet.');
        return;
    }

    grid.innerHTML = homeGridLoadingHTML('Loading events…');
    try {
        const events = await apiGet(`/content/events?limit=${ALL_EVENTS_LIMIT}`);
        allEventsCache = Array.isArray(events) ? events : [];
        if (allEventsCache.length >= ALL_EVENTS_LIMIT) {
            const allEvents = await apiGet('/content/events');
            if (Array.isArray(allEvents) && allEvents.length > allEventsCache.length) {
                allEventsCache = allEvents;
            }
        }
        renderEventGridCards('eventsAllGrid', allEventsCache, 'No events yet.');
    } catch {
        grid.innerHTML = '<p style="color:var(--iuea-gray-light)">Could not load events. Please try again.</p>';
    }
    const page = document.getElementById('events-all');
    if (page) refreshIconsIn(page);
}

async function loadAllEndowmentCampaignsPage(forceRefresh = false) {
    const grid = document.getElementById('endowmentCampaignsAllGrid');
    if (!grid) return;

    if (!forceRefresh && allEndowmentCampaignsCache) {
        renderGridCards('endowmentCampaignsAllGrid', allEndowmentCampaignsCache, 'endowment-campaigns', 'No endowment news yet.');
        return;
    }

    grid.innerHTML = homeGridLoadingHTML('Loading campaigns…');
    try {
        const campaigns = await apiGet(`/content/endowment-campaigns?limit=${ALL_ENDOWMENT_CAMPAIGNS_LIMIT}`);
        allEndowmentCampaignsCache = Array.isArray(campaigns) ? campaigns : [];
        if (allEndowmentCampaignsCache.length >= ALL_ENDOWMENT_CAMPAIGNS_LIMIT) {
            const allCampaigns = await apiGet('/content/endowment-campaigns');
            if (Array.isArray(allCampaigns) && allCampaigns.length > allEndowmentCampaignsCache.length) {
                allEndowmentCampaignsCache = allCampaigns;
            }
        }
        renderGridCards('endowmentCampaignsAllGrid', allEndowmentCampaignsCache, 'endowment-campaigns', 'No endowment news yet.');
    } catch {
        grid.innerHTML = '<p style="color:var(--iuea-gray-light)">Could not load campaigns. Please try again.</p>';
    }
    const page = document.getElementById('endowment-campaigns-all');
    if (page) refreshIconsIn(page);
}

function renderResearchAreasAll(areas) {
    const el = document.getElementById('researchAreasAllGrid');
    if (!el) return;
    const list = Array.isArray(areas) ? areas : [];
    el.innerHTML = list.length
        ? list.map(item => createCard(item, 'research-areas')).join('')
        : '<p style="color:var(--iuea-gray-light)">No research areas yet.</p>';
    refreshIconsIn(el);
}

async function loadAllResearchAreasPage(forceRefresh = false) {
    const grid = document.getElementById('researchAreasAllGrid');
    if (!grid) return;

    if (!forceRefresh && allResearchAreasCache) {
        renderResearchAreasAll(allResearchAreasCache);
        return;
    }

    if (!forceRefresh && Array.isArray(publicContentCache.researchAreas) && publicContentCache.researchAreas.length) {
        allResearchAreasCache = publicContentCache.researchAreas;
        renderResearchAreasAll(allResearchAreasCache);
        return;
    }

    grid.innerHTML = homeGridLoadingHTML('Loading research areas…');
    try {
        const areas = await apiGet(`/content/research-areas?limit=${ALL_RESEARCH_AREAS_LIMIT}`);
        allResearchAreasCache = Array.isArray(areas) ? areas : [];
        if (allResearchAreasCache.length >= ALL_RESEARCH_AREAS_LIMIT) {
            const allAreas = await apiGet('/content/research-areas');
            if (Array.isArray(allAreas) && allAreas.length > allResearchAreasCache.length) {
                allResearchAreasCache = allAreas;
            }
        }
        publicContentCache.researchAreas = allResearchAreasCache;
        renderResearchAreasAll(allResearchAreasCache);
    } catch {
        grid.innerHTML = '<p style="color:var(--iuea-gray-light)">Could not load research areas. Please try again.</p>';
    }
    const page = document.getElementById('research-areas-all');
    if (page) refreshIconsIn(page);
}

function loadAllPublicationsPage() {
    renderGridCards('publicationsAllGrid', publicContentCache.publications || [], 'publications', 'No publications yet.');
    const page = document.getElementById('publications-all');
    if (page) refreshIconsIn(page);
}

function loadAllResearchLabsPage() {
    renderGridCards('researchLabsAllGrid', publicContentCache.researchLabs || [], 'research-labs', 'No research labs yet.');
    const page = document.getElementById('research-labs-all');
    if (page) refreshIconsIn(page);
}

function filterCommunityByType(items, type) {
    const list = Array.isArray(items) ? items : [];
    return list.filter(i => (i.type || 'news') === type);
}

function renderCommunityNewsAll(items) {
    const el = document.getElementById('communityNewsAllGrid');
    if (!el) return;
    const list = Array.isArray(items) ? items : [];
    el.innerHTML = list.length
        ? list.map(item => createCard(item, 'community')).join('')
        : '<p style="color:var(--iuea-gray-light)">No community news yet.</p>';
    refreshIconsIn(el);
}

async function loadAllCommunityNewsPage(forceRefresh = false) {
    const grid = document.getElementById('communityNewsAllGrid');
    if (!grid) return;

    if (!forceRefresh && allCommunityNewsCache) {
        renderCommunityNewsAll(allCommunityNewsCache);
        return;
    }

    if (!forceRefresh && Array.isArray(publicContentCache.communityNews) && publicContentCache.communityNews.length) {
        allCommunityNewsCache = publicContentCache.communityNews;
        renderCommunityNewsAll(allCommunityNewsCache);
        return;
    }

    grid.innerHTML = homeGridLoadingHTML('Loading community news…');
    try {
        const news = await apiGet(`/content/community?type=news&limit=${ALL_COMMUNITY_NEWS_LIMIT}`);
        allCommunityNewsCache = Array.isArray(news) ? news : [];
        if (allCommunityNewsCache.length >= ALL_COMMUNITY_NEWS_LIMIT) {
            const allNews = await apiGet('/content/community?type=news');
            if (Array.isArray(allNews) && allNews.length > allCommunityNewsCache.length) {
                allCommunityNewsCache = allNews;
            }
        }
        publicContentCache.communityNews = allCommunityNewsCache;
        renderCommunityNewsAll(allCommunityNewsCache);
    } catch {
        grid.innerHTML = '<p style="color:var(--iuea-gray-light)">Could not load community news. Please try again.</p>';
    }
    const page = document.getElementById('community-news-all');
    if (page) refreshIconsIn(page);
}

function renderCommunityTypedAll(gridId, items, emptyMessage) {
    const el = document.getElementById(gridId);
    if (!el) return;
    const list = Array.isArray(items) ? items : [];
    el.innerHTML = list.length
        ? list.map(item => createCard(item, 'community')).join('')
        : `<p style="color:var(--iuea-gray-light)">${emptyMessage}</p>`;
    refreshIconsIn(el);
}

async function loadAllCommunityTypedPage({
    gridId,
    type,
    getCache,
    setCache,
    limit,
    loadingLabel,
    emptyMessage,
    errorMessage,
    pageId,
    forceRefresh = false,
}) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    if (!forceRefresh && getCache()) {
        renderCommunityTypedAll(gridId, getCache(), emptyMessage);
        return;
    }

    if (!forceRefresh && Array.isArray(publicContentCache.community) && publicContentCache.community.length) {
        const cached = filterCommunityByType(publicContentCache.community, type);
        if (cached.length) {
            setCache(cached);
            renderCommunityTypedAll(gridId, cached, emptyMessage);
            return;
        }
    }

    grid.innerHTML = homeGridLoadingHTML(loadingLabel);
    try {
        const items = await apiGet(`/content/community?type=${type}&limit=${limit}`);
        let list = Array.isArray(items) ? items : [];
        if (list.length >= limit) {
            const allItems = await apiGet(`/content/community?type=${type}`);
            if (Array.isArray(allItems) && allItems.length > list.length) {
                list = allItems;
            }
        }
        setCache(list);
        renderCommunityTypedAll(gridId, list, emptyMessage);
    } catch {
        grid.innerHTML = `<p style="color:var(--iuea-gray-light)">${errorMessage}</p>`;
    }
    const page = document.getElementById(pageId);
    if (page) refreshIconsIn(page);
}

function loadAllCommunityCommitteesPage(forceRefresh = false) {
    return loadAllCommunityTypedPage({
        gridId: 'communityCommitteesAllGrid',
        type: 'committee',
        getCache: () => allCommunityCommitteesCache,
        setCache: (v) => { allCommunityCommitteesCache = v; },
        limit: ALL_COMMUNITY_COMMITTEES_LIMIT,
        loadingLabel: 'Loading committees…',
        emptyMessage: 'No committees listed yet.',
        errorMessage: 'Could not load committees. Please try again.',
        pageId: 'community-committees-all',
        forceRefresh,
    });
}

function loadAllCommunityInitiativesPage(forceRefresh = false) {
    return loadAllCommunityTypedPage({
        gridId: 'communityInitiativesAllGrid',
        type: 'initiative',
        getCache: () => allCommunityInitiativesCache,
        setCache: (v) => { allCommunityInitiativesCache = v; },
        limit: ALL_COMMUNITY_INITIATIVES_LIMIT,
        loadingLabel: 'Loading initiatives…',
        emptyMessage: 'No initiatives yet.',
        errorMessage: 'Could not load initiatives. Please try again.',
        pageId: 'community-initiatives-all',
        forceRefresh,
    });
}

function loadAllCommunityReportsPage(forceRefresh = false) {
    return loadAllCommunityTypedPage({
        gridId: 'communityReportsAllGrid',
        type: 'report',
        getCache: () => allCommunityReportsCache,
        setCache: (v) => { allCommunityReportsCache = v; },
        limit: ALL_COMMUNITY_REPORTS_LIMIT,
        loadingLabel: 'Loading reports…',
        emptyMessage: 'No reports yet.',
        errorMessage: 'Could not load reports. Please try again.',
        pageId: 'community-reports-all',
        forceRefresh,
    });
}

function refreshActiveCommunityAllPages(forceRefresh = true) {
    const loaders = [
        ['community-news-all', loadAllCommunityNewsPage],
        ['community-committees-all', loadAllCommunityCommitteesPage],
        ['community-initiatives-all', loadAllCommunityInitiativesPage],
        ['community-reports-all', loadAllCommunityReportsPage],
    ];
    loaders.forEach(([pageId, loader]) => {
        if (document.getElementById(pageId)?.classList.contains('active')) {
            loader(forceRefresh);
        }
    });
}

async function loadHomeSection(forceRefresh = false) {
    if (!forceRefresh && isPublicContentFresh() && publicContentCache.news) {
        renderHomeSection(publicContentCache.news, publicContentCache.events || []);
        return;
    }

    showHomeLoadingState();
    const [news, events] = await Promise.all([
        fetchHomeNewsFeed(HOME_NEWS_LIMIT + 1),
        apiGet(`/content/events?limit=${HOME_EVENTS_LIMIT + 1}`)
    ]);
    publicContentCache.news = Array.isArray(news) ? news : [];
    publicContentCache.events = Array.isArray(events) ? events : [];
    publicContentCache.fetchedAt = Date.now();
    renderHomeSection(publicContentCache.news, publicContentCache.events);
    persistPublicContentSnapshot();
}

async function loadInitialData(options = {}) {
    const { forceRefresh = false } = options;

    loadHeroVideosForPublicPages();

    if (!forceRefresh && isPublicContentFresh()) {
        renderHomeSection(publicContentCache.news, publicContentCache.events || []);
        scheduleDeferredPublicSections(publicContentCache);
        return;
    }

    if (!forceRefresh && isOfflineMode()) {
        const hydrated = hydratePublicContentFromOfflineCache();
        if (hydrated) {
            renderHomeSection(publicContentCache.news, publicContentCache.events || []);
            scheduleDeferredPublicSections(publicContentCache);
            return;
        }
    }

    await fetchPublicContent(forceRefresh);
}

/* =================== ADMIN DATA =================== */
async function loadAdminDashboard() {
    if (!currentUser || !['super_admin', 'content_editor', 'admin'].includes(currentUser.role)) return;
    if (isOfflineMode()) {
        showToast('Admin dashboard is in offline view — server actions are disabled.', 'info');
    }

    // Set date display
    const dateDisplay = document.getElementById('adminDateDisplay');
    if (dateDisplay) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = new Date().toLocaleDateString('en-US', options);
    }

    await Promise.all([
        loadAdminStats(),
        loadAdminUsers(),
        loadAdminApprovals(),
        prefetchAdminContentModules(),
        refreshUnreadMessageBadges(),
        refreshNotifications({ silent: true }),
    ]);
    initAdminCharts();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

let chartInstances = {};
function initAdminCharts() {
    if (typeof Chart === 'undefined') return;
    
    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { borderDash: [2, 4], color: '#f1f5f9' } }, x: { grid: { display: false } } }
    };

    const ctx1 = document.getElementById('userGrowthChart');
    if (ctx1 && ctx1.offsetWidth > 0 && !chartInstances['userGrowthChart']) {
        chartInstances['userGrowthChart'] = new Chart(ctx1, { type: 'line', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], datasets: [{ data: [120, 190, 300, 450, 520, 680], borderColor: '#800000', backgroundColor: 'rgba(128,0,0,0.1)', fill: true, tension: 0.4 }] }, options: chartOptions });
    }

    const ctx2 = document.getElementById('contentActivityChart');
    if (ctx2 && ctx2.offsetWidth > 0 && !chartInstances['contentActivityChart']) {
        chartInstances['contentActivityChart'] = new Chart(ctx2, { type: 'bar', data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ data: [12, 19, 15, 25, 22, 10, 8], backgroundColor: '#cba052', borderRadius: 4 }] }, options: chartOptions });
    }
}

const ANALYTICS_PERIOD_LABELS = {
    '30d': 'Last 30 Days',
    year: 'This Year',
    all: 'All Time',
};

let adminAnalyticsCache = null;

function onAnalyticsPeriodChange(period) {
    loadAdminAnalytics(period).then(() => {
        destroyAnalyticsCharts();
        setTimeout(initAnalyticsCharts, 50);
    });
}

function destroyAnalyticsCharts() {
    ['analyticsContentByTypeChart', 'analyticsApprovalPipelineChart', 'analyticsUserRolesChart'].forEach(id => {
        if (chartInstances[id]) {
            chartInstances[id].destroy();
            delete chartInstances[id];
        }
    });
}

async function loadAdminAnalytics(period = '30d') {
    const stats = await apiGet(`/admin/stats?period=${encodeURIComponent(period)}`);
    if (!stats || stats.total_users === undefined) return;
    adminAnalyticsCache = stats;
    renderAdminAnalytics(stats);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function setAnalyticsText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatAnalyticsNumber(n) {
    if (n === undefined || n === null) return '—';
    return Number(n).toLocaleString();
}

function formatAnalyticsDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return iso;
    }
}

function formatRelativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return formatAnalyticsDate(iso);
}

function renderAdminAnalytics(stats) {
    const periodLabel = ANALYTICS_PERIOD_LABELS[stats.period] || 'Selected period';
    setAnalyticsText('analyticsPeriodLabel', `IUEA Today metrics for ${periodLabel.toLowerCase()}.`);
    setAnalyticsText('analytics-data-period', periodLabel);

    setAnalyticsText('analytics-users', formatAnalyticsNumber(stats.total_users));
    setAnalyticsText('analytics-active-users', `${formatAnalyticsNumber(stats.active_users)} active`);
    setAnalyticsText('analytics-pending', formatAnalyticsNumber(stats.pending_content));
    setAnalyticsText('analytics-approved', formatAnalyticsNumber(stats.approved_content));
    setAnalyticsText('analytics-rejected', `${formatAnalyticsNumber(stats.rejected_content)} rejected`);
    setAnalyticsText('analytics-news-events', formatAnalyticsNumber((stats.total_news || 0) + (stats.total_events || 0)));
    setAnalyticsText('analytics-innovation-hub', formatAnalyticsNumber(
        (stats.total_innovations || 0) + (stats.total_startups || 0) + (stats.total_alumni || 0)
    ));
    setAnalyticsText('analytics-engagement', formatAnalyticsNumber((stats.total_likes || 0) + (stats.total_comments || 0)));
    setAnalyticsText('analytics-likes', `${formatAnalyticsNumber(stats.total_likes)} likes`);
    setAnalyticsText('analytics-comments', `${formatAnalyticsNumber(stats.total_comments)} comments`);
    setAnalyticsText('analytics-publications', formatAnalyticsNumber(stats.total_publications));

    const sys = stats.system || {};
    const dbOk = sys.database_connected !== false;
    const apiOk = sys.api_status === 'online';
    const healthOk = dbOk && apiOk;
    const healthCard = document.getElementById('analytics-health-card');
    const healthIcon = document.getElementById('analytics-health-icon');
    if (healthCard) {
        healthCard.classList.toggle('health-ok', healthOk);
        healthCard.classList.toggle('health-warn', !healthOk);
    }
    if (healthIcon) {
        healthIcon.className = `stat-icon-wrap ${healthOk ? 'bg-green' : 'bg-red'}`;
    }
    setAnalyticsText('analytics-health-status', healthOk ? 'Healthy' : 'Degraded');
    setAnalyticsText('analytics-health-sub', healthOk ? 'All services operational' : 'Check database connection');
    setAnalyticsText('analytics-api-status', apiOk ? 'Online' : 'Offline');
    setAnalyticsText('analytics-db-status', dbOk ? 'Connected' : 'Disconnected');
    setAnalyticsText('analytics-api-version', sys.version || '—');
    setAnalyticsText('analytics-last-updated', formatAnalyticsDate(sys.last_updated));
    setAnalyticsText('analytics-api-url', API_BASE_URL);

    const apiDot = document.getElementById('analyticsApiDot');
    if (apiDot) {
        apiDot.className = `analytics-status-dot ${apiOk ? 'analytics-status-dot--online' : 'analytics-status-dot--offline'}`;
    }

    renderAnalyticsActivityFeed(stats.recent_activity || []);
    renderAnalyticsPipelineLegend(stats.content_by_type || []);
}

const ANALYTICS_TYPE_ICONS = {
    News: 'file-text',
    Events: 'calendar',
    Innovations: 'lightbulb',
    Startups: 'rocket',
    Alumni: 'graduation-cap',
    Community: 'shield',
    Commission: 'shield',
    Publications: 'book-open',
};

function renderAnalyticsActivityFeed(items) {
    const feed = document.getElementById('analyticsActivityFeed');
    if (!feed) return;
    if (!items.length) {
        feed.innerHTML = '<div class="admin-empty-state" style="padding:1.5rem 0;"><p style="color:#64748b;margin:0;">No recent activity recorded.</p></div>';
        return;
    }
    feed.innerHTML = items.map(item => {
        const icon = ANALYTICS_TYPE_ICONS[item.content_type] || 'activity';
        return `
            <div class="activity-item">
                <div class="activity-icon bg-maroon"><i data-lucide="${icon}"></i></div>
                <div class="activity-details">
                    <p><strong>${item.action}</strong> · ${item.content_type}</p>
                    <p style="margin:0.15rem 0 0;font-size:0.9rem;color:#334155;">${item.title}</p>
                    <span>${formatRelativeTime(item.timestamp)}</span>
                </div>
            </div>`;
    }).join('');
}

function renderAnalyticsPipelineLegend(contentByType) {
    const legend = document.getElementById('analyticsPipelineLegend');
    if (!legend) return;
    const totals = { pending: 0, approved: 0, rejected: 0 };
    contentByType.forEach(row => {
        totals.pending += row.pending || 0;
        totals.approved += row.approved || 0;
        totals.rejected += row.rejected || 0;
    });
    const items = [
        { label: 'Pending', value: totals.pending, color: '#f59e0b' },
        { label: 'Approved', value: totals.approved, color: '#22c55e' },
        { label: 'Rejected', value: totals.rejected, color: '#ef4444' },
    ];
    legend.innerHTML = items.map(i => `
        <div class="analytics-pipeline-legend-item">
            <span style="background:${i.color}"></span>
            ${i.label}: <strong>${formatAnalyticsNumber(i.value)}</strong>
        </div>`).join('');
}

function initAnalyticsCharts() {
    if (typeof Chart === 'undefined' || !adminAnalyticsCache) return;

    const stats = adminAnalyticsCache;
    const maroon = '#800000';
    const gold = '#cba052';
    const chartFont = "'Plus Jakarta Sans', sans-serif";

    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { font: { family: chartFont, size: 12 }, boxWidth: 12 } },
        },
    };

    const contentByType = stats.content_by_type || [];
    const ctx1 = document.getElementById('analyticsContentByTypeChart');
    if (ctx1 && ctx1.offsetWidth > 0) {
        if (chartInstances['analyticsContentByTypeChart']) chartInstances['analyticsContentByTypeChart'].destroy();
        chartInstances['analyticsContentByTypeChart'] = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: contentByType.map(r => r.label),
                datasets: [
                    { label: 'Approved', data: contentByType.map(r => r.approved), backgroundColor: '#22c55e', borderRadius: 4 },
                    { label: 'Pending', data: contentByType.map(r => r.pending), backgroundColor: '#f59e0b', borderRadius: 4 },
                    { label: 'Rejected', data: contentByType.map(r => r.rejected), backgroundColor: '#ef4444', borderRadius: 4 },
                ],
            },
            options: {
                ...baseOptions,
                plugins: { ...baseOptions.plugins, legend: { display: true, position: 'top' } },
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { font: { family: chartFont } } },
                    y: { stacked: true, beginAtZero: true, grid: { borderDash: [2, 4], color: '#f1f5f9' }, ticks: { precision: 0 } },
                },
            },
        });
    }

    const pipeline = stats.approval_pipeline || {};
    const ctx2 = document.getElementById('analyticsApprovalPipelineChart');
    if (ctx2 && ctx2.offsetWidth > 0) {
        if (chartInstances['analyticsApprovalPipelineChart']) chartInstances['analyticsApprovalPipelineChart'].destroy();
        chartInstances['analyticsApprovalPipelineChart'] = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['Pending', 'Approved', 'Rejected'],
                datasets: [{
                    data: [pipeline.pending || 0, pipeline.approved || 0, pipeline.rejected || 0],
                    backgroundColor: ['#f59e0b', '#22c55e', '#ef4444'],
                    borderWidth: 0,
                }],
            },
            options: {
                ...baseOptions,
                cutout: '68%',
                plugins: { legend: { display: false } },
            },
        });
    }

    const roles = stats.users_by_role || [];
    const roleColors = [maroon, gold, '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#e11d48'];
    const ctx3 = document.getElementById('analyticsUserRolesChart');
    if (ctx3 && ctx3.offsetWidth > 0) {
        if (chartInstances['analyticsUserRolesChart']) chartInstances['analyticsUserRolesChart'].destroy();
        chartInstances['analyticsUserRolesChart'] = new Chart(ctx3, {
            type: 'doughnut',
            data: {
                labels: roles.map(r => r.label),
                datasets: [{
                    data: roles.map(r => r.count),
                    backgroundColor: roles.map((_, i) => roleColors[i % roleColors.length]),
                    borderWidth: 0,
                }],
            },
            options: {
                ...baseOptions,
                cutout: '62%',
                plugins: { legend: { display: true, position: 'right', labels: { font: { family: chartFont, size: 11 } } } },
            },
        });
    }
}

function exportAnalyticsCsv() {
    if (!adminAnalyticsCache) {
        showToast('Load analytics data first.', 'error');
        return;
    }
    const s = adminAnalyticsCache;
    const period = ANALYTICS_PERIOD_LABELS[s.period] || s.period;
    const rows = [
        ['IUEA Today Platform Analytics'],
        ['Period', period],
        ['Exported', new Date().toISOString()],
        [],
        ['Metric', 'Value'],
        ['Total Users', s.total_users],
        ['Active Users', s.active_users],
        ['Pending Approvals', s.pending_content],
        ['Approved Content', s.approved_content],
        ['Rejected Content', s.rejected_content],
        ['News', s.total_news],
        ['Events', s.total_events],
        ['Innovations', s.total_innovations],
        ['Startups', s.total_startups],
        ['Alumni Profiles', s.total_alumni],
        ['Publications', s.total_publications],
        ['Donations', s.total_donations],
        ['Total Likes', s.total_likes],
        ['Total Comments', s.total_comments],
        [],
        ['Content Module', 'Total', 'Approved', 'Pending', 'Rejected'],
        ...(s.content_by_type || []).map(r => [r.label, r.total, r.approved, r.pending, r.rejected]),
        [],
        ['User Role', 'Count'],
        ...(s.users_by_role || []).map(r => [r.label, r.count]),
    ];
    const csv = rows.map(row => row.map(cell => {
        const str = String(cell ?? '');
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iuea-today-analytics-${s.period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Analytics exported as CSV.');
}

async function loadAdminStats() {
    const stats = await apiGet('/admin/stats?period=all');
    if (stats && stats.total_users !== undefined) {
        document.getElementById('stat-users-num').textContent = stats.total_users;
        const alumniNum = document.getElementById('stat-alumni-num');
        if (alumniNum) alumniNum.textContent = stats.total_alumni;
        const innovationsNum = document.getElementById('stat-innovations-num');
        if (innovationsNum) innovationsNum.textContent = stats.total_innovations;
        const startupsNum = document.getElementById('stat-startups-num');
        if (startupsNum) startupsNum.textContent = stats.total_startups;
        const eventsNum = document.getElementById('stat-events-num');
        if (eventsNum) eventsNum.textContent = stats.total_events;
        const donationsNum = document.getElementById('stat-donations-num');
        if (donationsNum) donationsNum.textContent = stats.total_donations;
        const pendingNum = document.getElementById('stat-pending-num');
        if (pendingNum) pendingNum.textContent = stats.pending_content;
        
        const pendingBadge = document.getElementById('nav-pending-badge');
        if (pendingBadge) pendingBadge.textContent = stats.pending_content;
        const kanbanPending = document.getElementById('kanban-pending-count');
        if (kanbanPending) kanbanPending.textContent = stats.pending_content;
    }

    const analyticsTab = document.getElementById('admin-tab-analytics');
    if (analyticsTab?.classList.contains('active')) {
        const period = document.getElementById('analyticsPeriodSelect')?.value || '30d';
        await loadAdminAnalytics(period);
        destroyAnalyticsCharts();
        setTimeout(initAnalyticsCharts, 50);
    }
}

const KANBAN_TYPE_LABELS = {
    news: 'News',
    events: 'Events',
    innovations: 'Innovations',
    startups: 'Startups',
    alumni: 'Alumni',
    community: 'Community',
    'community-news': 'Community News',
    'community-committees': 'Committee',
    'community-initiatives': 'Initiative',
    'community-reports': 'Report',
    publications: 'Publications',
};

const KANBAN_STATUS_LABELS = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
};

let kanbanPreviewCache = {};

async function loadAdminApprovals() {
    kanbanPreviewCache = {};
    const [pending, approved, rejected] = await Promise.all([
        apiGet('/admin/pending-content'),
        apiGet('/admin/approved-content'),
        apiGet('/admin/rejected-content'),
    ]);

    renderKanbanColumn('pendingContentList', pending, 'pending', 'No items pending review.');
    renderKanbanColumn('approvedContentList', approved, 'approved', 'Approved items appear here temporarily.');
    renderKanbanColumn('rejectedContentList', rejected, 'rejected', 'Rejected items appear here.');

    updateKanbanCount('kanban-pending-count', pending);
    updateKanbanCount('kanban-approved-count', approved);
    updateKanbanCount('kanban-rejected-count', rejected);

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateKanbanCount(elementId, items) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = Array.isArray(items) ? items.length : 0;
}

function renderKanbanColumn(containerId, items, variant, emptyMessage) {
    const list = document.getElementById(containerId);
    if (!list) return;

    if (!Array.isArray(items) || !items.length) {
        list.className = 'kanban-cards kanban-empty';
        list.innerHTML = `<p>${emptyMessage}</p>`;
        return;
    }

    list.className = 'kanban-cards';
    items.forEach(item => {
        kanbanPreviewCache[`${variant}-${item.content_type}-${item.id}`] = { ...item, variant };
    });
    list.innerHTML = items.map(item => renderKanbanCard(item, variant)).join('');
}

function formatKanbanTypeLabel(contentType) {
    return KANBAN_TYPE_LABELS[contentType] || contentType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatKanbanDate(item, variant) {
    const ts = variant === 'pending'
        ? (item.created_at || item.updated_at)
        : (item.updated_at || item.created_at);
    if (!ts) return '—';
    const prefix = variant === 'pending' ? 'Submitted' : KANBAN_STATUS_LABELS[variant];
    return `${prefix} ${new Date(ts).toLocaleString()}`;
}

function renderKanbanCardActions(item, variant) {
    const type = item.content_type;
    const id = item.id;
    const openBtn = `<button type="button" class="admin-table-action-btn" onclick="openKanbanPreview('${type}', ${id}, '${variant}')"><i data-lucide="eye"></i> Open</button>`;
    const deleteBtn = `<button type="button" class="admin-table-action-btn" onclick="deleteKanbanItem('${type}', ${id}, '${variant}')"><i data-lucide="trash-2"></i> Delete</button>`;

    if (variant === 'pending') {
        return `<div class="kanban-card-actions kanban-card-actions--pending">
            <button type="button" class="btn-approve" onclick="approveContent('${type}', ${id})"><i data-lucide="check"></i> Approve</button>
            <button type="button" class="btn-reject" onclick="rejectContent('${type}', ${id})"><i data-lucide="x"></i> Reject</button>
            ${openBtn}
            ${deleteBtn}
        </div>`;
    }

    return `<div class="kanban-card-actions">${openBtn}${deleteBtn}</div>`;
}

function openKanbanPreview(contentType, id, variant) {
    const item = kanbanPreviewCache[`${variant}-${contentType}-${id}`];
    if (!item) return;

    document.getElementById('kanbanPreviewTitle').textContent = item.title || 'Untitled';
    document.getElementById('kanbanPreviewType').textContent = formatKanbanTypeLabel(item.content_type);
    const statusEl = document.getElementById('kanbanPreviewStatus');
    statusEl.textContent = KANBAN_STATUS_LABELS[variant] || item.status || variant;
    statusEl.className = `status-badge ${variant}`;

    const authorRow = document.getElementById('kanbanPreviewAuthorRow');
    if (item.author_name) {
        document.getElementById('kanbanPreviewAuthor').textContent = item.author_name;
        authorRow.hidden = false;
    } else {
        authorRow.hidden = true;
    }

    document.getElementById('kanbanPreviewExcerpt').textContent = item.description || 'No description.';

    const imgWrap = document.getElementById('kanbanPreviewImageWrap');
    const imgEl = document.getElementById('kanbanPreviewImage');
    const imgUrl = resolveMediaUrl(kanbanItemImageRaw(item));

    imgEl.onerror = () => {
        imgEl.hidden = true;
        imgEl.removeAttribute('src');
        if (imgWrap) imgWrap.hidden = true;
    };
    imgEl.onload = () => {
        if (imgWrap) imgWrap.hidden = false;
    };

    if (imgUrl) {
        imgEl.src = imgUrl;
        imgEl.hidden = false;
        if (imgWrap) imgWrap.hidden = false;
    } else {
        imgEl.hidden = true;
        imgEl.removeAttribute('src');
        if (imgWrap) imgWrap.hidden = true;
    }

    document.getElementById('kanbanPreviewModal').classList.add('show');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeKanbanPreviewModal() {
    document.getElementById('kanbanPreviewModal').classList.remove('show');
}

function renderKanbanCard(item, variant) {
    const description = item.description
        ? item.description.substring(0, 100) + (item.description.length > 100 ? '…' : '')
        : 'No description';
    const authorLine = item.author_name
        ? `<span><i data-lucide="user"></i> ${item.author_name}</span>`
        : '';
    const dateLine = `<span><i data-lucide="clock"></i> ${formatKanbanDate(item, variant)}</span>`;

    return `
        <div class="kanban-card kanban-card--${variant}" id="${variant}-${item.content_type}-${item.id}">
            <div class="kanban-card-header">
                <span class="kanban-type-badge">${formatKanbanTypeLabel(item.content_type)}</span>
                <span class="status-badge ${variant}">${KANBAN_STATUS_LABELS[variant]}</span>
            </div>
            <h5 class="kanban-card-title">${item.title || 'Untitled'}</h5>
            <p class="kanban-card-excerpt">${description}</p>
            <div class="kanban-card-meta">
                ${authorLine}
                ${dateLine}
            </div>
            ${renderKanbanCardActions(item, variant)}
        </div>`;
}

async function deleteKanbanItem(contentType, id, variant) {
    if (!requireOnlineForAdmin('Deleting content')) return;
    if (!confirm('Delete this item? This cannot be undone.')) return;

    const res = await apiDelete(`/admin/content/${contentType}/${id}`);
    if (res.ok) {
        showToast('Content deleted.');
        if (variant === 'pending') decrementPendingCount();
        if (affectsHomeOrCommunityFeed(contentType)) {
            invalidateHomeFeedCaches();
        }
        if (affectsDonationsPublicContent(contentType)) {
            invalidateDonationsPublicCache(contentType);
            loadInitialData({ forceRefresh: true });
        }
        await loadAdminApprovals();
        loadAdminStats();
    } else {
        showToast(res.data?.detail || 'Failed to delete content.', 'error');
    }
}

function decrementPendingCount() {
    const counters = [
        document.getElementById('stat-pending-num'),
        document.getElementById('nav-pending-badge'),
        document.getElementById('kanban-pending-count'),
    ];
    counters.forEach(el => {
        if (el) el.textContent = Math.max(0, parseInt(el.textContent, 10) - 1);
    });
}

async function loadAdminUsers() {
    // Load users (super_admin only)
    const usersTabBtn = document.getElementById('sidebarUsersBtn');
    if (currentUser.role === 'super_admin') {
        if (usersTabBtn) usersTabBtn.style.display = 'flex';
        const users = await apiGet('/admin/users');
        const tbody = document.getElementById('usersTableBody');
        const userCount = document.getElementById('userCount');
        if (userCount) userCount.textContent = `${users.length} users`;
        if (tbody) {
            tbody.innerHTML = users.map((u, i) => `
                <tr>
                    <td style="color:var(--iuea-gray-light)">${i + 1}</td>
                    <td><strong>${u.name}</strong></td>
                    <td style="color:var(--iuea-gray-light)">${u.email}</td>
                    <td>
                        <select class="role-select" onchange="updateUserRole(${u.id}, this.value)">
                            ${selectableRolesForUser(u.role).map(r =>
                                `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.replace(/_/g, ' ')}</option>`
                            ).join('')}
                        </select>
                    </td>
                    <td><span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style="color:var(--iuea-gray-light); font-size:0.85rem">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                        <button class="btn-deactivate ${u.is_active ? 'active' : 'inactive'}" onclick="toggleUserStatus(${u.id}, ${u.is_active})">
                            ${u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                    </td>
                </tr>`).join('');
        }
    } else {
        if (usersTabBtn) usersTabBtn.style.display = 'none';
    }
}

async function approveContent(contentType, id) {
    if (!requireOnlineForAdmin('Approving content')) return;
    const res = await apiPut(`/admin/content/${contentType}/${id}/approve`);
    if (res.ok) {
        showToast('Content approved!');
        decrementPendingCount();
        if (affectsHomeOrCommunityFeed(contentType)) {
            invalidateHomeFeedCaches();
        }
        if (affectsDonationsPublicContent(contentType)) {
            invalidateDonationsPublicCache(contentType);
            loadInitialData({ forceRefresh: true });
        }
        await loadAdminApprovals();
    } else showToast('Failed to approve content', 'error');
}

async function rejectContent(contentType, id) {
    if (!requireOnlineForAdmin('Rejecting content')) return;
    const res = await apiPut(`/admin/content/${contentType}/${id}/reject`);
    if (res.ok) {
        showToast('Content rejected.');
        decrementPendingCount();
        await loadAdminApprovals();
    } else showToast('Failed to reject content', 'error');
}

async function updateUserRole(userId, newRole) {
    const res = await apiPut(`/admin/users/${userId}/role`, { role: newRole });
    if (res.ok) showToast(`Role updated to ${newRole.replace(/_/g, ' ')}`);
    else showToast('Failed to update role', 'error');
}

async function toggleUserStatus(userId, currentStatus) {
    const res = await apiPut(`/admin/users/${userId}/status`, { is_active: !currentStatus });
    if (res.ok) { showToast(`User ${!currentStatus ? 'activated' : 'deactivated'}`); loadAdminUsers(); }
    else showToast('Failed to update status', 'error');
}

/* =================== ADMIN CONTENT MODULES =================== */
let currentAdminModule = null;
let adminContentItemsCache = {};
const adminModuleCacheReady = new Set();
let adminContentPrefetchPromise = null;
let heroVideosCache = null;
let heroVideosCacheReady = false;

const RESEARCH_SUBMODULES = [
    { key: 'research-areas', label: 'Research Areas', createLabel: 'Add Research Area', endpoint: '/content/research-areas', createType: 'research-areas', icon: 'microscope' },
    { key: 'publications', label: 'Publications', createLabel: 'Add Publication', endpoint: '/content/publications', createType: 'publications', icon: 'book-open' },
    { key: 'research-labs', label: 'Research Labs', createLabel: 'Add Research Lab', endpoint: '/content/research-labs', createType: 'research-labs', icon: 'flask-conical' }
];

const INNOVATIONS_SUBMODULES = [
    { key: 'innovation-news', label: 'Innovation News', createLabel: 'Add Innovation News', endpoint: '/content/news?type=innovation', createType: 'innovation-news', icon: 'newspaper' },
    { key: 'innovations', label: 'Innovations', createLabel: 'Add Innovation', endpoint: '/content/innovations', createType: 'innovation', icon: 'lightbulb' },
    { key: 'startup-news', label: 'Startup News', createLabel: 'Add Startup News', endpoint: '/content/news?type=startup', createType: 'startup-news', icon: 'newspaper' },
    { key: 'startups', label: 'Startups', createLabel: 'Add Startup', endpoint: '/content/startups', createType: 'startup', icon: 'rocket' }
];

const COMMUNITY_SUBMODULES = [
    { key: 'community-news', label: 'Community News', createLabel: 'Add Community News', endpoint: '/content/community?type=news', createType: 'community-news', icon: 'newspaper' },
    { key: 'community-committees', label: 'Standing Committees', createLabel: 'Add Committee', endpoint: '/content/community?type=committee', createType: 'community-committees', icon: 'landmark' },
    { key: 'community-initiatives', label: 'Initiatives', createLabel: 'Add Initiative', endpoint: '/content/community?type=initiative', createType: 'community-initiatives', icon: 'target' },
    { key: 'community-reports', label: 'Reports', createLabel: 'Add Report', endpoint: '/content/community?type=report', createType: 'community-reports', icon: 'file-bar-chart' }
];

const COMMUNITY_VIRTUAL_TYPE_MAP = {
    'community-news': 'news',
    'community-committees': 'committee',
    'community-initiatives': 'initiative',
    'community-reports': 'report'
};

const TECH_PARK_SUBMODULES = [
    { key: 'tech-park', label: 'Facilities & Programs', createLabel: 'Add Facility or Program', endpoint: '/content/tech-park', createType: 'tech-park', icon: 'building-2' }
];

const ALUMNI_SUBMODULES = [
    { key: 'alumni-news', label: 'Alumni News', createLabel: 'Add Alumni News', endpoint: '/content/news?type=alumni', createType: 'alumni-news', icon: 'newspaper' },
    { key: 'alumni', label: 'Alumni Profiles', createLabel: 'Add Alumni Profile', endpoint: '/content/alumni', createType: 'alumni', icon: 'graduation-cap' }
];

const DONATIONS_SUBMODULES = [
    { key: 'donations', label: 'Supporters', createLabel: 'Record Donation', endpoint: '/content/donations', createType: 'donations', icon: 'heart', hint: 'Recent donors on the public Endowment page' },
    { key: 'donation-tiers', label: 'Giving Tiers', createLabel: 'Add Giving Tier', endpoint: '/content/donation-tiers', createType: 'donation-tiers', icon: 'gift', hint: 'Controls #donationTiers — Ways to Give cards on the Endowment page' },
    { key: 'endowment-stats', label: 'Impact Stats', createLabel: 'Add Impact Stat', endpoint: '/content/endowment-stats', createType: 'endowment-stats', icon: 'bar-chart-2', hint: 'Controls #endowmentStats — four stat boxes at the top of the Endowment page' },
    { key: 'endowment-campaigns', label: 'Campaigns', createLabel: 'Add Campaign', endpoint: '/content/endowment-campaigns', createType: 'endowment-campaigns', icon: 'target', hint: 'Controls #endowmentCampaign — Endowment News cards' },
    { key: 'endowment-info', label: 'Endowment Info', createLabel: 'Add Info Block', endpoint: '/content/endowment-info', createType: 'endowment-info', icon: 'info', hint: 'Controls #endowmentInfo — two-column about block (image, heading, body, Read more) on the public Endowment page. Add one block here or the page shows built-in placeholder text.' }
];

const NEWS_DISPLAY_SECTIONS = [
    {
        key: 'news-home',
        label: 'Home Latest News',
        hint: `Top ${HOME_NEWS_LIMIT} on home page (campus, innovation, alumni)`,
        icon: 'home',
        sliceItems(items) { return items.slice(0, HOME_NEWS_LIMIT); }
    },
    {
        key: 'news-archive',
        label: 'Full News Archive',
        hint: 'Campus, innovation, and alumni news on News & Announcements',
        icon: 'newspaper',
        sliceItems(items) { return items; }
    }
];

const EVENTS_DISPLAY_SECTIONS = [
    {
        key: 'events-home',
        label: 'Home Upcoming Events',
        hint: `First ${HOME_EVENTS_LIMIT} on home page`,
        icon: 'calendar',
        sliceItems(items) { return items.slice(0, HOME_EVENTS_LIMIT); }
    },
    {
        key: 'events-archive',
        label: 'All Events',
        hint: 'Complete list on Upcoming Events page',
        icon: 'calendar-days',
        sliceItems(items) { return items; }
    }
];

const ADMIN_MODULE_ENDPOINTS = {
    news:        '/content/news',
    events:      '/content/events',
    innovations: '/content/innovations',
    alumni:      '/content/alumni',
    research:    '/content/research-areas',
    community:  '/content/community',
    techpark:    '/content/tech-park'
};

const ADMIN_MODULE_API_TYPES = {
    news: 'news', events: 'events', innovations: 'innovations',
    startups: 'startups', alumni: 'alumni',
    'innovation-news': 'innovation-news', 'startup-news': 'startup-news', 'alumni-news': 'alumni-news',
    'research-areas': 'research-areas', publications: 'publications', 'research-labs': 'research-labs',
    'community-news': 'community-news', 'community-committees': 'community-committees',
    'community-initiatives': 'community-initiatives', 'community-reports': 'community-reports',
    techpark: 'tech-park', 'tech-park': 'tech-park',
    donations: 'donations', 'donation-tiers': 'donation-tiers',
    'endowment-stats': 'endowment-stats', 'endowment-campaigns': 'endowment-campaigns',
    'endowment-info': 'endowment-info'
};

const ADMIN_MODULE_LABELS = {
    news: 'News', events: 'Events', innovations: 'Innovations', startups: 'Startups',
    'innovation-news': 'Innovation News', 'startup-news': 'Startup News',
    'alumni-news': 'Alumni News', alumni: 'Alumni Profile', research: 'Research',
    'research-areas': 'Research Area', publications: 'Publication', 'research-labs': 'Research Lab',
    community: 'Community',
    'community-news': 'Community News', 'community-committees': 'Committee',
    'community-initiatives': 'Initiative', 'community-reports': 'Report',
    techpark: 'Tech Park', 'tech-park': 'Facilities & Programs',
    donations: 'Donation', 'donation-tiers': 'Giving Tier',
    'endowment-stats': 'Impact Stat', 'endowment-campaigns': 'Campaign',
    'endowment-info': 'Info Block'
};

const CREATE_TYPE_TO_MODULE = {
    news: 'news', event: 'events', innovation: 'innovations', startup: 'innovations',
    'innovation-news': 'innovations', 'startup-news': 'innovations',
    'alumni-news': 'alumni', alumni: 'alumni', 'research-areas': 'research', publications: 'research',
    'research-labs': 'research', 'tech-park': 'techpark',
    donations: 'donations', 'donation-tiers': 'donations', 'endowment-stats': 'donations',
    'endowment-campaigns': 'donations', 'endowment-info': 'donations',
    'community-news': 'community', 'community-committees': 'community',
    'community-initiatives': 'community', 'community-reports': 'community'
};

const TYPED_NEWS_CREATE_TYPES = {
    'innovation-news': { sectionCache: 'innovationNews', adminModule: 'innovations' },
    'startup-news': { sectionCache: 'startupNews', adminModule: 'innovations' },
    'alumni-news': { sectionCache: 'alumniNews', adminModule: 'alumni' },
};

const COMMUNITY_CREATE_INVALIDATION = {
    'community-news': { cacheKeys: ['news', 'community', 'communityNews'], adminModules: ['community'] },
    'community-committees': { cacheKeys: ['community'], adminModules: ['community'] },
    'community-initiatives': { cacheKeys: ['community'], adminModules: ['community'] },
    'community-reports': { cacheKeys: ['community'], adminModules: ['community'] },
};

const DONATIONS_PUBLIC_CACHE_MAP = {
    donations: ['donations'],
    'donation-tiers': ['donationTiers'],
    'endowment-stats': ['endowmentStats'],
    'endowment-campaigns': ['endowmentCampaigns'],
    'endowment-info': ['endowmentInfo'],
};

const DONATIONS_CREATE_INVALIDATION = {
    donations: { cacheKeys: ['donations'], adminModules: ['donations'] },
    'donation-tiers': { cacheKeys: ['donationTiers'], adminModules: ['donations'] },
    'endowment-stats': { cacheKeys: ['endowmentStats'], adminModules: ['donations'] },
    'endowment-campaigns': { cacheKeys: ['endowmentCampaigns'], adminModules: ['donations'] },
    'endowment-info': { cacheKeys: ['endowmentInfo'], adminModules: ['donations'] },
};

function resolveCreateFormType() {
    return createModalPresetType || document.getElementById('createType')?.value || 'news';
}

function getTypedNewsInvalidation(createType) {
    const meta = TYPED_NEWS_CREATE_TYPES[createType];
    if (!meta) return null;
    return {
        cacheKeys: ['news', meta.sectionCache],
        adminModules: ['news', meta.adminModule],
    };
}

function getContentCreateInvalidation(createType) {
    const typedNews = getTypedNewsInvalidation(createType);
    if (typedNews) return typedNews;
    const communityInvalidation = COMMUNITY_CREATE_INVALIDATION[createType];
    if (communityInvalidation) return communityInvalidation;
    const donations = DONATIONS_CREATE_INVALIDATION[createType];
    if (donations) return donations;
    return null;
}

function affectsDonationsPublicContent(contentType) {
    return Boolean(DONATIONS_PUBLIC_CACHE_MAP[contentType]);
}

function invalidateDonationsPublicCache(contentTypeOrModule) {
    const keys = DONATIONS_PUBLIC_CACHE_MAP[contentTypeOrModule];
    if (keys) invalidatePublicContentCache(keys);
}

function affectsHomeOrCommunityFeed(contentType) {
    return contentType === 'news'
        || contentType === 'events'
        || contentType === 'community'
        || contentType === 'commission'
        || contentType === 'community-news'
        || contentType === 'commission-news'
        || Boolean(COMMUNITY_CREATE_INVALIDATION[contentType]);
}

function invalidateHomeFeedCaches() {
    invalidatePublicContentCache([
        'news', 'events', 'innovationNews', 'startupNews', 'alumniNews', 'community'
    ]);
    loadHomeSection(true);
}

const ADMIN_MODULE_CREATE_TYPES = {
    news: 'news', events: 'event',
    techpark: 'tech-park'
};

function isResearchSubModule(moduleName) {
    return RESEARCH_SUBMODULES.some(sub => sub.key === moduleName);
}

function isInnovationsSubModule(moduleName) {
    return INNOVATIONS_SUBMODULES.some(sub => sub.key === moduleName);
}

function isAlumniSubModule(moduleName) {
    return ALUMNI_SUBMODULES.some(sub => sub.key === moduleName);
}

function isCommunitySubModule(moduleName) {
    return COMMUNITY_SUBMODULES.some(sub => sub.key === moduleName);
}

function isDisplaySectionedAdminModule(moduleName) {
    return moduleName === 'news' || moduleName === 'events';
}

function getDisplaySections(moduleName) {
    if (moduleName === 'news') return NEWS_DISPLAY_SECTIONS;
    if (moduleName === 'events') return EVENTS_DISPLAY_SECTIONS;
    return null;
}

function isTechParkSubModule(moduleName) {
    return TECH_PARK_SUBMODULES.some(sub => sub.key === moduleName);
}

function isDonationsSubModule(moduleName) {
    return DONATIONS_SUBMODULES.some(sub => sub.key === moduleName);
}

function getAdminModuleEndpoint(moduleName) {
    if (ADMIN_MODULE_ENDPOINTS[moduleName]) return ADMIN_MODULE_ENDPOINTS[moduleName];
    const researchSub = RESEARCH_SUBMODULES.find(s => s.key === moduleName);
    if (researchSub) return researchSub.endpoint;
    const innovSub = INNOVATIONS_SUBMODULES.find(s => s.key === moduleName);
    if (innovSub) return innovSub.endpoint;
    const alumniSub = ALUMNI_SUBMODULES.find(s => s.key === moduleName);
    if (alumniSub) return alumniSub.endpoint;
    const communitySub = COMMUNITY_SUBMODULES.find(s => s.key === moduleName);
    if (communitySub) return communitySub.endpoint;
    const techParkSub = TECH_PARK_SUBMODULES.find(s => s.key === moduleName);
    if (techParkSub) return techParkSub.endpoint;
    const donationsSub = DONATIONS_SUBMODULES.find(s => s.key === moduleName);
    return donationsSub?.endpoint || null;
}

function filterCommunityItems(items, moduleName) {
    const virtualType = COMMUNITY_VIRTUAL_TYPE_MAP[moduleName];
    if (!virtualType || !Array.isArray(items)) return items;
    if (moduleName === 'community-news') {
        return items.filter(isCommunityNewsItem);
    }
    return items.filter(item => (item.type || 'news') === virtualType);
}

function getAdminPrefetchModuleKeys() {
    const keys = Object.keys(ADMIN_MODULE_ENDPOINTS).filter(
        name => name !== 'research' && name !== 'innovations' && name !== 'alumni' && name !== 'techpark' && name !== 'community' && name !== 'donations'
    );
    return [
        ...keys,
        ...RESEARCH_SUBMODULES.map(sub => sub.key),
        ...INNOVATIONS_SUBMODULES.map(sub => sub.key),
        ...ALUMNI_SUBMODULES.map(sub => sub.key),
        ...COMMUNITY_SUBMODULES.map(sub => sub.key),
        ...TECH_PARK_SUBMODULES.map(sub => sub.key),
        ...DONATIONS_SUBMODULES.map(sub => sub.key)
    ];
}

const CREATE_MODAL_CONFIG = {
    news: {
        title: 'Add News Article',
        subtitle: 'Publish a news article with title, description, and optional media.',
        icon: 'file-text',
        titleLabel: 'Title',
        titlePlaceholder: 'Enter a compelling headline…',
        descLabel: 'Description',
        descPlaceholder: 'Write the article content…',
        submitLabel: 'Publish Article',
        showMedia: true,
        showVideo: true
    },
    event: {
        title: 'Create Event',
        subtitle: 'Schedule a university event with details and optional media.',
        icon: 'calendar',
        titleLabel: 'Event Title',
        titlePlaceholder: 'Enter the event name…',
        descLabel: 'Event Details',
        descPlaceholder: 'Describe date, location, and what attendees can expect…',
        submitLabel: 'Create Event',
        showMedia: true,
        showVideo: true
    },
    innovation: {
        title: 'Add Innovation',
        subtitle: 'Showcase a student or faculty innovation.',
        icon: 'lightbulb',
        titleLabel: 'Innovation Title',
        titlePlaceholder: 'Name the innovation…',
        descLabel: 'Description',
        descPlaceholder: 'Explain the problem solved and its impact…',
        submitLabel: 'Add Innovation',
        showMedia: true,
        showVideo: true
    },
    'innovation-news': {
        title: 'Add Innovation News',
        subtitle: 'Publish an innovation news story. It appears in Innovations and the admin News module (same record).',
        icon: 'newspaper',
        titleLabel: 'Headline',
        titlePlaceholder: 'Enter a compelling headline…',
        descLabel: 'Article Content',
        descPlaceholder: 'Write the innovation news story…',
        submitLabel: 'Publish Innovation News',
        showMedia: true,
        showVideo: true
    },
    'startup-news': {
        title: 'Add Startup News',
        subtitle: 'Publish a news article for the Startups section.',
        icon: 'newspaper',
        titleLabel: 'Headline',
        titlePlaceholder: 'Enter a compelling headline…',
        descLabel: 'Article Content',
        descPlaceholder: 'Write the startup news story…',
        submitLabel: 'Publish Startup News',
        showMedia: true,
        showVideo: true
    },
    'alumni-news': {
        title: 'Add Alumni News',
        subtitle: 'Publish an alumni news story. It appears in Alumni and the admin News module (same record).',
        icon: 'newspaper',
        titleLabel: 'Headline',
        titlePlaceholder: 'Enter a compelling headline…',
        descLabel: 'Article Content',
        descPlaceholder: 'Write the alumni news story…',
        submitLabel: 'Publish Alumni News',
        showMedia: true,
        showVideo: true
    },
    startup: {
        title: 'Register Startup',
        subtitle: 'Add a startup profile to the ecosystem directory.',
        icon: 'rocket',
        titleLabel: 'Startup Name',
        titlePlaceholder: 'Enter the startup name…',
        descLabel: 'About the Startup',
        descPlaceholder: 'Describe the venture, sector, and stage…',
        submitLabel: 'Register Startup',
        showMedia: true,
        showVideo: true
    },
    alumni: {
        title: 'Add Alumni Profile',
        subtitle: 'Highlight an alumni achievement or profile.',
        icon: 'graduation-cap',
        titleLabel: 'Full Name',
        titlePlaceholder: 'First and last name…',
        descLabel: 'Achievement',
        descPlaceholder: 'Describe their accomplishment or role…',
        submitLabel: 'Add Profile',
        showMedia: true,
        showVideo: false
    },
    'research-areas': {
        title: 'Add Research Area',
        subtitle: 'Define a research focus area or topic.',
        icon: 'microscope',
        titleLabel: 'Area Name',
        titlePlaceholder: 'Enter the research area name…',
        descLabel: 'Description',
        descPlaceholder: 'Summarize the research focus and goals…',
        submitLabel: 'Add Research Area',
        showMedia: true,
        showVideo: false
    },
    publications: {
        title: 'Add Publication',
        subtitle: 'Add a peer-reviewed publication for the Research page.',
        icon: 'book-open',
        titleLabel: 'Publication Title',
        titlePlaceholder: 'Enter the paper title…',
        descLabel: 'Authors',
        descPlaceholder: 'e.g. Dr. Smith, Dr. Jones',
        submitLabel: 'Add Publication',
        showMedia: true,
        showVideo: false,
        extraFields: 'publication'
    },
    'research-labs': {
        title: 'Add Research Lab',
        subtitle: 'Add a research lab profile for the Research page.',
        icon: 'flask-conical',
        titleLabel: 'Lab Name',
        titlePlaceholder: 'Enter the lab name…',
        descLabel: 'Research Focus',
        descPlaceholder: 'Primary research themes and objectives…',
        submitLabel: 'Add Research Lab',
        showMedia: true,
        showVideo: false,
        extraFields: 'lab'
    },
    'tech-park': {
        title: 'Add Tech Park Item',
        subtitle: 'Add a Tech Park listing or facility.',
        icon: 'building-2',
        titleLabel: 'Title',
        titlePlaceholder: 'Enter the listing title…',
        descLabel: 'Description',
        descPlaceholder: 'Describe the facility or offering…',
        submitLabel: 'Add Item',
        showMedia: true,
        showVideo: true
    },
    'community-news': {
        title: 'Add Community News',
        subtitle: 'Publish a news article for the Community page.',
        icon: 'newspaper',
        titleLabel: 'Headline',
        titlePlaceholder: 'Enter a compelling headline…',
        descLabel: 'Article Content',
        descPlaceholder: 'Write the community news story…',
        submitLabel: 'Publish Community News',
        showMedia: true,
        showVideo: false
    },
    'community-committees': {
        title: 'Add Committee',
        subtitle: 'Add a standing committee to the Community page.',
        icon: 'landmark',
        titleLabel: 'Committee Name',
        titlePlaceholder: 'Enter the committee name…',
        descLabel: 'Description',
        descPlaceholder: 'Describe the committee mandate and membership…',
        submitLabel: 'Add Committee',
        showMedia: true,
        showVideo: false
    },
    'community-initiatives': {
        title: 'Add Initiative',
        subtitle: 'Add a governance initiative for the Community page.',
        icon: 'target',
        titleLabel: 'Initiative Title',
        titlePlaceholder: 'Enter the initiative name…',
        descLabel: 'Description',
        descPlaceholder: 'Describe the initiative goals and progress…',
        submitLabel: 'Add Initiative',
        showMedia: true,
        showVideo: false
    },
    'community-reports': {
        title: 'Add Report',
        subtitle: 'Add an accountability report for the Community page.',
        icon: 'file-bar-chart',
        titleLabel: 'Report Title',
        titlePlaceholder: 'Enter the report title…',
        descLabel: 'Summary',
        descPlaceholder: 'Summarize the report findings…',
        submitLabel: 'Add Report',
        showMedia: true,
        showVideo: false
    },
    donations: {
        title: 'Record Donation',
        subtitle: 'Log a donation pledge or contribution.',
        icon: 'heart',
        titleLabel: 'Donor Name',
        titlePlaceholder: 'Enter the donor name…',
        descLabel: 'Amount (USD)',
        descPlaceholder: 'Enter the donation amount…',
        submitLabel: 'Record Donation',
        showMedia: false,
        showVideo: false
    },
    'donation-tiers': {
        title: 'Add Giving Tier',
        subtitle: 'Define a giving level for the Ways to Give section.',
        icon: 'gift',
        titleLabel: 'Tier Name',
        titlePlaceholder: 'e.g. Scholar',
        descLabel: 'Description',
        descPlaceholder: 'What this tier supports…',
        submitLabel: 'Add Giving Tier',
        showMedia: false,
        showVideo: false,
        extraFields: 'donation-tier'
    },
    'endowment-stats': {
        title: 'Add Impact Stat',
        subtitle: 'Add a headline statistic for the Endowment page.',
        icon: 'bar-chart-2',
        titleLabel: 'Stat Label',
        titlePlaceholder: 'e.g. Students Supported',
        descLabel: 'Display Value',
        descPlaceholder: 'e.g. 10,000+',
        submitLabel: 'Add Impact Stat',
        showMedia: false,
        showVideo: false
    },
    'endowment-campaigns': {
        title: 'Add Campaign',
        subtitle: 'Add a fundraising campaign for Endowment News.',
        icon: 'target',
        titleLabel: 'Campaign Title',
        titlePlaceholder: 'Enter campaign title…',
        descLabel: 'Summary',
        descPlaceholder: 'Campaign description or call to action…',
        submitLabel: 'Add Campaign',
        showMedia: true,
        showVideo: false,
        extraFields: 'endowment-campaign'
    },
    'endowment-info': {
        title: 'Add Endowment Info Block',
        subtitle: 'Controls the two-column about section (#endowmentInfo) on the public Endowment page — image, heading, body text, and Read more link.',
        icon: 'info',
        titleLabel: 'Heading',
        titlePlaceholder: 'e.g. Investing in the Future of Africa — Through IUEA',
        descLabel: 'Body Text',
        descPlaceholder: 'Short intro shown in the about block; full text appears in the Read more modal…',
        submitLabel: 'Add Info Block',
        showMedia: true,
        showVideo: false
    }
};

const CREATE_MODAL_GENERIC = {
    title: 'Create New Content',
    subtitle: 'Choose a content type and fill in the details below.',
    icon: 'file-plus',
    submitLabel: 'Publish Content'
};

let createModalPresetMode = false;
let createModalPresetType = null;

const ADMIN_MODULE_HEADER_CONFIG = {
    news: {
        subtitle: 'Manage campus and innovation news for the home feed and News & Announcements archive. Add campus stories here; use Innovations → Add Innovation News for innovation stories (they appear in both tables).',
        buttonLabel: 'Add Campus News',
        icon: 'file-text'
    },
    events: {
        subtitle: 'Manage events for home Upcoming Events (first 4) and the full Events page.',
        buttonLabel: 'Create Event',
        icon: 'calendar'
    },
    innovations: {
        subtitle: 'Manage innovations and startups for the public Innovation Hub page.',
        icon: 'lightbulb'
    },
    alumni: {
        subtitle: 'Manage alumni news and profiles for the public Alumni page.',
        icon: 'graduation-cap'
    },
    research: {
        subtitle: 'Manage research areas, publications, and research labs for the public Research page.',
        icon: 'microscope'
    },
    community: {
        subtitle: 'Manage community news, committees, initiatives, and reports for the public Community page.',
        icon: 'landmark'
    },
    techpark: {
        subtitle: 'Manage facilities and programs for the public Tech Park page.',
        icon: 'building-2'
    },
    donations: {
        subtitle: 'Manage content for the public Endowment page. Use the Endowment Info section for the two-column about block (#endowmentInfo). Impact Stats and Giving Tiers show built-in placeholders until you add items here.',
        icon: 'heart',
        secondary: [{ label: 'Export Report', icon: 'download', onclick: 'exportDonationsReport()' }]
    }
};

function buildAdminHeaderActionButton(sub) {
    return `<button type="button" class="btn-primary" onclick="showCreateModal('${sub.createType}')"><i data-lucide="${sub.icon}"></i> ${sub.createLabel}</button>`;
}

function updateAdminContentHeader(moduleName) {
    const config = ADMIN_MODULE_HEADER_CONFIG[moduleName];
    const titleEl = document.getElementById('adminContentModuleTitle');
    const subtitleEl = document.getElementById('adminContentModuleSubtitle');
    const actionsEl = document.getElementById('adminContentHeaderActions');

    if (!config) {
        if (titleEl) titleEl.textContent = 'Content Management';
        if (subtitleEl) subtitleEl.textContent = 'Select a content module from the sidebar to manage items.';
        if (actionsEl) {
            actionsEl.className = 'admin-panel-header-actions';
            actionsEl.innerHTML = '';
        }
        return;
    }

    if (titleEl) {
        titleEl.textContent = moduleName === 'research'
            ? 'Research Management'
            : moduleName === 'innovations'
            ? 'Innovations Management'
            : moduleName === 'alumni'
            ? 'Alumni Management'
            : moduleName === 'community'
            ? 'Community Management'
            : moduleName === 'techpark'
            ? 'Tech Park Management'
            : moduleName === 'donations'
            ? 'Donations Management'
            : `${ADMIN_MODULE_LABELS[moduleName]} Management`;
    }
    if (subtitleEl) subtitleEl.textContent = config.subtitle;

    let html = '';
    let actionsClass = 'admin-panel-header-actions';
    if (moduleName === 'research') {
        html = RESEARCH_SUBMODULES.map(buildAdminHeaderActionButton).join('');
    } else if (moduleName === 'innovations') {
        actionsClass += ' admin-panel-header-actions--stacked';
        const newsSubs = INNOVATIONS_SUBMODULES.filter(sub => sub.key.endsWith('-news'));
        const itemSubs = INNOVATIONS_SUBMODULES.filter(sub => !sub.key.endsWith('-news'));
        html = `
            <div class="admin-panel-header-action-row">${newsSubs.map(buildAdminHeaderActionButton).join('')}</div>
            <div class="admin-panel-header-action-row">${itemSubs.map(buildAdminHeaderActionButton).join('')}</div>`;
    } else if (moduleName === 'alumni') {
        actionsClass += ' admin-panel-header-actions--stacked';
        const newsSubs = ALUMNI_SUBMODULES.filter(sub => sub.key.endsWith('-news'));
        const itemSubs = ALUMNI_SUBMODULES.filter(sub => !sub.key.endsWith('-news'));
        html = `
            <div class="admin-panel-header-action-row">${newsSubs.map(buildAdminHeaderActionButton).join('')}</div>
            <div class="admin-panel-header-action-row">${itemSubs.map(buildAdminHeaderActionButton).join('')}</div>`;
    } else if (moduleName === 'community') {
        actionsClass += ' admin-panel-header-actions--stacked';
        const newsSubs = COMMUNITY_SUBMODULES.filter(sub => sub.key === 'community-news');
        const otherSubs = COMMUNITY_SUBMODULES.filter(sub => sub.key !== 'community-news');
        html = `
            <div class="admin-panel-header-action-row">${newsSubs.map(buildAdminHeaderActionButton).join('')}</div>
            <div class="admin-panel-header-action-row">${otherSubs.map(buildAdminHeaderActionButton).join('')}</div>`;
    } else if (moduleName === 'techpark') {
        html = TECH_PARK_SUBMODULES.map(buildAdminHeaderActionButton).join('');
    } else if (moduleName === 'donations') {
        actionsClass += ' admin-panel-header-actions--stacked';
        const topSubs = DONATIONS_SUBMODULES.filter(sub => sub.key === 'donations' || sub.key === 'donation-tiers');
        const bottomSubs = DONATIONS_SUBMODULES.filter(sub => sub.key !== 'donations' && sub.key !== 'donation-tiers');
        html = `
            <div class="admin-panel-header-action-row">${topSubs.map(buildAdminHeaderActionButton).join('')}</div>
            <div class="admin-panel-header-action-row">${bottomSubs.map(buildAdminHeaderActionButton).join('')}</div>`;
        if (config.secondary) {
            html += `<div class="admin-panel-header-action-row">${config.secondary.map(action =>
                `<button type="button" class="btn-secondary" onclick="${action.onclick}"><i data-lucide="${action.icon}"></i> ${action.label}</button>`
            ).join('')}</div>`;
        }
    } else {
        const createType = ADMIN_MODULE_CREATE_TYPES[moduleName];
        html = `<button type="button" class="btn-primary" onclick="showCreateModal('${createType}')"><i data-lucide="${config.icon || 'plus'}"></i> ${config.buttonLabel}</button>`;
        if (config.secondary) {
            config.secondary.forEach(action => {
                html += `<button type="button" class="btn-secondary" onclick="${action.onclick}"><i data-lucide="${action.icon}"></i> ${action.label}</button>`;
            });
        }
    }
    if (actionsEl) {
        actionsEl.className = actionsClass;
        actionsEl.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function exportDonationsReport() {
    const items = adminContentItemsCache.donations || [];
    if (!items.length) {
        showToast('No donations to export.', 'error');
        return;
    }
    const headers = ['Name', 'Amount', 'Message', 'Created'];
    const rows = items.map(i => [
        i.name || '',
        i.amount ?? '',
        (i.message || '').replace(/"/g, '""'),
        i.created_at ? new Date(i.created_at).toISOString().split('T')[0] : ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iuea-donations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Donations report exported.');
}

function adminItemTitle(item) {
    return item.title || item.name || item.label || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Untitled';
}

function adminItemDesc(item) {
    if (item.label && item.value && !item.title && !item.name) {
        return item.value;
    }
    if (item.goal_amount || item.raised_amount) {
        return [item.goal_amount, item.raised_amount].filter(Boolean).join(' · ');
    }
    if (item.amount && item.description === undefined && item.message === undefined && !item.title) {
        return String(item.amount);
    }
    if (item.authors || item.journal) {
        return [item.authors, item.journal, item.year].filter(Boolean).join(' · ');
    }
    if (item.director || item.focus) {
        return [item.director, item.focus].filter(Boolean).join(' · ');
    }
    return item.description || item.achievement || item.message || item.role || item.focus || '';
}

function adminItemStatusClass(status) {
    if (status === 'approved') return 'active';
    if (status === 'pending') return 'pending';
    return 'inactive';
}

const ADMIN_NEWS_CROSS_LINKED = ['news', 'innovation-news', 'alumni-news'];

function isAdminNewsCrossListedModule(moduleName) {
    return ADMIN_NEWS_CROSS_LINKED.includes(moduleName);
}

function invalidateLinkedAdminNewsCaches(moduleName) {
    if (!isAdminNewsCrossListedModule(moduleName)) return;
    ADMIN_NEWS_CROSS_LINKED.filter(m => m !== moduleName).forEach(linked => {
        adminModuleCacheReady.delete(linked);
        delete adminContentItemsCache[linked];
    });
}

function adminNewsTypeLabel(item) {
    const t = String(item?.type || 'news').toLowerCase();
    if (t === 'innovation') return 'Innovation';
    if (t === 'alumni') return 'Alumni';
    return 'Campus';
}

function adminNewsTypeBadge(item) {
    const label = adminNewsTypeLabel(item);
    const cls = label === 'Innovation' ? 'badge-innovation' : (label === 'Alumni' ? 'badge-alumni' : 'badge-campus');
    return `<span class="card-badge ${cls}" style="font-size:0.7rem;margin-left:0.35rem;">${label}</span>`;
}

function invalidateAdminModuleCache(moduleName) {
    if (moduleName === 'research') {
        RESEARCH_SUBMODULES.forEach(sub => {
            adminModuleCacheReady.delete(sub.key);
            delete adminContentItemsCache[sub.key];
        });
        adminModuleCacheReady.delete('research');
        return;
    }
    if (moduleName === 'innovations') {
        INNOVATIONS_SUBMODULES.forEach(sub => {
            adminModuleCacheReady.delete(sub.key);
            delete adminContentItemsCache[sub.key];
        });
        adminModuleCacheReady.delete('innovations');
        invalidateLinkedAdminNewsCaches('innovation-news');
        return;
    }
    if (moduleName === 'alumni') {
        ALUMNI_SUBMODULES.forEach(sub => {
            adminModuleCacheReady.delete(sub.key);
            delete adminContentItemsCache[sub.key];
        });
        adminModuleCacheReady.delete('alumni');
        invalidateLinkedAdminNewsCaches('alumni-news');
        return;
    }
    if (moduleName === 'community') {
        COMMUNITY_SUBMODULES.forEach(sub => {
            adminModuleCacheReady.delete(sub.key);
            delete adminContentItemsCache[sub.key];
        });
        adminModuleCacheReady.delete('community');
        return;
    }
    if (moduleName === 'techpark') {
        TECH_PARK_SUBMODULES.forEach(sub => {
            adminModuleCacheReady.delete(sub.key);
            delete adminContentItemsCache[sub.key];
        });
        adminModuleCacheReady.delete('techpark');
        return;
    }
    if (moduleName === 'donations') {
        DONATIONS_SUBMODULES.forEach(sub => {
            adminModuleCacheReady.delete(sub.key);
            delete adminContentItemsCache[sub.key];
        });
        adminModuleCacheReady.delete('donations');
        return;
    }
    if (isResearchSubModule(moduleName)) {
        adminModuleCacheReady.delete(moduleName);
        delete adminContentItemsCache[moduleName];
        adminModuleCacheReady.delete('research');
        return;
    }
    if (isInnovationsSubModule(moduleName)) {
        adminModuleCacheReady.delete(moduleName);
        delete adminContentItemsCache[moduleName];
        adminModuleCacheReady.delete('innovations');
        if (moduleName === 'innovation-news') invalidateLinkedAdminNewsCaches('innovation-news');
        return;
    }
    if (isAlumniSubModule(moduleName)) {
        adminModuleCacheReady.delete(moduleName);
        delete adminContentItemsCache[moduleName];
        adminModuleCacheReady.delete('alumni');
        if (moduleName === 'alumni-news') invalidateLinkedAdminNewsCaches('alumni-news');
        return;
    }
    if (isCommunitySubModule(moduleName)) {
        adminModuleCacheReady.delete(moduleName);
        delete adminContentItemsCache[moduleName];
        adminModuleCacheReady.delete('community');
        return;
    }
    if (isTechParkSubModule(moduleName)) {
        adminModuleCacheReady.delete(moduleName);
        delete adminContentItemsCache[moduleName];
        adminModuleCacheReady.delete('techpark');
        return;
    }
    if (isDonationsSubModule(moduleName)) {
        adminModuleCacheReady.delete(moduleName);
        delete adminContentItemsCache[moduleName];
        adminModuleCacheReady.delete('donations');
        return;
    }
    adminModuleCacheReady.delete(moduleName);
    delete adminContentItemsCache[moduleName];
    invalidateLinkedAdminNewsCaches(moduleName);
}

function adminContentListsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

function prefetchAdminContentModules() {
    if (!currentUser || !['super_admin', 'content_editor', 'admin'].includes(currentUser.role)) {
        return Promise.resolve();
    }
    if (adminContentPrefetchPromise) return adminContentPrefetchPromise;

    adminContentPrefetchPromise = Promise.all([
        ...getAdminPrefetchModuleKeys().map(async (moduleName) => {
            if (adminModuleCacheReady.has(moduleName)) return;
            const items = await fetchAdminContentList(moduleName);
            adminContentItemsCache[moduleName] = Array.isArray(items) ? items : [];
            adminModuleCacheReady.add(moduleName);
        }),
        prefetchHeroVideos()
    ]).catch(err => {
        console.error('Admin prefetch error:', err);
        adminContentPrefetchPromise = null;
    });

    return adminContentPrefetchPromise;
}

async function prefetchHeroVideos() {
    if (heroVideosCacheReady) return;
    const videos = await apiGet('/settings/hero-videos');
    heroVideosCache = Array.isArray(videos) ? videos : [];
    heroVideosCacheReady = true;
}

async function refreshAdminModuleInBackground(moduleName) {
    if (currentAdminModule !== moduleName) return;
    if (moduleName === 'research') return refreshResearchAdminModuleInBackground();
    if (moduleName === 'innovations') return refreshInnovationsAdminModuleInBackground();
    if (moduleName === 'alumni') return refreshAlumniAdminModuleInBackground();
    if (moduleName === 'community') return refreshCommunityAdminModuleInBackground();
    if (moduleName === 'techpark') return refreshTechParkAdminModuleInBackground();
    if (moduleName === 'donations') return refreshDonationsAdminModuleInBackground();

    const area = document.getElementById('adminContentArea');
    if (area) area.classList.add('admin-content-refreshing');

    try {
        const items = await fetchAdminContentList(moduleName);
        const normalized = Array.isArray(items) ? items : [];
        if (currentAdminModule !== moduleName) return;

        if (!adminContentListsEqual(adminContentItemsCache[moduleName], normalized)) {
            if (isDisplaySectionedAdminModule(moduleName)) {
                renderDisplaySectionedAdminModule(moduleName, normalized);
            } else {
                renderAdminContentTable(moduleName, normalized);
            }
        } else {
            adminContentItemsCache[moduleName] = normalized;
            adminModuleCacheReady.add(moduleName);
        }
    } finally {
        if (area && currentAdminModule === moduleName) {
            area.classList.remove('admin-content-refreshing');
        }
    }
}

async function fetchAdminContentList(moduleName) {
    const apiType = ADMIN_MODULE_API_TYPES[moduleName];
    const fallback = getAdminModuleEndpoint(moduleName);
    if (!apiType || !fallback) return [];

    try {
        const headers = authToken ? { 'Authorization': `Bearer ${authToken}`, 'ngrok-skip-browser-warning': 'true' } : { 'ngrok-skip-browser-warning': 'true' };
        const res = await fetch(`${API_BASE_URL}/admin/content/${apiType}`, { headers });
        if (res.status === 401) { logout(); return []; }
        if (res.ok) return await res.json();
        if (res.status === 403) {
            const items = await apiGet(fallback);
            return isCommunitySubModule(moduleName) ? filterCommunityItems(items, moduleName) : items;
        }
        return [];
    } catch (e) {
        console.error('Admin content list error:', moduleName, e);
        const items = await apiGet(fallback);
        return isCommunitySubModule(moduleName) ? filterCommunityItems(items, moduleName) : items;
    }
}

async function fetchAdminContentItem(moduleName, id) {
    const apiType = ADMIN_MODULE_API_TYPES[moduleName];
    if (!apiType) return null;

    try {
        const headers = authToken ? { 'Authorization': `Bearer ${authToken}`, 'ngrok-skip-browser-warning': 'true' } : { 'ngrok-skip-browser-warning': 'true' };
        const res = await fetch(`${API_BASE_URL}/admin/content/${apiType}/${id}`, { headers });
        if (res.status === 401) { logout(); return null; }
        if (res.ok) return await res.json();
        return null;
    } catch (e) {
        console.error('Admin content fetch error:', moduleName, id, e);
        return null;
    }
}

async function getAdminContentItem(moduleName, id) {
    let item = (adminContentItemsCache[moduleName] || []).find(i => i.id == id);
    if (!item) item = await fetchAdminContentItem(moduleName, id);
    return item || null;
}

async function loadAdminModule(moduleName, btn, options = {}) {
    const { forceRefresh = false } = options;
    if (moduleName === 'startups') moduleName = 'innovations';
    if (isDisplaySectionedAdminModule(moduleName)) {
        await loadDisplaySectionedAdminModule(moduleName, btn, options);
        return;
    }
    if (moduleName === 'research') {
        await loadResearchAdminModule(btn, options);
        return;
    }
    if (moduleName === 'innovations') {
        await loadInnovationsAdminModule(btn, options);
        return;
    }
    if (moduleName === 'alumni') {
        await loadAlumniAdminModule(btn, options);
        return;
    }
    if (moduleName === 'community') {
        await loadCommunityAdminModule(btn, options);
        return;
    }
    if (moduleName === 'techpark') {
        await loadTechParkAdminModule(btn, options);
        return;
    }
    if (moduleName === 'donations') {
        await loadDonationsAdminModule(btn, options);
        return;
    }

    currentAdminModule = moduleName;
    showAdminTab('content', btn || document.querySelector(`.admin-nav-btn[data-module="${moduleName}"]`));

    updateAdminContentHeader(moduleName);

    const endpoint = getAdminModuleEndpoint(moduleName);
    if (!endpoint) {
        console.error('Unknown admin module:', moduleName);
        return;
    }

    const area = document.getElementById('adminContentArea');
    const hasCache = adminModuleCacheReady.has(moduleName);

    if (hasCache && !forceRefresh) {
        renderAdminContentTable(moduleName, adminContentItemsCache[moduleName] || []);
        refreshAdminModuleInBackground(moduleName);
        return;
    }

    if (hasCache && forceRefresh) {
        renderAdminContentTable(moduleName, adminContentItemsCache[moduleName] || [], { refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const items = await fetchAdminContentList(moduleName);
    if (currentAdminModule !== moduleName) return;
    renderAdminContentTable(moduleName, Array.isArray(items) ? items : []);
}

async function loadResearchAdminModule(btn, options = {}) {
    const { forceRefresh = false } = options;
    currentAdminModule = 'research';
    showAdminTab('content', btn || document.querySelector('.admin-nav-btn[data-module="research"]'));
    updateAdminContentHeader('research');

    const area = document.getElementById('adminContentArea');
    const allCached = RESEARCH_SUBMODULES.every(sub => adminModuleCacheReady.has(sub.key));

    if (allCached && !forceRefresh) {
        renderResearchAdminModule();
        refreshResearchAdminModuleInBackground();
        return;
    }

    if (allCached && forceRefresh) {
        renderResearchAdminModule({ refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const results = await Promise.all(
        RESEARCH_SUBMODULES.map(async (sub) => {
            const items = await fetchAdminContentList(sub.key);
            return { key: sub.key, items: Array.isArray(items) ? items : [] };
        })
    );

    if (currentAdminModule !== 'research') return;

    results.forEach(({ key, items }) => {
        adminContentItemsCache[key] = items;
        adminModuleCacheReady.add(key);
    });
    adminModuleCacheReady.add('research');
    renderResearchAdminModule();
}

async function loadInnovationsAdminModule(btn, options = {}) {
    const { forceRefresh = false } = options;
    currentAdminModule = 'innovations';
    showAdminTab('content', btn || document.querySelector('.admin-nav-btn[data-module="innovations"]'));
    updateAdminContentHeader('innovations');

    const area = document.getElementById('adminContentArea');
    const allCached = INNOVATIONS_SUBMODULES.every(sub => adminModuleCacheReady.has(sub.key));

    if (allCached && !forceRefresh) {
        renderInnovationsAdminModule();
        refreshInnovationsAdminModuleInBackground();
        return;
    }

    if (allCached && forceRefresh) {
        renderInnovationsAdminModule({ refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const results = await Promise.all(
        INNOVATIONS_SUBMODULES.map(async (sub) => {
            const items = await fetchAdminContentList(sub.key);
            return { key: sub.key, items: Array.isArray(items) ? items : [] };
        })
    );

    if (currentAdminModule !== 'innovations') return;

    results.forEach(({ key, items }) => {
        adminContentItemsCache[key] = items;
        adminModuleCacheReady.add(key);
    });
    adminModuleCacheReady.add('innovations');
    renderInnovationsAdminModule();
}

async function loadAlumniAdminModule(btn, options = {}) {
    const { forceRefresh = false } = options;
    currentAdminModule = 'alumni';
    showAdminTab('content', btn || document.querySelector('.admin-nav-btn[data-module="alumni"]'));
    updateAdminContentHeader('alumni');

    const area = document.getElementById('adminContentArea');
    const allCached = ALUMNI_SUBMODULES.every(sub => adminModuleCacheReady.has(sub.key));

    if (allCached && !forceRefresh) {
        renderAlumniAdminModule();
        refreshAlumniAdminModuleInBackground();
        return;
    }

    if (allCached && forceRefresh) {
        renderAlumniAdminModule({ refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const results = await Promise.all(
        ALUMNI_SUBMODULES.map(async (sub) => {
            const items = await fetchAdminContentList(sub.key);
            return { key: sub.key, items: Array.isArray(items) ? items : [] };
        })
    );

    if (currentAdminModule !== 'alumni') return;

    results.forEach(({ key, items }) => {
        adminContentItemsCache[key] = items;
        adminModuleCacheReady.add(key);
    });
    adminModuleCacheReady.add('alumni');
    renderAlumniAdminModule();
}

async function loadCommunityAdminModule(btn, options = {}) {
    const { forceRefresh = false } = options;
    currentAdminModule = 'community';
    showAdminTab('content', btn || document.querySelector('.admin-nav-btn[data-module="community"]'));
    updateAdminContentHeader('community');

    delete adminContentItemsCache['community'];

    const area = document.getElementById('adminContentArea');
    const allCached = COMMUNITY_SUBMODULES.every(sub => adminModuleCacheReady.has(sub.key));

    if (allCached && !forceRefresh) {
        renderCommunityAdminModule();
        refreshCommunityAdminModuleInBackground();
        return;
    }

    if (allCached && forceRefresh) {
        renderCommunityAdminModule({ refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const results = await Promise.all(
        COMMUNITY_SUBMODULES.map(async (sub) => {
            const items = await fetchAdminContentList(sub.key);
            return { key: sub.key, items: Array.isArray(items) ? items : [] };
        })
    );

    if (currentAdminModule !== 'community') return;

    results.forEach(({ key, items }) => {
        adminContentItemsCache[key] = items;
        adminModuleCacheReady.add(key);
    });
    adminModuleCacheReady.add('community');
    renderCommunityAdminModule();
}

function renderCommunityAdminModule(options = {}) {
    const { refreshing = false } = options;
    const area = document.getElementById('adminContentArea');
    if (!area) return;

    area.classList.toggle('admin-content-refreshing', refreshing);
    area.innerHTML = `
        <div class="admin-research-sections">
            ${COMMUNITY_SUBMODULES.map(sub => {
                const items = adminContentItemsCache[sub.key] || [];
                return `
                <section class="admin-research-block">
                    <div class="admin-research-block-header">
                        <div class="admin-research-block-title">
                            <i data-lucide="${sub.icon}"></i>
                            <h4>${sub.label}</h4>
                        </div>
                        <span class="admin-research-block-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
                    </div>
                    ${buildAdminTableHTML(sub.key, items)}
                </section>`;
            }).join('')}
        </div>`;
    lucide.createIcons();
}

async function refreshCommunityAdminModuleInBackground() {
    if (currentAdminModule !== 'community') return;

    const area = document.getElementById('adminContentArea');
    if (area) area.classList.add('admin-content-refreshing');

    try {
        const results = await Promise.all(
            COMMUNITY_SUBMODULES.map(async (sub) => {
                const items = await fetchAdminContentList(sub.key);
                return { key: sub.key, items: Array.isArray(items) ? items : [] };
            })
        );
        if (currentAdminModule !== 'community') return;

        let changed = false;
        results.forEach(({ key, items }) => {
            if (!adminContentListsEqual(adminContentItemsCache[key], items)) changed = true;
            adminContentItemsCache[key] = items;
            adminModuleCacheReady.add(key);
        });

        if (changed) renderCommunityAdminModule();
    } finally {
        if (area && currentAdminModule === 'community') {
            area.classList.remove('admin-content-refreshing');
        }
    }
}

async function loadTechParkAdminModule(btn, options = {}) {
    const { forceRefresh = false } = options;
    currentAdminModule = 'techpark';
    showAdminTab('content', btn || document.querySelector('.admin-nav-btn[data-module="techpark"]'));
    updateAdminContentHeader('techpark');

    const area = document.getElementById('adminContentArea');
    const allCached = TECH_PARK_SUBMODULES.every(sub => adminModuleCacheReady.has(sub.key));

    if (allCached && !forceRefresh) {
        renderTechParkAdminModule();
        refreshTechParkAdminModuleInBackground();
        return;
    }

    if (allCached && forceRefresh) {
        renderTechParkAdminModule({ refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const results = await Promise.all(
        TECH_PARK_SUBMODULES.map(async (sub) => {
            const items = await fetchAdminContentList(sub.key);
            return { key: sub.key, items: Array.isArray(items) ? items : [] };
        })
    );

    if (currentAdminModule !== 'techpark') return;

    results.forEach(({ key, items }) => {
        adminContentItemsCache[key] = items;
        adminModuleCacheReady.add(key);
    });
    adminModuleCacheReady.add('techpark');
    renderTechParkAdminModule();
}

function buildDonationsSubmoduleTableHTML(subKey, items) {
    const label = ADMIN_MODULE_LABELS[subKey] || 'items';
    if (!items.length) {
        if (subKey === 'endowment-info') {
            return `<div class="admin-empty-state admin-empty-state--compact"><p>No Endowment Info block yet. The public page shows built-in placeholder text in <strong>#endowmentInfo</strong> until you add one here.</p><button type="button" class="btn-primary" style="margin-top:0.75rem" onclick="showCreateModal('endowment-info')"><i data-lucide="plus"></i> Add Info Block</button></div>`;
        }
        return `<div class="admin-empty-state admin-empty-state--compact"><p>No ${label} yet.</p></div>`;
    }

    const actionCell = (id) => `
        <div class="admin-table-actions">
            <button type="button" class="admin-table-action-btn" onclick="viewAdminContent('${subKey}', ${id})"><i data-lucide="eye"></i> View</button>
            <button type="button" class="admin-table-action-btn" onclick="editAdminContent('${subKey}', ${id})"><i data-lucide="pencil"></i> Edit</button>
            <button type="button" class="admin-table-action-btn" onclick="deleteAdminContent('${subKey}', ${id})"><i data-lucide="trash-2"></i> Delete</button>
        </div>`;

    if (subKey === 'donations') {
        return `
            <table class="admin-table-modern">
                <thead><tr><th>Donor</th><th>Amount</th><th>Message</th><th>Date</th><th style="width:200px">Actions</th></tr></thead>
                <tbody>
                    ${items.map(item => `
                    <tr id="admin-row-${subKey}-${item.id}">
                        <td><strong>${item.name || '—'}</strong></td>
                        <td style="font-weight:700;color:var(--iuea-maroon)">$${Number(item.amount || 0).toLocaleString()}</td>
                        <td style="color:#64748b;font-size:0.85rem;">${(item.message || '—').substring(0, 80)}</td>
                        <td style="color:#64748b;font-size:0.85rem;">${item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td>
                        <td>${actionCell(item.id)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="table-pagination"><span>${items.length} item${items.length === 1 ? '' : 's'}</span></div>`;
    }

    if (subKey === 'donation-tiers') {
        return `
            <table class="admin-table-modern">
                <thead><tr><th>Name</th><th>Amount</th><th>Description</th><th>Status</th><th style="width:200px">Actions</th></tr></thead>
                <tbody>
                    ${items.map(item => `
                    <tr id="admin-row-${subKey}-${item.id}">
                        <td><strong>${item.name || '—'}</strong></td>
                        <td>${item.amount || '—'}</td>
                        <td style="color:#64748b;font-size:0.85rem;">${(item.description || '—').substring(0, 80)}</td>
                        <td><span class="status-badge ${adminItemStatusClass(item.status || 'approved')}">${item.status || 'approved'}</span></td>
                        <td>${actionCell(item.id)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="table-pagination"><span>${items.length} item${items.length === 1 ? '' : 's'}</span></div>`;
    }

    if (subKey === 'endowment-stats') {
        return `
            <table class="admin-table-modern">
                <thead><tr><th>Label</th><th>Value</th><th>Status</th><th style="width:200px">Actions</th></tr></thead>
                <tbody>
                    ${items.map(item => `
                    <tr id="admin-row-${subKey}-${item.id}">
                        <td><strong>${item.label || '—'}</strong></td>
                        <td style="font-weight:700;color:var(--iuea-maroon)">${item.value || '—'}</td>
                        <td><span class="status-badge ${adminItemStatusClass(item.status || 'approved')}">${item.status || 'approved'}</span></td>
                        <td>${actionCell(item.id)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="table-pagination"><span>${items.length} item${items.length === 1 ? '' : 's'}</span></div>`;
    }

    if (subKey === 'endowment-campaigns') {
        return `
            <table class="admin-table-modern">
                <thead><tr><th>Title</th><th>Goal</th><th>Raised</th><th>Status</th><th style="width:200px">Actions</th></tr></thead>
                <tbody>
                    ${items.map(item => `
                    <tr id="admin-row-${subKey}-${item.id}">
                        <td><strong>${item.title || '—'}</strong></td>
                        <td>${item.goal_amount || '—'}</td>
                        <td>${item.raised_amount || '—'}</td>
                        <td><span class="status-badge ${adminItemStatusClass(item.status || 'approved')}">${item.status || 'approved'}</span></td>
                        <td>${actionCell(item.id)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="table-pagination"><span>${items.length} item${items.length === 1 ? '' : 's'}</span></div>`;
    }

    if (subKey === 'endowment-info') {
        return `
            <table class="admin-table-modern">
                <thead><tr><th>Heading</th><th>Image</th><th>Body Preview</th><th>Status</th><th style="width:200px">Actions</th></tr></thead>
                <tbody>
                    ${items.map(item => `
                    <tr id="admin-row-${subKey}-${item.id}">
                        <td><strong>${item.title || '—'}</strong></td>
                        <td>${item.image ? '<span style="color:#059669;font-size:0.85rem;">✓ Set</span>' : '<span style="color:#94a3b8;font-size:0.85rem;">Placeholder</span>'}</td>
                        <td style="color:#64748b;font-size:0.85rem;">${(item.description || '—').substring(0, 100)}</td>
                        <td><span class="status-badge ${adminItemStatusClass(item.status || 'approved')}">${item.status || 'approved'}</span></td>
                        <td>${actionCell(item.id)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="table-pagination"><span>${items.length} item${items.length === 1 ? '' : 's'} · only the first approved block is shown on #endowmentInfo</span></div>`;
    }

    return buildAdminTableHTML(subKey, items);
}

async function loadDonationsAdminModule(btn, options = {}) {
    const { forceRefresh = false } = options;
    currentAdminModule = 'donations';
    showAdminTab('content', btn || document.querySelector('.admin-nav-btn[data-module="donations"]'));
    updateAdminContentHeader('donations');

    const area = document.getElementById('adminContentArea');
    const allCached = DONATIONS_SUBMODULES.every(sub => adminModuleCacheReady.has(sub.key));

    if (allCached && !forceRefresh) {
        renderDonationsAdminModule();
        refreshDonationsAdminModuleInBackground();
        return;
    }

    if (allCached && forceRefresh) {
        renderDonationsAdminModule({ refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const results = await Promise.all(
        DONATIONS_SUBMODULES.map(async (sub) => {
            const items = await fetchAdminContentList(sub.key);
            return { key: sub.key, items: Array.isArray(items) ? items : [] };
        })
    );

    if (currentAdminModule !== 'donations') return;

    results.forEach(({ key, items }) => {
        adminContentItemsCache[key] = items;
        adminModuleCacheReady.add(key);
    });
    adminModuleCacheReady.add('donations');
    renderDonationsAdminModule();
}

function renderDonationsAdminModule(options = {}) {
    const { refreshing = false } = options;
    const area = document.getElementById('adminContentArea');
    if (!area) return;

    area.classList.toggle('admin-content-refreshing', refreshing);
    area.innerHTML = `
        <div class="admin-research-sections">
            ${DONATIONS_SUBMODULES.map(sub => {
                const items = adminContentItemsCache[sub.key] || [];
                return `
                <section class="admin-research-block">
                    <div class="admin-research-block-header">
                        <div class="admin-research-block-title">
                            <i data-lucide="${sub.icon}"></i>
                            <div>
                                <h4>${sub.label}</h4>
                                ${sub.hint ? `<span style="color:#64748b;font-size:0.8rem;font-weight:400;">${sub.hint}</span>` : ''}
                            </div>
                        </div>
                        <span class="admin-research-block-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
                    </div>
                    ${buildDonationsSubmoduleTableHTML(sub.key, items)}
                </section>`;
            }).join('')}
        </div>`;
    lucide.createIcons();
}

async function refreshDonationsAdminModuleInBackground() {
    if (currentAdminModule !== 'donations') return;

    const area = document.getElementById('adminContentArea');
    if (area) area.classList.add('admin-content-refreshing');

    try {
        const results = await Promise.all(
            DONATIONS_SUBMODULES.map(async (sub) => {
                const items = await fetchAdminContentList(sub.key);
                return { key: sub.key, items: Array.isArray(items) ? items : [] };
            })
        );
        if (currentAdminModule !== 'donations') return;

        let changed = false;
        results.forEach(({ key, items }) => {
            if (!adminContentListsEqual(adminContentItemsCache[key], items)) changed = true;
            adminContentItemsCache[key] = items;
            adminModuleCacheReady.add(key);
        });

        if (changed) renderDonationsAdminModule();
    } finally {
        if (area && currentAdminModule === 'donations') {
            area.classList.remove('admin-content-refreshing');
        }
    }
}

async function loadDisplaySectionedAdminModule(moduleName, btn, options = {}) {
    const { forceRefresh = false } = options;
    currentAdminModule = moduleName;
    showAdminTab('content', btn || document.querySelector(`.admin-nav-btn[data-module="${moduleName}"]`));
    updateAdminContentHeader(moduleName);

    const area = document.getElementById('adminContentArea');
    const hasCache = adminModuleCacheReady.has(moduleName);

    if (hasCache && !forceRefresh) {
        renderDisplaySectionedAdminModule(moduleName, adminContentItemsCache[moduleName] || []);
        refreshAdminModuleInBackground(moduleName);
        return;
    }

    if (hasCache && forceRefresh) {
        renderDisplaySectionedAdminModule(moduleName, adminContentItemsCache[moduleName] || [], { refreshing: true });
    } else if (area) {
        area.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const items = await fetchAdminContentList(moduleName);
    if (currentAdminModule !== moduleName) return;
    renderDisplaySectionedAdminModule(moduleName, Array.isArray(items) ? items : []);
}

function renderDisplaySectionedAdminModule(moduleName, items, options = {}) {
    const sections = getDisplaySections(moduleName);
    const { refreshing = false } = options;
    const area = document.getElementById('adminContentArea');
    if (!area || !sections) return;

    adminContentItemsCache[moduleName] = items;
    adminModuleCacheReady.add(moduleName);
    area.classList.toggle('admin-content-refreshing', refreshing);

    area.innerHTML = `
        <div class="admin-research-sections">
            ${sections.map(section => {
                const sectionItems = section.sliceItems(items);
                return `
                <section class="admin-research-block">
                    <div class="admin-research-block-header">
                        <div class="admin-research-block-title">
                            <i data-lucide="${section.icon}"></i>
                            <div>
                                <h4>${section.label}</h4>
                                <span style="color:#64748b;font-size:0.8rem;font-weight:400;">${section.hint}</span>
                            </div>
                        </div>
                        <span class="admin-research-block-count">${sectionItems.length} item${sectionItems.length === 1 ? '' : 's'}</span>
                    </div>
                    ${buildAdminTableHTML(moduleName, sectionItems)}
                </section>`;
            }).join('')}
        </div>`;
    lucide.createIcons();
}

async function refreshResearchAdminModuleInBackground() {
    if (currentAdminModule !== 'research') return;

    const area = document.getElementById('adminContentArea');
    if (area) area.classList.add('admin-content-refreshing');

    try {
        const results = await Promise.all(
            RESEARCH_SUBMODULES.map(async (sub) => {
                const items = await fetchAdminContentList(sub.key);
                return { key: sub.key, items: Array.isArray(items) ? items : [] };
            })
        );
        if (currentAdminModule !== 'research') return;

        let changed = false;
        results.forEach(({ key, items }) => {
            if (!adminContentListsEqual(adminContentItemsCache[key], items)) changed = true;
            adminContentItemsCache[key] = items;
            adminModuleCacheReady.add(key);
        });

        if (changed) renderResearchAdminModule();
    } finally {
        if (area && currentAdminModule === 'research') {
            area.classList.remove('admin-content-refreshing');
        }
    }
}

function buildAdminTableHTML(moduleName, items) {
    if (!items.length) {
        return `
            <div class="admin-empty-state admin-empty-state--compact">
                <p>No ${ADMIN_MODULE_LABELS[moduleName] || 'items'} yet.</p>
            </div>`;
    }

    return `
        <table class="admin-table-modern">
            <thead>
                <tr>
                    <th style="width:72px">Image</th>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style="width:200px">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => {
                    const title = adminItemTitle(item);
                    const desc = adminItemDesc(item);
                    const img = resolveMediaUrl(item.image) || `https://picsum.photos/80/60?random=${item.id}`;
                    const status = item.status || 'approved';
                    const created = item.created_at ? new Date(item.created_at).toLocaleDateString() : '—';
                    const descShort = desc.length > 80 ? desc.substring(0, 80) + '…' : desc;
                    const typeBadge = isAdminNewsCrossListedModule(moduleName) ? adminNewsTypeBadge(item) : '';
                    return `
                    <tr id="admin-row-${moduleName}-${item.id}">
                        <td><img src="${img}" alt="" style="width:56px;height:42px;object-fit:cover;border-radius:6px;" onerror="this.src='https://picsum.photos/80/60?random=${item.id}'"></td>
                        <td><strong>${title}</strong>${typeBadge}</td>
                        <td style="color:#64748b;font-size:0.85rem;">${descShort || '—'}</td>
                        <td><span class="status-badge ${adminItemStatusClass(status)}">${status}</span></td>
                        <td style="color:#64748b;font-size:0.85rem;">${created}</td>
                        <td>
                            <div class="admin-table-actions">
                                <button type="button" class="admin-table-action-btn" onclick="viewAdminContent('${moduleName}', ${item.id})"><i data-lucide="eye"></i> View</button>
                                <button type="button" class="admin-table-action-btn" onclick="editAdminContent('${moduleName}', ${item.id})"><i data-lucide="pencil"></i> Edit</button>
                                <button type="button" class="admin-table-action-btn" onclick="deleteAdminContent('${moduleName}', ${item.id})"><i data-lucide="trash-2"></i> Delete</button>
                            </div>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="table-pagination">
            <span>${items.length} item${items.length === 1 ? '' : 's'}</span>
        </div>`;
}

function renderResearchAdminModule(options = {}) {
    const { refreshing = false } = options;
    const area = document.getElementById('adminContentArea');
    if (!area) return;

    area.classList.toggle('admin-content-refreshing', refreshing);
    area.innerHTML = `
        <div class="admin-research-sections">
            ${RESEARCH_SUBMODULES.map(sub => {
                const items = adminContentItemsCache[sub.key] || [];
                return `
                <section class="admin-research-block">
                    <div class="admin-research-block-header">
                        <div class="admin-research-block-title">
                            <i data-lucide="${sub.icon}"></i>
                            <h4>${sub.label}</h4>
                        </div>
                        <span class="admin-research-block-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
                    </div>
                    ${buildAdminTableHTML(sub.key, items)}
                </section>`;
            }).join('')}
        </div>`;
    lucide.createIcons();
}

function renderInnovationsAdminModule(options = {}) {
    const { refreshing = false } = options;
    const area = document.getElementById('adminContentArea');
    if (!area) return;

    area.classList.toggle('admin-content-refreshing', refreshing);
    area.innerHTML = `
        <div class="admin-research-sections">
            ${INNOVATIONS_SUBMODULES.map(sub => {
                const items = adminContentItemsCache[sub.key] || [];
                return `
                <section class="admin-research-block">
                    <div class="admin-research-block-header">
                        <div class="admin-research-block-title">
                            <i data-lucide="${sub.icon}"></i>
                            <h4>${sub.label}</h4>
                        </div>
                        <span class="admin-research-block-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
                    </div>
                    ${buildAdminTableHTML(sub.key, items)}
                </section>`;
            }).join('')}
        </div>`;
    lucide.createIcons();
}

function renderAlumniAdminModule(options = {}) {
    const { refreshing = false } = options;
    const area = document.getElementById('adminContentArea');
    if (!area) return;

    area.classList.toggle('admin-content-refreshing', refreshing);
    area.innerHTML = `
        <div class="admin-research-sections">
            ${ALUMNI_SUBMODULES.map(sub => {
                const items = adminContentItemsCache[sub.key] || [];
                return `
                <section class="admin-research-block">
                    <div class="admin-research-block-header">
                        <div class="admin-research-block-title">
                            <i data-lucide="${sub.icon}"></i>
                            <h4>${sub.label}</h4>
                        </div>
                        <span class="admin-research-block-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
                    </div>
                    ${buildAdminTableHTML(sub.key, items)}
                </section>`;
            }).join('')}
        </div>`;
    lucide.createIcons();
}

function renderTechParkAdminModule(options = {}) {
    const { refreshing = false } = options;
    const area = document.getElementById('adminContentArea');
    if (!area) return;

    area.classList.toggle('admin-content-refreshing', refreshing);
    area.innerHTML = `
        <div class="admin-research-sections">
            ${TECH_PARK_SUBMODULES.map(sub => {
                const items = adminContentItemsCache[sub.key] || [];
                return `
                <section class="admin-research-block">
                    <div class="admin-research-block-header">
                        <div class="admin-research-block-title">
                            <i data-lucide="${sub.icon}"></i>
                            <h4>${sub.label}</h4>
                        </div>
                        <span class="admin-research-block-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
                    </div>
                    ${buildAdminTableHTML(sub.key, items)}
                </section>`;
            }).join('')}
        </div>`;
    lucide.createIcons();
}

async function refreshInnovationsAdminModuleInBackground() {
    if (currentAdminModule !== 'innovations') return;

    const area = document.getElementById('adminContentArea');
    if (area) area.classList.add('admin-content-refreshing');

    try {
        const results = await Promise.all(
            INNOVATIONS_SUBMODULES.map(async (sub) => {
                const items = await fetchAdminContentList(sub.key);
                return { key: sub.key, items: Array.isArray(items) ? items : [] };
            })
        );
        if (currentAdminModule !== 'innovations') return;

        let changed = false;
        results.forEach(({ key, items }) => {
            if (!adminContentListsEqual(adminContentItemsCache[key], items)) changed = true;
            adminContentItemsCache[key] = items;
            adminModuleCacheReady.add(key);
        });

        if (changed) renderInnovationsAdminModule();
    } finally {
        if (area && currentAdminModule === 'innovations') {
            area.classList.remove('admin-content-refreshing');
        }
    }
}

async function refreshAlumniAdminModuleInBackground() {
    if (currentAdminModule !== 'alumni') return;

    const area = document.getElementById('adminContentArea');
    if (area) area.classList.add('admin-content-refreshing');

    try {
        const results = await Promise.all(
            ALUMNI_SUBMODULES.map(async (sub) => {
                const items = await fetchAdminContentList(sub.key);
                return { key: sub.key, items: Array.isArray(items) ? items : [] };
            })
        );
        if (currentAdminModule !== 'alumni') return;

        let changed = false;
        results.forEach(({ key, items }) => {
            if (!adminContentListsEqual(adminContentItemsCache[key], items)) changed = true;
            adminContentItemsCache[key] = items;
            adminModuleCacheReady.add(key);
        });

        if (changed) renderAlumniAdminModule();
    } finally {
        if (area && currentAdminModule === 'alumni') {
            area.classList.remove('admin-content-refreshing');
        }
    }
}

async function refreshTechParkAdminModuleInBackground() {
    if (currentAdminModule !== 'techpark') return;

    const area = document.getElementById('adminContentArea');
    if (area) area.classList.add('admin-content-refreshing');

    try {
        const results = await Promise.all(
            TECH_PARK_SUBMODULES.map(async (sub) => {
                const items = await fetchAdminContentList(sub.key);
                return { key: sub.key, items: Array.isArray(items) ? items : [] };
            })
        );
        if (currentAdminModule !== 'techpark') return;

        let changed = false;
        results.forEach(({ key, items }) => {
            if (!adminContentListsEqual(adminContentItemsCache[key], items)) changed = true;
            adminContentItemsCache[key] = items;
            adminModuleCacheReady.add(key);
        });

        if (changed) renderTechParkAdminModule();
    } finally {
        if (area && currentAdminModule === 'techpark') {
            area.classList.remove('admin-content-refreshing');
        }
    }
}

function reloadAdminModuleAfterCrud(moduleName, options = {}) {
    const parentModule = isResearchSubModule(moduleName) ? 'research'
        : isInnovationsSubModule(moduleName) ? 'innovations'
        : isAlumniSubModule(moduleName) ? 'alumni'
        : isCommunitySubModule(moduleName) ? 'community'
        : isTechParkSubModule(moduleName) ? 'techpark'
        : isDonationsSubModule(moduleName) ? 'donations'
        : moduleName;
    loadAdminModule(parentModule, null, options);
}

function renderAdminContentTable(moduleName, items, options = {}) {
    const { refreshing = false } = options;
    if (moduleName === 'research') return renderResearchAdminModule(options);
    if (moduleName === 'innovations') return renderInnovationsAdminModule(options);
    if (moduleName === 'alumni') return renderAlumniAdminModule(options);
    if (moduleName === 'community') return renderCommunityAdminModule(options);
    if (moduleName === 'techpark') return renderTechParkAdminModule(options);
    if (moduleName === 'donations') return renderDonationsAdminModule(options);

    const area = document.getElementById('adminContentArea');
    if (!area) return;

    adminContentItemsCache[moduleName] = items;
    adminModuleCacheReady.add(moduleName);
    area.classList.toggle('admin-content-refreshing', refreshing);

    if (!items.length) {
        area.innerHTML = `
            <div class="admin-empty-state" style="padding:3rem;">
                <div class="empty-icon"><i data-lucide="inbox"></i></div>
                <h3>No ${ADMIN_MODULE_LABELS[moduleName] || 'items'} yet</h3>
                <p>Create new content using the button above.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    area.innerHTML = buildAdminTableHTML(moduleName, items);
    lucide.createIcons();
}

function refreshCurrentAdminModule() {
    if (currentAdminModule) loadAdminModule(currentAdminModule, null, { forceRefresh: true });
}

function showAdminContentDetail(item) {
    document.getElementById('detailTitle').textContent = adminItemTitle(item);
    const desc = adminItemDesc(item) || 'No description.';
    document.getElementById('detailBody').innerHTML = desc.replace(/\n/g, '<br>');
    const imgEl = document.getElementById('detailImage');
    const img = resolveMediaUrl(item.image);
    if (img) { imgEl.src = img; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    const meta = document.getElementById('detailMeta');
    meta.innerHTML = '';
    if (item.status) meta.innerHTML += statHTML('info', item.status);
    if (item.created_at) meta.innerHTML += statHTML('calendar', new Date(item.created_at).toLocaleDateString());
    document.getElementById('detailModal').classList.add('show');
    lucide.createIcons();
}

async function viewAdminContent(moduleName, id) {
    const item = await getAdminContentItem(moduleName, id);
    if (!item) { showToast('Item not found.', 'error'); return; }
    showAdminContentDetail(item);
}

let adminEditContext = { moduleName: null, id: null };
let adminEditExistingImageUrl = null;

function getAdminEditCreateType(moduleName) {
    const map = { events: 'event', techpark: 'tech-park' };
    return map[moduleName] || moduleName;
}

function adminEditModuleHasImage(moduleName) {
    const config = CREATE_MODAL_CONFIG[getAdminEditCreateType(moduleName)];
    return config ? config.showMedia !== false : false;
}

function showAdminEditImagePreview(url, label) {
    const resolved = resolveMediaUrl(url);
    const preview = document.getElementById('adminEditImagePreview');
    const wrap = document.getElementById('adminEditImagePreviewWrap');
    const zone = document.getElementById('adminEditImageDropZone');
    const nameEl = document.getElementById('adminEditImageFileName');
    if (!preview || !wrap) return;
    if (resolved) {
        preview.src = resolved;
        preview.style.display = 'block';
        wrap.style.display = 'none';
        if (zone) zone.classList.add('has-file');
        if (nameEl) nameEl.textContent = label || 'Current image';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        wrap.style.display = 'flex';
        if (zone) zone.classList.remove('has-file');
        if (nameEl) nameEl.textContent = 'No new image selected';
    }
}

function clearAdminEditMedia() {
    const input = document.getElementById('adminEditImageFile');
    const clearBtn = document.getElementById('adminEditClearImageBtn');
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    const imageEl = document.getElementById('adminEditImage');
    if (imageEl) imageEl.value = adminEditExistingImageUrl || '';
    showAdminEditImagePreview(
        adminEditExistingImageUrl,
        adminEditExistingImageUrl ? 'Current image' : null
    );
}

function previewAdminEditMedia(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
        showToast(err, 'error');
        input.value = '';
        clearAdminEditMedia();
        return;
    }
    const nameEl = document.getElementById('adminEditImageFileName');
    const clearBtn = document.getElementById('adminEditClearImageBtn');
    const zone = document.getElementById('adminEditImageDropZone');
    const preview = document.getElementById('adminEditImagePreview');
    const wrap = document.getElementById('adminEditImagePreviewWrap');
    const imageEl = document.getElementById('adminEditImage');

    if (nameEl) nameEl.textContent = file.name;
    if (clearBtn) clearBtn.style.display = 'inline';
    if (zone) zone.classList.add('has-file');
    if (imageEl) imageEl.value = '';

    const reader = new FileReader();
    reader.onload = e => {
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (wrap) wrap.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function handleAdminEditFileDrop(event) {
    event.preventDefault();
    const zone = document.getElementById('adminEditImageDropZone');
    if (zone) zone.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
        showToast(err, 'error');
        return;
    }
    const input = document.getElementById('adminEditImageFile');
    if (!input) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    previewAdminEditMedia(input);
}

function onAdminEditImageUrlInput(value) {
    const fileInput = document.getElementById('adminEditImageFile');
    if (fileInput?.files?.[0]) return;
    const trimmed = (value || '').trim();
    showAdminEditImagePreview(trimmed, trimmed ? 'Image from URL' : null);
}

function configureAdminEditFields(moduleName) {
    const titleGroup = document.getElementById('adminEditTitleGroup');
    const nameRow = document.getElementById('adminEditNameRow');
    const amountGroup = document.getElementById('adminEditAmountGroup');
    const statusGroup = document.getElementById('adminEditStatusGroup');
    const titleLabel = document.getElementById('adminEditTitleLabel');
    const descLabel = document.getElementById('adminEditDescLabel');

    titleGroup.style.display = 'block';
    nameRow.style.display = 'none';
    amountGroup.style.display = 'none';
    statusGroup.style.display = 'block';
    titleLabel.textContent = 'Title';
    descLabel.textContent = 'Description';

    if (moduleName === 'alumni') {
        titleGroup.style.display = 'none';
        nameRow.style.display = 'flex';
        descLabel.textContent = 'Achievement';
    } else if (moduleName === 'research-areas') {
        titleLabel.textContent = 'Name';
    } else if (moduleName === 'publications') {
        titleLabel.textContent = 'Title';
        descLabel.textContent = 'Authors';
    } else if (moduleName === 'research-labs') {
        titleLabel.textContent = 'Lab Name';
        descLabel.textContent = 'Research Focus';
    } else if (moduleName === 'donations') {
        titleLabel.textContent = 'Donor Name';
        amountGroup.style.display = 'block';
        descLabel.textContent = 'Message';
        statusGroup.style.display = 'none';
    } else if (moduleName === 'donation-tiers') {
        titleLabel.textContent = 'Tier Name';
        descLabel.textContent = 'Description';
    } else if (moduleName === 'endowment-stats') {
        titleLabel.textContent = 'Stat Label';
        descLabel.textContent = 'Display Value';
    } else if (moduleName === 'endowment-campaigns') {
        titleLabel.textContent = 'Campaign Title';
        descLabel.textContent = 'Summary';
    } else if (moduleName === 'endowment-info') {
        titleLabel.textContent = 'Heading';
        descLabel.textContent = 'Body Text';
    } else if (moduleName === 'community-news') {
        titleLabel.textContent = 'Headline';
        descLabel.textContent = 'Article Content';
    } else if (moduleName === 'community-committees') {
        titleLabel.textContent = 'Committee Name';
        descLabel.textContent = 'Description';
    } else if (moduleName === 'community-initiatives') {
        titleLabel.textContent = 'Initiative Title';
        descLabel.textContent = 'Description';
    } else if (moduleName === 'community-reports') {
        titleLabel.textContent = 'Report Title';
        descLabel.textContent = 'Summary';
    }

    const pubExtras = document.getElementById('adminEditPubExtras');
    const labExtras = document.getElementById('adminEditLabExtras');
    const tierExtras = document.getElementById('adminEditDonationTierExtras');
    const campaignExtras = document.getElementById('adminEditEndowmentCampaignExtras');
    if (pubExtras) pubExtras.style.display = moduleName === 'publications' ? 'flex' : 'none';
    if (labExtras) labExtras.style.display = moduleName === 'research-labs' ? 'block' : 'none';
    if (tierExtras) tierExtras.style.display = moduleName === 'donation-tiers' ? 'flex' : 'none';
    if (campaignExtras) campaignExtras.style.display = moduleName === 'endowment-campaigns' ? 'flex' : 'none';

    const imageGroup = document.getElementById('adminEditImageGroup');
    if (imageGroup) imageGroup.style.display = adminEditModuleHasImage(moduleName) ? 'block' : 'none';
}

function populateAdminEditForm(moduleName, item) {
    configureAdminEditFields(moduleName);

    const titleEl = document.getElementById('adminEditTitle');
    const fnEl = document.getElementById('adminEditFirstName');
    const lnEl = document.getElementById('adminEditLastName');
    const descEl = document.getElementById('adminEditDesc');
    const statusEl = document.getElementById('adminEditStatus');
    const amountEl = document.getElementById('adminEditAmount');

    if (moduleName === 'alumni') {
        fnEl.value = item.first_name || '';
        lnEl.value = item.last_name || '';
        descEl.value = item.achievement || item.role || '';
    } else if (moduleName === 'research-areas') {
        titleEl.value = item.name || '';
        descEl.value = item.description || '';
    } else if (moduleName === 'publications') {
        titleEl.value = item.title || '';
        descEl.value = item.authors || '';
        const journalEl = document.getElementById('adminEditJournal');
        const yearEl = document.getElementById('adminEditYear');
        if (journalEl) journalEl.value = item.journal || '';
        if (yearEl) yearEl.value = item.year || '';
    } else if (moduleName === 'research-labs') {
        titleEl.value = item.name || '';
        descEl.value = item.focus || '';
        const directorEl = document.getElementById('adminEditDirector');
        if (directorEl) directorEl.value = item.director || '';
    } else if (moduleName === 'donations') {
        titleEl.value = item.name || '';
        amountEl.value = item.amount != null ? item.amount : '';
        descEl.value = item.message || '';
    } else if (moduleName === 'donation-tiers') {
        titleEl.value = item.name || '';
        descEl.value = item.description || '';
        const tierAmountEl = document.getElementById('adminEditTierAmount');
        const tierIconEl = document.getElementById('adminEditTierIcon');
        if (tierAmountEl) tierAmountEl.value = item.amount || '';
        if (tierIconEl) tierIconEl.value = item.icon || '';
    } else if (moduleName === 'endowment-stats') {
        titleEl.value = item.label || '';
        descEl.value = item.value || '';
    } else if (moduleName === 'endowment-campaigns') {
        titleEl.value = item.title || '';
        descEl.value = item.description || '';
        const goalEl = document.getElementById('adminEditGoalAmount');
        const raisedEl = document.getElementById('adminEditRaisedAmount');
        if (goalEl) goalEl.value = item.goal_amount || '';
        if (raisedEl) raisedEl.value = item.raised_amount || '';
    } else if (moduleName === 'endowment-info') {
        titleEl.value = item.title || '';
        descEl.value = item.description || '';
    } else {
        titleEl.value = item.title || item.name || '';
        descEl.value = item.description || '';
    }

    adminEditExistingImageUrl = item.image || null;
    clearAdminEditMedia();
    if (statusEl) statusEl.value = item.status || 'approved';
}

function buildAdminEditBody(moduleName) {
    const body = {};
    if (adminEditModuleHasImage(moduleName)) {
        const image = document.getElementById('adminEditImage').value.trim();
        if (image) body.image = image;
    }

    if (moduleName === 'alumni') {
        body.first_name = document.getElementById('adminEditFirstName').value.trim();
        body.last_name = document.getElementById('adminEditLastName').value.trim();
        body.achievement = document.getElementById('adminEditDesc').value.trim();
        body.status = document.getElementById('adminEditStatus').value;
    } else if (moduleName === 'research-areas') {
        body.name = document.getElementById('adminEditTitle').value.trim();
        body.description = document.getElementById('adminEditDesc').value.trim();
        body.status = document.getElementById('adminEditStatus').value;
    } else if (moduleName === 'publications') {
        body.title = document.getElementById('adminEditTitle').value.trim();
        body.authors = document.getElementById('adminEditDesc').value.trim();
        body.journal = document.getElementById('adminEditJournal')?.value.trim() || null;
        body.year = document.getElementById('adminEditYear')?.value.trim() || null;
        body.status = document.getElementById('adminEditStatus').value;
    } else if (moduleName === 'research-labs') {
        body.name = document.getElementById('adminEditTitle').value.trim();
        body.focus = document.getElementById('adminEditDesc').value.trim();
        body.director = document.getElementById('adminEditDirector')?.value.trim() || null;
        body.status = document.getElementById('adminEditStatus').value;
    } else if (moduleName === 'donations') {
        body.name = document.getElementById('adminEditTitle').value.trim();
        body.amount = parseFloat(document.getElementById('adminEditAmount').value) || 0;
        body.message = document.getElementById('adminEditDesc').value.trim();
    } else if (moduleName === 'donation-tiers') {
        body.name = document.getElementById('adminEditTitle').value.trim();
        body.description = document.getElementById('adminEditDesc').value.trim();
        body.amount = document.getElementById('adminEditTierAmount')?.value.trim() || '';
        body.icon = document.getElementById('adminEditTierIcon')?.value.trim() || 'gift';
        body.status = document.getElementById('adminEditStatus').value;
    } else if (moduleName === 'endowment-stats') {
        body.label = document.getElementById('adminEditTitle').value.trim();
        body.value = document.getElementById('adminEditDesc').value.trim();
        body.status = document.getElementById('adminEditStatus').value;
    } else if (moduleName === 'endowment-campaigns') {
        body.title = document.getElementById('adminEditTitle').value.trim();
        body.description = document.getElementById('adminEditDesc').value.trim();
        body.goal_amount = document.getElementById('adminEditGoalAmount')?.value.trim() || null;
        body.raised_amount = document.getElementById('adminEditRaisedAmount')?.value.trim() || null;
        body.status = document.getElementById('adminEditStatus').value;
    } else if (moduleName === 'endowment-info') {
        body.title = document.getElementById('adminEditTitle').value.trim();
        body.description = document.getElementById('adminEditDesc').value.trim();
        body.status = document.getElementById('adminEditStatus').value;
    } else {
        body.title = document.getElementById('adminEditTitle').value.trim();
        body.description = document.getElementById('adminEditDesc').value.trim();
        body.status = document.getElementById('adminEditStatus').value;
    }
    return body;
}

function closeAdminEditModal() {
    document.getElementById('adminEditModal').classList.remove('show');
    adminEditContext = { moduleName: null, id: null };
    adminEditExistingImageUrl = null;
    const fileInput = document.getElementById('adminEditImageFile');
    if (fileInput) fileInput.value = '';
}

async function editAdminContent(moduleName, id) {
    const item = await getAdminContentItem(moduleName, id);
    if (!item) { showToast('Item not found.', 'error'); return; }

    adminEditContext = { moduleName, id };
    populateAdminEditForm(moduleName, item);
    document.getElementById('adminEditModalSubtitle').textContent =
        `Editing ${ADMIN_MODULE_LABELS[moduleName] || 'content'} #${id}`;
    document.getElementById('adminEditModal').classList.add('show');
    lucide.createIcons();
}

async function saveAdminEdit() {
    const { moduleName, id } = adminEditContext;
    if (!moduleName || id == null) return;

    const btn = document.getElementById('adminEditSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        const imageInput = document.getElementById('adminEditImageFile');
        if (adminEditModuleHasImage(moduleName) && imageInput?.files?.[0]) {
            const uploadedUrl = await uploadFile(imageInput, 'image', () => {});
            if (uploadedUrl) {
                const imageEl = document.getElementById('adminEditImage');
                if (imageEl) imageEl.value = uploadedUrl;
            }
        }

        const body = buildAdminEditBody(moduleName);
        const apiType = ADMIN_MODULE_API_TYPES[moduleName];
        const res = await apiPut(`/admin/content/${apiType}/${id}`, body);

        if (res.ok) {
            showToast('Content updated successfully!');
            closeAdminEditModal();
            invalidateLinkedAdminNewsCaches(moduleName);
            const editInvalidation = getContentCreateInvalidation(moduleName);
            if (editInvalidation) {
                invalidatePublicContentCache(editInvalidation.cacheKeys);
                if (affectsHomeOrCommunityFeed(moduleName)) loadHomeSection(true);
            }
            reloadAdminModuleAfterCrud(moduleName, { forceRefresh: true });
            loadInitialData({ forceRefresh: true });
            loadAdminStats();
            loadAdminApprovals();
            if (moduleName === 'research-areas' && document.getElementById('research-areas-all')?.classList.contains('active')) {
                loadAllResearchAreasPage(true);
            }
            if (isCommunitySubModule(moduleName)) {
                refreshActiveCommunityAllPages(true);
            }
        } else {
            showToast(res.data?.detail || 'Failed to update content.', 'error');
        }
    } catch (err) {
        showToast(err.message || 'Failed to update content.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Save Changes'; lucide.createIcons(); }
    }
}

async function deleteAdminContent(moduleName, id) {
    if (!confirm('Delete this item? This cannot be undone.')) return;

    const apiType = ADMIN_MODULE_API_TYPES[moduleName];
    const res = await apiDelete(`/admin/content/${apiType}/${id}`);

    if (res.ok) {
        showToast('Content deleted.');
        if (adminContentItemsCache[moduleName]) {
            adminContentItemsCache[moduleName] = adminContentItemsCache[moduleName].filter(i => i.id != id);
        }
        invalidateLinkedAdminNewsCaches(moduleName);
        const deleteInvalidation = getContentCreateInvalidation(moduleName);
        if (deleteInvalidation) {
            invalidatePublicContentCache(deleteInvalidation.cacheKeys);
            if (affectsHomeOrCommunityFeed(moduleName)) loadHomeSection(true);
        }
        if (isDonationsSubModule(moduleName)) invalidateDonationsPublicCache(moduleName);
        reloadAdminModuleAfterCrud(moduleName, { forceRefresh: true });
        loadInitialData({ forceRefresh: true });
        loadAdminStats();
        if (moduleName === 'research-areas' && document.getElementById('research-areas-all')?.classList.contains('active')) {
            loadAllResearchAreasPage(true);
        }
        if (isCommunitySubModule(moduleName)) {
            refreshActiveCommunityAllPages(true);
        }
    } else {
        showToast(res.data?.detail || 'Failed to delete content.', 'error');
    }
}

/* =================== FORMS =================== */
const PUBLIC_JOIN_FORM_ENDPOINTS = {
    innovation: '/forms/innovation-join',
    alumni: '/forms/alumni-join',
    community: '/forms/community-join',
    research: '/forms/research-join',
};

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

function resetPublicForm(type) {
    const container = document.getElementById(type + 'FormContainer');
    if (!container) return;
    container.querySelectorAll('input, textarea').forEach(el => { el.value = ''; });
}

function getPublicJoinFormValues(type) {
    return {
        first_name: document.getElementById(`${type}_fn`)?.value?.trim() || '',
        last_name: document.getElementById(`${type}_ln`)?.value?.trim() || '',
        email: document.getElementById(`${type}_email`)?.value?.trim() || '',
        phone: document.getElementById(`${type}_phone`)?.value?.trim() || '',
        details: document.getElementById(`${type}_details`)?.value?.trim() || '',
    };
}

function validatePublicJoinForm(values) {
    if (!values.first_name || !values.last_name || !values.email) {
        return 'Please fill in first name, last name, and email.';
    }
    if (!isValidEmail(values.email)) {
        return 'Please enter a valid email address.';
    }
    return null;
}

function getFormHTML(type) {
    if (type === 'donation') {
        return `
        <div class="form-row">
            <div class="form-group"><label>Full Name *</label><input type="text" id="don_name" placeholder="Your name"></div>
            <div class="form-group"><label>Amount (USD) *</label><input type="number" id="don_amount" placeholder="e.g. 1000"></div>
        </div>
        <div class="form-group"><label>Message</label><textarea id="don_msg" rows="3" placeholder="Optional message..."></textarea></div>
        <button class="btn-primary" onclick="submitDonation()"><i data-lucide="heart"></i> Pledge Donation</button>`;
    }
    return `
    <div class="form-row">
        <div class="form-group"><label>First Name *</label><input type="text" id="${type}_fn" placeholder="First name"></div>
        <div class="form-group"><label>Last Name *</label><input type="text" id="${type}_ln" placeholder="Last name"></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label>Email *</label><input type="email" id="${type}_email" placeholder="email@iuea.ac.ug"></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="${type}_phone" placeholder="+256..."></div>
    </div>
    <div class="form-group"><label>Details</label><textarea id="${type}_details" rows="3" placeholder="Tell us more..."></textarea></div>
    <button class="btn-primary" onclick="submitGenericForm('${type}')"><i data-lucide="send"></i> Submit Registration</button>`;
}

async function submitDonation() {
    const name = document.getElementById('don_name')?.value?.trim();
    const amountRaw = document.getElementById('don_amount')?.value;
    const amount = parseFloat(amountRaw);
    const message = document.getElementById('don_msg')?.value?.trim() || '';
    if (!name) {
        showToast('Please enter your full name.', 'error');
        return;
    }
    if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid donation amount in USD.', 'error');
        return;
    }
    const res = await apiPost('/forms/donation-pledge', { name, amount, message: message || null }, false);
    if (res.ok) {
        showToast('Thank you for your generosity!');
        resetPublicForm('donation');
        closeForm('donation');
    } else {
        const detail = res.data?.detail;
        const msg = typeof detail === 'string' ? detail : 'Donation submission failed. Please try again.';
        showToast(msg, 'error');
    }
}

async function submitGenericForm(type) {
    const endpoint = PUBLIC_JOIN_FORM_ENDPOINTS[type];
    if (!endpoint) {
        showToast('Unknown form type.', 'error');
        return;
    }
    const values = getPublicJoinFormValues(type);
    const validationError = validatePublicJoinForm(values);
    if (validationError) {
        showToast(validationError, 'error');
        return;
    }
    const body = {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone: values.phone || null,
        details: values.details || null,
    };
    const res = await apiPost(endpoint, body, false);
    if (res.ok) {
        showToast('Registration submitted! We will be in touch soon.');
        resetPublicForm(type);
        closeForm(type);
    } else {
        const detail = res.data?.detail;
        const msg = typeof detail === 'string' ? detail : 'Submission failed. Please try again.';
        showToast(msg, 'error');
    }
}

const SHARE_PAGE_MAP = {
    news: 'home',
    events: 'home',
    alumni: 'alumni',
    innovations: 'innovation',
    startups: 'innovation',
    community: 'community',
    'research-areas': 'research',
    publications: 'research',
    'research-labs': 'research',
    'tech-park': 'techpark',
    techpark: 'techpark',
    'endowment-campaigns': 'endowment',
};

const SHARE_PLATFORM_SVGS = {
    facebook: '<svg class="share-brand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    twitter: '<svg class="share-brand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
    whatsapp: '<svg class="share-brand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
    linkedin: '<svg class="share-brand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
};

const SHARE_PLATFORMS = [
    { id: 'facebook', label: 'Facebook', className: 'share-fb' },
    { id: 'twitter', label: 'X (Twitter)', className: 'share-x' },
    { id: 'whatsapp', label: 'WhatsApp', className: 'share-wa' },
    { id: 'linkedin', label: 'LinkedIn', className: 'share-li' },
    { id: 'telegram', label: 'Telegram', icon: 'send', className: 'share-tg' },
    { id: 'copy', label: 'Copy Link', icon: 'link', className: 'share-copy' },
];

function sharePlatformIconHtml(platform) {
    if (SHARE_PLATFORM_SVGS[platform.id]) return SHARE_PLATFORM_SVGS[platform.id];
    return `<i data-lucide="${platform.icon}"></i>`;
}

let shareModalState = { url: '', title: '', text: '' };

function buildShareUrl(type, id) {
    const page = SHARE_PAGE_MAP[type] || 'home';
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('page', page);
    url.searchParams.set('share', type);
    url.searchParams.set('id', String(id));
    return url.toString();
}

function buildShareText(title, description) {
    const parts = [(title || 'IUEA Today').trim()];
    const desc = (description || '').trim();
    if (desc) parts.push(truncateText(desc, 160));
    parts.push('IUEA Today');
    return parts.join(' — ');
}

function getSharePlatformUrl(platformId, url, text) {
    switch (platformId) {
        case 'facebook':
            return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        case 'twitter':
            return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        case 'whatsapp':
            return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
        case 'linkedin':
            return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        case 'telegram':
            return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        default:
            return url;
    }
}

function renderSharePlatforms() {
    const grid = document.getElementById('sharePlatformsGrid');
    if (!grid) return;
    grid.innerHTML = SHARE_PLATFORMS.map(p => `
        <button type="button" class="share-platform-btn ${p.className}" onclick="shareToPlatform('${p.id}')" aria-label="Share on ${p.label}">
            <span class="share-platform-icon">${sharePlatformIconHtml(p)}</span>
            <span class="share-platform-label">${p.label}</span>
        </button>`).join('');
    refreshIconsIn(grid);
}

function openShareModal({ url, title, text }) {
    shareModalState = { url, title, text };

    const contextEl = document.getElementById('shareModalContext');
    const urlInput = document.getElementById('shareUrlPreview');
    if (contextEl) contextEl.textContent = title;
    if (urlInput) urlInput.value = url;

    renderSharePlatforms();
    document.getElementById('shareModal')?.classList.add('show');
    if (document.getElementById('navLinks')?.classList.contains('open')) toggleMobileNav();
    refreshIconsIn(document.getElementById('shareModal'));
}

function closeShareModal() {
    document.getElementById('shareModal')?.classList.remove('show');
    shareModalState = { url: '', title: '', text: '' };
}

function handleShareModalBackdrop(event) {
    if (event.target.id === 'shareModal') closeShareModal();
}

async function copyShareLink() {
    const url = shareModalState.url;
    if (!url) return;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
        } else {
            const input = document.getElementById('shareUrlPreview');
            if (input) {
                input.select();
                document.execCommand('copy');
            }
        }
        showToast('Link copied to clipboard!');
    } catch {
        showToast('Could not copy link', 'error');
    }
}

function shareToPlatform(platformId) {
    const { url, text } = shareModalState;
    if (!url) return;

    if (platformId === 'copy') {
        copyShareLink();
        return;
    }

    const shareUrl = getSharePlatformUrl(platformId, url, text);
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=520');
}

async function shareContent(type, id, title, description) {
    const shareUrl = buildShareUrl(type, id);
    const shareTitle = (title || getCardTitleFromDom(type, id) || 'IUEA Today').trim();
    const shareText = buildShareText(shareTitle, description);

    if (navigator.share) {
        try {
            await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
            return;
        } catch (err) {
            if (err?.name === 'AbortError') return;
        }
    }

    openShareModal({ url: shareUrl, title: shareTitle, text: shareText });
}

let cardDetailModalState = { type: null, id: null, title: '', description: '' };
let cardDetailClickInitialized = false;

function normalizeCardDetailType(type) {
    const raw = String(type || '').trim();
    const aliases = {
        event: 'events',
        innovation: 'innovations',
        startup: 'startups',
        techpark: 'tech-park',
        'community-news': 'community',
        'community-committees': 'community',
        'community-initiatives': 'community',
        'community-reports': 'community',
    };
    return aliases[raw] || raw || 'news';
}

function cardDetailCacheCandidates(type) {
    const normalized = normalizeCardDetailType(type);
    const map = {
        news: ['news', 'innovationNews', 'startupNews', 'alumniNews', 'communityNews'],
        community: ['communityNews', 'community', 'news'],
        events: ['events'],
        alumni: ['alumni'],
        innovations: ['innovations'],
        startups: ['startups'],
        'research-areas': ['researchAreas'],
        publications: ['publications'],
        'research-labs': ['researchLabs'],
        'tech-park': ['techPark'],
        'endowment-campaigns': ['endowmentCampaigns'],
    };
    const keys = map[normalized] || [normalized];
    const publicItems = keys.flatMap(key => Array.isArray(publicContentCache[key]) ? publicContentCache[key] : []);
    const allPageItems = {
        news: allNewsCache,
        events: allEventsCache,
        community: [
            ...(Array.isArray(allCommunityNewsCache) ? allCommunityNewsCache : []),
            ...(Array.isArray(allCommunityCommitteesCache) ? allCommunityCommitteesCache : []),
            ...(Array.isArray(allCommunityInitiativesCache) ? allCommunityInitiativesCache : []),
            ...(Array.isArray(allCommunityReportsCache) ? allCommunityReportsCache : []),
        ],
        'research-areas': allResearchAreasCache,
        'endowment-campaigns': allEndowmentCampaignsCache,
    };
    const extraItems = allPageItems[normalized];
    if (Array.isArray(extraItems)) return [...publicItems, ...extraItems];
    return publicItems;
}

function findCachedCardDetailItem(type, id) {
    if (!id) return null;
    return cardDetailCacheCandidates(type).find(item => String(item?.id) === String(id)) || null;
}

function getCardDetailTitle(item, card) {
    if (item) {
        return alumniDisplayName(item)
            || item.title
            || item.name
            || `${item.first_name || ''} ${item.last_name || ''}`.trim()
            || 'Untitled';
    }
    return card?.querySelector('.card-content h3')?.textContent.trim() || 'Untitled';
}

function getCardDetailDescription(item, card) {
    if (item) {
        if (item.description) return item.description;
        if (item.achievement || item.role) return [item.achievement, item.role].filter(Boolean).join('\n');
        if (item.focus) return item.focus;
        if (item.category) return item.category;
        if (item.journal || item.year) return [item.journal, item.year].filter(Boolean).join(' · ');
    }
    return card?.querySelector('.card-content p')?.textContent.trim() || '';
}

function getCardDetailBadge(item, card, type) {
    return item?.badge
        || item?.category
        || item?.type
        || card?.querySelector('.card-badge')?.textContent.trim()
        || normalizeCardDetailType(type).replace(/-/g, ' ');
}

function getCardDetailMeta(item, card) {
    const fields = [
        item?.date,
        item?.location,
        item?.year ? `Class of ${item.year}` : '',
        item?.authors,
        item?.director ? `Director: ${item.director}` : '',
        item?.goal_amount ? `Goal: ${item.goal_amount}` : '',
        item?.raised_amount ? `Raised: ${item.raised_amount}` : '',
    ].filter(Boolean);

    if (fields.length) return [...new Set(fields)];

    return Array.from(card?.querySelectorAll('.card-stats-row .stat-pill') || [])
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .slice(0, 4);
}

function getCardDetailMedia(item, card) {
    const cardVideo = card?.querySelector('.card-media video');
    const cardImage = card?.querySelector('.card-media img');
    const image = resolveMediaUrl(item?.image || item?.image_url || item?.profile_image) || cardImage?.currentSrc || cardImage?.src || '';
    const video = resolveMediaUrl(item?.video || item?.video_url) || cardVideo?.currentSrc || cardVideo?.src || '';
    const poster = image || cardVideo?.poster || '';
    return { image, video, poster };
}

function cardDetailFromCard(card) {
    if (!card) return null;
    const type = normalizeCardDetailType(card.dataset.contentType);
    const id = card.dataset.contentId;
    const item = findCachedCardDetailItem(type, id);
    return {
        type,
        id,
        title: getCardDetailTitle(item, card),
        description: getCardDetailDescription(item, card),
        badge: getCardDetailBadge(item, card, type),
        meta: getCardDetailMeta(item, card),
        media: getCardDetailMedia(item, card),
    };
}

function renderCardDetailMedia(detail) {
    const { image, video, poster } = detail.media || {};
    const safeTitle = escapeHtml(detail.title);
    if (video) {
        return `<video class="card-detail-media-el" src="${escapeHtml(video)}" poster="${escapeHtml(poster || image || '')}" controls playsinline></video>`;
    }
    if (image) {
        return `<img class="card-detail-media-el" src="${escapeHtml(image)}" alt="${safeTitle}" loading="lazy" decoding="async">`;
    }
    return `<div class="card-detail-media-empty"><i data-lucide="image"></i><span>No media available</span></div>`;
}

function renderCardDetailShareActions(detail) {
    return SHARE_PLATFORMS.map(platform => `
        <button type="button" class="card-detail-share-btn ${platform.className}" onclick="event.stopPropagation(); shareToPlatform('${platform.id}')" aria-label="Share on ${escapeHtml(platform.label)}">
            <span class="share-platform-icon">${sharePlatformIconHtml(platform)}</span>
        </button>`).join('');
}

function renderCardDetailActions(detail) {
    const typeArg = jsStringLiteral(detail.type);
    const titleArg = jsStringLiteral(detail.title);
    const descArg = jsStringLiteral(truncateText(detail.description || '', 200));
    const idArg = /^\d+$/.test(String(detail.id)) ? String(Number(detail.id)) : jsStringLiteral(detail.id);
    const likeCall = detail.type === 'alumni' ? `likeAlumni(${idArg})` : `likeContent(${typeArg}, ${idArg})`;
    const commentCall = `closeCardDetailModal(); commentContent(${typeArg}, ${idArg})`;
    const saveCall = `saveContent(${typeArg}, ${idArg})`;
    const shareCall = `openCardDetailSharePanel(${typeArg}, ${idArg}, ${titleArg}, ${descArg})`;

    return `
        <button type="button" onclick="event.stopPropagation(); ${likeCall}"><i data-lucide="heart"></i> Like</button>
        <button type="button" onclick="event.stopPropagation(); ${commentCall}"><i data-lucide="message-circle"></i> Comment</button>
        <button type="button" onclick="event.stopPropagation(); ${shareCall}"><i data-lucide="share-2"></i> Share</button>
        <button type="button" onclick="event.stopPropagation(); ${saveCall}"><i data-lucide="bookmark"></i> Save</button>`;
}

function openCardDetailSharePanel(type, id, title, description) {
    closeCardDetailModal();
    openShareModal({
        url: buildShareUrl(type, id),
        title: title || getCardTitleFromDom(type, id) || 'IUEA Today',
        text: buildShareText(title, description),
    });
}

function openCardDetailFromCard(card) {
    const detail = cardDetailFromCard(card);
    if (!detail || !detail.id) return;

    const modal = document.getElementById('cardDetailModal');
    const media = document.getElementById('cardDetailMedia');
    const badge = document.getElementById('cardDetailBadge');
    const title = document.getElementById('cardDetailTitle');
    const desc = document.getElementById('cardDetailDescription');
    const meta = document.getElementById('cardDetailMeta');
    const actions = document.getElementById('cardDetailActions');
    const share = document.getElementById('cardDetailShareActions');
    if (!modal || !media || !title || !desc || !actions || !share) return;

    cardDetailModalState = {
        type: detail.type,
        id: detail.id,
        title: detail.title,
        description: detail.description,
    };
    shareModalState = {
        url: buildShareUrl(detail.type, detail.id),
        title: detail.title,
        text: buildShareText(detail.title, detail.description),
    };

    media.innerHTML = renderCardDetailMedia(detail);
    if (badge) badge.textContent = detail.badge;
    title.textContent = detail.title;
    desc.innerHTML = escapeHtml(detail.description || 'No description available.').replace(/\n/g, '<br>');
    if (meta) {
        meta.innerHTML = detail.meta.map(item => `<span>${escapeHtml(item)}</span>`).join('');
        meta.hidden = !detail.meta.length;
    }
    actions.innerHTML = renderCardDetailActions(detail);
    share.innerHTML = renderCardDetailShareActions(detail);

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    if (document.getElementById('navLinks')?.classList.contains('open')) toggleMobileNav();
    refreshIconsIn(modal);
}

function closeCardDetailModal() {
    const modal = document.getElementById('cardDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    modal.querySelectorAll('video').forEach(video => video.pause());
    cardDetailModalState = { type: null, id: null, title: '', description: '' };
}

function handleCardDetailBackdrop(event) {
    if (event.target.id === 'cardDetailModal') closeCardDetailModal();
}

function handleModernCardDetailClick(event) {
    const card = event.target.closest('.modern-card[data-content-type][data-content-id]');
    if (!card || event.target.closest(CARD_DETAIL_INTERACTIVE_SELECTOR)) return;
    openCardDetailFromCard(card);
}

function initCardDetailModal() {
    if (cardDetailClickInitialized) return;
    document.addEventListener('click', handleModernCardDetailClick);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('cardDetailModal')?.classList.contains('show')) {
            closeCardDetailModal();
        }
    });
    cardDetailClickInitialized = true;
}

function scrollToSharedCard(type, id) {
    const card = document.querySelector(`.modern-card[data-content-type="${type}"][data-content-id="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('share-highlight');
    setTimeout(() => card.classList.remove('share-highlight'), 2500);
}

function handleShareDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const shareType = params.get('share');
    const shareId = params.get('id');
    if (page) navigateTo(page);
    if (shareType && shareId) {
        setTimeout(() => scrollToSharedCard(shareType, shareId), 600);
    }
}

async function likeAlumni(id) {
    const res = await apiPost(`/content/alumni/${id}/like`, {}, false);
    if (res.ok && res.data?.likes !== undefined) {
        updateCardEngagementStat('alumni', id, 'heart', `${res.data.likes} likes`);
        showToast(res.queued ? 'Like saved offline — will sync when online.' : 'Thanks for the like!', res.queued ? 'info' : 'success');
    } else {
        showToast('Could not like this profile', 'error');
    }
}

async function likeContent(type, id) {
    const apiType = commentApiPath(type);
    const res = await apiPost(`/content/${apiType}/${id}/like`, {}, false);
    if (res.ok && res.data?.likes !== undefined) {
        updateCardEngagementStat(type, id, 'heart', `${res.data.likes} likes`);
        showToast(res.queued ? 'Like saved offline — will sync when online.' : 'Thanks for the like!', res.queued ? 'info' : 'success');
    } else {
        showToast('Could not like this item', 'error');
    }
}

const COMMENT_CHAR_LIMIT = 500;
let commentModalState = { type: null, id: null, title: null };

function getCardTitleFromDom(type, id) {
    const card = document.querySelector(`.modern-card[data-content-type="${type}"][data-content-id="${id}"]`);
    if (!card) return 'Untitled';
    const heading = card.querySelector('.card-content h3');
    return heading ? heading.textContent.trim() : 'Untitled';
}

function getCommentAuthorInitial(name) {
    const n = (name || 'A').trim();
    return n.charAt(0).toUpperCase();
}

function formatCommentDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMins = Math.floor((now - d) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderCommentItem(comment, options = {}) {
    const { newsId = null, allowReply = false, depth = 0 } = options;
    const author = comment.author_name || 'Community member';
    const date = formatCommentDate(comment.created_at);
    const isNested = depth > 0;
    const replyBtn = allowReply && newsId && currentUser
        ? `<button type="button" class="comment-reply-btn" onclick="toggleNewsReplyForm(${newsId}, ${comment.id}, 'modal')">Reply</button>`
        : '';
    const replyFormHtml = allowReply && newsId
        ? renderNewsReplyForm(newsId, comment.id, 'modal')
        : '';
    const repliesHtml = Array.isArray(comment.replies) && comment.replies.length
        ? `<div class="comment-replies">${comment.replies.map(r => renderCommentItem(r, { ...options, depth: depth + 1 })).join('')}</div>`
        : '';

    return `
        <div class="comment-item${isNested ? ' comment-item-reply' : ''}" data-comment-id="${comment.id}">
            <div class="comment-item-avatar" aria-hidden="true">${getCommentAuthorInitial(author)}</div>
            <div class="comment-item-body">
                <div class="comment-item-meta">
                    <span class="comment-item-author">${escapeHtml(author)}</span>
                    ${date ? `<span class="comment-item-date">${escapeHtml(date)}</span>` : ''}
                </div>
                <p class="comment-item-message">${escapeHtml(comment.message || '')}</p>
                ${replyBtn}
                ${replyFormHtml}
                ${repliesHtml}
            </div>
        </div>`;
}

function renderRuStoryComment(comment, newsId, depth = 0) {
    const author = comment.author_name || 'Community member';
    const isNested = depth > 0;
    const replyBtn = currentUser
        ? `<button type="button" class="comment-reply-btn" onclick="toggleNewsReplyForm(${newsId}, ${comment.id}, 'ru')">Reply</button>`
        : '';
    const replyFormHtml = renderNewsReplyForm(newsId, comment.id, 'ru');
    const repliesHtml = Array.isArray(comment.replies) && comment.replies.length
        ? `<ul class="ru-story-comment-replies">${comment.replies.map(r => `<li>${renderRuStoryComment(r, newsId, depth + 1)}</li>`).join('')}</ul>`
        : '';

    return `
        <div class="ru-story-comment${isNested ? ' ru-story-comment-reply' : ''}" data-comment-id="${comment.id}">
            <div class="ru-story-comment-meta">
                <strong>${escapeHtml(author)}</strong>
                <span>${formatShortDate(comment.created_at)}</span>
            </div>
            <p>${escapeHtml(comment.message || '')}</p>
            ${replyBtn}
            ${replyFormHtml}
            ${repliesHtml}
        </div>`;
}

function newsReplyFormId(newsId, commentId, context) {
    return `news-reply-form-${context}-${newsId}-${commentId}`;
}

function newsReplyInputId(newsId, commentId, context) {
    return `news-reply-input-${context}-${newsId}-${commentId}`;
}

function newsReplyCountId(newsId, commentId, context) {
    return `news-reply-count-${context}-${newsId}-${commentId}`;
}

function renderNewsReplyForm(newsId, commentId, context) {
    const formId = newsReplyFormId(newsId, commentId, context);
    const inputId = newsReplyInputId(newsId, commentId, context);
    const countId = newsReplyCountId(newsId, commentId, context);
    return `
        <div class="comment-reply-form hidden" id="${formId}">
            <textarea id="${inputId}" rows="2" maxlength="${COMMENT_CHAR_LIMIT}"
                placeholder="Write a reply…"
                oninput="updateNewsReplyCharCount(${newsId}, ${commentId}, '${context}')"></textarea>
            <div class="comment-reply-form-actions">
                <span id="${countId}" class="comment-char-count">0 / ${COMMENT_CHAR_LIMIT}</span>
                <div class="comment-reply-form-buttons">
                    <button type="button" class="comment-reply-cancel" onclick="toggleNewsReplyForm(${newsId}, ${commentId}, '${context}', true)">Cancel</button>
                    <button type="button" class="btn-primary comment-reply-post" onclick="postNewsReply(${newsId}, ${commentId}, '${context}')">
                        <i data-lucide="send"></i> Post Reply
                    </button>
                </div>
            </div>
        </div>`;
}

function toggleNewsReplyForm(newsId, commentId, context, forceClose = false) {
    const formId = newsReplyFormId(newsId, commentId, context);
    const form = document.getElementById(formId);
    if (!form) return;

    if (!currentUser) {
        showAuthModal();
        return;
    }

    const shouldOpen = forceClose ? false : form.classList.contains('hidden');
    document.querySelectorAll('.comment-reply-form').forEach(el => el.classList.add('hidden'));

    if (shouldOpen) {
        form.classList.remove('hidden');
        const input = document.getElementById(newsReplyInputId(newsId, commentId, context));
        input?.focus();
    }
}

function updateNewsReplyCharCount(newsId, commentId, context) {
    const input = document.getElementById(newsReplyInputId(newsId, commentId, context));
    const counter = document.getElementById(newsReplyCountId(newsId, commentId, context));
    if (!input || !counter) return;
    const len = input.value.length;
    counter.textContent = `${len} / ${COMMENT_CHAR_LIMIT}`;
    counter.classList.toggle('near-limit', len >= COMMENT_CHAR_LIMIT - 50 && len < COMMENT_CHAR_LIMIT);
    counter.classList.toggle('at-limit', len >= COMMENT_CHAR_LIMIT);
}

async function postNewsReply(newsId, parentId, context) {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    const inputId = newsReplyInputId(newsId, parentId, context);
    const input = document.getElementById(inputId);
    const message = input?.value.trim();
    if (!message) {
        showToast('Please write a reply.', 'error');
        input?.focus();
        return;
    }
    if (message.length > COMMENT_CHAR_LIMIT) {
        showToast(`Reply must be ${COMMENT_CHAR_LIMIT} characters or fewer.`, 'error');
        return;
    }

    const postBtn = document.querySelector(`#${newsReplyFormId(newsId, parentId, context)} .comment-reply-post`);
    if (postBtn) postBtn.disabled = true;

    const res = await apiPost(`/content/news/${newsId}/comment`, { message, parent_id: parentId });

    if (postBtn) postBtn.disabled = false;

    if (res.ok) {
        showToast(res.queued ? 'Reply saved offline — will sync when online.' : 'Reply posted!', res.queued ? 'info' : 'success');
        if (!res.queued) {
            if (context === 'modal') {
                await loadContentComments('news', newsId);
            } else {
                await loadRuSharedStories();
            }
        }
    } else {
        const detail = res.data?.detail;
        showToast(typeof detail === 'string' ? detail : 'Could not post reply', 'error');
    }
}

function updateCommentFormVisibility() {
    const form = document.getElementById('contentCommentForm');
    const loginPrompt = document.getElementById('contentCommentLoginPrompt');
    const userNameEl = document.getElementById('contentCommentUserName');
    const avatarEl = document.getElementById('contentCommentUserAvatar');

    if (currentUser) {
        form?.classList.remove('hidden');
        loginPrompt?.classList.add('hidden');
        const name = getUserDisplayName(currentUser) || 'You';
        if (userNameEl) userNameEl.textContent = name;
        if (avatarEl) avatarEl.textContent = getCommentAuthorInitial(name);
    } else {
        form?.classList.add('hidden');
        loginPrompt?.classList.remove('hidden');
    }
}

function updateCommentCharCount() {
    const input = document.getElementById('contentCommentInput');
    const counter = document.getElementById('contentCommentCharCount');
    if (!input || !counter) return;
    const len = input.value.length;
    counter.textContent = `${len} / ${COMMENT_CHAR_LIMIT}`;
    counter.classList.toggle('near-limit', len >= COMMENT_CHAR_LIMIT - 50 && len < COMMENT_CHAR_LIMIT);
    counter.classList.toggle('at-limit', len >= COMMENT_CHAR_LIMIT);
}

function closeCommentModal() {
    document.getElementById('contentCommentModal')?.classList.remove('show');
    commentModalState = { type: null, id: null, title: null };
}

function handleCommentModalBackdrop(event) {
    if (event.target.id === 'contentCommentModal') closeCommentModal();
}

async function loadContentComments(type, id) {
    const listEl = document.getElementById('contentCommentList');
    if (!listEl) return;

    listEl.innerHTML = `
        <div class="comment-loading">
            <span class="grid-loading-spinner" aria-hidden="true"></span>
            <span>Loading comments…</span>
        </div>`;

    const apiType = commentApiPath(type);
    try {
        const headers = authToken ? { Authorization: `Bearer ${authToken}`, 'ngrok-skip-browser-warning': 'true' } : { 'ngrok-skip-browser-warning': 'true' };
        const res = await fetch(`${API_BASE_URL}/content/${apiType}/${id}/comments`, { headers });
        if (!res.ok) {
            listEl.innerHTML = `<div class="comment-empty"><p>Could not load comments. Please try again.</p></div>`;
            return;
        }
        const comments = await res.json();
        const allowReply = type === 'news';
        if (!Array.isArray(comments) || comments.length === 0) {
            listEl.innerHTML = `
                <div class="comment-empty">
                    <i data-lucide="message-circle"></i>
                    <p>No comments yet. Be the first to share your thoughts!</p>
                </div>`;
        } else {
            listEl.innerHTML = comments.map(c => renderCommentItem(c, { newsId: id, allowReply })).join('');
        }
        refreshIconsIn(listEl);
    } catch (e) {
        console.error('Comments load error:', e);
        listEl.innerHTML = `<div class="comment-empty"><p>Could not load comments. Please try again.</p></div>`;
    }
}

async function commentContent(type, id) {
    commentModalState = { type, id, title: getCardTitleFromDom(type, id) };

    const contextEl = document.getElementById('contentCommentContext');
    const titleEl = document.getElementById('contentCommentTitle');
    if (contextEl) contextEl.textContent = commentModalState.title;
    if (titleEl) titleEl.innerHTML = '<i data-lucide="message-circle"></i> Comments';

    updateCommentFormVisibility();

    const input = document.getElementById('contentCommentInput');
    const postBtn = document.getElementById('contentCommentPostBtn');
    if (input) {
        input.value = '';
        input.disabled = false;
    }
    if (postBtn) postBtn.disabled = false;
    updateCommentCharCount();

    document.getElementById('contentCommentModal')?.classList.add('show');
    if (document.getElementById('navLinks')?.classList.contains('open')) toggleMobileNav();

    await loadContentComments(type, id);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function postContentComment() {
    if (!currentUser) {
        closeCommentModal();
        showAuthModal();
        return;
    }

    const input = document.getElementById('contentCommentInput');
    const message = input?.value.trim();
    if (!message) {
        showToast('Please write a comment.', 'error');
        input?.focus();
        return;
    }
    if (message.length > COMMENT_CHAR_LIMIT) {
        showToast(`Comment must be ${COMMENT_CHAR_LIMIT} characters or fewer.`, 'error');
        return;
    }

    const { type, id } = commentModalState;
    if (!type || !id) return;

    const postBtn = document.getElementById('contentCommentPostBtn');
    if (postBtn) postBtn.disabled = true;

    const apiType = commentApiPath(type);
    const res = await apiPost(`/content/${apiType}/${id}/comment`, { message });

    if (postBtn) postBtn.disabled = false;

    if (res.ok && res.data) {
        if (input) input.value = '';
        updateCommentCharCount();

        const listEl = document.getElementById('contentCommentList');
        if (listEl && type === 'news' && !res.queued) {
            await loadContentComments(type, id);
        } else if (listEl) {
            const emptyState = listEl.querySelector('.comment-empty');
            if (emptyState) listEl.innerHTML = '';
            listEl.insertAdjacentHTML('afterbegin', renderCommentItem(res.data));
        }

        if (res.data.comments_count !== undefined) {
            updateCardEngagementStat(type, id, 'message-circle', `${res.data.comments_count} comments`);
        }
        showToast(res.queued ? 'Comment saved offline — will sync when online.' : 'Comment posted!', res.queued ? 'info' : 'success');
    } else {
        const detail = res.data?.detail;
        showToast(typeof detail === 'string' ? detail : 'Could not post comment', 'error');
    }
}

async function commentEvent(id) {
    return commentContent('events', id);
}

/* =================== AUTH =================== */
function showAuthModal() {
    document.getElementById('authModal').classList.add('show');
    if (document.getElementById('navLinks').classList.contains('open')) toggleMobileNav();
}
function closeAuthModal() { document.getElementById('authModal').classList.remove('show'); }
function closeDetailModal() { document.getElementById('detailModal').classList.remove('show'); }

/* =================== AUTHOR PROFILE MODAL =================== */
let authorProfileState = {
    userId: null,
    profile: null,
    fallbackName: '',
    contentType: null,
    contentId: null,
    isFollowingItem: false,
};

function formatMemberSince(value) {
    if (!value) return 'Recently joined';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Recently joined';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function setAuthorProfileFollowButton(isFollowing, disabled = false) {
    const followBtn = document.getElementById('authorProfileFollowBtn');
    if (!followBtn) return;
    followBtn.disabled = disabled;
    followBtn.classList.toggle('is-following', !!isFollowing);
    followBtn.innerHTML = isFollowing
        ? '<i data-lucide="heart"></i> Following Item'
        : '<i data-lucide="heart"></i> Follow Item';
}

function renderAuthorProfileModal(profile) {
    const name = profile?.name || authorProfileState.fallbackName || 'Community member';
    const role = profile?.role ? formatRoleShort(profile.role) : 'Community member';
    const initial = msgInitials(name, '');
    const memberSince = formatMemberSince(profile?.member_since);
    const storiesCount = profile?.stories_count ?? 0;
    const bio = profile?.bio || 'IUEA community member';
    const isSelf = currentUser && profile?.id === currentUser.id;
    const isFollowingItem = !!authorProfileState.isFollowingItem;
    const hasItemContext = !!(authorProfileState.contentType && authorProfileState.contentId);

    document.getElementById('authorProfileAvatar').textContent = initial;
    document.getElementById('authorProfileName').textContent = name;
    document.getElementById('authorProfileRole').textContent = role;
    document.getElementById('authorProfileMemberSince').textContent = memberSince;
    document.getElementById('authorProfileStoriesCount').textContent =
        `${storiesCount} stor${storiesCount === 1 ? 'y' : 'ies'} shared`;
    document.getElementById('authorProfileBio').textContent = bio;

    const actions = document.getElementById('authorProfilePrimaryActions');
    const msgBtn = document.getElementById('authorProfileMessageBtn');
    const followBtn = document.getElementById('authorProfileFollowBtn');
    const storiesLink = document.getElementById('authorProfileStoriesLink');

    if (actions) actions.style.display = isSelf ? 'none' : '';
    if (msgBtn) msgBtn.disabled = false;
    if (followBtn) {
        followBtn.hidden = !hasItemContext;
        if (hasItemContext) {
            setAuthorProfileFollowButton(isFollowingItem, false);
        }
    }
    if (storiesLink) {
        storiesLink.hidden = !(storiesCount > 0 && !isSelf);
    }
    refreshIconsIn(document.getElementById('authorProfileModal'));
}

async function followItemFromProfile() {
    const { contentType, contentId } = authorProfileState;
    if (!contentType || !contentId) return;

    if (!currentUser) {
        closeAuthorProfileModal();
        showAuthModal();
        return;
    }

    const followBtn = document.getElementById('authorProfileFollowBtn');
    if (followBtn) followBtn.disabled = true;

    const res = await apiPost('/content/follow-item', {
        content_type: contentType,
        content_id: contentId,
    });
    if (!res.ok) {
        const detail = res.data?.detail;
        showToast(typeof detail === 'string' ? detail : 'Could not update follow status.', 'error');
        if (followBtn) followBtn.disabled = false;
        return;
    }

    authorProfileState.isFollowingItem = res.data.following;
    const followKey = followedKey(authorProfileState.contentType, authorProfileState.contentId);
    if (res.data.following) followedContentKeys.add(followKey);
    else followedContentKeys.delete(followKey);
    setAuthorProfileFollowButton(res.data.following, false);
    refreshIconsIn(document.getElementById('authorProfileModal'));
    showToast(
        res.data.following ? 'You are now following this item.' : 'Item unfollowed.',
        'success'
    );

    const statFollowed = document.getElementById('ru-stat-followed');
    if (statFollowed && typeof res.data.count === 'number') {
        statFollowed.textContent = res.data.count;
    }
    refreshIconsIn(document.getElementById('authorProfileModal'));
}

function viewAuthorStories() {
    const authorId = authorProfileState.userId;
    const profile = authorProfileState.profile;
    const authorName = profile?.name || authorProfileState.fallbackName || 'Community member';
    closeAuthorProfileModal();
    navigateTo('home');
    setTimeout(() => {
        const grid = document.getElementById('newsGrid');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (authorId) {
            showToast(`Showing stories from ${authorName}.`, 'info');
        }
    }, 150);
}

async function openAuthorProfileModal(authorId, authorName, contentType, contentId) {
    if (!authorId) return;
    authorProfileState = {
        userId: authorId,
        profile: null,
        fallbackName: authorName || '',
        contentType: contentType || null,
        contentId: contentId ? Number(contentId) : null,
        isFollowingItem: false,
    };

    renderAuthorProfileModal({ name: authorName, role: '', stories_count: 0 });
    document.getElementById('authorProfileModal')?.classList.add('show');
    refreshIconsIn(document.getElementById('authorProfileModal'));

    const profilePromise = apiGet(`/auth/users/${authorId}/profile`);
    const profile = await profilePromise;

    if (currentUser && authToken && authorProfileState.contentType && authorProfileState.contentId) {
        if (!userEngagementLoaded) await loadUserEngagementState();
        authorProfileState.isFollowingItem = isContentFollowed(
            authorProfileState.contentType,
            authorProfileState.contentId
        );
    }

    if (profile && profile.id) {
        authorProfileState.profile = profile;
    }

    renderAuthorProfileModal(authorProfileState.profile || { name: authorName, role: '', stories_count: 0 });
}

function closeAuthorProfileModal() {
    document.getElementById('authorProfileModal')?.classList.remove('show');
    authorProfileState = {
        userId: null,
        profile: null,
        fallbackName: '',
        contentType: null,
        contentId: null,
        isFollowingItem: false,
    };
}

function handleAuthorProfileBackdrop(event) {
    if (event.target.id === 'authorProfileModal') closeAuthorProfileModal();
}

function getMessagingContextForCurrentUser() {
    if (!currentUser) return null;
    const role = currentUser.role;
    if (['super_admin', 'content_editor', 'admin'].includes(role)) return 'admin';
    if (role === 'registered_user') return 'ru';
    if (role === 'donor_partner') return 'dp';
    return null;
}

async function messageContentAuthor() {
    const authorId = authorProfileState.userId;
    if (!authorId) return;

    if (!currentUser) {
        closeAuthorProfileModal();
        showAuthModal();
        return;
    }

    if (authorId === currentUser.id) {
        showToast('You cannot message yourself.', 'error');
        return;
    }

    const profile = authorProfileState.profile;
    const authorName = profile?.name || authorProfileState.fallbackName || 'User';
    const authorRole = profile?.role || '';

    closeAuthorProfileModal();
    openMiniChat(authorId, authorName, authorRole);
}

function applyCreateModalConfig(type, useGenericHeader) {
    const config = CREATE_MODAL_CONFIG[type] || CREATE_MODAL_CONFIG.news;
    const header = useGenericHeader ? CREATE_MODAL_GENERIC : config;

    const titleEl = document.getElementById('createModalTitle');
    const subtitleEl = document.getElementById('createModalSubtitle');
    const titleLabelEl = document.getElementById('createTitleLabel');
    const descLabelEl = document.getElementById('createDescLabel');
    const titleInput = document.getElementById('createTitle');
    const descInput = document.getElementById('createDesc');
    const mediaCol = document.getElementById('createMediaColumn');
    const videoSection = document.getElementById('createVideoSection');
    const modalBody = document.getElementById('createModalBody');
    const submitBtn = document.getElementById('createSubmitBtn');

    if (titleEl) titleEl.innerHTML = `<i data-lucide="${header.icon}"></i> ${header.title}`;
    if (subtitleEl) subtitleEl.textContent = header.subtitle;

    const req = '<span style="color:var(--iuea-maroon)">*</span>';
    if (titleLabelEl) titleLabelEl.innerHTML = `${config.titleLabel} ${req}`;
    if (descLabelEl) descLabelEl.innerHTML = `${config.descLabel} ${req}`;
    if (titleInput) titleInput.placeholder = config.titlePlaceholder;
    if (descInput) descInput.placeholder = config.descPlaceholder;

    if (mediaCol) mediaCol.classList.toggle('hidden', !config.showMedia);
    if (videoSection) videoSection.classList.toggle('hidden', !config.showVideo);
    if (modalBody) modalBody.style.gridTemplateColumns = config.showMedia ? '' : '1fr';

    const pubExtras = document.getElementById('createPubExtras');
    const labExtras = document.getElementById('createLabExtras');
    const tierExtras = document.getElementById('createDonationTierExtras');
    const campaignExtras = document.getElementById('createEndowmentCampaignExtras');
    if (pubExtras) pubExtras.style.display = config.extraFields === 'publication' ? 'flex' : 'none';
    if (labExtras) labExtras.style.display = config.extraFields === 'lab' ? 'block' : 'none';
    if (tierExtras) tierExtras.style.display = config.extraFields === 'donation-tier' ? 'flex' : 'none';
    if (campaignExtras) campaignExtras.style.display = config.extraFields === 'endowment-campaign' ? 'flex' : 'none';

    const submitLabel = useGenericHeader ? CREATE_MODAL_GENERIC.submitLabel : config.submitLabel;
    if (submitBtn) submitBtn.innerHTML = `<i data-lucide="send"></i> ${submitLabel}`;
}

function resetCreateSubmitBtn(type) {
    const resolvedType = type || createModalPresetType || document.getElementById('createType')?.value || 'news';
    const config = CREATE_MODAL_CONFIG[resolvedType] || CREATE_MODAL_CONFIG.news;
    const label = createModalPresetMode ? config.submitLabel : CREATE_MODAL_GENERIC.submitLabel;
    const btn = document.getElementById('createSubmitBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="send"></i> ${label}`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function onCreateTypeChange(type) {
    if (!createModalPresetMode) applyCreateModalConfig(type, true);
}

function showCreateModal(presetType) {
    createModalPresetMode = !!presetType;
    createModalPresetType = presetType || null;
    const type = presetType || 'news';

    ['createTitle', 'createDesc', 'createJournal', 'createYear', 'createDirector', 'createTierAmount', 'createTierIcon', 'createGoalAmount', 'createRaisedAmount'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const typeEl = document.getElementById('createType');
    const typeGroup = document.getElementById('createTypeGroup');
    if (typeEl) typeEl.value = type;
    if (typeGroup) typeGroup.classList.toggle('hidden', createModalPresetMode);

    applyCreateModalConfig(type, !createModalPresetMode);

    clearMedia('image');
    clearMedia('video');
    document.getElementById('uploadProgressWrap').style.display = 'none';
    document.getElementById('uploadProgressBar').style.width = '0%';
    const btn = document.getElementById('createSubmitBtn');
    if (btn) btn.disabled = false;

    document.getElementById('createModal').classList.add('show');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('show');

    createModalPresetMode = false;
    createModalPresetType = null;
    const typeGroup = document.getElementById('createTypeGroup');
    const typeEl = document.getElementById('createType');
    if (typeGroup) typeGroup.classList.remove('hidden');
    if (typeEl) typeEl.value = 'news';

    applyCreateModalConfig('news', true);

    ['createTitle', 'createDesc', 'createJournal', 'createYear', 'createDirector', 'createTierAmount', 'createTierIcon', 'createGoalAmount', 'createRaisedAmount'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const modalBody = document.getElementById('createModalBody');
    if (modalBody) modalBody.style.gridTemplateColumns = '';
    clearMedia('image');
    clearMedia('video');
    document.getElementById('uploadProgressWrap').style.display = 'none';
    document.getElementById('uploadProgressBar').style.width = '0%';
    const btn = document.getElementById('createSubmitBtn');
    if (btn) btn.disabled = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ---- upload size limits (must match backend upload_routes.py) ---- */
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function validateImageFile(file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return 'Only JPEG, PNG, WebP, and GIF images are allowed.';
    }
    if (file.size > IMAGE_MAX_BYTES) {
        return 'Image must be 20MB or smaller.';
    }
    return null;
}

function validateVideoFile(file) {
    if (!['video/mp4', 'video/webm', 'video/ogg'].includes(file.type)) {
        return 'Only MP4, WebM, and OGG videos are allowed.';
    }
    if (file.size > VIDEO_MAX_BYTES) {
        return 'Video must be 200MB or smaller.';
    }
    return null;
}

/* ---- media preview ---- */
function previewMedia(input, type) {
    const file = input.files[0];
    if (!file) return;
    const err = type === 'image' ? validateImageFile(file) : validateVideoFile(file);
    if (err) {
        showToast(err, 'error');
        input.value = '';
        clearMedia(type);
        return;
    }
    const nameEl  = document.getElementById(`${type}FileName`);
    const clearBtn = document.getElementById(`clear${type.charAt(0).toUpperCase()+type.slice(1)}Btn`);
    if (nameEl) nameEl.textContent = file.name;
    if (clearBtn) clearBtn.style.display = 'inline';

    const zone = document.getElementById(`${type}DropZone`);
    zone.classList.add('has-file');

    if (type === 'image') {
        const preview = document.getElementById('imagePreview');
        const wrap    = document.getElementById('imagePreviewWrap');
        const reader  = new FileReader();
        reader.onload = e => { preview.src = e.target.result; preview.style.display='block'; wrap.style.display='none'; };
        reader.readAsDataURL(file);
    } else {
        const preview = document.getElementById('videoPreview');
        const wrap    = document.getElementById('videoPreviewWrap');
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        wrap.style.display = 'none';
    }
}

function handleFileDrop(event, type) {
    event.preventDefault();
    const zone = document.getElementById(`${type}DropZone`);
    zone.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const err = type === 'image' ? validateImageFile(file) : validateVideoFile(file);
    if (err) {
        showToast(err, 'error');
        return;
    }
    // Assign to the hidden input
    const inputEl = document.getElementById(`create${type.charAt(0).toUpperCase()+type.slice(1)}File`);
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    previewMedia(inputEl, type);
}

function clearMedia(type) {
    const cap    = type.charAt(0).toUpperCase() + type.slice(1);
    const input  = document.getElementById(`create${cap}File`);
    const nameEl = document.getElementById(`${type}FileName`);
    const clearBtn= document.getElementById(`clear${cap}Btn`);
    const zone   = document.getElementById(`${type}DropZone`);
    if (input)   input.value = '';
    if (nameEl)  nameEl.textContent = `No ${type} selected`;
    if (clearBtn) clearBtn.style.display = 'none';
    if (zone)    zone.classList.remove('has-file');
    if (type === 'image') {
        document.getElementById('imagePreview').style.display = 'none';
        document.getElementById('imagePreviewWrap').style.display = 'flex';
    } else {
        document.getElementById('videoPreview').style.display = 'none';
        document.getElementById('videoPreviewWrap').style.display = 'flex';
    }
}

/* ---- home post form: image preview & upload ---- */
function previewNewsPostImage(input) {
    const file = input?.files[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
        showToast(err, 'error');
        input.value = '';
        clearNewsPostImage();
        return;
    }
    const nameEl = document.getElementById('newsPostFileName');
    const clearBtn = document.getElementById('clearNewsPostImageBtn');
    const zone = document.getElementById('newsPostDropZone');
    const preview = document.getElementById('newsPostImagePreview');
    const wrap = document.getElementById('newsPostPreviewWrap');
    const urlInput = document.getElementById('newsPostImage');

    if (nameEl) nameEl.textContent = file.name;
    if (clearBtn) clearBtn.style.display = 'inline';
    if (zone) zone.classList.add('has-file');
    if (urlInput) urlInput.value = '';

    const reader = new FileReader();
    reader.onload = e => {
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (wrap) wrap.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function handleNewsPostImageDrop(event) {
    event.preventDefault();
    const zone = document.getElementById('newsPostDropZone');
    if (zone) zone.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
        showToast(err, 'error');
        return;
    }
    const input = document.getElementById('newsPostImageFile');
    if (!input) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    previewNewsPostImage(input);
}

function clearNewsPostImage() {
    const input = document.getElementById('newsPostImageFile');
    const nameEl = document.getElementById('newsPostFileName');
    const clearBtn = document.getElementById('clearNewsPostImageBtn');
    const zone = document.getElementById('newsPostDropZone');
    const preview = document.getElementById('newsPostImagePreview');
    const wrap = document.getElementById('newsPostPreviewWrap');

    if (input) input.value = '';
    if (nameEl) nameEl.textContent = 'No image selected';
    if (clearBtn) clearBtn.style.display = 'none';
    if (zone) zone.classList.remove('has-file');
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (wrap) wrap.style.display = 'flex';
}

function clearNewsPostForm() {
    const contentEl = document.getElementById('newsPostContent');
    const urlInput = document.getElementById('newsPostImage');
    if (contentEl) contentEl.value = '';
    if (urlInput) urlInput.value = '';
    clearNewsPostImage();
}

let newsPostSubmitting = false;

async function addNewsPost() {
    if (!authToken || !currentUser) {
        showToast('Please sign in to post updates.', 'error');
        showAuthModal();
        return;
    }

    if (newsPostSubmitting) return;

    const contentEl = document.getElementById('newsPostContent');
    const content = contentEl?.value.trim();
    if (!content) {
        showToast('Please write something to post.', 'error');
        return;
    }

    const btn = document.getElementById('newsPostSubmitBtn');
    const fileInput = document.getElementById('newsPostImageFile');
    const urlInput = document.getElementById('newsPostImage');
    const hasFile = Boolean(fileInput?.files?.[0]);
    const pastedUrl = urlInput?.value.trim() || '';

    newsPostSubmitting = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> Posting...'; }
    if (contentEl) contentEl.disabled = true;
    if (fileInput) fileInput.disabled = true;
    if (urlInput) urlInput.disabled = true;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        let imageUrl = null;

        // One submit action: upload selected file first, then create the post with the URL.
        if (hasFile) {
            imageUrl = await uploadFile(fileInput, 'image', () => {});
            if (!imageUrl) {
                throw new Error('Image upload failed. Your post was not submitted.');
            }
        } else if (pastedUrl) {
            imageUrl = pastedUrl;
        }

        const firstLine = content.split('\n')[0].trim();
        const title = firstLine.length > 100 ? firstLine.slice(0, 97) + '…' : firstLine;
        const body = {
            title,
            description: content,
            image: imageUrl,
            author_name: getUserDisplayName(currentUser)
        };

        const res = await apiPost('/content/news', body);
        if (res.ok) {
            if (res.queued) {
                showToast('Update saved offline — it will sync when you\'re back online.', 'info');
                clearNewsPostForm();
            } else {
                const isAdmin = ['super_admin', 'content_editor', 'admin'].includes(currentUser.role);
                showToast(isAdmin ? 'Update posted successfully!' : 'Update submitted for review.');
                clearNewsPostForm();
                if (isAdmin) {
                    invalidatePublicContentCache(['news']);
                    await loadHomeSection(true);
                }
            }
        } else {
            showToast(res.data?.detail || 'Failed to post update.', 'error');
        }
    } catch (err) {
        showToast(err.message || 'Could not post update.', 'error');
    } finally {
        newsPostSubmitting = false;
        if (contentEl) contentEl.disabled = false;
        if (fileInput) fileInput.disabled = false;
        if (urlInput) urlInput.disabled = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send"></i> Post Update';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

/* ---- upload helper: POST a file to /upload/image or /upload/video ---- */
async function uploadFile(fileInput, type, onProgress) {
    const file = fileInput?.files[0];
    if (!file) return null;
    const err = type === 'image' ? validateImageFile(file) : validateVideoFile(file);
    if (err) throw new Error(err);
    const formData = new FormData();
    formData.append('file', file);
    onProgress(30, `Uploading ${type}…`);
    const res = await fetch(`${API_BASE_URL}/upload/${type}`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${authToken}`,
            'ngrok-skip-browser-warning': 'true'
        },
        body: formData
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `${type} upload failed: ${res.status}`);
    }
    onProgress(70, `${type.charAt(0).toUpperCase()+type.slice(1)} uploaded ✓`);
    const data = await res.json();
    return data.url || null;
}

/* ---- submit content ---- */
async function submitCreateForm() {
    const type = resolveCreateFormType();
    const title = document.getElementById('createTitle')?.value.trim();
    const desc  = document.getElementById('createDesc')?.value.trim();

    const config = CREATE_MODAL_CONFIG[type] || CREATE_MODAL_CONFIG.news;
    if (!title || !desc) {
        showToast(`${config.titleLabel} and ${config.descLabel.toLowerCase()} are required.`, 'error');
        return;
    }

    const btn = document.getElementById('createSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }

    const progressWrap  = document.getElementById('uploadProgressWrap');
    const progressBar   = document.getElementById('uploadProgressBar');
    const progressLabel = document.getElementById('uploadProgressLabel');
    progressWrap.style.display = 'block';

    const setProgress = (pct, label) => {
        progressBar.style.width = pct + '%';
        if (progressLabel) progressLabel.textContent = label;
    };

    try {
        setProgress(10, 'Preparing…');
        const imageInput = document.getElementById('createImageFile');
        const videoInput = document.getElementById('createVideoFile');

        let imageUrl = null;
        let videoUrl = null;

        if (imageInput?.files[0]) imageUrl = await uploadFile(imageInput, 'image', setProgress);
        if (videoInput?.files[0]) videoUrl = await uploadFile(videoInput, 'video', setProgress);

        setProgress(85, 'Saving content…');

        const ENDPOINT_MAP = {
            news:       '/content/news',
            'innovation-news': '/content/news',
            'startup-news': '/content/news',
            'alumni-news': '/content/news',
            'community-news': '/content/community',
            'community-committees': '/content/community',
            'community-initiatives': '/content/community',
            'community-reports': '/content/community',
            event:      '/content/events',
            innovation: '/content/innovations',
            startup:    '/content/startups',
            alumni:     '/content/alumni',
            'research-areas': '/content/research-areas',
            publications: '/content/publications',
            'research-labs': '/content/research-labs',
            'tech-park': '/content/tech-park',
            donations:  '/content/donations',
            'donation-tiers': '/content/donation-tiers',
            'endowment-stats': '/content/endowment-stats',
            'endowment-campaigns': '/content/endowment-campaigns',
            'endowment-info': '/content/endowment-info'
        };
        const endpoint = ENDPOINT_MAP[type] || '/content/news';
        
        let body = { title, description: desc, image: imageUrl, video: videoUrl };
        if (type === 'alumni') {
            const names = title.split(' ');
            body = { 
                first_name: names[0] || 'Unknown', 
                last_name: names.slice(1).join(' ') || 'Unknown', 
                achievement: desc, 
                image: imageUrl 
            };
        } else if (type === 'research-areas') {
            body = { name: title, description: desc, image: imageUrl };
        } else if (type === 'publications') {
            body = {
                title,
                authors: desc,
                journal: document.getElementById('createJournal')?.value.trim() || null,
                year: document.getElementById('createYear')?.value.trim() || null,
                image: imageUrl
            };
        } else if (type === 'research-labs') {
            body = {
                name: title,
                focus: desc,
                director: document.getElementById('createDirector')?.value.trim() || null,
                image: imageUrl
            };
        } else if (type === 'donations') {
            body = { name: title, amount: parseFloat(desc) || 0, message: 'Created from admin' };
        } else if (type === 'donation-tiers') {
            body = {
                name: title,
                description: desc,
                amount: document.getElementById('createTierAmount')?.value.trim() || '$0',
                icon: document.getElementById('createTierIcon')?.value.trim() || 'gift'
            };
        } else if (type === 'endowment-stats') {
            body = { label: title, value: desc };
        } else if (type === 'endowment-campaigns') {
            body = {
                title,
                description: desc,
                goal_amount: document.getElementById('createGoalAmount')?.value.trim() || null,
                raised_amount: document.getElementById('createRaisedAmount')?.value.trim() || null,
                image: imageUrl
            };
        } else if (type === 'endowment-info') {
            body = { title, description: desc, image: imageUrl };
        } else if (type === 'news') {
            body = { title, description: desc, image: imageUrl, video: videoUrl, type: 'news' };
        } else if (type === 'innovation-news') {
            body = { title, description: desc, image: imageUrl, video: videoUrl, type: 'innovation' };
        } else if (type === 'startup-news') {
            body = { title, description: desc, image: imageUrl, video: videoUrl, type: 'startup' };
        } else if (type === 'alumni-news') {
            body = { title, description: desc, image: imageUrl, video: videoUrl, type: 'alumni' };
        } else if (type === 'community-news') {
            body = { title, description: desc, image: imageUrl, type: 'news' };
        } else if (type === 'community-committees') {
            body = { title, description: desc, image: imageUrl, type: 'committee' };
        } else if (type === 'community-initiatives') {
            body = { title, description: desc, image: imageUrl, type: 'initiative' };
        } else if (type === 'community-reports') {
            body = { title, description: desc, image: imageUrl, type: 'report' };
        }

        console.log("Submitting content:", body);
        const res = await apiPost(endpoint, body);
        console.log("API response:", res);

        if (res.ok) {
            setProgress(100, 'Done!');
            showToast(`${config.submitLabel || 'Content'} completed successfully!`);
            const typedInvalidation = getContentCreateInvalidation(type);
            if (typedInvalidation) {
                invalidatePublicContentCache(typedInvalidation.cacheKeys);
                typedInvalidation.adminModules.forEach(m => invalidateAdminModuleCache(m));
            } else if (type === 'news') {
                invalidatePublicContentCache(['news']);
            } else if (type === 'event') {
                invalidatePublicContentCache(['events']);
            }
            setTimeout(() => {
                closeCreateModal();
                loadInitialData({ forceRefresh: true });
                if (affectsHomeOrCommunityFeed(type)) loadHomeSection(true);
                if (document.getElementById('news-all')?.classList.contains('active')) {
                    loadAllNewsPage(true);
                }
                if (document.getElementById('endowment-campaigns-all')?.classList.contains('active')) {
                    loadAllEndowmentCampaignsPage(true);
                }
                if (document.getElementById('research-areas-all')?.classList.contains('active')) {
                    loadAllResearchAreasPage(true);
                }
                if (COMMUNITY_CREATE_INVALIDATION[type]) {
                    refreshActiveCommunityAllPages(true);
                }
                const mod = CREATE_TYPE_TO_MODULE[type];
                if (mod) {
                    currentAdminModule = mod;
                    if (!typedInvalidation) invalidateAdminModuleCache(mod);
                    loadAdminModule(mod, null, { forceRefresh: true });
                } else {
                    refreshCurrentAdminModule();
                }
            }, 600);
        } else {
            const msg = formatApiDetail(res.data?.detail, `Failed to create content (${res.status || 'error'}).`);
            showToast(msg, 'error');
            resetCreateSubmitBtn(type);
            progressWrap.style.display = 'none';
        }
    } catch (err) {
        showToast(err.message || 'Upload error.', 'error');
        resetCreateSubmitBtn(type);
        progressWrap.style.display = 'none';
    }
}


async function signIn() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showToast('Please enter email and password', 'error'); return; }

    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'ngrok-skip-browser-warning': 'true'
            },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            authToken = data.access_token;
            localStorage.setItem('jwt_token', authToken);
            const me = await apiGet('/auth/me');
            currentUser = me;
            cacheUserSession(me);
            updateUIForUser();
            loadUserEngagementState();
            closeAuthModal();
            showToast(`Welcome back, ${currentUser.name}!`);
            const dashId = getDashboardForRole(currentUser.role);
            if (dashId) navigateTo(dashId);
            else navigateTo('home');
        } else {
            showToast(data.detail || 'Invalid credentials', 'error');
        }
    } catch (e) { showToast('Server unreachable. Is FastAPI running?', 'error'); }
}

function showSignUp() {
    document.getElementById('authFormContent').innerHTML = `
        <div class="auth-modal-header">
            <h2>Create Account</h2>
            <p>Join the IUEA community today</p>
        </div>
        <div class="auth-modal-body">
            <div class="form-group"><label for="signupName">Full Name</label><input type="text" id="signupName" placeholder="Your full name" autocomplete="name"></div>
            <div class="form-group"><label for="signupEmail">Email</label><input type="email" id="signupEmail" placeholder="you@iuea.ac.ug" autocomplete="email"></div>
            <div class="form-group"><label for="signupPassword">Password</label><input type="password" id="signupPassword" placeholder="Min. 8 characters" autocomplete="new-password"></div>
            <button type="button" class="btn-primary auth-submit-btn" onclick="signUp()"><i data-lucide="user-plus"></i> Create Account</button>
        </div>
        <div class="auth-modal-footer">
            <p>Already have an account? <a href="#" onclick="restoreSignIn(); return false;">Sign In</a></p>
        </div>
    `;
    lucide.createIcons();
}

function restoreSignIn() {
    document.getElementById('authFormContent').innerHTML = `
        <div class="auth-modal-header">
            <h2>Sign In</h2>
            <p>Welcome back to IUEA Today</p>
        </div>
        <div class="auth-modal-body">
            <div class="form-group"><label for="loginEmail">Email</label><input type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email"></div>
            <div class="form-group"><label for="loginPassword">Password</label><input type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password"></div>
            <button type="button" class="btn-primary auth-submit-btn" onclick="signIn()">Sign In</button>
        </div>
        <div class="auth-modal-footer">
            <p>Don't have an account? <a href="#" onclick="showSignUp(); return false;">Sign Up</a></p>
        </div>
    `;
    lucide.createIcons();
}

async function signUp() {
    if (platformPublicSettings.allow_registrations === false) {
        showToast('New registrations are currently disabled.', 'error');
        return;
    }
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    if (!name || !email || !password) { showToast('Please fill all fields', 'error'); return; }
    const res = await apiPost('/auth/signup', { name, email, password, role: 'registered_user' }, false);
    if (res.ok) {
        showToast('Account created! Please sign in.');
        restoreSignIn();
    } else {
        showToast(res.data?.detail || 'Registration failed', 'error');
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    savedContentKeys.clear();
    followedContentKeys.clear();
    userEngagementFetchPromise = null;
    userEngagementLoaded = false;
    localStorage.removeItem('jwt_token');
    clearCachedUser();
    adminModuleCacheReady.clear();
    adminContentItemsCache = {};
    adminContentPrefetchPromise = null;
    heroVideosCache = null;
    heroVideosCacheReady = false;
    invalidatePublicContentCache();
    publicFormsInitialized = false;
    stopNotificationPolling();
    updateUIForUser();
    applySavedStateToCards();
    navigateTo('home');
    showToast('Signed out successfully.');
}



function updateUIForUser() {
    const display    = document.getElementById('userNameDisplay');
    const mobileLink = document.getElementById('mobileAuthLink');
    const userDashLink = document.getElementById('userDashboardNavLink');
    const badge      = document.getElementById('adminRoleBadge');
    const welcomeTitle = document.getElementById('adminWelcomeTitle');

    if (currentUser) {
        const displayName = getUserDisplayName(currentUser) || 'User';
        if (display) display.textContent = displayName;
        if (mobileLink) mobileLink.innerHTML = `<i data-lucide="log-out"></i> Sign Out`;
        if (mobileLink) mobileLink.setAttribute('onclick', 'logout()');

        const role = currentUser.role || 'public_visitor';
        if (userDashLink) userDashLink.style.display = getDashboardForRole(role) ? 'flex' : 'none';
        const roleLabel = formatRoleLabel(role);
        if (badge) badge.textContent = roleLabel;
        if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${displayName}`;

        const adminUserNameEl = document.getElementById('adminUserName');
        if (adminUserNameEl) adminUserNameEl.textContent = getAdminMenuDisplayName(currentUser);

        // Populate name in role dashboards
        const ruDashNameEl = document.getElementById('ruDashName');
        if (ruDashNameEl) ruDashNameEl.textContent = displayName;
        const dpUserNameEl = document.getElementById('dpUserName');
        if (dpUserNameEl) dpUserNameEl.textContent = displayName;
        const dpRoleBadgeEl = document.getElementById('dpRoleBadge');
        if (dpRoleBadgeEl) dpRoleBadgeEl.textContent = role === 'donor_partner' ? 'Donor Partner' : '';
        const coUserNameEl = document.getElementById('coUserName');
        if (coUserNameEl) coUserNameEl.textContent = displayName;
        const coRoleBadgeEl = document.getElementById('coRoleBadge');
        if (coRoleBadgeEl) coRoleBadgeEl.textContent = role === 'coordinator' ? 'Coordinator' : '';
        refreshUnreadMessageBadges();
        refreshNotifications({ silent: true });
        startNotificationPolling();
    } else {
        if (display) display.textContent = `Sign In`;
        if (mobileLink) { mobileLink.innerHTML = `<i data-lucide="log-in"></i> Sign In`; mobileLink.setAttribute('onclick', 'showAuthModal()'); }
        if (userDashLink) userDashLink.style.display = 'none';
        if (badge) badge.textContent = '';
        if (welcomeTitle) welcomeTitle.textContent = 'Welcome';
        const adminUserName = document.getElementById('adminUserName');
        if (adminUserName) adminUserName.textContent = 'Admin';
        notificationState.items = [];
        notificationState.unreadCount = 0;
        updateAllNotifyBadges();
        closeAllNotifyDropdowns();
        stopNotificationPolling();
    }

    const profileBtn = document.querySelector('.profile-icon');
    if (profileBtn) profileBtn.setAttribute('onclick', currentUser ? 'navigateToDashboard()' : 'showAuthModal()');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    if (currentUser && ['super_admin', 'content_editor', 'admin'].includes(currentUser.role)) {
        prefetchAdminContentModules();
    }
}

/* =================== SEARCH =================== */
const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_RESULTS = 12;
let searchDebounceTimer = null;
let searchActiveIndex = -1;

const SEARCH_INDEX_SOURCES = [
    { cacheKey: 'news', contentType: 'news', label: 'News' },
    { cacheKey: 'events', contentType: 'events', label: 'Event' },
    { cacheKey: 'innovations', contentType: 'innovations', label: 'Innovation' },
    { cacheKey: 'startups', contentType: 'startups', label: 'Startup' },
    { cacheKey: 'alumni', contentType: 'alumni', label: 'Alumni' },
    { cacheKey: 'community', contentType: 'community', label: 'Community' },
    { cacheKey: 'researchAreas', contentType: 'research-areas', label: 'Research Area' },
    { cacheKey: 'publications', contentType: 'publications', label: 'Publication' },
    { cacheKey: 'researchLabs', contentType: 'research-labs', label: 'Research Lab' },
    { cacheKey: 'techPark', contentType: 'tech-park', label: 'Tech Park' },
];

function getSearchItemTitle(item) {
    return item.title || item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Untitled';
}

function getSearchItemSubtitle(item, contentType) {
    if (contentType === 'publications') {
        return [item.authors, item.journal, item.year].filter(Boolean).join(' · ');
    }
    if (contentType === 'alumni') {
        return [item.role, item.achievement, item.year ? `Class of ${item.year}` : ''].filter(Boolean).join(' · ');
    }
    if (contentType === 'research-labs') {
        return [item.director ? `Dir: ${item.director}` : '', item.focus].filter(Boolean).join(' · ');
    }
    return item.description || item.achievement || item.role || item.category || item.focus || item.journal || '';
}

function getSearchItemHaystack(item) {
    return [
        item.title,
        item.name,
        item.description,
        item.first_name,
        item.last_name,
        item.achievement,
        item.role,
        item.category,
        item.journal,
        item.authors,
        item.director,
        item.focus,
        item.type,
        item.badge,
    ].filter(Boolean).join(' ').toLowerCase();
}

function scoreSearchMatch(haystack, query) {
    if (!haystack.includes(query)) return 0;
    if (haystack.startsWith(query)) return 4;
    const words = haystack.split(/\s+/);
    if (words.some(word => word.startsWith(query))) return 3;
    if (haystack.includes(` ${query}`)) return 2;
    return 1;
}

function buildSearchResults(query) {
    const seen = new Set();
    const results = [];

    SEARCH_INDEX_SOURCES.forEach(({ cacheKey, contentType, label }) => {
        const items = publicContentCache[cacheKey];
        if (!Array.isArray(items)) return;

        items.forEach(item => {
            if (!item?.id) return;
            const key = `${contentType}:${item.id}`;
            if (seen.has(key)) return;

            const haystack = getSearchItemHaystack(item);
            const score = scoreSearchMatch(haystack, query);
            if (!score) return;

            seen.add(key);
            results.push({
                id: item.id,
                contentType,
                label,
                title: getSearchItemTitle(item),
                subtitle: truncateText(getSearchItemSubtitle(item, contentType), 90),
                image: resolveMediaUrl(item.image),
                score,
            });
        });
    });

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function renderSearchResults(matches, query) {
    const resultsDiv = document.getElementById('searchResults');
    const input = document.getElementById('globalSearch');
    if (!resultsDiv || !input) return;

    if (!matches.length) {
        resultsDiv.innerHTML = `<div class="search-status">No results for “${escapeHtml(query)}”</div>`;
        resultsDiv.classList.add('show');
        input.setAttribute('aria-expanded', 'true');
        searchActiveIndex = -1;
        return;
    }

    resultsDiv.innerHTML = matches.map((match, index) => {
        const thumb = match.image
            ? `<img class="search-result-thumb" src="${match.image}" alt="" loading="lazy">`
            : `<div class="search-result-thumb" aria-hidden="true"></div>`;
        return `
        <button type="button" class="search-result-item${index === 0 ? ' active' : ''}" role="option"
            data-index="${index}" onclick="openSearchResult('${match.contentType}', ${match.id})">
            ${thumb}
            <span class="search-result-body">
                <div class="search-result-title">${escapeHtml(match.title)}</div>
                ${match.subtitle ? `<div class="search-result-subtitle">${escapeHtml(match.subtitle)}</div>` : ''}
            </span>
            <span class="search-result-type">${escapeHtml(match.label)}</span>
        </button>`;
    }).join('');

    resultsDiv.classList.add('show');
    input.setAttribute('aria-expanded', 'true');
    searchActiveIndex = 0;
    refreshIconsIn(resultsDiv);
}

function hideSearchResults() {
    const resultsDiv = document.getElementById('searchResults');
    const input = document.getElementById('globalSearch');
    if (resultsDiv) {
        resultsDiv.classList.remove('show');
        resultsDiv.innerHTML = '';
    }
    if (input) input.setAttribute('aria-expanded', 'false');
    searchActiveIndex = -1;
}

function updateSearchActiveItem(index) {
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;
    const items = resultsDiv.querySelectorAll('.search-result-item');
    items.forEach((item, i) => item.classList.toggle('active', i === index));
    if (items[index]) items[index].scrollIntoView({ block: 'nearest' });
    searchActiveIndex = index;
}

async function runLiveSearch() {
    const input = document.getElementById('globalSearch');
    const clearBtn = document.getElementById('searchClearBtn');
    const resultsDiv = document.getElementById('searchResults');
    if (!input || !resultsDiv) return;

    const query = input.value.trim().toLowerCase();
    if (clearBtn) clearBtn.classList.toggle('hidden', query.length === 0);

    if (query.length < SEARCH_MIN_CHARS) {
        hideSearchResults();
        return;
    }

    resultsDiv.innerHTML = '<div class="search-status">Searching…</div>';
    resultsDiv.classList.add('show');
    input.setAttribute('aria-expanded', 'true');

    try {
        await fetchPublicContent();
    } catch {
        /* search still works from whatever is already cached */
    }

    renderSearchResults(buildSearchResults(query).slice(0, SEARCH_MAX_RESULTS), query);
}

function liveSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(runLiveSearch, 220);
}

function clearGlobalSearch() {
    const input = document.getElementById('globalSearch');
    if (!input) return;
    input.value = '';
    hideSearchResults();
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    input.focus();
}

function openSearchResult(contentType, id) {
    const input = document.getElementById('globalSearch');
    if (input) input.value = '';
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    hideSearchResults();
    const page = SHARE_PAGE_MAP[contentType] || 'home';
    navigateTo(page);
    setTimeout(() => scrollToSharedCard(contentType, id), 650);
}

function handleSearchKeydown(event) {
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv || !resultsDiv.classList.contains('show')) {
        if (event.key === 'Escape') clearGlobalSearch();
        return;
    }

    const items = resultsDiv.querySelectorAll('.search-result-item');
    if (!items.length) {
        if (event.key === 'Escape') clearGlobalSearch();
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = searchActiveIndex < items.length - 1 ? searchActiveIndex + 1 : 0;
        updateSearchActiveItem(next);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = searchActiveIndex > 0 ? searchActiveIndex - 1 : items.length - 1;
        updateSearchActiveItem(prev);
    } else if (event.key === 'Enter') {
        event.preventDefault();
        const target = items[searchActiveIndex >= 0 ? searchActiveIndex : 0];
        if (target) target.click();
    } else if (event.key === 'Escape') {
        hideSearchResults();
    }
}

document.addEventListener('click', e => {
    if (!e.target.closest('#publicSearch')) hideSearchResults();
});

/* =================== HERO VIDEOS =================== */
const HERO_PAGES = [
    { key: 'home', label: 'Home', vidId: 'homeVideo' },
    { key: 'innovation', label: 'Innovation', vidId: 'innovationVideo' },
    { key: 'alumni', label: 'Alumni', vidId: 'alumniVideo' },
    { key: 'endowment', label: 'Endowment', vidId: 'endowmentVideo' },
    { key: 'community', label: 'Community', vidId: 'communityVideo' },
    { key: 'research', label: 'Research', vidId: 'researchVideo' },
    { key: 'techpark', label: 'Tech Park', vidId: 'techparkVideo' }
];

const HERO_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const HERO_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const HERO_PAGE_KEY_ALIASES = { commission: 'community' };

function resolveHeroPageEntry(videoMap, pageKey) {
    const normalizedKey = HERO_PAGE_KEY_ALIASES[pageKey] || pageKey;
    if (videoMap[normalizedKey]) return videoMap[normalizedKey];
    for (const [alias, canonical] of Object.entries(HERO_PAGE_KEY_ALIASES)) {
        if (canonical === normalizedKey && videoMap[alias]) return videoMap[alias];
    }
    return videoMap[pageKey] || null;
}

function validateHeroVideoFile(file) {
    if (!HERO_VIDEO_TYPES.includes(file.type)) {
        return 'Only MP4 and WebM videos are allowed.';
    }
    if (file.size > HERO_VIDEO_MAX_BYTES) {
        return 'Video must be 200MB or smaller.';
    }
    return null;
}

async function loadHeroVideosForPublicPages() {
    if (heroVideosCacheReady && Array.isArray(heroVideosCache)) {
        applyHeroVideosToPages(heroVideosCache);
        return;
    }

    await prefetchHeroVideos();
    applyHeroVideosToPages(heroVideosCache || []);
}

function applyHeroVideosToPages(videos) {
    if (!videos || !Array.isArray(videos)) return;

    const videoMap = {};
    videos.forEach(v => { videoMap[v.page_key] = resolveMediaUrl(v.video_url); });

    HERO_PAGES.forEach(page => {
        const vidEl = document.getElementById(page.vidId);
        if (!vidEl) return;

        const url = resolveHeroPageEntry(videoMap, page.key);
        if (url) {
            if (vidEl.getAttribute('src') !== url) {
                vidEl.src = url;
                vidEl.load();
            }
            vidEl.style.display = 'block';
        } else {
            vidEl.removeAttribute('src');
            vidEl.style.display = 'none';
        }
    });
}

async function refreshHeroVideosInBackground() {
    const container = document.getElementById('heroVideosList');
    if (container) container.classList.add('admin-content-refreshing');

    try {
        const videos = await apiGet('/settings/hero-videos');
        const normalized = Array.isArray(videos) ? videos : [];
        if (!heroVideosListsEqual(heroVideosCache, normalized)) {
            renderHeroVideoSettings(normalized);
        } else {
            heroVideosCache = normalized;
            heroVideosCacheReady = true;
        }
    } finally {
        if (container) container.classList.remove('admin-content-refreshing');
    }
}

function heroVideosListsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

async function loadHeroVideoSettings(options = {}) {
    const { forceRefresh = false } = options;
    const container = document.getElementById('heroVideosList');
    if (!container) return;

    if (heroVideosCacheReady && !forceRefresh) {
        renderHeroVideoSettings(heroVideosCache);
        refreshHeroVideosInBackground();
        return;
    }

    if (heroVideosCacheReady && forceRefresh) {
        renderHeroVideoSettings(heroVideosCache);
        container.classList.add('admin-content-refreshing');
    } else if (!heroVideosCacheReady) {
        container.innerHTML = '<div class="admin-empty-state" style="padding:2rem;"><p>Loading…</p></div>';
    }

    const videos = await apiGet('/settings/hero-videos');
    heroVideosCache = Array.isArray(videos) ? videos : [];
    heroVideosCacheReady = true;
    renderHeroVideoSettings(heroVideosCache);
    container.classList.remove('admin-content-refreshing');
}

function renderHeroVideoSettings(videos) {
    const container = document.getElementById('heroVideosList');
    if (!container) return;

    heroVideosCache = videos;
    heroVideosCacheReady = true;

    const videoMap = {};
    videos.forEach(v => { videoMap[v.page_key] = v; });

    container.innerHTML = HERO_PAGES.map(page => {
        const record = resolveHeroPageEntry(videoMap, page.key);
        const currentVideo = record ? resolveMediaUrl(record.video_url) : null;
        const statusId = `heroStatus-${page.key}`;
        const previewHTML = currentVideo
            ? `<div class="hero-video-preview"><video src="${currentVideo}" controls muted></video></div>`
            : `<div class="hero-video-preview-empty">No video uploaded</div>`;

        return `
        <div class="hero-video-card" data-page-key="${page.key}">
            <div class="hero-video-card-header">
                <h4 class="hero-video-card-title">${page.label} Hero</h4>
                <div class="hero-video-card-actions">
                    <input type="file" id="heroFileInput-${page.key}" accept="video/mp4,video/webm" style="display:none"
                        onchange="handleHeroVideoFileSelect('${page.key}', this)">
                    <button type="button" class="hero-upload-btn" id="heroUploadBtn-${page.key}"
                        onclick="document.getElementById('heroFileInput-${page.key}').click()">
                        <i data-lucide="upload"></i> ${currentVideo ? 'Replace' : 'Upload'}
                    </button>
                    ${currentVideo ? `<button type="button" class="hero-remove-btn" onclick="removeHeroVideo('${page.key}')"><i data-lucide="trash-2"></i> Remove</button>` : ''}
                </div>
            </div>
            <p class="hero-video-hint">MP4 or WebM, max 200MB${record?.original_filename ? ` · Current: ${record.original_filename}` : ''}</p>
            <p id="${statusId}" class="hero-video-status"></p>
            ${previewHTML}
        </div>`;
    }).join('');
    lucide.createIcons();
}

function handleHeroVideoFileSelect(pageKey, inputEl) {
    const file = inputEl.files[0];
    if (!file) return;
    uploadHeroVideo(pageKey, file, inputEl);
}

async function uploadHeroVideo(pageKey, file, inputEl) {
    if (!requireOnlineForAdmin('Uploading hero videos')) return;
    const statusEl = document.getElementById(`heroStatus-${pageKey}`);
    const btn = document.getElementById(`heroUploadBtn-${pageKey}`);

    const validationError = validateHeroVideoFile(file);
    if (validationError) {
        if (statusEl) statusEl.textContent = validationError;
        showToast(validationError, 'error');
        if (inputEl) inputEl.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('video', file);

    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = 'Uploading...';
        btn.disabled = true;
    }
    if (statusEl) statusEl.textContent = 'Uploading...';

    try {
        const res = await fetch(`${API_BASE_URL}/settings/hero-videos/${pageKey}`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'ngrok-skip-browser-warning': 'true'
            },
            body: formData
        });

        if (res.ok) {
            if (statusEl) statusEl.textContent = 'Upload complete.';
            showToast('Hero video uploaded successfully');
            await loadHeroVideoSettings({ forceRefresh: true });
            loadHeroVideosForPublicPages();
        } else {
            const data = await res.json().catch(() => ({}));
            const message = data.detail || 'Upload failed';
            if (statusEl) statusEl.textContent = message;
            showToast(message, 'error');
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Upload error.';
        showToast('Upload error', 'error');
    }

    if (btn) {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
    if (inputEl) inputEl.value = '';
    lucide.createIcons();
}

async function removeHeroVideo(pageKey) {
    if (!requireOnlineForAdmin('Removing hero videos')) return;
    if (!confirm('Are you sure you want to remove this video?')) return;

    const statusEl = document.getElementById(`heroStatus-${pageKey}`);
    if (statusEl) statusEl.textContent = 'Removing...';

    const res = await apiDelete(`/settings/hero-videos/${pageKey}`);
    if (res.ok) {
        if (statusEl) statusEl.textContent = 'Video removed.';
        showToast('Hero video removed');
        await loadHeroVideoSettings({ forceRefresh: true });
        loadHeroVideosForPublicPages();
    } else {
        const message = res.data?.detail || 'Failed to remove video';
        if (statusEl) statusEl.textContent = message;
        showToast(message, 'error');
    }
}

/* =================== PLATFORM SETTINGS =================== */
const PLATFORM_SETTINGS_DEFAULTS = {
    university_name: 'International University of East Africa',
    motto: 'Learning to Succeed',
    tagline: "East Africa's premier international university",
    logo_url: '/assets/images/iuea-logo.png',
    founded_year: 2010,
    contact_email: 'info@iuea.ac.ug',
    contact_phone: '+256 414 000 000',
    contact_address: 'Kansanga, Kampala, Uganda',
    website_url: 'https://iuea.ac.ug',
    facebook_url: 'https://www.facebook.com/IUEAUganda/',
    twitter_url: 'https://x.com/iuea_uganda',
    linkedin_url: 'https://ug.linkedin.com/school/international-university-of-east-africa-iuea-/',
    instagram_url: 'https://www.instagram.com/iuea_uganda/',
    youtube_url: 'https://www.youtube.com/@iuea_uganda',
    primary_color: '#800000',
    accent_color: '#cba052',
    timezone: 'Africa/Kampala',
    maintenance_mode: false,
    allow_registrations: true,
};

let platformPublicSettings = { ...PLATFORM_SETTINGS_DEFAULTS };

let adminSettingsInitialized = false;
let adminSettingsSaving = false;
let adminSettingsSnapshot = null;
let adminSettingsActiveSection = 'general';
let adminSettingsLoadToken = 0;

function isValidSettingsUrl(value) {
    if (!value || !value.trim()) return true;
    const trimmed = value.trim();
    if (trimmed.startsWith('/assets/') || trimmed.startsWith('assets/')) return true;
    return /^https?:\/\/\S+$/i.test(trimmed);
}

const SOCIAL_URL_KEYS = ['facebook_url', 'twitter_url', 'linkedin_url', 'instagram_url', 'youtube_url'];

function mergePlatformSettings(data) {
    const merged = { ...PLATFORM_SETTINGS_DEFAULTS, ...(data || {}) };
    SOCIAL_URL_KEYS.forEach((key) => {
        if (!(merged[key] || '').trim()) {
            merged[key] = PLATFORM_SETTINGS_DEFAULTS[key];
        }
    });
    return merged;
}

function resolveSocialUrl(key, settings) {
    const val = (settings?.[key] || '').trim();
    return val || (PLATFORM_SETTINGS_DEFAULTS[key] || '').trim();
}

function resolveSettingsLogoUrl(url) {
    const resolved = resolveMediaUrl(url);
    return resolved || (url && url.trim() ? url.trim() : null);
}

async function loadPublicPlatformSettings() {
    try {
        const data = await apiGet('/settings/public');
        if (data && data.university_name) {
            platformPublicSettings = mergePlatformSettings(data);
            applyPublicPlatformSettings(platformPublicSettings);
            return platformPublicSettings;
        }
    } catch (e) {
        console.warn('Could not load public platform settings', e);
    }
    applyPublicPlatformSettings(PLATFORM_SETTINGS_DEFAULTS);
    return PLATFORM_SETTINGS_DEFAULTS;
}

function applyPublicPlatformSettings(settings) {
    const s = mergePlatformSettings(settings);
    platformPublicSettings = s;

    const primary = normalizeHexColor(s.primary_color, PLATFORM_SETTINGS_DEFAULTS.primary_color);
    const accent = normalizeHexColor(s.accent_color, PLATFORM_SETTINGS_DEFAULTS.accent_color);
    const root = document.documentElement;
    root.style.setProperty('--iuea-maroon', primary);
    root.style.setProperty('--iuea-maroon-dark', primary);
    root.style.setProperty('--iuea-gold', accent);

    const uniName = s.university_name || PLATFORM_SETTINGS_DEFAULTS.university_name;
    const tagline = s.tagline || s.motto || PLATFORM_SETTINGS_DEFAULTS.tagline;
    document.title = `IUEA Today | ${uniName}`;

    const logoSrc = resolveSettingsLogoUrl(s.logo_url) || 'assets/images/iuea-logo.png';
    ['publicHeaderLogo', 'publicFooterLogo'].forEach((id) => {
        const img = document.getElementById(id);
        if (img) {
            img.src = logoSrc;
            img.alt = `${uniName} Logo`;
        }
    });

    const footerTagline = document.getElementById('footerTagline');
    if (footerTagline) footerTagline.textContent = tagline;

    const footerAddress = document.getElementById('footerContactAddress');
    if (footerAddress) footerAddress.textContent = s.contact_address || PLATFORM_SETTINGS_DEFAULTS.contact_address;

    const footerEmail = document.getElementById('footerContactEmail');
    if (footerEmail) {
        const email = s.contact_email || PLATFORM_SETTINGS_DEFAULTS.contact_email;
        footerEmail.textContent = email;
        footerEmail.href = `mailto:${email}`;
    }

    const footerPhone = document.getElementById('footerContactPhone');
    const footerPhoneWrap = document.getElementById('footerContactPhoneWrap');
    const phone = (s.contact_phone || '').trim();
    if (footerPhone) footerPhone.textContent = phone || PLATFORM_SETTINGS_DEFAULTS.contact_phone;
    if (footerPhoneWrap) footerPhoneWrap.hidden = !phone;

    const year = new Date().getFullYear();
    const footerCopyright = document.getElementById('footerCopyright');
    if (footerCopyright) {
        footerCopyright.textContent = `© ${year} ${uniName}. All rights reserved.`;
    }

    const socialMap = [
        ['footerFacebook', resolveSocialUrl('facebook_url', s)],
        ['footerTwitter', resolveSocialUrl('twitter_url', s)],
        ['footerLinkedin', resolveSocialUrl('linkedin_url', s)],
        ['footerInstagram', resolveSocialUrl('instagram_url', s)],
        ['footerYoutube', resolveSocialUrl('youtube_url', s)],
    ];
    socialMap.forEach(([id, href]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const url = (href || '').trim();
        if (url) {
            el.href = url;
            el.removeAttribute('hidden');
            el.target = '_blank';
            el.rel = 'noopener noreferrer';
        } else {
            el.hidden = true;
        }
    });

    const maintenanceBanner = document.getElementById('maintenanceBanner');
    const maintenanceTitle = document.getElementById('maintenanceBannerTitle');
    if (maintenanceBanner) {
        maintenanceBanner.hidden = !s.maintenance_mode;
        if (maintenanceTitle && uniName) {
            maintenanceTitle.textContent = `${uniName} — maintenance in progress`;
        }
    }

    const signUpLink = document.querySelector('#authFormContent a[onclick*="showSignUp"]');
    const mobileAuth = document.getElementById('mobileAuthLink');
    if (s.allow_registrations === false) {
        if (signUpLink) signUpLink.style.display = 'none';
    } else if (signUpLink) {
        signUpLink.style.display = '';
    }
}

function formatAdminRole(role) {
    const labels = {
        super_admin: 'Super Admin',
        content_editor: 'Content Editor',
        admin: 'Administrator',
    };
    return labels[role] || (role || 'Admin').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function showAdminSettingsSection(sectionId, btn) {
    adminSettingsActiveSection = sectionId;
    document.querySelectorAll('.admin-settings-nav-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
        document.querySelector(`.admin-settings-nav-btn[data-settings-section="${sectionId}"]`)?.classList.add('active');
    }
    document.querySelectorAll('.admin-settings-section').forEach((panel) => {
        const isActive = panel.dataset.settingsPanel === sectionId;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
    });
    if (sectionId === 'security') refreshAdminSettingsSession();
    lucide.createIcons();
}

function normalizeHexColor(value, fallback) {
    if (!value || typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    const short = trimmed.replace(/^#/, '');
    if (/^[0-9A-Fa-f]{6}$/.test(short)) return `#${short.toLowerCase()}`;
    return fallback;
}

function bindAdminColorField(pickerId, hexId, swatchId) {
    const picker = document.getElementById(pickerId);
    const hex = document.getElementById(hexId);
    const swatch = document.getElementById(swatchId);
    if (!picker || !hex) return;

    const syncFromHex = () => {
        const normalized = normalizeHexColor(hex.value, picker.value);
        hex.value = normalized;
        picker.value = normalized;
        if (swatch) swatch.style.background = normalized;
        updateAdminBrandingPreview();
        markAdminSettingsDirty();
    };

    picker.addEventListener('input', () => {
        hex.value = picker.value.toLowerCase();
        if (swatch) swatch.style.background = picker.value;
        updateAdminBrandingPreview();
        markAdminSettingsDirty();
    });
    hex.addEventListener('input', () => {
        updateAdminBrandingPreview();
        markAdminSettingsDirty();
    });
    hex.addEventListener('blur', syncFromHex);
}

function updateMaintenanceWarning() {
    const maintenance = document.getElementById('settingsMaintenanceMode');
    const warning = document.getElementById('settingsMaintenanceWarning');
    if (warning) warning.hidden = !maintenance?.checked;
}

function populateAdminSettingsSession() {
    const nameEl = document.getElementById('adminSettingsSessionName');
    const emailEl = document.getElementById('adminSettingsSessionEmail');
    const roleEl = document.getElementById('adminSettingsSessionRole');
    if (!currentUser) {
        if (nameEl) nameEl.textContent = '—';
        if (emailEl) emailEl.textContent = '—';
        if (roleEl) roleEl.textContent = '—';
        return;
    }
    if (nameEl) nameEl.textContent = currentUser.name || 'Administrator';
    if (emailEl) emailEl.textContent = currentUser.email || '—';
    if (roleEl) roleEl.textContent = formatAdminRole(currentUser.role);
}

async function refreshAdminSettingsSession() {
    if (!authToken) {
        populateAdminSettingsSession();
        return;
    }
    try {
        const me = await apiGet('/auth/me');
        if (me && me.id) {
            currentUser = me;
            populateAdminSettingsSession();
        }
    } catch (e) {
        populateAdminSettingsSession();
    }
}

function updateAdminLogoPreview() {
    const input = document.getElementById('settingsLogoUrl');
    const preview = document.getElementById('settingsLogoPreview');
    const img = document.getElementById('settingsLogoPreviewImg');
    if (!preview || !img) return;

    const raw = input?.value?.trim() || PLATFORM_SETTINGS_DEFAULTS.logo_url;
    const src = resolveSettingsLogoUrl(raw);
    if (src) {
        img.src = src;
        img.alt = 'Logo preview';
        preview.hidden = false;
        img.onerror = () => { preview.hidden = true; };
    } else {
        preview.hidden = true;
    }
}

function initAdminSettingsForm() {
    if (adminSettingsInitialized) return;
    adminSettingsInitialized = true;

    bindAdminColorField('settingsPrimaryColorPicker', 'settingsPrimaryColor', 'settingsPrimarySwatch');
    bindAdminColorField('settingsAccentColorPicker', 'settingsAccentColor', 'settingsAccentSwatch');

    const previewFields = ['settingsUniversityName', 'settingsTagline', 'settingsLogoUrl', 'settingsPrimaryColor', 'settingsAccentColor'];
    previewFields.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            updateAdminBrandingPreview();
            if (id === 'settingsLogoUrl') updateAdminLogoPreview();
        });
    });

    const form = document.getElementById('adminSettingsForm');
    if (form) {
        form.addEventListener('input', markAdminSettingsDirty);
        form.addEventListener('change', (e) => {
            if (e.target?.id === 'settingsMaintenanceMode') updateMaintenanceWarning();
            markAdminSettingsDirty();
        });
    }
}

function updateAdminBrandingPreview() {
    const title = document.getElementById('settingsPreviewTitle');
    const tagline = document.getElementById('settingsPreviewTagline');
    const header = document.getElementById('settingsPreviewHeader');
    const previewLogo = document.getElementById('settingsPreviewLogo');
    const logoFallback = document.getElementById('settingsPreviewLogoFallback');
    const signIn = document.getElementById('settingsPreviewSignIn');
    const btnPrimary = document.getElementById('settingsPreviewBtnPrimary');
    const btnAccent = document.getElementById('settingsPreviewBtnAccent');
    const uni = document.getElementById('settingsUniversityName');
    const taglineInput = document.getElementById('settingsTagline');
    const logoInput = document.getElementById('settingsLogoUrl');
    const primary = document.getElementById('settingsPrimaryColor');
    const accent = document.getElementById('settingsAccentColor');

    const primaryColor = normalizeHexColor(primary?.value, PLATFORM_SETTINGS_DEFAULTS.primary_color);
    const accentColor = normalizeHexColor(accent?.value, PLATFORM_SETTINGS_DEFAULTS.accent_color);
    const uniName = uni?.value.trim() || PLATFORM_SETTINGS_DEFAULTS.university_name;

    if (title) title.textContent = uniName;
    if (tagline && taglineInput) {
        tagline.textContent = taglineInput.value.trim() || PLATFORM_SETTINGS_DEFAULTS.tagline;
    }
    if (header) header.style.borderBottomColor = primaryColor;
    if (signIn) signIn.style.color = primaryColor;

    const logoSrc = resolveSettingsLogoUrl(logoInput?.value?.trim() || PLATFORM_SETTINGS_DEFAULTS.logo_url);
    if (previewLogo && logoFallback) {
        if (logoSrc) {
            previewLogo.src = logoSrc;
            previewLogo.hidden = false;
            logoFallback.hidden = true;
            previewLogo.onerror = () => {
                previewLogo.hidden = true;
                logoFallback.hidden = false;
                logoFallback.textContent = uniName.split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase();
            };
        } else {
            previewLogo.hidden = true;
            logoFallback.hidden = false;
            logoFallback.textContent = uniName.split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase();
        }
    }

    if (btnPrimary) {
        btnPrimary.style.background = primaryColor;
        btnPrimary.style.borderColor = primaryColor;
    }
    if (btnAccent) {
        btnAccent.style.background = 'transparent';
        btnAccent.style.borderColor = accentColor;
        btnAccent.style.color = accentColor;
    }
}

function collectAdminSettingsPayload() {
    const foundedRaw = document.getElementById('settingsFoundedYear')?.value?.trim();
    const foundedYear = foundedRaw ? parseInt(foundedRaw, 10) : null;

    return {
        university_name: document.getElementById('settingsUniversityName')?.value.trim() || '',
        motto: document.getElementById('settingsMotto')?.value.trim() || '',
        tagline: document.getElementById('settingsTagline')?.value.trim() || '',
        logo_url: document.getElementById('settingsLogoUrl')?.value.trim() || '',
        founded_year: Number.isFinite(foundedYear) ? foundedYear : null,
        contact_email: document.getElementById('settingsContactEmail')?.value.trim() || '',
        contact_phone: document.getElementById('settingsContactPhone')?.value.trim() || '',
        contact_address: document.getElementById('settingsContactAddress')?.value.trim() || '',
        website_url: document.getElementById('settingsWebsiteUrl')?.value.trim() || '',
        facebook_url: document.getElementById('settingsFacebookUrl')?.value.trim() || '',
        twitter_url: document.getElementById('settingsTwitterUrl')?.value.trim() || '',
        linkedin_url: document.getElementById('settingsLinkedinUrl')?.value.trim() || '',
        instagram_url: document.getElementById('settingsInstagramUrl')?.value.trim() || '',
        youtube_url: document.getElementById('settingsYoutubeUrl')?.value.trim() || '',
        primary_color: normalizeHexColor(
            document.getElementById('settingsPrimaryColor')?.value,
            PLATFORM_SETTINGS_DEFAULTS.primary_color
        ),
        accent_color: normalizeHexColor(
            document.getElementById('settingsAccentColor')?.value,
            PLATFORM_SETTINGS_DEFAULTS.accent_color
        ),
        timezone: document.getElementById('settingsTimezone')?.value || PLATFORM_SETTINGS_DEFAULTS.timezone,
        maintenance_mode: !!document.getElementById('settingsMaintenanceMode')?.checked,
        allow_registrations: !!document.getElementById('settingsAllowRegistrations')?.checked,
    };
}

function snapshotAdminSettingsPayload() {
    adminSettingsSnapshot = JSON.stringify(collectAdminSettingsPayload());
    updateAdminSettingsDirtyBadge(false);
}

function markAdminSettingsDirty() {
    if (!adminSettingsSnapshot) return;
    const dirty = JSON.stringify(collectAdminSettingsPayload()) !== adminSettingsSnapshot;
    updateAdminSettingsDirtyBadge(dirty);
}

function updateAdminSettingsDirtyBadge(dirty) {
    const badge = document.getElementById('adminSettingsDirtyBadge');
    if (badge) badge.hidden = !dirty;
}

function populateAdminSettingsForm(data) {
    const values = { ...PLATFORM_SETTINGS_DEFAULTS, ...(data || {}) };
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    setVal('settingsUniversityName', values.university_name);
    setVal('settingsMotto', values.motto);
    setVal('settingsTagline', values.tagline);
    setVal('settingsLogoUrl', values.logo_url);
    setVal('settingsFoundedYear', values.founded_year ?? '');
    setVal('settingsContactEmail', values.contact_email);
    setVal('settingsContactPhone', values.contact_phone);
    setVal('settingsContactAddress', values.contact_address);
    setVal('settingsWebsiteUrl', values.website_url);
    setVal('settingsFacebookUrl', values.facebook_url);
    setVal('settingsTwitterUrl', values.twitter_url);
    setVal('settingsLinkedinUrl', values.linkedin_url);
    setVal('settingsInstagramUrl', values.instagram_url);
    setVal('settingsYoutubeUrl', values.youtube_url);
    setVal('settingsTimezone', values.timezone);

    const primary = normalizeHexColor(values.primary_color, PLATFORM_SETTINGS_DEFAULTS.primary_color);
    const accent = normalizeHexColor(values.accent_color, PLATFORM_SETTINGS_DEFAULTS.accent_color);
    setVal('settingsPrimaryColor', primary);
    setVal('settingsAccentColor', accent);
    setVal('settingsPrimaryColorPicker', primary);
    setVal('settingsAccentColorPicker', accent);

    const primarySwatch = document.getElementById('settingsPrimarySwatch');
    const accentSwatch = document.getElementById('settingsAccentSwatch');
    if (primarySwatch) primarySwatch.style.background = primary;
    if (accentSwatch) accentSwatch.style.background = accent;

    const maintenance = document.getElementById('settingsMaintenanceMode');
    const registrations = document.getElementById('settingsAllowRegistrations');
    if (maintenance) maintenance.checked = !!values.maintenance_mode;
    if (registrations) registrations.checked = values.allow_registrations !== false;

    const updatedEl = document.getElementById('adminSettingsUpdatedAt');
    if (updatedEl) {
        if (values.updated_at) {
            const when = new Date(values.updated_at);
            updatedEl.textContent = `Last saved ${when.toLocaleString()}`;
        } else {
            updatedEl.textContent = 'Not saved yet — using defaults until you save.';
        }
    }

    updateMaintenanceWarning();
    updateAdminBrandingPreview();
    updateAdminLogoPreview();
    populateAdminSettingsSession();
    snapshotAdminSettingsPayload();
}

function clearAdminSettingsErrors() {
    document.querySelectorAll('#adminSettingsForm .field-error').forEach((el) => {
        el.textContent = '';
    });
    document.querySelectorAll('#adminSettingsForm .admin-form-field').forEach((el) => {
        el.classList.remove('has-error');
    });
}

function setAdminSettingsFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.getElementById(`${fieldId}Error`);
    if (input) input.closest('.admin-form-field')?.classList.add('has-error');
    if (errorEl) errorEl.textContent = message;
}

function validateAdminSettingsForm() {
    clearAdminSettingsErrors();
    const payload = collectAdminSettingsPayload();
    let valid = true;

    if (!payload.university_name) {
        setAdminSettingsFieldError('settingsUniversityName', 'University name is required.');
        valid = false;
    }
    if (!payload.contact_email || !payload.contact_email.includes('@')) {
        setAdminSettingsFieldError('settingsContactEmail', 'Enter a valid contact email.');
        valid = false;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(payload.primary_color)) {
        setAdminSettingsFieldError('settingsPrimaryColor', 'Use a 6-digit hex color (e.g. #800000).');
        valid = false;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(payload.accent_color)) {
        setAdminSettingsFieldError('settingsAccentColor', 'Use a 6-digit hex color (e.g. #cba052).');
        valid = false;
    }
    if (payload.founded_year !== null && (payload.founded_year < 1800 || payload.founded_year > 2100)) {
        setAdminSettingsFieldError('settingsFoundedYear', 'Enter a year between 1800 and 2100.');
        valid = false;
    }

    const urlChecks = [
        ['settingsLogoUrl', payload.logo_url, 'Logo URL'],
        ['settingsWebsiteUrl', payload.website_url, 'Website URL'],
        ['settingsFacebookUrl', payload.facebook_url, 'Facebook URL'],
        ['settingsTwitterUrl', payload.twitter_url, 'Twitter URL'],
        ['settingsLinkedinUrl', payload.linkedin_url, 'LinkedIn URL'],
        ['settingsInstagramUrl', payload.instagram_url, 'Instagram URL'],
        ['settingsYoutubeUrl', payload.youtube_url, 'YouTube URL'],
    ];
    urlChecks.forEach(([fieldId, value, label]) => {
        if (!isValidSettingsUrl(value)) {
            const hint = fieldId === 'settingsLogoUrl'
                ? `${label} must be a valid URL or /assets/ path`
                : `${label} must start with http:// or https://`;
            setAdminSettingsFieldError(fieldId, hint);
            valid = false;
        }
    });

    if (!valid) {
        const firstError = document.querySelector('#adminSettingsForm .admin-form-field.has-error');
        const panel = firstError?.closest('.admin-settings-section');
        if (panel?.dataset?.settingsPanel) {
            showAdminSettingsSection(panel.dataset.settingsPanel);
        }
    }

    return valid;
}

function setAdminSettingsSaveLoading(loading) {
    adminSettingsSaving = loading;
    const btn = document.getElementById('adminSettingsSaveBtn');
    const resetBtn = document.getElementById('adminSettingsResetBtn');
    if (!btn) return;

    if (loading) {
        btn.classList.add('is-loading');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Saving…';
        if (resetBtn) resetBtn.disabled = true;
    } else {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Save Changes';
        if (resetBtn) resetBtn.disabled = false;
    }
}

function setAdminSettingsView(view) {
    const skeleton = document.getElementById('adminSettingsSkeleton');
    const body = document.getElementById('adminSettingsBody');
    const error = document.getElementById('adminSettingsError');
    if (skeleton) skeleton.hidden = view !== 'loading';
    if (body) body.hidden = view !== 'ready';
    if (error) error.hidden = view !== 'error';
}

async function fetchPlatformSettings() {
    const headers = authToken ? { 'Authorization': `Bearer ${authToken}`, 'ngrok-skip-browser-warning': 'true' } : { 'ngrok-skip-browser-warning': 'true' };
    const res = await fetch(`${API_BASE_URL}/admin/settings`, { headers });
    if (res.status === 401) {
        logout();
        throw new Error('Session expired. Please sign in again.');
    }

    let data;
    try {
        data = await res.json();
    } catch (e) {
        console.error('GET /admin/settings: invalid JSON', e);
        throw new Error('Invalid response from server.');
    }

    if (!res.ok) {
        const detail = data?.detail;
        const message = typeof detail === 'string'
            ? detail
            : `Could not load settings (HTTP ${res.status}).`;
        console.error('GET /admin/settings failed:', res.status, data);
        throw new Error(message);
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        console.error('GET /admin/settings: unexpected payload', data);
        throw new Error('Unexpected settings data from server.');
    }

    return data;
}

async function loadAdminSettings() {
    const loadId = ++adminSettingsLoadToken;
    setAdminSettingsView('loading');

    try {
        initAdminSettingsForm();
        showAdminSettingsSection(adminSettingsActiveSection);

        const data = await fetchPlatformSettings();
        if (loadId !== adminSettingsLoadToken) return;

        populateAdminSettingsForm(data.university_name ? data : PLATFORM_SETTINGS_DEFAULTS);
        setAdminSettingsView('ready');
    } catch (e) {
        if (loadId !== adminSettingsLoadToken) return;
        console.error('loadAdminSettings failed:', e);
        const message = e?.message || 'Could not load platform settings.';
        const msgEl = document.getElementById('adminSettingsErrorMessage');
        if (msgEl) msgEl.textContent = message;
        setAdminSettingsView('error');
        showToast(message, 'error');
    } finally {
        if (loadId === adminSettingsLoadToken && typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function retryLoadAdminSettings() {
    loadAdminSettings();
}

async function saveAdminSettings() {
    if (!requireOnlineForAdmin('Saving platform settings')) return;
    if (adminSettingsSaving) return;
    if (!validateAdminSettingsForm()) {
        showToast('Please fix the highlighted fields.', 'error');
        return;
    }

    setAdminSettingsSaveLoading(true);
    const payload = collectAdminSettingsPayload();

    try {
        const res = await apiPut('/admin/settings', payload);
        if (res.ok && res.data) {
            populateAdminSettingsForm(res.data);
            applyPublicPlatformSettings(res.data);
            showToast('Platform settings saved successfully.');
        } else {
            const message = res.data?.detail || 'Failed to save settings.';
            showToast(typeof message === 'string' ? message : 'Failed to save settings.', 'error');
        }
    } catch (e) {
        showToast('Failed to save settings.', 'error');
    } finally {
        setAdminSettingsSaveLoading(false);
        lucide.createIcons();
    }
}

async function resetAdminSettings() {
    if (!confirm('Reset all fields to platform defaults? This will save immediately.')) return;
    populateAdminSettingsForm(PLATFORM_SETTINGS_DEFAULTS);
    await saveAdminSettings();
}

/* =================== BOOT =================== */
async function boot() {
    initOfflineSupport();
    initCardDetailModal();
    showHomeLoadingState();
    await Promise.all([loadInitialData(), loadPublicPlatformSettings()]);

    let me = null;
    if (authToken) {
        me = isAppOnline ? await apiGet('/auth/me') : loadCachedUser();
    }

    if (authToken) {
        if (me && me.id) {
            currentUser = me;
            if (isAppOnline) cacheUserSession(me);
            updateUIForUser();
            if (isAppOnline) loadUserEngagementState();
        } else if (isAppOnline) {
            logout();
        }
    }
}

boot().then(() => {
    refreshIconsIn(document.getElementById('publicHeader'));
    handleShareDeepLink();
    initNotificationsUI();
});

/* =================== ROLE DASHBOARD HELPERS =================== */
function usesAdminRoleLayout(prefix) {
    return prefix === 'dp';
}

function usesAdminRoleNav(prefix) {
    return prefix === 'dp' || prefix === 'ru';
}

function getRoleTabSelector(prefix) {
    if (prefix === 'co') return '.co-tab';
    if (usesAdminRoleLayout(prefix)) return '.admin-tab-content';
    return '.role-tab';
}

function getRoleNavSelector(prefix) {
    if (prefix === 'co') return '.cdash-nav-btn[data-co-tab]';
    if (usesAdminRoleNav(prefix)) return '.admin-nav-btn';
    return '.rdash-nav-btn';
}

function showRoleTab(prefix, tabId, btn) {
    // Deactivate all buttons and tabs for this dashboard
    const dashId = {
        ru: 'registered-user-dashboard',
        dp: 'donor-partner-dashboard',
        co: 'coordinator-dashboard',
    }[prefix];
    if (!dashId) return;
    const dash = document.getElementById(dashId);
    if (!dash) return;

    const navSelector = getRoleNavSelector(prefix);
    const tabSelector = getRoleTabSelector(prefix);

    dash.querySelectorAll(navSelector).forEach(b => b.classList.remove('active'));
    dash.querySelectorAll(tabSelector).forEach(t => t.classList.remove('active'));
    if (!btn) {
        btn = dash.querySelector(`[data-co-tab="${tabId}"]`)
            || dash.querySelector(`[data-ru-tab="${tabId}"]`)
            || dash.querySelector(`${navSelector}[onclick*="'${tabId}'"]`)
            || dash.querySelector(`${navSelector}[onclick*='"${tabId}"']`);
    }
    if (btn) btn.classList.add('active');
    const tab = document.getElementById(`${prefix}-tab-${tabId}`);
    if (tab) tab.classList.add('active');
    lucide.createIcons();

    if (prefix === 'ru' && tabId === 'stories') {
        loadRuSharedStories();
    }
    if (prefix === 'ru' && tabId === 'saved') {
        loadRuSavedContent();
    }
    if (prefix === 'ru' && tabId === 'followed') {
        loadRuFollowedContent();
    }
    if (prefix === 'ru' && tabId === 'overview') {
        loadRuOverviewStats();
    }
    if (prefix === 'co' && tabId === 'overview') {
        loadCoordinatorStats();
    }
    if (prefix === 'co' && CO_TAB_FORM_TYPES[tabId]) {
        coordinatorActiveTab = tabId;
        loadCoordinatorSubmissions(tabId);
    }
    if (tabId === 'messages') {
        initMessaging(prefix);
    }
}

function ruGoToTab(tabId) {
    const dash = document.getElementById('registered-user-dashboard');
    const btn = dash?.querySelector(`[data-ru-tab="${tabId}"]`);
    showRoleTab('ru', tabId, btn || null);
}

function returnToPublic() {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    const home = document.getElementById('home');
    if (home) home.classList.add('active');
    const pubHeader = document.getElementById('publicHeader');
    const pubSearch = document.getElementById('publicSearch');
    const footer    = document.querySelector('footer');
    const applyBtn  = document.getElementById('fixedApplyBtn');
    if (pubHeader) pubHeader.style.display = 'block';
    if (pubSearch) pubSearch.style.display = 'block';
    if (footer)    footer.style.display    = 'block';
    if (applyBtn)  applyBtn.style.display  = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    lucide.createIcons();
}

function populateRoleDashboard(dashId) {
    ensureRoleDashboardTabActive(dashId);
    // Pre-fill profile data if available
    if (currentUser) {
        if (dashId === 'registered-user-dashboard') {
            populateRuDashboard();
        }
        if (dashId === 'donor-partner-dashboard') {
            populateDpDashboard();
        }
        if (dashId === 'coordinator-dashboard') {
            populateCoordinatorDashboard();
        }
        refreshNotifications({ silent: true });
    }
    lucide.createIcons();
}

function ensureRoleDashboardTabActive(dashId) {
    const prefixMap = {
        'registered-user-dashboard': 'ru',
        'donor-partner-dashboard': 'dp',
        'coordinator-dashboard': 'co',
    };
    const prefix = prefixMap[dashId];
    if (!prefix) return;
    const dash = document.getElementById(dashId);
    if (!dash || dash.querySelector('.admin-tab-content.active')) return;
    const btn = findRoleTabButton(prefix, 'overview');
    if (btn) showRoleTab(prefix, 'overview', btn);
}

function populateRuDashboard() {
    if (!currentUser) return;

    const displayName = getUserDisplayName(currentUser) || 'User';

    const welcome = document.getElementById('ruWelcomeTitle');
    if (welcome) welcome.textContent = `Welcome back, ${displayName}`;

    const dateEl = document.getElementById('ruDateDisplay');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    const nameEl = document.getElementById('ruDashName');
    if (nameEl) nameEl.textContent = displayName;

    const badge = document.getElementById('ruRoleBadge');
    if (badge) badge.textContent = 'Registered User';

    const el = document.getElementById('ruProfileName');
    if (el) el.value = currentUser.name || '';
    const em = document.getElementById('ruProfileEmail');
    if (em) em.value = currentUser.email || '';

    loadRuOverviewStats();
}

async function loadRuOverviewStats() {
    const statStories = document.getElementById('ru-stat-stories');
    if (!statStories || !authToken) return;

    const [stories] = await Promise.all([
        apiGet('/content/my-news'),
        loadUserEngagementState(),
    ]);
    if (Array.isArray(stories)) {
        statStories.textContent = stories.length;
    }
    const statSaved = document.getElementById('ru-stat-saved');
    if (statSaved) statSaved.textContent = savedContentKeys.size;
    const statFollowed = document.getElementById('ru-stat-followed');
    if (statFollowed) statFollowed.textContent = followedContentKeys.size;
}

function renderSavedCard(entry) {
    const item = entry?.item;
    if (!item) return '';
    const type = entry.content_type;
    if (type === 'events') return createEventCard(item);
    if (type === 'alumni') return createAlumniCard(item);
    return createCard(item, type);
}

async function loadRuSavedContent() {
    const container = document.getElementById('ruSavedList');
    if (!container) return;

    if (!authToken) {
        container.innerHTML = ruEmptyStatePanel('lock', 'Sign in required', 'Sign in to view your saved content.');
        lucide.createIcons();
        return;
    }

    container.innerHTML = ruEmptyStatePanel('loader', 'Loading saved items…', 'Fetching your bookmarked content.');
    lucide.createIcons();

    const saved = await apiGet('/content/saved');
    if (!Array.isArray(saved)) {
        container.innerHTML = ruEmptyStatePanel('alert-circle', 'Could not load saved items', 'Please try again in a moment.');
        lucide.createIcons();
        return;
    }

    savedContentKeys.clear();
    saved.forEach(({ content_type, content_id }) => {
        savedContentKeys.add(`${content_type}:${content_id}`);
    });
    applySavedStateToCards();

    const statSaved = document.getElementById('ru-stat-saved');
    if (statSaved) statSaved.textContent = saved.length;

    if (!saved.length) {
        container.innerHTML = ruEmptyStatePanel(
            'bookmark-x',
            'No saved items yet',
            'Browse the public site and save items to see them here.',
            '<button class="btn-primary" onclick="returnToPublic()"><i data-lucide="compass"></i> Explore Now</button>'
        );
        lucide.createIcons();
        return;
    }

    container.innerHTML = `<div class="content-grid ru-saved-grid">${saved.map(renderSavedCard).join('')}</div>`;
    refreshIconsIn(container);
    applySavedStateToCards();
}

function renderFollowedCard(entry) {
    return renderSavedCard(entry);
}

async function loadRuFollowedContent() {
    const container = document.getElementById('ruFollowedList');
    if (!container) return;

    if (!authToken) {
        container.innerHTML = ruEmptyStatePanel('lock', 'Sign in required', 'Sign in to view items you follow.');
        lucide.createIcons();
        return;
    }

    container.innerHTML = ruEmptyStatePanel('loader', 'Loading followed items…', 'Fetching stories and content you follow.');
    lucide.createIcons();

    const followed = await apiGet('/content/followed');
    if (!Array.isArray(followed)) {
        container.innerHTML = ruEmptyStatePanel('alert-circle', 'Could not load followed items', 'Please try again in a moment.');
        lucide.createIcons();
        return;
    }

    const statFollowed = document.getElementById('ru-stat-followed');
    if (statFollowed) {
        const ids = await apiGet('/content/followed/ids');
        if (Array.isArray(ids)) statFollowed.textContent = ids.length;
    }

    if (!followed.length) {
        container.innerHTML = ruEmptyStatePanel(
            'heart-crack',
            'Nothing followed yet',
            'Open a story card and use Follow Item on the author profile to track updates here.',
            '<button class="btn-primary" onclick="returnToPublic()"><i data-lucide="compass"></i> Explore Now</button>'
        );
        lucide.createIcons();
        return;
    }

    container.innerHTML = `<div class="content-grid ru-followed-grid">${followed.map(renderFollowedCard).join('')}</div>`;
    refreshIconsIn(container);
    applySavedStateToCards();
}

function ruEmptyStatePanel(icon, title, message, actionHtml = '') {
    return `
        <div class="admin-panel">
            <div class="ru-empty-state">
                <i data-lucide="${icon}"></i>
                <h3>${title}</h3>
                <p>${message}</p>
                ${actionHtml}
            </div>
        </div>`;
}

function getMyDonations(allDonations) {
    if (!Array.isArray(allDonations) || !currentUser?.name) return [];
    const myName = currentUser.name.trim().toLowerCase();
    return allDonations.filter(d => (d.name || '').trim().toLowerCase() === myName);
}

function renderDpDonationsList(donations) {
    const container = document.getElementById('dpDonationsList');
    if (!container) return;

    if (!donations.length) {
        container.innerHTML = `
            <div class="admin-panel admin-empty-state">
                <div class="empty-icon"><i data-lucide="dollar-sign"></i></div>
                <h3 style="color:#334155;margin:0 0 0.5rem;font-family:'Plus Jakarta Sans',sans-serif">No donations recorded</h3>
                <p style="margin:0;max-width:320px">Your donation history will appear here once you make a contribution.</p>
                <button class="btn-primary" style="margin-top:1rem" onclick="showRoleTab('dp','overview', findRoleTabButton('dp','overview'))">Make a Donation</button>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <div class="admin-panel p-0">
            <table class="admin-table-modern">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    ${donations.map(d => `
                        <tr>
                            <td>${formatShortDate(d.created_at)}</td>
                            <td class="font-bold text-maroon">$${Number(d.amount).toLocaleString()}</td>
                            <td>${escapeHtml(d.message || '—')}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderDpRecentActivity(donations) {
    const feed = document.getElementById('dpRecentActivity');
    if (!feed) return;

    if (!donations.length) {
        feed.innerHTML = '<div class="admin-empty-state" style="padding:1.5rem 0;"><p style="color:#64748b;margin:0;">No recent activity yet.</p></div>';
        return;
    }

    feed.innerHTML = `<div class="activity-feed">${donations.slice(0, 5).map(d => `
        <div class="activity-item">
            <div class="activity-icon bg-maroon"><i data-lucide="heart"></i></div>
            <div class="activity-details">
                <p><strong>$${Number(d.amount).toLocaleString()}</strong> donated</p>
                <span style="font-size:0.8rem;color:#94a3b8">${formatShortDate(d.created_at)}</span>
            </div>
        </div>`).join('')}</div>`;
    lucide.createIcons();
}

async function populateDpDashboard() {
    if (!currentUser || currentUser.role !== 'donor_partner') return;

    const displayName = currentUser.name || 'Donor';
    const welcome = document.getElementById('dpWelcomeTitle');
    if (welcome) welcome.textContent = `Welcome back, ${displayName}`;

    const dateEl = document.getElementById('dpDateDisplay');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    const nameEl = document.getElementById('dpUserName');
    if (nameEl) nameEl.textContent = displayName;

    const badge = document.getElementById('dpRoleBadge');
    if (badge) badge.textContent = 'Donor Partner';

    const donations = await apiGet('/content/donations');
    const myDonations = getMyDonations(donations);
    const totalGiven = myDonations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setStat('dp-stat-total', '$' + totalGiven.toLocaleString());
    setStat('dp-stat-projects', '0');
    setStat('dp-stat-students', '0');
    setStat('dp-stat-certificates', '0');

    renderDpDonationsList(myDonations);
    renderDpRecentActivity(myDonations);
    lucide.createIcons();
}

/* =================== COORDINATOR DASHBOARD =================== */
const CO_TAB_FORM_TYPES = {
    innovation: 'innovation_join',
    alumni: 'alumni_join',
    donations: 'donation_pledge',
    community: 'community_join',
    research: 'research_join',
};

const CO_FORM_CONFIG = {
    innovation: {
        formType: 'innovation_join',
        tbodyId: 'co-tbody-innovation',
        tableId: 'co-table-innovation',
        loadingId: 'co-innovation-loading',
        emptyId: 'co-innovation-empty',
        paginationId: 'co-pagination-innovation',
        countId: 'co-pagination-innovation-count',
        filterId: 'co-filter-innovation-status',
        navBadgeId: 'co-nav-innovation-badge',
        statPendingId: 'co-stat-innovation-pending',
    },
    alumni: {
        formType: 'alumni_join',
        tbodyId: 'co-tbody-alumni',
        tableId: 'co-table-alumni',
        loadingId: 'co-alumni-loading',
        emptyId: 'co-alumni-empty',
        paginationId: 'co-pagination-alumni',
        countId: 'co-pagination-alumni-count',
        filterId: 'co-filter-alumni-status',
        navBadgeId: 'co-nav-alumni-badge',
        statPendingId: 'co-stat-alumni-pending',
    },
    donations: {
        formType: 'donation_pledge',
        tbodyId: 'co-tbody-donations',
        tableId: 'co-table-donations',
        loadingId: 'co-donations-loading',
        emptyId: 'co-donations-empty',
        paginationId: 'co-pagination-donations',
        countId: 'co-pagination-donations-count',
        filterId: 'co-filter-donations-status',
        navBadgeId: 'co-nav-donations-badge',
        statPendingId: 'co-stat-donations-pending',
    },
    community: {
        formType: 'community_join',
        tbodyId: 'co-tbody-community',
        tableId: 'co-table-community',
        loadingId: 'co-community-loading',
        emptyId: 'co-community-empty',
        paginationId: 'co-pagination-community',
        countId: 'co-pagination-community-count',
        filterId: 'co-filter-community-status',
        navBadgeId: 'co-nav-community-badge',
        statPendingId: 'co-stat-community-pending',
    },
    research: {
        formType: 'research_join',
        tbodyId: 'co-tbody-research',
        tableId: 'co-table-research',
        loadingId: 'co-research-loading',
        emptyId: 'co-research-empty',
        paginationId: 'co-pagination-research',
        countId: 'co-pagination-research-count',
        filterId: 'co-filter-research-status',
        navBadgeId: 'co-nav-research-badge',
        statPendingId: 'co-stat-research-pending',
    },
};

let coordinatorActiveTab = 'innovation';
let coordinatorUiInitialized = false;
let coordinatorDetailSubmission = null;

function normalizeCoordinatorSubmission(sub) {
    const firstName = (sub.first_name || '').trim();
    const lastName = (sub.last_name || '').trim();
    const name = [firstName, lastName].filter(Boolean).join(' ')
        || (sub.submitter_name || sub.name || 'Unknown');
    return {
        ...sub,
        name,
        email: sub.email || sub.submitter_email || '—',
    };
}

function coExtraCellValue(tabKey, sub) {
    const payload = sub.payload || sub.data || sub;
    if (tabKey === 'alumni') return payload.graduation_year || payload.year || sub.details || '—';
    if (tabKey === 'donations') {
        const amount = sub.amount ?? payload.amount;
        return amount != null ? `$${Number(amount).toLocaleString()}` : '—';
    }
    if (tabKey === 'community') return payload.interest_area || payload.interest || payload.program || sub.details || '—';
    if (tabKey === 'research') return payload.research_area || payload.area || payload.program || sub.details || '—';
    return '';
}

function renderSubmissionRow(sub, tabKey) {
    const normalized = normalizeCoordinatorSubmission(sub);
    const name = escapeHtml(normalized.name);
    const email = escapeHtml(normalized.email);
    const status = sub.status || 'pending';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const date = formatShortDate(sub.created_at);
    const extra = coExtraCellValue(tabKey, sub);
    const hasExtra = ['alumni', 'donations', 'community', 'research'].includes(tabKey);
    const pendingActions = status === 'pending'
        ? `<button type="button" class="admin-table-action-btn" onclick="openCoordinatorSubmissionDetail(${sub.id}, '${tabKey}')"><i data-lucide="eye"></i> View</button>
           <button type="button" class="btn-approve" onclick="updateSubmissionStatus(${sub.id}, 'approved', '${tabKey}')"><i data-lucide="check"></i> Approve</button>
           <button type="button" class="btn-reject" onclick="updateSubmissionStatus(${sub.id}, 'rejected', '${tabKey}')"><i data-lucide="x"></i> Reject</button>`
        : `<button type="button" class="admin-table-action-btn" onclick="openCoordinatorSubmissionDetail(${sub.id}, '${tabKey}')"><i data-lucide="eye"></i> View</button>`;

    return `
        <tr class="co-submission-row" id="co-submission-row-${sub.id}">
            <td class="co-cell-applicant">
                <div class="user-cell">
                    <div class="avatar"><i data-lucide="user"></i></div>
                    <strong class="co-cell-name">${name}</strong>
                </div>
            </td>
            ${tabKey === 'donations'
                ? `<td class="co-cell-extra">${escapeHtml(extra)}</td><td class="co-cell-email">${email}</td>`
                : `<td class="co-cell-email">${email}</td>${hasExtra ? `<td class="co-cell-extra">${escapeHtml(extra)}</td>` : ''}`}
            <td class="co-cell-submitted">${date}</td>
            <td class="co-cell-status"><span class="status-badge ${ruStoryStatusClass(status)}">${statusLabel}</span></td>
            <td class="co-cell-actions">
                <div class="admin-table-actions co-row-actions">${pendingActions}</div>
            </td>
        </tr>`;
}

function setCoordinatorPanelState(tabKey, state) {
    const cfg = CO_FORM_CONFIG[tabKey];
    if (!cfg) return;
    const loading = document.getElementById(cfg.loadingId);
    const empty = document.getElementById(cfg.emptyId);
    const table = document.getElementById(cfg.tableId);
    const pagination = document.getElementById(cfg.paginationId);
    if (loading) loading.hidden = state !== 'loading';
    if (empty) empty.hidden = state !== 'empty';
    if (table) table.hidden = state !== 'ready';
    if (pagination) pagination.hidden = state !== 'ready';
}

async function loadCoordinatorSubmissions(formTypeOrTab) {
    const tabKey = CO_FORM_CONFIG[formTypeOrTab] ? formTypeOrTab : Object.keys(CO_FORM_CONFIG).find(
        key => CO_FORM_CONFIG[key].formType === formTypeOrTab
    );
    const cfg = tabKey ? CO_FORM_CONFIG[tabKey] : null;
    if (!cfg) return;

    const tbody = document.getElementById(cfg.tbodyId);
    if (!tbody) return;

    if (!authToken) {
        setCoordinatorPanelState(tabKey, 'empty');
        return;
    }

    setCoordinatorPanelState(tabKey, 'loading');

    const filterEl = document.getElementById(cfg.filterId);
    const statusFilter = filterEl?.value || 'pending';
    const query = statusFilter === 'all'
        ? `form_type=${encodeURIComponent(cfg.formType)}`
        : `form_type=${encodeURIComponent(cfg.formType)}&status=${encodeURIComponent(statusFilter)}`;
    const items = await apiGet(`/forms/submissions?${query}`);

    if (!Array.isArray(items)) {
        setCoordinatorPanelState(tabKey, 'empty');
        return;
    }

    if (!items.length) {
        tbody.innerHTML = '';
        setCoordinatorPanelState(tabKey, 'empty');
        return;
    }

    tbody.innerHTML = items.map(item => renderSubmissionRow(normalizeCoordinatorSubmission(item), tabKey)).join('');
    const countEl = document.getElementById(cfg.countId);
    if (countEl) countEl.textContent = `${items.length} submission${items.length === 1 ? '' : 's'}`;
    setCoordinatorPanelState(tabKey, 'ready');
    lucide.createIcons();
}

async function updateSubmissionStatus(id, status, tabKey) {
    if (!authToken) {
        showToast('Please sign in first.', 'error');
        return;
    }

    const res = await apiPatch(`/forms/submissions/${id}`, { status });
    if (res.ok) {
        showToast(`Submission ${status}.`);
        closeCoordinatorSubmissionDetail();
        await loadCoordinatorStats();
        const activeTab = tabKey || coordinatorActiveTab;
        if (activeTab && CO_FORM_CONFIG[activeTab]) {
            await loadCoordinatorSubmissions(activeTab);
        }
    } else {
        const detail = res.data?.detail;
        showToast(typeof detail === 'string' ? detail : 'Failed to update submission.', 'error');
    }
}

async function openCoordinatorSubmissionDetail(id, tabKey) {
    coordinatorDetailSubmission = { id, tabKey };
    const modal = document.getElementById('co-submission-detail-modal');
    const titleEl = document.getElementById('co-detail-title');
    const bodyEl = document.getElementById('co-detail-body');
    const statusEl = document.getElementById('co-detail-status-badge');
    const submittedEl = document.getElementById('co-detail-submitted-at');
    const formTypeEl = document.getElementById('co-detail-form-type');
    const actionsEl = document.getElementById('co-detail-actions');
    if (!modal || !bodyEl) return;

    const sub = await apiGet(`/forms/submissions/${id}`);
    if (!sub || Array.isArray(sub)) {
        showToast('Could not load submission details.', 'error');
        return;
    }

    const normalized = normalizeCoordinatorSubmission(sub);
    const status = sub.status || 'pending';
    const cfg = CO_FORM_CONFIG[tabKey];

    if (titleEl) titleEl.innerHTML = `<i data-lucide="file-text"></i> ${escapeHtml(normalized.name)}`;
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = `status-badge ${ruStoryStatusClass(status)}`;
    }
    if (submittedEl) submittedEl.textContent = `Submitted ${formatShortDate(sub.created_at)}`;
    if (formTypeEl) formTypeEl.textContent = cfg?.formType || sub.form_type || tabKey;

    const lines = [
        `<dl class="co-detail-field"><dt>Email</dt><dd>${escapeHtml(normalized.email)}</dd></dl>`,
    ];
    if (sub.phone) {
        lines.push(`<dl class="co-detail-field"><dt>Phone</dt><dd>${escapeHtml(sub.phone)}</dd></dl>`);
    }
    if (sub.amount != null) {
        lines.push(`<dl class="co-detail-field"><dt>Amount</dt><dd>$${Number(sub.amount).toLocaleString()}</dd></dl>`);
    }
    if (sub.details) {
        lines.push(`<dl class="co-detail-field"><dt>Details</dt><dd>${escapeHtml(sub.details)}</dd></dl>`);
    }
    if (sub.notes) {
        lines.push(`<dl class="co-detail-field"><dt>Notes</dt><dd>${escapeHtml(sub.notes)}</dd></dl>`);
    }
    bodyEl.innerHTML = lines.join('');

    if (actionsEl) {
        actionsEl.hidden = status !== 'pending';
    }

    modal.classList.add('show');
    lucide.createIcons();
}

function closeCoordinatorSubmissionDetail() {
    const modal = document.getElementById('co-submission-detail-modal');
    if (modal) modal.classList.remove('show');
    coordinatorDetailSubmission = null;
}

function initCoordinatorDashboardUi() {
    if (coordinatorUiInitialized) return;
    coordinatorUiInitialized = true;

    document.querySelectorAll('#coordinator-dashboard .cdash-nav-btn[data-co-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.coTab;
            if (tabId) showRoleTab('co', tabId, btn);
        });
    });

    Object.keys(CO_FORM_CONFIG).forEach(tabKey => {
        const filterEl = document.getElementById(CO_FORM_CONFIG[tabKey].filterId);
        if (filterEl) {
            filterEl.addEventListener('change', () => loadCoordinatorSubmissions(tabKey));
        }
    });

    const closeBtn = document.getElementById('co-detail-close');
    const closeSecondary = document.getElementById('co-detail-close-secondary');
    const approveBtn = document.getElementById('co-detail-approve');
    const rejectBtn = document.getElementById('co-detail-reject');
    if (closeBtn) closeBtn.addEventListener('click', closeCoordinatorSubmissionDetail);
    if (closeSecondary) closeSecondary.addEventListener('click', closeCoordinatorSubmissionDetail);
    if (approveBtn) {
        approveBtn.addEventListener('click', () => {
            if (coordinatorDetailSubmission) {
                updateSubmissionStatus(
                    coordinatorDetailSubmission.id,
                    'approved',
                    coordinatorDetailSubmission.tabKey
                );
            }
        });
    }
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            if (coordinatorDetailSubmission) {
                updateSubmissionStatus(
                    coordinatorDetailSubmission.id,
                    'rejected',
                    coordinatorDetailSubmission.tabKey
                );
            }
        });
    }
}

async function loadCoordinatorStats() {
    const stats = await apiGet('/forms/stats');
    if (!stats || Array.isArray(stats)) return;

    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    const byType = stats.by_form_type || stats.by_type || {};
    Object.entries(CO_FORM_CONFIG).forEach(([tabKey, cfg]) => {
        const bucket = byType[cfg.formType] || byType[tabKey] || {};
        const pending = bucket.pending ?? stats[`${tabKey}_pending`] ?? stats[`${cfg.formType}_pending`];
        if (pending != null) {
            setStat(cfg.statPendingId, pending);
            const badge = document.getElementById(cfg.navBadgeId);
            if (badge) {
                if (pending > 0) {
                    badge.textContent = pending > 99 ? '99+' : String(pending);
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
            }
        }
    });

    const pendingTotal = stats.pending ?? stats.total_pending ?? Object.values(byType).reduce(
        (sum, bucket) => sum + (bucket?.pending || 0), 0
    );
    setStat('co-stat-total-pending', pendingTotal);
    setStat('co-stat-approved-today', stats.approved_today ?? stats.approved ?? 0);
    setStat('co-stat-rejected-today', stats.rejected_today ?? stats.rejected ?? 0);
}

async function populateCoordinatorDashboard() {
    if (!currentUser || currentUser.role !== 'coordinator') return;

    initCoordinatorDashboardUi();

    const displayName = getUserDisplayName(currentUser) || 'Coordinator';

    const welcome = document.getElementById('coWelcomeTitle');
    if (welcome) welcome.textContent = `Welcome back, ${displayName}`;

    const dateEl = document.getElementById('coDateDisplay');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    const nameEl = document.getElementById('coUserName');
    if (nameEl) nameEl.textContent = displayName;

    const badge = document.getElementById('coRoleBadge');
    if (badge) badge.textContent = 'Coordinator';

    await loadCoordinatorStats();
    if (coordinatorActiveTab && CO_TAB_FORM_TYPES[coordinatorActiveTab]) {
        await loadCoordinatorSubmissions(coordinatorActiveTab);
    }
    lucide.createIcons();
}

function ruStoryStatusClass(status) {
    if (status === 'approved') return 'approved';
    if (status === 'pending') return 'pending';
    if (status === 'rejected') return 'rejected';
    return 'inactive';
}

function formatShortDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadRuSharedStories() {
    const container = document.getElementById('ruStoriesList');
    if (!container) return;

    if (!authToken) {
        container.innerHTML = ruEmptyStatePanel('lock', 'Sign in required', 'Sign in to view your shared stories.');
        lucide.createIcons();
        return;
    }

    container.innerHTML = ruEmptyStatePanel('loader', 'Loading stories…', 'Fetching your shared content.');
    lucide.createIcons();

    const stories = await apiGet('/content/my-news');
    if (!Array.isArray(stories)) {
        container.innerHTML = ruEmptyStatePanel('alert-circle', 'Could not load stories', 'Please try again in a moment.');
        lucide.createIcons();
        return;
    }

    const statStories = document.getElementById('ru-stat-stories');
    if (statStories) statStories.textContent = stories.length;

    if (!stories.length) {
        container.innerHTML = ruEmptyStatePanel(
            'file-text',
            'No shared stories yet',
            'Share a story from the public site to see it here with approval status and comments.',
            '<button class="btn-primary" onclick="returnToPublic()"><i data-lucide="pen-tool"></i> Share a Story</button>'
        );
        lucide.createIcons();
        return;
    }

    container.innerHTML = `<div class="ru-stories-list">${stories.map(story => {
        const img = resolveMediaUrl(story.image) || `https://picsum.photos/120/90?random=${story.id}`;
        const status = story.status || 'pending';
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        const comments = Array.isArray(story.comments) ? story.comments : [];
        const commentsHtml = comments.length
            ? `<ul class="ru-story-comments">${comments.map(c => `<li>${renderRuStoryComment(c, story.id)}</li>`).join('')}</ul>`
            : `<p class="ru-story-no-comments">No comments yet.</p>`;

        return `
            <article class="ru-story-card">
                <div class="ru-story-main">
                    <img class="ru-story-thumb" src="${img}" alt="${escapeHtml(story.title || 'Story')}" onerror="this.src='https://picsum.photos/120/90?random=${story.id}'">
                    <div class="ru-story-body">
                        <div class="ru-story-title-row">
                            <h3>${escapeHtml(story.title || 'Untitled story')}</h3>
                            <span class="status-badge ${ruStoryStatusClass(status)}">${statusLabel}</span>
                        </div>
                        <p class="ru-story-desc">${escapeHtml(truncateText(story.description || '', 160))}</p>
                        <div class="ru-story-meta">
                            <span><i data-lucide="calendar"></i> ${formatShortDate(story.created_at)}</span>
                            <span><i data-lucide="heart"></i> ${story.likes || 0} likes</span>
                            <span><i data-lucide="message-circle"></i> ${story.comments_count || comments.length} comment${(story.comments_count || comments.length) === 1 ? '' : 's'}</span>
                        </div>
                    </div>
                </div>
                <div class="ru-story-comments-wrap">
                    <h4><i data-lucide="message-square"></i> Comments</h4>
                    ${commentsHtml}
                </div>
            </article>`;
    }).join('')}</div>`;
    lucide.createIcons();
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function makeDonation() {
    const amount  = parseFloat(document.getElementById('dpDonAmount')?.value);
    const message = document.getElementById('dpDonMsg')?.value.trim();
    if (!amount || amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }
    const name = currentUser?.name || 'Anonymous';
    const res = await apiPost('/content/donations', { name, amount, message }, false);
    if (res.ok) {
        showToast('Thank you for your generous donation!');
        document.getElementById('dpDonAmount').value = '';
        document.getElementById('dpDonMsg').value    = '';
        await populateDpDashboard();
    } else {
        showToast('Donation failed. Please try again.', 'error');
    }
}

function saveProfile() {
    showToast('Profile saved successfully!');
}

/* =================== MINI CHAT (direct message overlay) =================== */
const miniChatState = {
    userId: null,
    userName: '',
    userRole: '',
    pollTimer: null,
    initialized: false,
};

function initMiniChat() {
    if (miniChatState.initialized) return;
    const sendBtn = document.getElementById('miniChatSend');
    const input = document.getElementById('miniChatInput');
    if (sendBtn) sendBtn.addEventListener('click', () => sendMiniChatMessage());
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMiniChatMessage();
            }
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('miniChatModal')?.hidden) {
            closeMiniChat();
        }
    });
    miniChatState.initialized = true;
}

function renderMiniChatHeader() {
    const name = miniChatState.userName || 'User';
    const role = miniChatState.userRole ? formatRoleShort(miniChatState.userRole) : 'Member';
    const nameEl = document.getElementById('miniChatRecipientName');
    const roleEl = document.getElementById('miniChatRecipientRole');
    const avatarEl = document.getElementById('miniChatAvatar');
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = role;
    if (avatarEl) avatarEl.textContent = msgInitials(name, '');
}

async function openMiniChat(userId, userName, userRole) {
    if (!authToken || !currentUser) {
        showAuthModal();
        return;
    }
    if (userId === currentUser.id) {
        showToast('You cannot message yourself.', 'error');
        return;
    }

    initMiniChat();
    miniChatState.userId = userId;
    miniChatState.userName = userName || 'User';
    miniChatState.userRole = userRole || '';

    const modal = document.getElementById('miniChatModal');
    if (!modal) return;

    renderMiniChatHeader();
    const messagesEl = document.getElementById('miniChatMessages');
    if (messagesEl) messagesEl.innerHTML = '<div class="msg-loading">Loading messages…</div>';

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    const input = document.getElementById('miniChatInput');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 120);
    }

    refreshIconsIn(modal);
    await loadMiniChatThread();
    startMiniChatPolling();
}

function closeMiniChat() {
    const modal = document.getElementById('miniChatModal');
    if (modal) {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
    }
    stopMiniChatPolling();
    miniChatState.userId = null;
    miniChatState.userName = '';
    miniChatState.userRole = '';
}

function stopMiniChatPolling() {
    if (miniChatState.pollTimer) {
        clearInterval(miniChatState.pollTimer);
        miniChatState.pollTimer = null;
    }
}

function startMiniChatPolling() {
    stopMiniChatPolling();
    miniChatState.pollTimer = setInterval(() => {
        if (miniChatState.userId) loadMiniChatThread({ silent: true });
        refreshUnreadMessageBadges();
    }, 10000);
}

function renderMiniChatMessagesHtml(messages) {
    if (!messages.length) {
        return '<div class="msg-loading">No messages yet. Say hello!</div>';
    }
    let lastDate = '';
    return messages.map(msg => {
        const isSent = msg.sender_id === currentUser?.id;
        const msgDate = formatMsgDateDivider(msg.created_at);
        let divider = '';
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            divider = `<div class="msg-date-divider">${escapeHtml(msgDate)}</div>`;
        }
        return `${divider}
            <div class="msg-bubble-row ${isSent ? 'sent' : 'received'}">
                <div class="msg-bubble">${escapeHtml(msg.body)}</div>
                <span class="msg-bubble-time">${formatMsgTime(msg.created_at)}</span>
            </div>`;
    }).join('');
}

async function loadMiniChatThread(opts = {}) {
    const userId = miniChatState.userId;
    const messagesEl = document.getElementById('miniChatMessages');
    if (!userId || !messagesEl) return;

    if (!opts.silent) {
        messagesEl.innerHTML = '<div class="msg-loading">Loading messages…</div>';
    }

    const messages = await apiGet(`/admin/messages/with/${userId}`);
    if (!Array.isArray(messages)) {
        if (!opts.silent) {
            const detail = messages?.detail || 'Could not load messages.';
            messagesEl.innerHTML = `<div class="msg-loading">${escapeHtml(typeof detail === 'string' ? detail : 'Could not load messages.')}</div>`;
            showToast(typeof detail === 'string' ? detail : 'Could not open this conversation.', 'error');
        }
        return;
    }

    const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    messagesEl.innerHTML = renderMiniChatMessagesHtml(messages);
    if (!opts.silent || wasAtBottom) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    if (!opts.silent) refreshUnreadMessageBadges();
}

async function sendMiniChatMessage() {
    const input = document.getElementById('miniChatInput');
    const sendBtn = document.getElementById('miniChatSend');
    const userId = miniChatState.userId;
    if (!input || !userId) return;

    const body = input.value.trim();
    if (!body) return;

    if (sendBtn) sendBtn.disabled = true;
    const res = await apiPost('/admin/messages', {
        recipient_id: userId,
        body,
    });
    if (sendBtn) sendBtn.disabled = false;

    if (res.ok) {
        input.value = '';
        await loadMiniChatThread();
        refreshUnreadMessageBadges();
    } else {
        const detail = res.data?.detail;
        showToast(typeof detail === 'string' ? detail : 'Failed to send message', 'error');
    }
}

/* =================== MESSAGING =================== */
const messagingState = {
    admin: { selectedUserId: null, selectedUser: null, pollTimer: null, searchTimer: null, initialized: false },
    ru: { selectedUserId: null, selectedUser: null, pollTimer: null, searchTimer: null, initialized: false },
    dp: { selectedUserId: null, selectedUser: null, pollTimer: null, searchTimer: null, initialized: false },
};

const MSG_CONTEXT_CONFIG = {
    admin: { prefix: 'admin', badgeId: 'nav-messages-badge' },
    ru: { prefix: 'ru', badgeId: 'ru-nav-messages-badge' },
    dp: { prefix: 'dp', badgeId: 'dp-nav-messages-badge' },
};

function msgEl(context, suffix) {
    const prefix = MSG_CONTEXT_CONFIG[context]?.prefix || context;
    return document.getElementById(`${prefix}-msg-${suffix}`);
}

function msgInitials(name, email) {
    const source = (name || email || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
}

function formatMsgTime(value) {
    if (!value) return '';
    const d = new Date(value);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMsgDateDivider(value) {
    if (!value) return '';
    const d = new Date(value);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatRoleShort(role) {
    const map = {
        super_admin: 'Super Admin',
        content_editor: 'Content Editor',
        admin: 'Admin',
        registered_user: 'Registered User',
        student_innovator: 'Innovator',
        alumni: 'Alumni',
        donor_partner: 'Donor',
        public_visitor: 'Visitor',
    };
    return map[role] || role || 'User';
}

function setMsgBadge(badgeId, count) {
    const badge = document.getElementById(badgeId);
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

async function refreshUnreadMessageBadges() {
    if (!authToken || !currentUser) return;
    const data = await apiGet('/admin/messages/unread-count');
    const count = data?.count || 0;
    const isAdmin = ['super_admin', 'content_editor', 'admin'].includes(currentUser.role);
    if (isAdmin) setMsgBadge('nav-messages-badge', count);
    if (currentUser.role === 'registered_user') setMsgBadge('ru-nav-messages-badge', count);
    if (currentUser.role === 'donor_partner') setMsgBadge('dp-nav-messages-badge', count);
}

function stopMessagePolling(context) {
    const state = messagingState[context];
    if (state?.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

function startMessagePolling(context) {
    stopMessagePolling(context);
    const state = messagingState[context];
    state.pollTimer = setInterval(async () => {
        const query = msgEl(context, 'search')?.value?.trim() || '';
        await loadConversations(context, { silent: true, query });
        if (state.selectedUserId) await loadThread(context, state.selectedUserId, { silent: true });
        refreshUnreadMessageBadges();
    }, 10000);
}

function initMessaging(context) {
    if (!authToken) {
        showToast('Please sign in to use messages.', 'error');
        return;
    }
    const state = messagingState[context];
    if (!state) return;
    if (!state.initialized) {
        const searchInput = msgEl(context, 'search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(state.searchTimer);
                state.searchTimer = setTimeout(() => {
                    loadConversations(context, { query: searchInput.value.trim() });
                }, 300);
            });
        }
        const listEl = msgEl(context, 'conversations');
        if (listEl) {
            listEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.msg-conv-item');
                if (!btn) return;
                const userId = parseInt(btn.dataset.userId, 10);
                if (userId) selectConversation(context, userId);
            });
        }
        const sendBtn = msgEl(context, 'send');
        const input = msgEl(context, 'input');
        if (sendBtn) sendBtn.addEventListener('click', () => sendChatMessage(context));
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage(context);
                }
            });
        }
        state.initialized = true;
    }
    loadConversations(context);
    startMessagePolling(context);
    refreshUnreadMessageBadges();
    lucide.createIcons();
}

function conversationItemHtml(context, conv, selectedUserId) {
    const user = conv.user;
    if (!user?.id) return '';
    const active = selectedUserId === user.id ? ' active' : '';
    let preview = '';
    if (conv.last_message) {
        preview = conv.last_sender_id === currentUser?.id ? `You: ${conv.last_message}` : conv.last_message;
    } else {
        preview = 'Start a conversation';
    }
    const unread = conv.unread_count > 0
        ? `<span class="msg-conv-unread">${conv.unread_count > 9 ? '9+' : conv.unread_count}</span>`
        : '';
    const previewClass = conv.unread_count > 0 ? ' unread' : '';
    const roleLine = user.role
        ? `<span class="msg-conv-role">${escapeHtml(formatRoleShort(user.role))}</span>`
        : '';
    const safeName = escapeHtml(user.name || user.email);
    const safeEmail = escapeHtml(user.email || '');
    const safeRole = escapeHtml(user.role || '');
    return `
        <button type="button" class="msg-conv-item${active}" data-user-id="${user.id}"
            data-user-name="${safeName}" data-user-email="${safeEmail}" data-user-role="${safeRole}"
            onclick="selectConversation('${context}', ${user.id})">
            <div class="msg-avatar">${msgInitials(user.name, user.email)}</div>
            <div class="msg-conv-body">
                <div class="msg-conv-top">
                    <div class="msg-conv-name-wrap">
                        <span class="msg-conv-name">${safeName}</span>
                        ${roleLine}
                    </div>
                    <div class="msg-conv-meta">
                        ${unread}
                        <span class="msg-conv-time">${formatMsgTime(conv.last_message_at)}</span>
                    </div>
                </div>
                <div class="msg-conv-preview${previewClass}">${escapeHtml(preview || '…')}</div>
            </div>
        </button>`;
}

function renderConversationList(context, items, opts = {}) {
    const listEl = msgEl(context, 'conversations');
    if (!listEl) return;

    const state = messagingState[context];
    const query = opts.query || '';

    if (!items.length) {
        if (query) {
            listEl.innerHTML = '<div class="msg-list-empty"><strong>No users found</strong><span>Try a different name or email</span></div>';
        } else {
            listEl.innerHTML = `
                <div class="msg-list-empty">
                    <i data-lucide="message-square-plus"></i>
                    <strong>No conversations yet</strong>
                    <span>Search above to find a user</span>
                </div>`;
        }
        lucide.createIcons();
        return;
    }

    listEl.innerHTML = items.map(conv => conversationItemHtml(context, conv, state.selectedUserId)).join('');
    if (!opts.silent) lucide.createIcons();
}

async function loadConversations(context, opts = {}) {
    const listEl = msgEl(context, 'conversations');
    if (!listEl) return;

    const query = (opts.query || '').trim();
    let items = [];

    const convos = await apiGet('/admin/messages/conversations');
    const convoList = Array.isArray(convos) ? convos.filter(c => c?.user?.id) : [];

    if (query) {
        const contacts = await apiGet(`/admin/messages/contacts?q=${encodeURIComponent(query)}`);
        const contactList = Array.isArray(contacts) ? contacts : [];
        const convoMap = new Map(convoList.map(c => [c.user.id, c]));
        items = contactList.map(user => convoMap.get(user.id) || {
            user,
            last_message: null,
            last_message_at: null,
            last_sender_id: null,
            unread_count: 0,
        });
    } else {
        items = convoList;
    }

    renderConversationList(context, items, { query, silent: opts.silent });
}

async function selectConversation(context, userId) {
    const state = messagingState[context];
    state.selectedUserId = userId;

    const convItem = msgEl(context, 'conversations')?.querySelector(`[data-user-id="${userId}"]`);
    let user = null;
    if (convItem) {
        user = {
            id: userId,
            name: convItem.dataset.userName || '',
            email: convItem.dataset.userEmail || '',
            role: convItem.dataset.userRole || '',
        };
    }
    if (!user?.name) {
        const contacts = await apiGet(`/admin/messages/contacts?q=`);
        const found = Array.isArray(contacts) ? contacts.find(c => c.id === userId) : null;
        if (found) user = found;
    }
    state.selectedUser = user || { id: userId, name: 'User', email: '', role: '' };

    msgEl(context, 'conversations')?.querySelectorAll('.msg-conv-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.userId, 10) === userId);
    });

    const empty = msgEl(context, 'empty');
    const thread = msgEl(context, 'thread');
    if (empty) empty.hidden = true;
    if (thread) thread.hidden = false;

    const header = msgEl(context, 'thread-header');
    if (header) {
        const u = state.selectedUser;
        header.innerHTML = `
            <div class="msg-avatar">${msgInitials(u.name, u.email)}</div>
            <div class="msg-thread-meta">
                <h4>${escapeHtml(u.name || u.email || 'User')}</h4>
                <span>${escapeHtml(formatRoleShort(u.role))}</span>
            </div>`;
    }

    await loadThread(context, userId);
    const query = msgEl(context, 'search')?.value?.trim() || '';
    await loadConversations(context, { silent: true, query });
    lucide.createIcons();
}

async function loadThread(context, userId, opts = {}) {
    const messagesEl = msgEl(context, 'messages');
    if (!messagesEl) return;

    if (!opts.silent) {
        messagesEl.innerHTML = '<div class="msg-loading">Loading messages…</div>';
    }

    const messages = await apiGet(`/admin/messages/with/${userId}`);
    if (!Array.isArray(messages)) {
        if (!opts.silent) messagesEl.innerHTML = '<div class="msg-loading">Could not load messages.</div>';
        return;
    }

    if (!messages.length) {
        messagesEl.innerHTML = '<div class="msg-loading">No messages yet. Say hello!</div>';
        return;
    }

    let lastDate = '';
    const html = messages.map(msg => {
        const isSent = msg.sender_id === currentUser?.id;
        const msgDate = formatMsgDateDivider(msg.created_at);
        let divider = '';
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            divider = `<div class="msg-date-divider">${escapeHtml(msgDate)}</div>`;
        }
        return `${divider}
            <div class="msg-bubble-row ${isSent ? 'sent' : 'received'}">
                <div class="msg-bubble">${escapeHtml(msg.body)}</div>
                <span class="msg-bubble-time">${formatMsgTime(msg.created_at)}</span>
            </div>`;
    }).join('');

    const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    messagesEl.innerHTML = html;
    if (!opts.silent || wasAtBottom) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    if (!opts.silent) refreshUnreadMessageBadges();
}

async function sendChatMessage(context) {
    const state = messagingState[context];
    const input = msgEl(context, 'input');
    const sendBtn = msgEl(context, 'send');
    if (!input || !state.selectedUserId) return;

    const body = input.value.trim();
    if (!body) return;

    if (sendBtn) sendBtn.disabled = true;
    const res = await apiPost('/admin/messages', {
        recipient_id: state.selectedUserId,
        body,
    });
    if (sendBtn) sendBtn.disabled = false;

    if (res.ok) {
        input.value = '';
        await loadThread(context, state.selectedUserId);
        const query = msgEl(context, 'search')?.value?.trim() || '';
        await loadConversations(context, { query });
        refreshUnreadMessageBadges();
    } else {
        showToast(res.data?.detail || 'Failed to send message', 'error');
    }
}

/* =================== NOTIFICATIONS =================== */
const notificationState = {
    items: [],
    unreadCount: 0,
    pollTimer: null,
    openContext: null,
    initialized: false,
};

const NOTIFY_TYPE_LABELS = {
    pending_approval: 'Approval',
    content_approved: 'Approved',
    content_rejected: 'Rejected',
    new_message: 'Message',
    story_comment: 'Comment',
    comment_reply: 'Reply',
    role_updated: 'Account',
};

const NOTIFY_DASHBOARD_MAP = {
    admin: 'admin-dashboard',
    ru: 'registered-user-dashboard',
    dp: 'donor-partner-dashboard',
};

function getActiveNotifyContext() {
    if (!currentUser) return null;
    const role = currentUser.role;
    if (['super_admin', 'content_editor', 'admin'].includes(role)) return 'admin';
    if (role === 'registered_user') return 'ru';
    if (role === 'donor_partner') return 'dp';
    return null;
}

function getNotifyWrap(context) {
    return document.querySelector(`.notify-wrap[data-notify-context="${context}"]`);
}

function setNotifyBadge(context, count) {
    const wrap = getNotifyWrap(context);
    const badge = wrap?.querySelector('.notify-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

function formatNotifyTime(value) {
    if (!value) return '';
    const d = new Date(value);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderNotificationDropdown(context) {
    const wrap = getNotifyWrap(context);
    if (!wrap) return;
    const listEl = wrap.querySelector('.notify-dropdown-list');
    const emptyEl = wrap.querySelector('.notify-dropdown-empty');
    if (!listEl || !emptyEl) return;

    if (!notificationState.items.length) {
        listEl.innerHTML = '';
        emptyEl.hidden = false;
        return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = notificationState.items.map(item => {
        const unreadClass = item.read_at ? '' : ' unread';
        const typeLabel = NOTIFY_TYPE_LABELS[item.type] || 'Update';
        return `
            <button type="button" class="notify-item${unreadClass}" data-notify-id="${item.id}">
                <div class="notify-item-title">
                    <strong>${escapeHtml(item.title || 'Notification')}</strong>
                    <span class="notify-item-time">${escapeHtml(formatNotifyTime(item.created_at))}</span>
                </div>
                ${item.body ? `<p class="notify-item-body">${escapeHtml(item.body)}</p>` : ''}
                <span class="notify-item-type">${escapeHtml(typeLabel)}</span>
            </button>`;
    }).join('');
}

function updateAllNotifyBadges() {
    const count = notificationState.unreadCount || 0;
    const active = getActiveNotifyContext();
    document.querySelectorAll('.notify-wrap[data-notify-context]').forEach(wrap => {
        const ctx = wrap.dataset.notifyContext;
        if (ctx === active) setNotifyBadge(ctx, count);
        else setNotifyBadge(ctx, 0);
    });
}

function closeAllNotifyDropdowns() {
    document.querySelectorAll('.notify-wrap').forEach(wrap => {
        const dropdown = wrap.querySelector('.notify-dropdown');
        const btn = wrap.querySelector('.notify-btn');
        if (dropdown) dropdown.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
    });
    notificationState.openContext = null;
}

function toggleNotifyDropdown(context) {
    const wrap = getNotifyWrap(context);
    if (!wrap) return;
    const dropdown = wrap.querySelector('.notify-dropdown');
    const btn = wrap.querySelector('.notify-btn');
    if (!dropdown || !btn) return;

    const willOpen = dropdown.hidden;
    closeAllNotifyDropdowns();
    if (willOpen) {
        dropdown.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        notificationState.openContext = context;
        renderNotificationDropdown(context);
        refreshNotifications({ silent: true });
    }
    lucide.createIcons();
}

async function refreshNotifications(opts = {}) {
    if (!authToken || !currentUser) {
        notificationState.items = [];
        notificationState.unreadCount = 0;
        updateAllNotifyBadges();
        return;
    }

    const data = await apiGet('/notifications?limit=30');
    if (!data || !Array.isArray(data.items)) {
        if (!opts.silent) return;
        return;
    }

    notificationState.items = data.items;
    notificationState.unreadCount = data.unread_count || 0;
    updateAllNotifyBadges();

    if (notificationState.openContext) {
        renderNotificationDropdown(notificationState.openContext);
    }
    lucide.createIcons();
}

async function markNotificationRead(notificationId) {
    await apiPatch(`/notifications/${notificationId}/read`);
    const item = notificationState.items.find(n => n.id === notificationId);
    if (item && !item.read_at) {
        item.read_at = new Date().toISOString();
        notificationState.unreadCount = Math.max(0, (notificationState.unreadCount || 0) - 1);
        updateAllNotifyBadges();
    }
}

async function markAllNotificationsRead() {
    await apiPatch('/notifications/read-all');
    notificationState.items.forEach(item => {
        if (!item.read_at) item.read_at = new Date().toISOString();
    });
    notificationState.unreadCount = 0;
    updateAllNotifyBadges();
    if (notificationState.openContext) {
        renderNotificationDropdown(notificationState.openContext);
    }
}

function findAdminTabButton(tabId) {
    return document.querySelector(`.admin-nav-btn[onclick*="showAdminTab('${tabId}'"]`)
        || document.querySelector(`.admin-nav-btn[onclick*='showAdminTab("${tabId}"']`);
}

function findRoleTabButton(prefix, tabId) {
    const dashId = NOTIFY_DASHBOARD_MAP[prefix];
    let navClass = 'rdash-nav-btn';
    if (prefix === 'co') navClass = 'cdash-nav-btn';
    else if (['ru', 'dp'].includes(prefix)) navClass = 'admin-nav-btn';
    return document.querySelector(`#${dashId} .${navClass}[data-co-tab="${tabId}"]`)
        || document.querySelector(`#${dashId} .${navClass}[onclick*="showRoleTab('${prefix}','${tabId}'"]`)
        || document.querySelector(`#${dashId} .${navClass}[onclick*='showRoleTab("${prefix}","${tabId}"']`);
}

async function navigateFromNotificationLink(link) {
    if (!link) return;
    const parts = link.split(':');
    let ctx = parts[0];
    let tab = parts[1];
    const extra = parts[2];

    if (!NOTIFY_DASHBOARD_MAP[ctx] && LEGACY_NOTIFY_CONTEXT_MAP[ctx]) {
        ctx = LEGACY_NOTIFY_CONTEXT_MAP[ctx];
        if (tab === 'mentor') tab = 'messages';
        if (tab === 'submissions') tab = 'stories';
        if (tab === 'achievement') tab = 'profile';
    }

    const dashId = NOTIFY_DASHBOARD_MAP[ctx];
    if (!dashId) return;

    navigateTo(dashId);

    setTimeout(async () => {
        if (ctx === 'admin') {
            const btn = findAdminTabButton(tab);
            showAdminTab(tab, btn);
            if (tab === 'messages' && extra) {
                initMessaging('admin');
                await selectConversation('admin', parseInt(extra, 10));
            }
        } else {
            const btn = findRoleTabButton(ctx, tab);
            showRoleTab(ctx, tab, btn);
            if (tab === 'messages' && extra) {
                initMessaging(ctx);
                await selectConversation(ctx, parseInt(extra, 10));
            }
        }
    }, 80);
}

function stopNotificationPolling() {
    if (notificationState.pollTimer) {
        clearInterval(notificationState.pollTimer);
        notificationState.pollTimer = null;
    }
}

function startNotificationPolling() {
    stopNotificationPolling();
    if (!authToken || !currentUser) return;
    notificationState.pollTimer = setInterval(() => {
        refreshNotifications({ silent: true });
    }, 30000);
}

function initNotificationsUI() {
    if (notificationState.initialized) return;
    document.querySelectorAll('.notify-wrap[data-notify-context]').forEach(wrap => {
        const context = wrap.dataset.notifyContext;
        const btn = wrap.querySelector('.notify-btn');
        const markAllBtn = wrap.querySelector('.notify-mark-all');
        const listEl = wrap.querySelector('.notify-dropdown-list');

        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleNotifyDropdown(context);
            });
        }
        if (markAllBtn) {
            markAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await markAllNotificationsRead();
            });
        }
        if (listEl) {
            listEl.addEventListener('click', async (e) => {
                const itemBtn = e.target.closest('.notify-item');
                if (!itemBtn) return;
                const id = parseInt(itemBtn.dataset.notifyId, 10);
                const item = notificationState.items.find(n => n.id === id);
                if (!item) return;
                await markNotificationRead(id);
                closeAllNotifyDropdowns();
                if (item.link) await navigateFromNotificationLink(item.link);
                renderNotificationDropdown(context);
            });
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.notify-wrap')) closeAllNotifyDropdowns();
    });

    notificationState.initialized = true;
    startNotificationPolling();
}

