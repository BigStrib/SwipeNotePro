(function () {
    'use strict';

    var sidebar = document.getElementById('sidebar');
    var sidebarOverlay = document.getElementById('sidebarOverlay');
    var hamburgerBtn = document.getElementById('hamburgerBtn');
    var searchInput = document.getElementById('searchInput');
    var sidebarNotesList = document.getElementById('sidebarNotesList');
    var sidebarNoteCount = document.getElementById('sidebarNoteCount');
    var noteCounter = document.getElementById('noteCounter');
    var dotNavigation = document.getElementById('dotNavigation');
    var notesViewport = document.getElementById('notesViewport');
    var notesContainer = document.getElementById('notesContainer');
    var emptyState = document.getElementById('emptyState');
    var fontDecreaseBtn = document.getElementById('fontDecreaseBtn');
    var fontIncreaseBtn = document.getElementById('fontIncreaseBtn');
    var deleteBtn = document.getElementById('deleteBtn');
    var deleteModal = document.getElementById('deleteModal');
    var deleteModalText = document.getElementById('deleteModalText');
    var cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    var confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    var notes = [];
    var currentNoteIndex = 0;
    var deleteTargetId = null;
    var viewportHeight = 0;

    var isDragging = false;
    var dragStartY = 0;
    var dragOffset = 0;
    var dragStartTime = 0;
    var dragStartedInTextarea = false;
    var textareaUnlocked = false;
    var touchActive = false;
    var scrollLock = false;

    function save() {
        localStorage.setItem('notesAppData', JSON.stringify({
            notes: notes.map(function (n) {
                return { id: n.id, content: n.content, fontSize: n.fontSize, createdAt: n.createdAt, updatedAt: n.updatedAt };
            }),
            currentNoteIndex: currentNoteIndex
        }));
    }

    function load() {
        try {
            var d = JSON.parse(localStorage.getItem('notesAppData'));
            if (d && d.notes) {
                notes = d.notes.map(function (n) {
                    return { id: n.id, content: n.content || '', fontSize: n.fontSize || 16, createdAt: n.createdAt || Date.now(), updatedAt: n.updatedAt || Date.now() };
                });
                currentNoteIndex = d.currentNoteIndex || 0;
                if (currentNoteIndex >= notes.length) currentNoteIndex = Math.max(0, notes.length - 1);
            }
        } catch (e) { notes = []; currentNoteIndex = 0; }
    }

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }

    function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    function title(n) {
        if (!n.content || !n.content.trim()) return 'Untitled Note';
        var l = n.content.trim().split('\n')[0];
        return l.length > 40 ? l.substr(0, 40) + '…' : l;
    }

    function preview(n) {
        if (!n.content || !n.content.trim()) return '';
        var lines = n.content.trim().split('\n');
        if (lines.length > 1) { var p = lines.slice(1).join(' ').trim(); return p.length > 50 ? p.substr(0, 50) + '…' : p; }
        return '';
    }

    function timeAgo(ts) {
        var d = Date.now() - ts, m = Math.floor(d / 60000);
        if (m < 1) return 'Now';
        if (m < 60) return m + 'm';
        var h = Math.floor(d / 3600000);
        if (h < 24) return h + 'h';
        var dy = Math.floor(d / 86400000);
        if (dy < 7) return dy + 'd';
        return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function empty(n) { return !n || !n.content || !n.content.trim(); }

    function canCreate(dir) {
        if (!notes.length) return true;
        if (empty(notes[currentNoteIndex])) return false;
        if (dir === 'down' && currentNoteIndex < notes.length - 1 && empty(notes[currentNoteIndex + 1])) return false;
        if (dir === 'up' && currentNoteIndex > 0 && empty(notes[currentNoteIndex - 1])) return false;
        return true;
    }

    function canNext() { return !notes.length || currentNoteIndex < notes.length - 1 || canCreate('down'); }
    function canPrev() { return !notes.length || currentNoteIndex > 0 || canCreate('up'); }

    function newNote() { return { id: uid(), content: '', fontSize: 16, createdAt: Date.now(), updatedAt: Date.now() }; }

    function focusNote() {
        setTimeout(function () { var t = activeTA(); if (t) t.focus(); }, 400);
    }

    function addBelow() {
        if (!canCreate('down')) return;
        notes.splice(currentNoteIndex + 1, 0, newNote());
        currentNoteIndex++;
        save(); fullRender(); focusNote();
    }

    function addAbove() {
        if (!canCreate('up')) return;
        notes.splice(currentNoteIndex, 0, newNote());
        save(); fullRender(); focusNote();
    }

    function addFirst() {
        if (notes.length) return;
        notes.push(newNote());
        currentNoteIndex = 0;
        save(); fullRender(); focusNote();
    }

    function removeNote(id) {
        var i = notes.findIndex(function (n) { return n.id === id; });
        if (i < 0) return;
        notes.splice(i, 1);
        if (!notes.length) currentNoteIndex = 0;
        else if (currentNoteIndex >= notes.length) currentNoteIndex = notes.length - 1;
        else if (i < currentNoteIndex) currentNoteIndex--;
        save(); fullRender();
    }

    function editNote(id, val) {
        var n = notes.find(function (x) { return x.id === id; });
        if (n) { n.content = val; n.updatedAt = Date.now(); save(); renderSidebar(); renderDots(); renderCount(); }
    }

    function goTo(i) {
        if (i < 0 || i >= notes.length) return;
        currentNoteIndex = i;
        save(); renderDots(); renderSidebar(); slideTo();
    }

    function goNext() {
        if (!notes.length) { addFirst(); return; }
        if (currentNoteIndex < notes.length - 1) goTo(currentNoteIndex + 1);
        else addBelow();
    }

    function goPrev() {
        if (!notes.length) { addFirst(); return; }
        if (currentNoteIndex > 0) goTo(currentNoteIndex - 1);
        else addAbove();
    }

    function measureViewport() {
        viewportHeight = notesViewport.offsetHeight;
    }

    function targetY() {
        return notes.length ? -currentNoteIndex * viewportHeight : 0;
    }

    function snapTo() {
        measureViewport();
        notesContainer.classList.remove('animating');
        notesContainer.style.transform = 'translateY(' + targetY() + 'px)';
    }

    function slideTo() {
        measureViewport();
        notesContainer.classList.add('animating');
        notesContainer.style.transform = 'translateY(' + targetY() + 'px)';
        var done = function () { notesContainer.classList.remove('animating'); notesContainer.removeEventListener('transitionend', done); };
        notesContainer.addEventListener('transitionend', done);
    }

    function sizeCards() {
        measureViewport();
        var cards = notesContainer.querySelectorAll('.note-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].style.height = viewportHeight + 'px';
        }
    }

    function fullRender() {
        renderNotes();
        renderSidebar();
        renderDots();
        renderCount();
        renderEmpty();
        sizeCards();
        snapTo();
    }

    function renderNotes() {
        notesContainer.innerHTML = '';
        notes.forEach(function (note) {
            var card = document.createElement('div');
            card.className = 'note-card';
            card.dataset.id = note.id;

            var ta = document.createElement('textarea');
            ta.className = 'note-textarea';
            ta.placeholder = 'Start writing...';
            ta.value = note.content;
            ta.style.fontSize = note.fontSize + 'px';
            ta.addEventListener('input', function () { editNote(note.id, ta.value); });

            card.appendChild(ta);
            notesContainer.appendChild(card);
        });
    }

    function renderSidebar(filter) {
        sidebarNotesList.innerHTML = '';
        var q = (filter || searchInput.value).toLowerCase().trim();
        var list = q ? notes.filter(function (n) { return n.content.toLowerCase().indexOf(q) > -1 || title(n).toLowerCase().indexOf(q) > -1; }) : notes;

        list.forEach(function (note) {
            var idx = notes.indexOf(note);
            var item = document.createElement('div');
            item.className = 'sidebar-note-item';

            var del = document.createElement('div');
            del.className = 'sidebar-note-delete';
            del.innerHTML = '<i class="fas fa-trash-alt"></i>';
            del.addEventListener('click', function (e) { e.stopPropagation(); confirmDelete(note.id); });

            var row = document.createElement('div');
            row.className = 'sidebar-note-content' + (idx === currentNoteIndex ? ' active' : '');
            var prev = preview(note);
            row.innerHTML =
                '<div class="sidebar-note-icon"><i class="fas fa-file-alt"></i></div>' +
                '<div class="sidebar-note-info"><div class="sidebar-note-title">' + esc(title(note)) + '</div>' +
                (prev ? '<div class="sidebar-note-preview">' + esc(prev) + '</div>' : '') + '</div>' +
                '<div class="sidebar-note-date">' + timeAgo(note.updatedAt) + '</div>';

            row.addEventListener('click', function () {
                if (row.classList.contains('swiped')) { row.classList.remove('swiped'); return; }
                currentNoteIndex = idx; save(); fullRender(); closeSidebar();
            });

            sidebarSwipe(row);
            item.appendChild(del);
            item.appendChild(row);
            sidebarNotesList.appendChild(item);
        });
    }

    function renderDots() {
        dotNavigation.innerHTML = '';
        if (!notes.length) return;
        var max = 25, s = 0, e = notes.length;
        if (notes.length > max) {
            s = Math.max(0, currentNoteIndex - Math.floor(max / 2));
            e = Math.min(notes.length, s + max);
            if (e - s < max) s = Math.max(0, e - max);
        }
        for (var i = s; i < e; i++) {
            (function (x) {
                var dot = document.createElement('div');
                dot.className = 'dot' + (x === currentNoteIndex ? ' active' : '');
                dot.addEventListener('click', function () { goTo(x); });
                dotNavigation.appendChild(dot);
            })(i);
        }
    }

    function renderCount() {
        var c = notes.length, l = c + (c === 1 ? ' Note' : ' Notes');
        noteCounter.textContent = l;
        sidebarNoteCount.textContent = l;
    }

    function renderEmpty() {
        if (!notes.length) {
            emptyState.classList.add('visible');
            notesViewport.style.visibility = 'hidden';
            dotNavigation.style.visibility = 'hidden';
        } else {
            emptyState.classList.remove('visible');
            notesViewport.style.visibility = '';
            dotNavigation.style.visibility = '';
        }
    }

    function openSidebar() { sidebar.classList.add('open'); sidebarOverlay.classList.add('active'); renderSidebar(); renderCount(); }
    function closeSidebar() {
        sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active');
        document.querySelectorAll('.sidebar-note-content.swiped').forEach(function (el) { el.classList.remove('swiped'); });
    }

    function confirmDelete(id) {
        deleteTargetId = id;
        var n = notes.find(function (x) { return x.id === id; });
        if (n) deleteModalText.textContent = '"' + title(n) + '" will be permanently deleted.';
        deleteModal.classList.add('active');
    }
    function hideModal() { deleteModal.classList.remove('active'); deleteTargetId = null; }

    function resizeFont(delta) {
        if (!notes.length) return;
        var note = notes[currentNoteIndex];
        if (!note) return;
        var sz = Math.min(36, Math.max(10, note.fontSize + delta));
        if (sz === note.fontSize) return;
        note.fontSize = sz;
        save();
        var ta = activeTA();
        if (ta) ta.style.fontSize = sz + 'px';
    }

    function activeTA() {
        var cards = notesContainer.querySelectorAll('.note-card');
        return cards[currentNoteIndex] ? cards[currentNoteIndex].querySelector('.note-textarea') : null;
    }

    function atBottom(ta) { return ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 2; }
    function atTop(ta) { return ta.scrollTop <= 2; }

    // ========== TOUCH ==========
    notesViewport.addEventListener('touchstart', function (e) {
        if (!notes.length) return;
        touchActive = true;
        dragStartY = e.touches[0].clientY;
        dragOffset = 0;
        dragStartTime = Date.now();
        isDragging = false;
        dragStartedInTextarea = e.target.classList.contains('note-textarea');
        textareaUnlocked = false;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!touchActive || !dragStartY) return;
        var cy = e.touches[0].clientY;
        var diff = dragStartY - cy;

        if (dragStartedInTextarea && !textareaUnlocked) {
            var ta = activeTA();
            if (ta) {
                var edge = diff > 0 ? atBottom(ta) : atTop(ta);
                if (!edge) return;
                if (Math.abs(diff) > 20) { textareaUnlocked = true; dragStartY = cy; return; }
            }
        }

        if (Math.abs(diff) > 10) {
            isDragging = true;
            var ok = diff > 0 ? canNext() : canPrev();
            measureViewport();
            var base = -currentNoteIndex * viewportHeight;
            var pull = ok ? -diff * 0.45 : -diff * 0.06;
            dragOffset = diff;
            notesContainer.classList.remove('animating');
            notesContainer.style.transform = 'translateY(' + (base + pull) + 'px)';
            if (dragStartedInTextarea) { var t = activeTA(); if (t) t.blur(); }
        }
    }, { passive: true });

    document.addEventListener('touchend', function () {
        if (!touchActive) return;
        touchActive = false;
        if (!isDragging) { dragStartY = 0; return; }
        var diff = dragOffset;
        var ms = Date.now() - dragStartTime;
        var v = Math.abs(diff) / Math.max(ms, 1);
        var th = v > 0.3 ? 25 : 70;
        if (Math.abs(diff) > th) {
            if (diff > 0 && canNext()) goNext();
            else if (diff < 0 && canPrev()) goPrev();
            else slideTo();
        } else { slideTo(); }
        isDragging = false; dragStartY = 0; dragOffset = 0; textareaUnlocked = false;
    }, { passive: true });

    document.addEventListener('touchcancel', function () {
        if (!touchActive) return;
        touchActive = false; isDragging = false; dragStartY = 0; dragOffset = 0; textareaUnlocked = false;
        snapTo();
    }, { passive: true });

    // ========== SCROLL ==========
    notesViewport.addEventListener('wheel', function (e) {
        if (scrollLock) return;
        var ta = activeTA();
        if (ta) { var dn = e.deltaY > 0; if (!(dn ? atBottom(ta) : atTop(ta))) return; }
        if (Math.abs(e.deltaY) < 30) return;
        if (!(e.deltaY > 0 ? canNext() : canPrev())) return;
        scrollLock = true;
        setTimeout(function () { scrollLock = false; }, 500);
        if (e.deltaY > 0) goNext(); else goPrev();
    }, { passive: true });

    // ========== EMPTY STATE ==========
    var emptyTouch = 0;
    document.addEventListener('wheel', function (e) {
        if (notes.length || scrollLock || Math.abs(e.deltaY) < 30) return;
        scrollLock = true; setTimeout(function () { scrollLock = false; }, 500);
        addFirst();
    }, { passive: true });
    document.addEventListener('touchstart', function (e) { if (!notes.length) emptyTouch = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchend', function (e) {
        if (!notes.length && emptyTouch) {
            if (Math.abs(emptyTouch - (e.changedTouches[0] ? e.changedTouches[0].clientY : 0)) > 50) addFirst();
            emptyTouch = 0;
        }
    }, { passive: true });

    // ========== SIDEBAR SWIPE ==========
    function sidebarSwipe(el) {
        var sx = 0, cx = 0, sy = 0, sw = false;
        el.addEventListener('touchstart', function (e) {
            document.querySelectorAll('.sidebar-note-content.swiped').forEach(function (s) { if (s !== el) s.classList.remove('swiped'); });
            sx = e.touches[0].clientX; sy = e.touches[0].clientY; sw = false;
        }, { passive: true });
        el.addEventListener('touchmove', function (e) {
            cx = e.touches[0].clientX;
            if (Math.abs(sx - cx) > Math.abs(sy - e.touches[0].clientY) && Math.abs(sx - cx) > 10) sw = true;
        }, { passive: true });
        el.addEventListener('touchend', function () {
            if (sw) { if (sx - cx > 50) el.classList.add('swiped'); else if (cx - sx > 25) el.classList.remove('swiped'); }
            sx = cx = 0; sw = false;
        }, { passive: true });
    }

    // ========== RESIZE ==========
    var resizeRAF = null;
    function onResize() {
        if (resizeRAF) cancelAnimationFrame(resizeRAF);
        resizeRAF = requestAnimationFrame(function () {
            sizeCards();
            snapTo();
            resizeRAF = null;
        });
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () {
        setTimeout(function () { sizeCards(); snapTo(); }, 100);
        setTimeout(function () { sizeCards(); snapTo(); }, 300);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onResize);
    }

    // ========== EVENTS ==========
    hamburgerBtn.addEventListener('click', openSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    searchInput.addEventListener('input', function () { renderSidebar(); });
    fontDecreaseBtn.addEventListener('click', function (e) { e.preventDefault(); resizeFont(-2); });
    fontIncreaseBtn.addEventListener('click', function (e) { e.preventDefault(); resizeFont(2); });
    deleteBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (notes.length && notes[currentNoteIndex]) confirmDelete(notes[currentNoteIndex].id);
    });
    cancelDeleteBtn.addEventListener('click', hideModal);
    confirmDeleteBtn.addEventListener('click', function () { if (deleteTargetId) removeNote(deleteTargetId); hideModal(); });
    deleteModal.addEventListener('click', function (e) { if (e.target === deleteModal) hideModal(); });

    // ========== INIT ==========
    load();
    fullRender();
})();