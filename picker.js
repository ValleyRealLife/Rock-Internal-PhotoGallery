/*
 * PhotoGallery: "Insert photo" for Rock's HTML editor.
 *
 * Adds a toolbar button to every Summernote editor on the page (HTML Content block,
 * content channel items, ...). The button opens a panel that browses the gallery
 * (search, rating filter, sort), then inserts an <img> tag at the cursor. Works in
 * the visual editor and in Rock's code editor mode. With an image selected in the
 * visual editor, the panel replaces that image instead.
 *
 * Load it on every internal page with an HTML Content block (site Header zone):
 *   <script src="/Content/vrl_lava/PhotoGallery/picker.js?v=5" data-gallery-url="/page/123" defer></script>
 * Bump ?v= after changing this file so browsers fetch the new copy.
 * data-gallery-url is optional; it adds an "Open gallery" link to the panel.
 *
 * Data comes from the Lava app's browse endpoint (view=picker), so the user needs
 * View access to the PhotoGallery app.
 */
(function () {
    'use strict';

    if (window.wtiPicker || !window.jQuery) { return; }

    var $ = window.jQuery;
    var script = document.currentScript;
    var BROWSE_URL = '/api/v2/lava-app/1/photogallery/browse';
    var GALLERY_URL = (script && script.getAttribute('data-gallery-url')) || '';
    var STORE_KEY = 'wti.picker.size';
    var NONE = '⊘';
    var STAR = '★';

    var PRESETS = [
        { label: 'Original size', w: 0, h: 0, mode: 'max' },
        { label: 'Thumbnail 480', w: 480, h: 0, mode: 'max' },
        { label: 'Card 800×600', w: 800, h: 600, mode: 'crop' },
        { label: 'Square 1080', w: 1080, h: 1080, mode: 'crop' },
        { label: 'Full width 1920', w: 1920, h: 0, mode: 'max' },
        { label: 'Hero 1920×1080', w: 1920, h: 1080, mode: 'crop' }
    ];
    var DEFAULT_SIZE = { w: 1920, h: 0, mode: 'max', anchor: 'middlecenter' };

    /* ---------- helpers ---------- */

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function positiveInt(value) {
        var n = parseInt(value, 10);
        return n > 0 ? n : 0;
    }

    function loadSize() {
        try {
            var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (saved && typeof saved === 'object') { return $.extend({}, DEFAULT_SIZE, saved); }
        } catch (e) { /* storage blocked or bad JSON */ }
        return $.extend({}, DEFAULT_SIZE);
    }

    function saveSize(size) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(size)); } catch (e) { /* ignore */ }
    }

    /* Same URL rules as the gallery's URL builder */
    function buildImageUrl(item, size) {
        var params = ['guid=' + item.guid];
        if (size.w) { params.push('w=' + size.w); }
        if (size.h) { params.push('h=' + size.h); }
        if (size.w && size.h) {
            /* Always send mode with both sizes; without it Rock drops the smaller one */
            params.push('mode=' + size.mode);
            if (size.mode === 'crop' && size.anchor && size.anchor !== 'middlecenter') { params.push('anchor=' + size.anchor); }
        }
        return '/GetImage.ashx?' + params.join('&');
    }

    /* Pixel size the URL will produce (no upscaling), for the width/height attributes */
    function outputSize(item, size) {
        var ow = positiveInt(item.width);
        var oh = positiveInt(item.height);
        if (size.w && size.h && size.mode === 'crop') { return { w: size.w, h: size.h }; }
        if (!ow || !oh) { return null; }
        var scale = 1;
        if (size.w && size.h) { scale = Math.min(size.w / ow, size.h / oh, 1); }
        else if (size.w) { scale = Math.min(size.w / ow, 1); }
        else if (size.h) { scale = Math.min(size.h / oh, 1); }
        return { w: Math.round(ow * scale), h: Math.round(oh * scale) };
    }

    function buildImgHtml(item, size, alt) {
        var dims = outputSize(item, size);
        return '<img src="' + escapeHtml(buildImageUrl(item, size)) + '" alt="' + escapeHtml(alt) + '"' +
            (dims ? ' width="' + dims.w + '" height="' + dims.h + '"' : '') +
            ' style="max-width: 100%; height: auto;">';
    }

    function starsHtml(n) {
        if (!n) { return NONE; }
        var html = '';
        for (var i = 1; i <= 5; i++) { html += i <= n ? STAR : '☆'; }
        return html;
    }

    /* ---------- styles ---------- */

    function injectStyles() {
        if (document.getElementById('wti-pk-styles')) { return; }
        var css = [
            'dialog.wti-pk { width: min(1100px, 94vw); height: min(820px, 90vh); max-width: none; max-height: none; padding: 0; border: 1px solid var(--color-interface-soft, #d9d9e3); border-radius: 8px; background: var(--color-interface-softest, #fff); color: var(--color-interface-strongest, #0a0a0a); box-shadow: 0 12px 40px rgba(0,0,0,.35); overflow: hidden; }',
            'dialog.wti-pk[open] { display: flex; flex-direction: column; }',
            'dialog.wti-pk::backdrop { background: rgba(0,0,0,.45); }',
            '.wti-pk-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--color-interface-soft, #d9d9e3); }',
            '.wti-pk-title { margin: 0 8px 0 0; font-size: 16px; font-weight: 600; }',
            '.wti-pk-search { position: relative; flex: 1 1 220px; min-width: 160px; }',
            '.wti-pk-search .form-control { padding-right: 28px; }',
            '.wti-pk-clear { position: absolute; top: 50%; right: 4px; transform: translateY(-50%); border: 0; background: none; padding: 2px 6px; color: var(--color-interface-medium, #8b8ba7); cursor: pointer; }',
            '.wti-pk-clear.is-hidden { display: none !important; }',
            '.wti-pk-head select.form-control { width: auto; }',
            '.wti-pk-link { white-space: nowrap; font-size: 13px; }',
            '.wti-pk-close { margin-left: auto; border: 0; background: none; font-size: 22px; line-height: 1; padding: 0 4px; color: var(--color-interface-strong, #3d444d); cursor: pointer; }',
            '.wti-pk-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 12px 16px; }',
            '.wti-pk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }',
            '.wti-pk-item { position: relative; display: block; width: 100%; aspect-ratio: 4 / 3; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; background: var(--color-interface-softer, #f8f8fc); cursor: pointer; }',
            '.wti-pk-item img { display: block; width: 100%; height: 100%; object-fit: cover; }',
            '.wti-pk-item:hover, .wti-pk-item:focus-visible { border-color: var(--color-interface-medium, #8b8ba7); outline: none; }',
            '.wti-pk-item.is-selected { border-color: var(--color-primary, #337ab7); box-shadow: 0 0 0 2px var(--color-primary, #337ab7); }',
            '.wti-pk-stars { position: absolute; left: 4px; bottom: 4px; padding: 0 4px; border-radius: 3px; background: rgba(0,0,0,.55); color: #fff; font-size: 10px; line-height: 15px; }',
            '.wti-pk-stars i { font-style: normal; color: rgba(255,255,255,.35); }',
            '.wti-pk-stars i.is-on { color: #f5b301; }',
            '.wti-pk-msg { padding: 24px 0; text-align: center; color: var(--color-interface-medium, #8b8ba7); }',
            '.wti-pk-more { height: 1px; grid-column: 1 / -1; }',
            '.wti-pk-foot { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--color-interface-soft, #d9d9e3); }',
            '.wti-pk-preview { flex: 0 0 auto; width: 96px; height: 72px; border-radius: 4px; background: var(--color-interface-softer, #f8f8fc); object-fit: contain; }',
            '.wti-pk-picked { flex: 1 1 160px; min-width: 140px; font-size: 13px; }',
            '.wti-pk-picked strong { display: block; word-break: break-all; }',
            '.wti-pk-picked span { color: var(--color-interface-medium, #8b8ba7); }',
            '.wti-pk-field { display: flex; flex-direction: column; gap: 2px; }',
            '.wti-pk-field label { margin: 0; font-size: 12px; font-weight: 600; }',
            '.wti-pk-field .form-control { width: auto; }',
            '.wti-pk-num { width: 84px !important; }',
            '.wti-pk-alt { flex: 1 1 220px; }',
            '.wti-pk-alt .form-control { width: 100%; }',
            '.wti-pk-actions { display: flex; gap: 8px; margin-left: auto; }',
            '.wti-pk-hide { display: none !important; }',
            '.wti-pk-group .note-btn i { font-size: 15px; }'
        ].join('\n');
        var style = document.createElement('style');
        style.id = 'wti-pk-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- panel ---------- */

    function panelMarkup(replacing) {
        var presets = PRESETS.map(function (p, i) {
            return '<option value="' + i + '">' + escapeHtml(p.label) + '</option>';
        }).join('') + '<option value="custom">Custom</option>';

        var ratings = '<option value="">Any rating</option><option value="0">' + NONE + ' No rating</option>';
        for (var r = 1; r <= 5; r++) { ratings += '<option value="' + r + '">' + starsHtml(r) + '</option>'; }

        return '' +
            '<div class="wti-pk-head">' +
                '<h4 class="wti-pk-title">' + (replacing ? 'Replace photo' : 'Insert photo') + '</h4>' +
                '<div class="wti-pk-search">' +
                    '<input type="search" class="form-control input-sm" data-pk="q" placeholder="Search name, description, keywords" aria-label="Search photos">' +
                    '<button type="button" class="wti-pk-clear is-hidden" data-pk="clear" aria-label="Clear search">&times;</button>' +
                '</div>' +
                '<select class="form-control input-sm" data-pk="ratingop" aria-label="Rating comparison">' +
                    '<option value="gte">&ge;</option><option value="eq">=</option><option value="lte">&le;</option>' +
                '</select>' +
                '<select class="form-control input-sm" data-pk="rating" aria-label="Rating">' + ratings + '</select>' +
                '<select class="form-control input-sm" data-pk="sort" aria-label="Sort">' +
                    '<option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option>' +
                '</select>' +
                (GALLERY_URL ? '<a class="wti-pk-link" href="' + escapeHtml(GALLERY_URL) + '" target="_blank" rel="noopener"><i class="fa fa-external-link"></i> Open gallery</a>' : '') +
                '<button type="button" class="wti-pk-close" data-pk="close" aria-label="Close">&times;</button>' +
            '</div>' +
            '<div class="wti-pk-body" data-pk="body">' +
                '<div class="wti-pk-grid" data-pk="grid"></div>' +
                '<div class="wti-pk-msg wti-pk-hide" data-pk="msg"></div>' +
            '</div>' +
            '<div class="wti-pk-foot">' +
                '<img class="wti-pk-preview wti-pk-hide" data-pk="preview" alt="">' +
                '<div class="wti-pk-picked" data-pk="picked"><span>Select a photo</span></div>' +
                '<div class="wti-pk-field"><label>Size</label><select class="form-control input-sm" data-pk="preset">' + presets + '</select></div>' +
                '<div class="wti-pk-field"><label>Width</label><input type="number" min="1" step="1" class="form-control input-sm wti-pk-num" data-pk="w" placeholder="Auto"></div>' +
                '<div class="wti-pk-field"><label>Height</label><input type="number" min="1" step="1" class="form-control input-sm wti-pk-num" data-pk="h" placeholder="Auto"></div>' +
                '<div class="wti-pk-field" data-pk="mode-group"><label>Fit</label><select class="form-control input-sm" data-pk="mode">' +
                    '<option value="max">Fit within</option><option value="crop">Crop to fill</option>' +
                '</select></div>' +
                '<div class="wti-pk-field" data-pk="anchor-group"><label>Keep in frame</label><select class="form-control input-sm" data-pk="anchor">' +
                    '<option value="topcenter">Top</option><option value="middlecenter">Center</option><option value="bottomcenter">Bottom</option>' +
                    '<option value="middleleft">Left</option><option value="middleright">Right</option>' +
                '</select></div>' +
                '<div class="wti-pk-field wti-pk-alt"><label>Alt text</label><input type="text" class="form-control input-sm" data-pk="alt" placeholder="Describe the photo for screen readers"></div>' +
                '<div class="wti-pk-actions">' +
                    '<button type="button" class="btn btn-default btn-sm" data-pk="cancel">Cancel</button>' +
                    '<button type="button" class="btn btn-primary btn-sm" data-pk="insert" disabled>' + (replacing ? 'Replace' : 'Insert') + '</button>' +
                '</div>' +
            '</div>';
    }

    function openPanel(target) {
        injectStyles();

        var dialog = document.createElement('dialog');
        dialog.className = 'wti-pk';
        dialog.setAttribute('aria-label', target.image ? 'Replace photo' : 'Insert photo');
        dialog.innerHTML = panelMarkup(!!target.image);

        /* Inside the editor's modal (if any) so Bootstrap's focus trap leaves our inputs alone */
        (target.editor.closest('.modal') || document.body).appendChild(dialog);

        var el = function (name) { return dialog.querySelector('[data-pk="' + name + '"]'); };
        var grid = el('grid');
        var body = el('body');
        var msg = el('msg');
        var size = loadSize();
        var selected = null; /* { guid, name, desc, width, height } */
        var page = 1;
        var request = null;
        var searchTimer = null;
        var observer = null;

        /* Size controls */
        function syncSizeControls() {
            el('w').value = size.w || '';
            el('h').value = size.h || '';
            el('mode').value = size.mode;
            el('anchor').value = size.anchor;
            var match = 'custom';
            PRESETS.forEach(function (p, i) {
                if (p.w === size.w && p.h === size.h && (!(p.w && p.h) || p.mode === size.mode)) { match = String(i); }
            });
            el('preset').value = match;
            var both = size.w && size.h;
            el('mode').disabled = !both;
            el('anchor-group').classList.toggle('wti-pk-hide', !(both && size.mode === 'crop'));
            updatePicked();
        }

        function readSizeControls() {
            size.w = positiveInt(el('w').value);
            size.h = positiveInt(el('h').value);
            size.mode = el('mode').value === 'crop' ? 'crop' : 'max';
            size.anchor = el('anchor').value || 'middlecenter';
            syncSizeControls();
        }

        function updatePicked() {
            var picked = el('picked');
            if (!selected) {
                picked.innerHTML = '<span>Select a photo</span>';
                return;
            }
            var dims = outputSize(selected, size);
            picked.innerHTML = '<strong>' + escapeHtml(selected.name) + '</strong>' +
                '<span>Original ' + escapeHtml(selected.width || '?') + ' × ' + escapeHtml(selected.height || '?') +
                (dims ? ' · Inserts at ' + dims.w + ' × ' + dims.h : '') + '</span>';
        }

        function select(button) {
            Array.prototype.forEach.call(grid.querySelectorAll('.wti-pk-item.is-selected'), function (b) {
                b.classList.remove('is-selected');
                b.setAttribute('aria-pressed', 'false');
            });
            button.classList.add('is-selected');
            button.setAttribute('aria-pressed', 'true');
            selected = {
                guid: button.dataset.guid,
                name: button.dataset.name || '',
                desc: button.dataset.desc || '',
                width: button.dataset.width || '',
                height: button.dataset.height || ''
            };
            el('alt').value = selected.desc;
            var preview = el('preview');
            preview.src = button.querySelector('img').src;
            preview.classList.remove('wti-pk-hide');
            el('insert').disabled = false;
            updatePicked();
        }

        /* Loading */
        function showMessage(text) {
            msg.textContent = text;
            msg.classList.toggle('wti-pk-hide', !text);
        }

        function query(pageNumber) {
            var params = new URLSearchParams({
                view: 'picker',
                page: String(pageNumber),
                q: el('q').value.trim(),
                sort: el('sort').value,
                rating: el('rating').value,
                ratingop: el('ratingop').value
            });
            return BROWSE_URL + '?' + params.toString();
        }

        function load(pageNumber) {
            if (request) { request.abort(); }
            if (observer) { observer.disconnect(); }
            request = new AbortController();
            page = pageNumber;
            if (pageNumber === 1) {
                grid.innerHTML = '';
                body.scrollTop = 0;
                showMessage('Loading…');
            }

            fetch(query(pageNumber), {
                credentials: 'same-origin',
                headers: { 'X-Helix-CSRF-Protection': 'true', 'HX-Request': 'true' },
                signal: request.signal
            }).then(function (response) {
                return response.text().then(function (text) {
                    if (response.status === 401 || response.status === 403) {
                        throw new Error('You don’t have access to the photo gallery.');
                    }
                    if (!response.ok) {
                        throw new Error('Couldn’t load photos (' + response.status + ' ' + response.statusText + ').');
                    }
                    return text;
                });
            }).then(function (text) {
                var reply = document.createElement('template');
                reply.innerHTML = text;
                var items = reply.content.querySelectorAll('.wti-pk-item');
                var empty = reply.content.querySelector('.wti-empty');
                var more = reply.content.querySelector('.wti-pk-more');

                if (!items.length && !empty) {
                    /* An error panel or Lava error instead of items */
                    throw new Error(reply.content.textContent.trim().replace(/\s+/g, ' ') || 'Unexpected reply from the gallery.');
                }

                showMessage(empty && pageNumber === 1 ? empty.textContent.trim() : '');
                Array.prototype.forEach.call(items, function (item) {
                    item.setAttribute('aria-pressed', 'false');
                    if (selected && item.dataset.guid === selected.guid) {
                        item.classList.add('is-selected');
                        item.setAttribute('aria-pressed', 'true');
                    }
                    grid.appendChild(document.importNode(item, true));
                });

                if (more) {
                    var sentinel = document.createElement('div');
                    sentinel.className = 'wti-pk-more';
                    grid.appendChild(sentinel);
                    observer = new IntersectionObserver(function (entries) {
                        if (entries.some(function (e) { return e.isIntersecting; })) {
                            observer.disconnect();
                            sentinel.remove();
                            load(positiveInt(more.dataset.page) || page + 1);
                        }
                    }, { root: body, rootMargin: '200px' });
                    observer.observe(sentinel);
                }
            }).catch(function (error) {
                if (error.name === 'AbortError') { return; }
                showMessage(error.message);
            });
        }

        /* Insert */
        function insert() {
            if (!selected) { return; }
            readSizeControls();
            saveSize(size);
            var alt = el('alt').value.trim();
            var html = buildImgHtml(selected, size, alt);
            close();
            target.insert(html, selected, size, alt);
        }

        function close() {
            if (request) { request.abort(); }
            if (observer) { observer.disconnect(); }
            clearTimeout(searchTimer);
            if (dialog.open) { dialog.close(); }
            dialog.remove();
        }

        /* Events */
        dialog.addEventListener('click', function (e) {
            var item = e.target.closest('.wti-pk-item');
            if (item) { select(item); return; }
            var action = e.target.closest('[data-pk]');
            if (!action) { return; }
            switch (action.dataset.pk) {
                case 'close':
                case 'cancel':
                    close();
                    break;
                case 'insert':
                    insert();
                    break;
                case 'clear':
                    el('q').value = '';
                    el('clear').classList.add('is-hidden');
                    el('q').focus();
                    load(1);
                    break;
            }
        });

        dialog.addEventListener('dblclick', function (e) {
            var item = e.target.closest('.wti-pk-item');
            if (item) { select(item); insert(); }
        });

        dialog.addEventListener('input', function (e) {
            var name = e.target.dataset.pk;
            if (name === 'q') {
                el('clear').classList.toggle('is-hidden', !e.target.value);
                clearTimeout(searchTimer);
                searchTimer = setTimeout(function () { load(1); }, 300);
            } else if (name === 'w' || name === 'h') {
                readSizeControls();
            }
        });

        dialog.addEventListener('change', function (e) {
            var name = e.target.dataset.pk;
            if (name === 'sort' || name === 'rating' || name === 'ratingop') {
                load(1);
            } else if (name === 'preset') {
                var preset = PRESETS[positiveInt(e.target.value) || 0];
                if (e.target.value !== 'custom' && preset) {
                    size.w = preset.w;
                    size.h = preset.h;
                    size.mode = preset.mode;
                    syncSizeControls();
                }
            } else if (name === 'mode' || name === 'anchor') {
                readSizeControls();
            }
        });

        dialog.addEventListener('keydown', function (e) {
            /* Keep keys away from the page: Enter would submit Rock's WebForms form */
            e.stopPropagation();
            if (e.key === 'Enter' && e.target.matches('input')) {
                e.preventDefault();
                if (e.target.dataset.pk === 'alt' && selected) { insert(); }
            }
        });

        dialog.addEventListener('cancel', function (e) {
            e.preventDefault();
            close();
        });

        syncSizeControls();
        dialog.showModal();
        el('q').focus();
        load(1);
    }

    /* ---------- Summernote integration ---------- */

    function findContext(editor) {
        var found = null;
        $(editor).siblings().each(function () {
            var ctx = $(this).data('summernote');
            if (ctx && ctx.layoutInfo && ctx.layoutInfo.editor && ctx.layoutInfo.editor[0] === editor) {
                found = ctx;
                return false;
            }
        });
        return found;
    }

    function openFor(editor, ctx) {
        var target = { editor: editor, image: null };

        if (editor.classList.contains('code-editor-visible')) {
            /* Rock's code editor mode (Ace) */
            var aceEl = editor.querySelector('[id^="codeeditor-div-"]');
            var aceEditor = aceEl && window.ace ? window.ace.edit(aceEl.id) : null;
            if (!aceEditor) { return; }
            target.insert = function (html) {
                aceEditor.insert(html);
                aceEditor.focus();
            };
        } else {
            /* Visual editor: replace the selected image, or insert at the saved cursor */
            var selection = editor.querySelector('.note-control-selection');
            var img = $(ctx.layoutInfo.editable.data('target'))[0];
            if (img && img.tagName === 'IMG' && selection && $(selection).is(':visible') &&
                ctx.layoutInfo.editable[0].contains(img)) {
                target.image = img;
            }
            /*
             * Keep our own copy of the cursor. Summernote resets its saved range whenever the
             * editor regains focus, which happens when the panel closes, and that fallback is
             * the end of the content.
             */
            var savedRange = ctx.invoke('editor.createRange');

            target.insert = function (html, item, size, alt) {
                if (target.image) {
                    var dims = outputSize(item, size);
                    target.image.setAttribute('src', buildImageUrl(item, size));
                    target.image.setAttribute('alt', alt);
                    if (dims) {
                        target.image.setAttribute('width', dims.w);
                        target.image.setAttribute('height', dims.h);
                    } else {
                        target.image.removeAttribute('width');
                        target.image.removeAttribute('height');
                    }
                    target.image.style.width = '';
                    target.image.style.height = 'auto';
                    target.image.style.maxWidth = '100%';
                } else {
                    var holder = document.createElement('div');
                    holder.innerHTML = html;
                    ctx.layoutInfo.editable.focus(); /* fires Summernote's focus reset first */
                    savedRange.select();
                    ctx.invoke('editor.setLastRange', savedRange);
                    ctx.invoke('editor.insertNode', holder.firstChild);
                }
                /* Same as Rock's image browser: let Rock know the content changed */
                ctx.invoke('triggerEvent', 'change', ctx.code());
            };
        }

        openPanel(target);
    }

    function decorate(editor) {
        if (editor.hasAttribute('data-wti-pk')) { return; }
        var toolbar = $(editor).children('.note-toolbar')[0];
        var ctx = findContext(editor);
        if (!toolbar || !ctx) { return; }
        editor.setAttribute('data-wti-pk', '');

        var group = document.createElement('div');
        group.className = 'note-btn-group btn-group wti-pk-group';
        /* note-codeview-keep: Rock keeps this button enabled in code editor mode */
        group.innerHTML = '<button type="button" class="note-btn btn btn-default btn-sm note-codeview-keep" tabindex="-1" title="Insert from Gallery" aria-label="Insert from Gallery"><i class="ti ti-library-photo"></i></button>';
        var button = group.firstChild;
        /* Same hover tooltip as Summernote's own buttons */
        if ($.fn.tooltip) {
            $(button).tooltip({ container: ctx.options.container || 'body', trigger: 'hover', placement: 'bottom' });
        }
        button.addEventListener('mousedown', function (e) { e.preventDefault(); }); /* keep the cursor in the editor */
        button.addEventListener('click', function (e) {
            e.preventDefault();
            if ($.fn.tooltip) { $(button).tooltip('hide'); }
            openFor(editor, ctx);
        });
        toolbar.appendChild(group);
    }

    function scan(root) {
        if (root.nodeType !== 1) { return; }
        if (root.classList.contains('note-editor')) { decorate(root); }
        Array.prototype.forEach.call(root.querySelectorAll('.note-editor'), decorate);
    }

    function start() {
        scan(document.body);
        /* Editors appear later too (UpdatePanel postbacks, modals) */
        new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                Array.prototype.forEach.call(m.addedNodes, scan);
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    window.wtiPicker = { version: 5 };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
