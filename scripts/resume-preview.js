(() => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
    // StatiCrypt replaces the document after unlocking, but keeps the window.
    if (window.__resumePreviewPolling) return;
    window.__resumePreviewPolling = true;
    const version = document.querySelector('meta[name="resume-preview-version"]').content;

    const poll = async () => {
        try {
            const url = new URL(location.pathname, location.origin);
            url.searchParams.set('_resume_preview', Date.now());
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) {
                const html = await response.text();
                const next = html.match(/<meta name="resume-preview-version" content="([a-f0-9]+)">/);
                if (!next || next[1] !== version) {
                    location.reload();
                    return;
                }
            }
        } catch {
            // Keep the current page while the preview server is restarting.
        }
        window.setTimeout(poll, 1500);
    };
    window.setTimeout(poll, 1500);
})();
