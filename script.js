(function () {
    'use strict';

    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const searchInput = document.getElementById('searchInput');
    const sidebarNotesList = document.getElementById('sidebarNotesList');
    const sidebarNoteCount = document.getElementById('sidebarNoteCount');
    const noteCounter = document.getElementById('noteCounter');
    const dotNavigation = document.getElementById('dotNavigation');
    const notesViewport = document.getElementById('notesViewport');
    const notesContainer = document.getElementById('notesContainer');
    const emptyState = document.getElementById('emptyState');
    const fontDecreaseBtn = document.getElementById('fontDecreaseBtn');
    const fontIncreaseBtn = document.getElementById('fontIncreaseBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const deleteModal = document.getElementById('deleteModal');
    const deleteModalText = document.getElementById('deleteModalText');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    let notes = [];
    let currentNoteIndex = 0;
    let deleteTargetId = null;

    let isDragging = false;
    let dragStartY = 0;
    let dragOffset = 0;
    let dragStartTime = 0;
    let dragStartedInTextarea = false;
    let textareaAtBoundary = false;
    let touchStartedInViewport = false;
    let scrollCooldown = false;
    let rafId = null;

    // ========== STORAGE ==========
    function save() {
        var data = { notes: [], currentNoteIndex: currentNoteIndex };
        notes.forEach(function (n) {
            data.notes.push({
                id: n.id,
                content: n.content,
                fontSize: n.fontSize,
                createdAt: n.createdAt,
                updatedAt: n.updatedAt
            });
        });
        localStorage.setItem('notesAppData', JSON.stringify(data));
    }

    function load() {
        try {
            var d = JSON.parse(localStorage.getItem('notesAppData'));
            if (d) {
                notes = (d.notes || []).map(function (n) {
                    return {
                        id: n.id,
                        content: n.content || '',
                        fontSize: n.fontSize || 16,
                        createdAt: n.createdAt || Date.now(),
                        updatedAt: n.updatedAt || Date.now()
                    };
                });
                currentNoteIndex = d.currentNoteIndex || 0;
                if (currentNoteIndex >= notes.length) {
                    currentNoteIndex = Math.max(0, notes.length - 1);
                }
            }
        } catch (e) {
            notes = [];
            currentNoteIndex = 0;
        }
    }

    // ========== HELPERS ==========
    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    function escHtml(t) {
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function getTitle(n) {
        if (!n.content || !n.content.trim()) return 'Untitled Note';
        var l = n.content.trim().split('\n')[0];
        return l.length > 40 ? l.substring(0, 40) + '…' : l;
    }

    function getPreview(n) {
        if (!n.content || !n.content.trim()) return '';
        var lines = n.content.trim().split('\n');
        if (lines.length > 1) {
            var p = lines.slice(1).join(' ').trim();
            return p.length > 50 ? p.substring(0, 50) + '…' : p;
        }
        return '';
    }

    function fmtDate(ts) {
        var diff = Date.now() - ts;
        var m = Math.floor(diff / 60000);
        if (m < 1) return 'Now';
        if (m < 60) return m + 'm';
        var h = Math.floor(diff / 3600000);
        if (h < 24) return h + 'h';
        var dy = Math.floor(diff / 86400000);
        if (dy < 7) return dy + 'd';
        return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function isNoteEmpty(note) {
        return !note || !note.content || note.content.trim() === '';
    }

    function canCreateNote(direction) {
        if (notes.length === 0) return true;
        if (isNoteEmpty(notes[currentNoteIndex])) return false;
        if (direction === 'down' && currentNoteIndex < notes.length - 1 && isNoteEmpty(notes[currentNoteIndex + 1])) return false;
        if (direction === 'up' && currentNoteIndex > 0 && isNoteEmpty(notes[currentNoteIndex - 1])) return false;
        return true;
    }

    function canGoNext() {
        if (notes.length === 0) return true;
        if (currentNoteIndex < notes.length - 1) return true;
        return canCreateNote('down');
    }

    function canGoPrev() {
        if (notes.length === 0) return true;
        if (currentNoteIndex > 0) return true;
        return canCreateNote('up');
    }

    // ========== NOTE OPS ==========
    function makeNote() {
        return {
            id: genId(),
            content: '',
            fontSize: 16,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    function createNoteBelow() {
        if (!canCreateNote('down')) return;
        notes.splice(currentNoteIndex + 1, 0, makeNote());
        currentNoteIndex++;
        save();
        renderAll();
        focusCurrent();
    }

    function createNoteAbove() {
        if (!canCreateNote('up')) return;
        notes.splice(currentNoteIndex, 0, makeNote());
        save();
        renderAll();
        focusCurrent();
    }

    function createFirstNote() {
        if (notes.length > 0) return;
        notes.push(makeNote());
        currentNoteIndex = 0;
        save();
        renderAll();
        focusCurrent();
    }

    function focusCurrent() {
        setTimeout(function () {
            var ta = getActiveTextarea();
            if (ta) ta.focus();
        }, 420);
    }

    function deleteNote(id) {
        var i = notes.findIndex(function (n) { return n.id === id; });
        if (i === -1) return;
        notes.splice(i, 1);
        if (!notes.length) currentNoteIndex = 0;
        else if (currentNoteIndex >= notes.length) currentNoteIndex = notes.length - 1;
        else if (i < currentNoteIndex) currentNoteIndex--;
        save();
        renderAll();
    }

    function updateNote(id, content) {
        var n = notes.find(function (n) { return n.id === id; });
        if (n) {
            n.content = content;
            n.updatedAt = Date.now();
            save();
            renderSidebar();
            renderDots();
            renderCounter();
        }
    }

    // ========== NAVIGATION ==========
    function goToNote(index) {
        if (index < 0 || index >= notes.length) return;
        currentNoteIndex = index;
        save();
        renderDots();
        renderSidebar();
        animateToPosition();
    }

    function goNext() {
        if (notes.length === 0) { createFirstNote(); return; }
        if (currentNoteIndex < notes.length - 1) goToNote(currentNoteIndex + 1);
        else createNoteBelow();
    }

    function goPrev() {
        if (notes.length === 0) { createFirstNote(); return; }
        if (currentNoteIndex > 0) goToNote(currentNoteIndex - 1);
        else createNoteAbove();
    }

    // ========== POSITION ==========
    function getTargetOffset() {
        if (!notes.length) return 0;
        return -currentNoteIndex * notesViewport.offsetHeight;
    }

    function setPositionImmediate() {
        if (!notes.length) return;
        notesContainer.classList.remove('animating');
        notesContainer.style.transform = 'translateY(' + getTargetOffset() + 'px)';
    }

    function animateToPosition() {
        if (!notes.length) return;
        notesContainer.classList.add('animating');
        notesContainer.style.transform = 'translateY(' + getTargetOffset() + 'px)';
        var onEnd = function () {
            notesContainer.classList.remove('animating');
            notesContainer.removeEventListener('transitionend', onEnd);
        };
        notesContainer.addEventListener('transitionend', onEnd);
    }

    // ========== RENDER ==========
    function renderAll() {
        renderNotes();
        renderSidebar();
        renderDots();
        renderCounter();
        renderEmpty();
        setPositionImmediate();
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
            ta.addEventListener('input', function () { updateNote(note.id, ta.value); });

            card.appendChild(ta);
            notesContainer.appendChild(card);
        });
    }

    function renderSidebar(filter) {
        sidebarNotesList.innerHTML = '';
        var q = (filter || searchInput.value).toLowerCase().trim();
        var filtered = q
            ? notes.filter(function (n) {
                return n.content.toLowerCase().includes(q) || getTitle(n).toLowerCase().includes(q);
            })
            : notes;

        filtered.forEach(function (note) {
            var idx = notes.indexOf(note);
            var item = document.createElement('div');
            item.className = 'sidebar-note-item';

            var del = document.createElement('div');
            del.className = 'sidebar-note-delete';
            del.innerHTML = '<i class="fas fa-trash-alt"></i>';
            del.addEventListener('click', function (e) {
                e.stopPropagation();
                showDeleteModal(note.id);
            });

            var content = document.createElement('div');
            content.className = 'sidebar-note-content' + (idx === currentNoteIndex ? ' active' : '');
            var preview = getPreview(note);
            content.innerHTML =
                '<div class="sidebar-note-icon"><i class="fas fa-file-alt"></i></div>' +
                '<div class="sidebar-note-info">' +
                '<div class="sidebar-note-title">' + escHtml(getTitle(note)) + '</div>' +
                (preview ? '<div class="sidebar-note-preview">' + escHtml(preview) + '</div>' : '') +
                '</div>' +
                '<div class="sidebar-note-date">' + fmtDate(note.updatedAt) + '</div>';

            content.addEventListener('click', function () {
                if (content.classList.contains('swiped')) {
                    content.classList.remove('swiped');
                    return;
                }
                currentNoteIndex = idx;
                save();
                renderAll();
                closeSidebar();
            });

            setupSidebarSwipe(content);
            item.appendChild(del);
            item.appendChild(content);
            sidebarNotesList.appendChild(item);
        });
    }

    function renderDots() {
        dotNavigation.innerHTML = '';
        if (!notes.length) return;
        var max = 25;
        var start = 0, end = notes.length;
        if (notes.length > max) {
            start = Math.max(0, currentNoteIndex - Math.floor(max / 2));
            end = Math.min(notes.length, start + max);
            if (end - start < max) start = Math.max(0, end - max);
        }
        for (var i = start; i < end; i++) {
            (function (idx) {
                var dot = document.createElement('div');
                dot.className = 'dot' + (idx === currentNoteIndex ? ' active' : '');
                dot.addEventListener('click', function () { goToNote(idx); });
                dotNavigation.appendChild(dot);
            })(i);
        }
    }

    function renderCounter() {
        var c = notes.length;
        var l = c + (c === 1 ? ' Note' : ' Notes');
        noteCounter.textContent = l;
        sidebarNoteCount.textContent = l;
    }

    function renderEmpty() {
        if (!notes.length) {
            emptyState.classList.add('visible');
            notesViewport.style.display = 'none';
            dotNavigation.style.display = 'none';
        } else {
            emptyState.classList.remove('visible');
            notesViewport.style.display = '';
            dotNavigation.style.display = '';
        }
    }

    // ========== SIDEBAR ==========
    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        renderSidebar();
        renderCounter();
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        document.querySelectorAll('.sidebar-note-content.swiped').forEach(function (el) {
            el.classList.remove('swiped');
        });
    }

    // ========== DELETE ==========
    function showDeleteModal(id) {
        deleteTargetId = id;
        var n = notes.find(function (n) { return n.id === id; });
        if (n) deleteModalText.textContent = '"' + getTitle(n) + '" will be permanently deleted.';
        deleteModal.classList.add('active');
    }

    function hideDeleteModal() {
        deleteModal.classList.remove('active');
        deleteTargetId = null;
    }

    // ========== FONT SIZE ==========
    function changeFontSize(delta) {
        if (!notes.length) return;
        var note = notes[currentNoteIndex];
        if (!note) return;
        var newSize = Math.min(36, Math.max(10, note.fontSize + delta));
        if (newSize === note.fontSize) return;
        note.fontSize = newSize;
        save();
        var ta = getActiveTextarea();
        if (ta) ta.style.fontSize = note.fontSize + 'px';
    }

    // ========== TEXTAREA ==========
    function getActiveTextarea() {
        var cards = notesContainer.querySelectorAll('.note-card');
        if (!cards[currentNoteIndex]) return null;
        return cards[currentNoteIndex].querySelector('.note-textarea');
    }

    function isAtBottom(ta) {
        return ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 2;
    }

    function isAtTop(ta) {
        return ta.scrollTop <= 2;
    }

    // ========== TOUCH ==========
    function setupTouch() {
        notesViewport.addEventListener('touchstart', function (e) {
            if (!notes.length) return;
            touchStartedInViewport = true;
            dragStartY = e.touches[0].clientY;
            dragOffset = 0;
            dragStartTime = Date.now();
            isDragging = false;
            dragStartedInTextarea = e.target.classList.contains('note-textarea');
            textareaAtBoundary = false;
        }, { passive: true });

        document.addEventListener('touchmove', function (e) {
            if (!touchStartedInViewport || dragStartY === 0) return;

            var cy = e.touches[0].clientY;
            var diff = dragStartY - cy;

            if (dragStartedInTextarea && !textareaAtBoundary) {
                var ta = getActiveTextarea();
                if (ta) {
                    var bound = diff > 0 ? isAtBottom(ta) : isAtTop(ta);
                    if (!bound) return;
                    if (Math.abs(diff) > 20) {
                        textareaAtBoundary = true;
                        dragStartY = cy;
                        return;
                    }
                }
            }

            if (Math.abs(diff) > 10) {
                var allowed = diff > 0 ? canGoNext() : canGoPrev();
                isDragging = true;

                var h = notesViewport.offsetHeight;
                var base = -currentNoteIndex * h;
                var pull = allowed ? -diff * 0.45 : -diff * 0.06;

                dragOffset = diff;
                notesContainer.classList.remove('animating');
                notesContainer.style.transform = 'translateY(' + (base + pull) + 'px)';

                if (dragStartedInTextarea) {
                    var activeTa = getActiveTextarea();
                    if (activeTa) activeTa.blur();
                }
            }
        }, { passive: true });

        document.addEventListener('touchend', function () {
            if (!touchStartedInViewport) return;
            touchStartedInViewport = false;
            endDrag();
        }, { passive: true });

        document.addEventListener('touchcancel', function () {
            if (!touchStartedInViewport) return;
            touchStartedInViewport = false;
            endDrag();
        }, { passive: true });
    }

    function endDrag() {
        if (!isDragging) {
            dragStartY = 0;
            return;
        }

        var diff = dragOffset;
        var elapsed = Date.now() - dragStartTime;
        var velocity = Math.abs(diff) / Math.max(elapsed, 1);
        var threshold = velocity > 0.3 ? 25 : 70;

        if (Math.abs(diff) > threshold) {
            if (diff > 0 && canGoNext()) goNext();
            else if (diff < 0 && canGoPrev()) goPrev();
            else animateToPosition();
        } else {
            animateToPosition();
        }

        isDragging = false;
        dragStartY = 0;
        dragOffset = 0;
        textareaAtBoundary = false;
    }

    // ========== SCROLL ==========
    function setupScroll() {
        notesViewport.addEventListener('wheel', function (e) {
            if (scrollCooldown) return;

            var ta = getActiveTextarea();
            if (ta) {
                var down = e.deltaY > 0;
                if (!(down ? isAtBottom(ta) : isAtTop(ta))) return;
            }

            if (Math.abs(e.deltaY) < 30) return;
            if (!(e.deltaY > 0 ? canGoNext() : canGoPrev())) return;

            scrollCooldown = true;
            setTimeout(function () { scrollCooldown = false; }, 500);

            if (e.deltaY > 0) goNext();
            else goPrev();
        }, { passive: true });
    }

    // ========== EMPTY ==========
    function setupEmptyInteractions() {
        var emptyTouchStart = 0;

        document.addEventListener('wheel', function (e) {
            if (notes.length > 0 || scrollCooldown || Math.abs(e.deltaY) < 30) return;
            scrollCooldown = true;
            setTimeout(function () { scrollCooldown = false; }, 500);
            createFirstNote();
        }, { passive: true });

        document.addEventListener('touchstart', function (e) {
            if (notes.length === 0) emptyTouchStart = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchend', function (e) {
            if (notes.length === 0 && emptyTouchStart) {
                var diff = emptyTouchStart - (e.changedTouches[0] ? e.changedTouches[0].clientY : 0);
                if (Math.abs(diff) > 50) createFirstNote();
                emptyTouchStart = 0;
            }
        }, { passive: true });
    }

    // ========== SIDEBAR SWIPE ==========
    function setupSidebarSwipe(el) {
        var sx = 0, cx = 0, sy = 0, swiping = false;

        el.addEventListener('touchstart', function (e) {
            document.querySelectorAll('.sidebar-note-content.swiped').forEach(function (s) {
                if (s !== el) s.classList.remove('swiped');
            });
            sx = e.touches[0].clientX;
            sy = e.touches[0].clientY;
            swiping = false;
        }, { passive: true });

        el.addEventListener('touchmove', function (e) {
            cx = e.touches[0].clientX;
            if (Math.abs(sx - cx) > Math.abs(sy - e.touches[0].clientY) && Math.abs(sx - cx) > 10) {
                swiping = true;
            }
        }, { passive: true });

        el.addEventListener('touchend', function () {
            if (swiping) {
                if (sx - cx > 50) el.classList.add('swiped');
                else if (cx - sx > 25) el.classList.remove('swiped');
            }
            sx = cx = 0;
            swiping = false;
        }, { passive: true });
    }

    // ========== RESIZE ==========
    function setupResize() {
        var onResize = function () {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(function () {
                setPositionImmediate();
                rafId = null;
            });
        };

        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', function () {
            setTimeout(setPositionImmediate, 50);
            setTimeout(setPositionImmediate, 200);
            setTimeout(setPositionImmediate, 500);
        });

        // Catch visual viewport resize on mobile (keyboard open/close)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onResize);
        }
    }

    // ========== EVENTS ==========
    function initEvents() {
        hamburgerBtn.addEventListener('click', openSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);
        searchInput.addEventListener('input', function () { renderSidebar(); });
        fontDecreaseBtn.addEventListener('click', function () { changeFontSize(-2); });
        fontIncreaseBtn.addEventListener('click', function () { changeFontSize(2); });

        deleteBtn.addEventListener('click', function () {
            if (!notes.length) return;
            var n = notes[currentNoteIndex];
            if (n) showDeleteModal(n.id);
        });

        cancelDeleteBtn.addEventListener('click', hideDeleteModal);
        confirmDeleteBtn.addEventListener('click', function () {
            if (deleteTargetId) deleteNote(deleteTargetId);
            hideDeleteModal();
        });
        deleteModal.addEventListener('click', function (e) {
            if (e.target === deleteModal) hideDeleteModal();
        });

        setupResize();
        setupTouch();
        setupScroll();
        setupEmptyInteractions();
    }

    // ========== INIT ==========
    function init() {
        load();
        initEvents();
        renderAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();