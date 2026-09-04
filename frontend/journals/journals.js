document.addEventListener('DOMContentLoaded', () => {
    // 0. Scroll Animations
    //    a) Reveal on scroll: fade-in / slide-up / slide-left / slide-right
    const revealEls = document.querySelectorAll('[data-reveal]');

    if (revealEls.length) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const delay = parseInt(el.dataset.revealDelay || '0', 10);
                    el.style.setProperty('--reveal-delay', `${delay}ms`);
                    el.classList.add('revealed');
                    revealObserver.unobserve(el);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        revealEls.forEach((el) => revealObserver.observe(el));
    }

    //    b) Parallax: elements with [data-parallax] drift with scroll.
    //       The value is the drift factor (0.1 = slow, 0.5 = fast).
    const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]'))
        .map((el) => ({ el, factor: parseFloat(el.dataset.parallax || '0.2') }));

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let parallaxTicking = false;

    function applyParallax() {
        const scrollY = window.scrollY;
        parallaxEls.forEach(({ el, factor }) => {
            el.style.transform = `translate3d(0, ${(scrollY * factor).toFixed(1)}px, 0)`;
        });
        parallaxTicking = false;
    }

    if (parallaxEls.length && !prefersReducedMotion) {
        window.addEventListener('scroll', () => {
            if (!parallaxTicking) {
                parallaxTicking = true;
                requestAnimationFrame(applyParallax);
            }
        }, { passive: true });
        applyParallax();
    }

    //    c) Animated counters in the hero stats strip
    const counters = document.querySelectorAll('[data-count]');

    if (counters.length) {
        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                counterObserver.unobserve(el);

                const target = parseInt(el.dataset.count || '0', 10);
                const suffix = el.dataset.suffix || '';
                const duration = 1400;
                const start = performance.now();

                function tick(now) {
                    const progress = Math.min((now - start) / duration, 1);
                    // Ease-out cubic for a natural slowdown
                    const eased = 1 - Math.pow(1 - progress, 3);
                    el.textContent = Math.round(target * eased) + suffix;
                    if (progress < 1) requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
            });
        }, { threshold: 0.4 });

        counters.forEach((el) => counterObserver.observe(el));
    }

    // 1. Back to Top Button Logic
    const backToTopBtn = document.getElementById('backToTop');

    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('show');
            } else {
                backToTopBtn.classList.remove('show');
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // 2. Contact Form Validation
    const formFeedback = document.getElementById('formFeedback');
    const contactForm = document.getElementById('contactForm');

    if (contactForm && formFeedback) {
        contactForm.addEventListener('submit', function (e) {
            e.preventDefault();
            formFeedback.className = 'form-feedback';
            formFeedback.style.display = 'none';

            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const message = document.getElementById('contactMessage').value.trim();

            if (!name || !email || !message) {
                showFeedback('error', 'Please fill in all required fields.');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showFeedback('error', 'Please enter a valid email address.');
                return;
            }

            showFeedback('success', 'Your message has been sent successfully! We will get back to you shortly.');
            contactForm.reset();
        });
    }

    // 3. Newsletter form (footer)
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', function (e) {
            e.preventDefault();
            alert('Subscribed!');
        });
    }

    function showFeedback(type, message) {
        formFeedback.textContent = message;
        formFeedback.className = `form-feedback ${type}`;
        formFeedback.style.display = 'block';
    }

    // 4. Journals carousel (marquee + expand-to-detail overlay)
    if (typeof window.initJournalsCarousel === 'function') {
        window.initJournalsCarousel();
    }
});

/* ==========================================================================
   Journals carousel — auto-scrolling marquee with expand-to-detail overlay
   ========================================================================== */
window.initJournalsCarousel = function initJournalsCarousel() {
    const track = document.getElementById('journalsGrid');
    const viewport = document.getElementById('jcViewport');
    const prevBtn = document.getElementById('jcPrev');
    const nextBtn = document.getElementById('jcNext');
    const overlay = document.getElementById('jcOverlay');
    if (!track || !viewport || !overlay) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = track.children.length / 2; // original set size (set is duplicated once)
    if (!total) return;
    track.dataset.carouselInit = 'true'; // guard against double-init (auto + explicit call)

    /* --- Measure one full set width (cards + gap) for the seamless loop --- */
    let setWidth = 0;
    let gapWidth = 28;
    const measure = () => {
        gapWidth = parseFloat(getComputedStyle(track).columnGap) || 28;
        // One full set = the first `total` cards plus the gap after each. The
        // inter-set gap is the same, so including it keeps the loop seamless.
        setWidth = 0;
        for (let i = 0; i < total; i++) setWidth += track.children[i].getBoundingClientRect().width + gapWidth;
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });

    /* --- Auto-scrolling marquee --- */
    let offset = 0;
    let paused = false;
    const SPEED = 0.5; // px per frame

    const wrap = () => {
        if (setWidth > 0) {
            if (offset >= setWidth) offset -= setWidth;
            if (offset < 0) offset += setWidth;
        }
    };
    const render = () => { track.style.transform = `translateX(${-offset}px)`; };

    function tick() {
        if (!paused && !prefersReducedMotion) { offset += SPEED; wrap(); render(); }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    /* Pause on hover/focus inside the carousel */
    const carousel = document.getElementById('jcCarousel');
    ['mouseenter', 'focusin'].forEach((evt) => carousel.addEventListener(evt, () => { paused = true; }));
    ['mouseleave', 'focusout'].forEach((evt) => carousel.addEventListener(evt, () => { paused = false; }));

    /* --- Arrow buttons: nudge by one card --- */
    const nudge = (dir) => {
        measure();
        offset += dir * (track.children[0].getBoundingClientRect().width + gapWidth);
        wrap();
        render();
    };
    prevBtn && prevBtn.addEventListener('click', () => nudge(-1));
    nextBtn && nextBtn.addEventListener('click', () => nudge(1));

    /* --- Pointer drag / touch swipe --- */
    let dragging = false, startX = 0, startOffset = 0, moved = false, downCard = null;
    viewport.addEventListener('pointerdown', (e) => {
        dragging = true; moved = false;
        startX = e.clientX; startOffset = offset;
        downCard = e.target.closest('.journal-card');
        track.classList.add('is-dragging');
        viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 6) moved = true;
        offset = startOffset - dx;
        wrap(); render();
    });
    const endDrag = () => { dragging = false; track.classList.remove('is-dragging'); };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    /* ==========================================================================
       Expand-to-detail overlay
       ========================================================================== */
    const JOURNALS_DATA = window.JOURNALS_DATA || [];
    const detailCover = document.getElementById('jcDetailCover');
    const detailTitle = document.getElementById('jcDetailTitle');
    const detailEyebrow = document.getElementById('jcDetailEyebrow');
    const detailMeta = document.getElementById('jcDetailMeta');
    const detailDesc = document.getElementById('jcDetailDesc');
    const detailLatest = document.getElementById('jcDetailLatest');
    const detailClose = document.getElementById('jcDetailClose');
    const backdrop = document.getElementById('jcOverlayBackdrop');
    let lastFocused = null;

    const ISSUE_SAMPLES = [
        { title: 'Determinants of SME growth in Kampala', year: 2024 },
        { title: 'Solar microgrid adoption in rural East Africa', year: 2024 },
        { title: 'Mobile banking and financial inclusion', year: 2023 }
    ];

    function openDetail(idx, card) {
        const j = JOURNALS_DATA[idx % JOURNALS_DATA.length];
        if (!j) return;
        lastFocused = card;

        detailEyebrow.textContent = `${j.vol} · ${j.freq}`;
        detailTitle.textContent = j.title;
        detailDesc.textContent = j.desc;
        detailMeta.innerHTML = `
      <span><i class="ph ph-hash"></i> ISSN ${j.issn}</span>
      <span><i class="ph ph-clock"></i> ${j.freq}</span>
      <span class="gold"><i class="ph ph-lock-key-open"></i> Open Access</span>`;
        detailLatest.innerHTML = `
      <h4>Latest Articles</h4>
      <ul>${ISSUE_SAMPLES.map((a) => `<li><i class="ph ph-file-text"></i><span>${a.title}</span><span>${a.year}</span></li>`).join('')}</ul>`;

        // Clone the 3D cover from the clicked card into the detail panel
        const cover = card.querySelector('.jc-cover');
        detailCover.innerHTML = '';
        if (cover) detailCover.appendChild(cover.cloneNode(true));

        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('is-open'));
        document.body.style.overflow = 'hidden';
        detailClose.focus();
    }

    function closeDetail() {
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        setTimeout(() => { overlay.hidden = true; }, 300);
        if (lastFocused) lastFocused.focus();
    }

    track.addEventListener('click', (e) => {
        if (moved) return; // ignore click that ended a drag
        // setPointerCapture() retargets the click to the viewport, so e.target may
        // not be inside the card — fall back to the card that was pressed.
        const card = e.target.closest('.journal-card') || downCard;
        downCard = null;
        if (!card || !track.contains(card)) return;
        openDetail(parseInt(card.dataset.idx, 10), card);
    });
    track.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.journal-card');
        if (!card) return;
        e.preventDefault();
        openDetail(parseInt(card.dataset.idx, 10), card);
    });

    detailClose.addEventListener('click', closeDetail);
    backdrop.addEventListener('click', closeDetail);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) closeDetail();
    });
};
