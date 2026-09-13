document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const journalId = params.get('id');

    if (!journalId) {
        window.location.href = 'journals.html';
        return;
    }

    const JOURNALS_DATA = window.JOURNALS_DATA || [];
    const ISSUE_SAMPLES = window.ISSUE_SAMPLES_DATA || [];

    const journal = JOURNALS_DATA.find(j => j.acronym === journalId);

    if (!journal) {
        window.location.href = 'journals.html';
        return;
    }

    // Populate Hero / Header
    const sidebarTitle = document.getElementById('jsSidebarTitle');
    if(sidebarTitle) sidebarTitle.textContent = journal.title;
    
    document.getElementById('jsSidebarAcronym').textContent = journal.acronym;
    document.getElementById('jhVol').innerHTML = `<i class="ph ph-books"></i> ${journal.vol} &middot; ${journal.freq}`;
    document.getElementById('jhTitle').textContent = journal.title;

    // Apply journal specific accent color to the acronym badge
    document.getElementById('jsSidebarAcronym').style.backgroundColor = journal.accent;

    // Populate Sidebar Facts
    document.getElementById('jsIssn').textContent = journal.issn;
    document.getElementById('jsFreq').textContent = journal.freq;

    // Populate Main Content
    // We use fullDesc if available, otherwise fallback to desc
    const descText = journal.fullDesc || journal.desc;
    document.getElementById('jmFullDesc').innerHTML = `<p>${descText}</p>`;

    // Populate Latest Articles
    const articlesList = document.getElementById('jmLatestArticles');
    articlesList.innerHTML = ISSUE_SAMPLES.map(a => `
        <li>
            <div class="article-meta">
                <span class="article-year">${a.year}</span>
                <span class="article-type">Research Article</span>
            </div>
            <a href="#" class="article-title-link"><h4>${a.title}</h4></a>
            <a href="#" class="btn btn-pill">PDF <i class="ph ph-download-simple"></i></a>
        </li>
    `).join('');
});
