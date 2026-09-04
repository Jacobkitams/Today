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
        contactForm.addEventListener('submit', function(e) {
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
        newsletterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Subscribed!');
        });
    }

    function showFeedback(type, message) {
        formFeedback.textContent = message;
        formFeedback.className = `form-feedback ${type}`;
        formFeedback.style.display = 'block';
    }
});
