document.addEventListener('DOMContentLoaded', () => {
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

    // 2. Automatic Background Human Verification
    //    The checkbox is non-interactive (pointer-events: none).
    //    Verification starts automatically when the widget is visible
    //    and completes after a short simulated background check (~1s).
    function autoVerifyCaptcha(opts) {
        const checkbox = document.getElementById(opts.checkboxId);
        const hiddenInput = document.getElementById(opts.hiddenInputId);
        const helper = document.getElementById(opts.helperId);
        const submitBtn = document.querySelector(opts.submitSelector);

        if (!checkbox || !hiddenInput) return;

        const msg = checkbox.querySelector('.captcha-msg');
        const iconBox = checkbox.querySelector('.check-box');
        const interactive = checkbox.closest('.captcha-interactive');
        const badge = interactive ? interactive.querySelector('img') : null;

        // --- Start state: verifying ---
        msg.textContent = 'Verifying…';
        if (helper) {
            helper.textContent = opts.helperText;
        }
        hiddenInput.value = 'false';
        checkbox.classList.remove('verified');
        iconBox.innerHTML = '';
        if (badge) badge.style.opacity = '0.3';
        if (submitBtn) submitBtn.disabled = true;

        // --- Simulated background verification (1 second) ---
        setTimeout(() => {
            // Verification succeeded
            checkbox.classList.add('verified');
            msg.innerHTML = '<strong>Success!</strong> Verification complete.';
            hiddenInput.value = 'true';

            // Green checkmark icon
            iconBox.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

            // Update helper text to confirm
            if (helper) {
                helper.textContent = opts.successText;
                helper.classList.add('verified');
            }

            // Enable the submit button
            if (submitBtn) submitBtn.disabled = false;

            // Reveal verification badge
            if (badge) badge.style.opacity = '1';
        }, 1000);
    }

    // --- Contact form captcha ---
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        autoVerifyCaptcha({
            checkboxId: 'captchaCheckbox',
            hiddenInputId: 'isHuman',
            helperId: 'captchaHelper',
            submitSelector: '#contactForm button[type="submit"]',
            helperText: 'Please complete the verification before sending your message.',
            successText: 'Verification complete. You can now send your message.'
        });
    }

    // --- Newsletter form captcha (footer) ---
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        autoVerifyCaptcha({
            checkboxId: 'captchaCheckboxNewsletter',
            hiddenInputId: 'isHumanNewsletter',
            helperId: 'captchaHelperNewsletter',
            submitSelector: '.newsletter-form button[type="submit"]',
            helperText: 'Please complete verification before subscribing.',
            successText: 'Verification complete. You can now subscribe.'
        });

        // Intercept newsletter submission to enforce verification
        newsletterForm.addEventListener('submit', function(e) {
            const isHuman = document.getElementById('isHumanNewsletter');
            if (isHuman && isHuman.value !== 'true') {
                e.preventDefault();
                return false;
            }
            e.preventDefault();
            alert('Subscribed!');
        });
    }

    // 3. Contact Form Validation
    const formFeedback = document.getElementById('formFeedback');

    if (contactForm && formFeedback) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            // The submit button is disabled until verification succeeds,
            // but we still validate everything here as a safeguard.
            formFeedback.className = 'form-feedback';
            formFeedback.style.display = 'none';

            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const message = document.getElementById('contactMessage').value.trim();
            const isHuman = document.getElementById('isHuman').value;

            if (!name || !email || !message) {
                showFeedback('error', 'Please fill in all required fields.');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showFeedback('error', 'Please enter a valid email address.');
                return;
            }

            if (isHuman !== 'true') {
                showFeedback('error', 'Please verify that you are human.');
                return;
            }

            // Success state (simulated since there is no backend yet)
            showFeedback('success', 'Your message has been sent successfully! We will get back to you shortly.');

            // Reset form
            contactForm.reset();
        });
    }

    function showFeedback(type, message) {
        formFeedback.textContent = message;
        formFeedback.className = `form-feedback ${type}`;
        formFeedback.style.display = 'block';
    }
});
