import * as params from '@params';

const modal = document.getElementById('global-search');
const dialog = modal?.querySelector('.global-search-dialog');
const closeButton = document.getElementById('search-close');
const clearButton = document.getElementById('search-clear');
const resList = document.getElementById('searchResults');
const sInput = document.getElementById('searchInput');
const searchBox = document.getElementById('searchbox');
const status = document.getElementById('search-status');
const triggers = Array.from(document.querySelectorAll('.global-search-trigger'));

let fuse;
let fusePromise;
let currentElement = null;
let firstResult = null;
let lastResult = null;
let restoreFocusTo = null;

const defaultFuseOptions = {
    distance: 100,
    threshold: 0.4,
    ignoreLocation: true,
    keys: ['title', 'permalink', 'summary', 'content']
};

const buildFuseOptions = () => {
    if (!params.fuseOpts) {
        return defaultFuseOptions;
    }

    return {
        isCaseSensitive: params.fuseOpts.iscasesensitive ?? false,
        includeScore: params.fuseOpts.includescore ?? false,
        includeMatches: params.fuseOpts.includematches ?? false,
        minMatchCharLength: params.fuseOpts.minmatchcharlength ?? 1,
        shouldSort: params.fuseOpts.shouldsort ?? true,
        findAllMatches: params.fuseOpts.findallmatches ?? false,
        keys: params.fuseOpts.keys ?? defaultFuseOptions.keys,
        location: params.fuseOpts.location ?? 0,
        threshold: params.fuseOpts.threshold ?? defaultFuseOptions.threshold,
        distance: params.fuseOpts.distance ?? defaultFuseOptions.distance,
        ignoreLocation: params.fuseOpts.ignorelocation ?? defaultFuseOptions.ignoreLocation
    };
};

const debounce = (fn, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => fn(...args), delay);
    };
};

const setStatus = (message) => {
    if (status) {
        status.textContent = message;
    }
};

const reset = () => {
    currentElement = null;
    firstResult = null;
    lastResult = null;
    resList.replaceChildren();
    sInput.value = '';
    setStatus('');
};

const setActiveResult = (element) => {
    resList.querySelectorAll('.focus').forEach((item) => item.classList.remove('focus'));

    if (!element) {
        return;
    }

    element.focus();
    element.classList.add('focus');
    currentElement = element;
};

const createResult = (result) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    const title = document.createElement('span');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    link.className = 'search-result-link';
    link.href = result.item.permalink;
    title.textContent = result.item.title;

    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="m9 18 6-6-6-6"></path>';

    link.append(title, svg);
    li.append(link);
    return li;
};

const renderResults = (results) => {
    const fragment = document.createDocumentFragment();

    for (const result of results) {
        fragment.append(createResult(result));
    }

    resList.replaceChildren(fragment);
    firstResult = resList.firstElementChild;
    lastResult = resList.lastElementChild;
    currentElement = null;
    setStatus(results.length === 1 ? '1 result' : `${results.length} results`);
};

const performSearch = () => {
    if (!fuse) {
        return;
    }

    const query = sInput.value.trim();
    if (!query) {
        renderResults([]);
        setStatus('');
        return;
    }

    const searchOptions = params.fuseOpts?.limit ? { limit: params.fuseOpts.limit } : undefined;
    const results = searchOptions ? fuse.search(query, searchOptions) : fuse.search(query);
    renderResults(results);
};

const loadSearchIndex = () => {
    if (fuse) {
        return Promise.resolve(fuse);
    }
    if (fusePromise) {
        return fusePromise;
    }

    fusePromise = fetch(params.indexURL)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Search index load failed: ${response.status}`);
            }
            return response.json();
        })
        .then((data) => {
            fuse = new Fuse(data, buildFuseOptions());
            performSearch();
            return fuse;
        })
        .catch((error) => {
            fusePromise = null;
            setStatus('Search is unavailable.');
            console.error(error);
        });

    return fusePromise;
};

const setBackgroundInert = (isInert) => {
    document.querySelectorAll('body > header, body > main, body > footer, body > .top-link').forEach((element) => {
        element.inert = isInert;
    });
};

const openSearch = () => {
    if (!modal || modal.classList.contains('active')) {
        return;
    }

    restoreFocusTo = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('search-modal-open');
    setBackgroundInert(true);
    triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'true'));
    sInput.focus();
    loadSearchIndex();
};

const closeSearch = () => {
    if (!modal?.classList.contains('active')) {
        return;
    }

    reset();
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('search-modal-open');
    setBackgroundInert(false);
    triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));

    if (restoreFocusTo?.isConnected) {
        restoreFocusTo.focus();
    }
    restoreFocusTo = null;
};

const trapFocus = (event) => {
    if (event.key !== 'Tab') {
        return;
    }

    const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]'))
        .filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
};

triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        openSearch();
    });
});

closeButton?.addEventListener('click', closeSearch);
clearButton?.addEventListener('click', () => {
    sInput.value = '';
    renderResults([]);
    setStatus('');
    sInput.focus();
});

modal?.addEventListener('click', (event) => {
    if (!event.target.closest('.global-search-dialog')) {
        closeSearch();
    }
});

dialog?.addEventListener('keydown', trapFocus);
sInput?.addEventListener('input', debounce(performSearch, 120));
sInput?.addEventListener('search', () => {
    if (!sInput.value) {
        renderResults([]);
        setStatus('');
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('active')) {
        event.preventDefault();
        closeSearch();
        return;
    }

    if (!modal?.classList.contains('active') || !firstResult || !searchBox.contains(document.activeElement)) {
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (document.activeElement === sInput) {
            setActiveResult(firstResult.querySelector('.search-result-link'));
        } else if (document.activeElement.closest('li') !== lastResult) {
            setActiveResult(document.activeElement.closest('li')?.nextElementSibling?.querySelector('.search-result-link'));
        }
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (document.activeElement.closest('li') === firstResult) {
            sInput.focus();
        } else if (document.activeElement !== sInput) {
            setActiveResult(document.activeElement.closest('li')?.previousElementSibling?.querySelector('.search-result-link'));
        }
    }
});

if (triggers.some((trigger) => new URL(trigger.href, window.location.href).pathname === window.location.pathname)) {
    openSearch();
}
