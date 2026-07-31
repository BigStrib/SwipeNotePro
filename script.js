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
    let fontSize = 16;
    let deleteTargetId = null;

    let isDragging = false;
    let dragStartY = 0;
    let dragOffset = 0;
    let dragStartTime = 0;
    let dragStartedInTextarea = false;
    let textareaAtBoundary = false;
    let scrollCooldown = false;
    let touchStartedInViewport = false;

    // ========== STORAGE ==========
    function save() {
        localStorage.setItem('notesAppData', JSON.stringify({ notes, currentNoteIndex, fontSize }));
    }

    function load() {
        try {
            const d = JSON.parse(localStorage.getItem('notesAppData'));
            if (d) {
                notes = d.notes || [];
                currentNoteIndex = d.currentNoteIndex || 0;
                fontSize = d.fontSize || 16;
                if (currentNoteIndex >= notes.length) currentNoteIndex = Math.max(0, notes.length - 1);
            }
        } catch (e) {
            notes = [];
            currentNoteIndex = 0;
            fontSize = 16;
        }
    }

    // ========== HELPERS ==========
    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function escHtml(t) {
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function getTitle(n) {
        if (!n.content || !n.content.trim()) return 'Untitled Note';
        const l = n.content.trim().split('\n')[0];
        return l.length > 40 ? l.substring(0, 40) + '…' : l;
    }

    function getPreview(n) {
        if (!n.content || !n.content.trim()) return 'Empty note';
        const lines = n.content.trim().split('\n');
        if (lines.length > 1) {
            const p = lines.slice(1).join(' ').trim();
            return p.length > 50 ? p.substring(0, 50) + '…' : p || '';
        }
        return '';
    }

    function fmtDate(ts) {
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'Now';
        if (m < 60) return m + 'm';
        const h = Math.floor(diff / 3600000);
        if (h < 24) return h + 'h';
        const d = Math.floor(diff / 86400000);
        if (d < 7) return d + 'd';
        return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function isNoteEmpty(note) {
        return !note.content || note.content.trim() === '';
    }

    function hasBlankNeighbor(direction) {
        if (notes.length === 0) return false;
        if (isNoteEmpty(notes[currentNoteIndex])) return true;
        if (direction === 'down') {
            if (currentNoteIndex < notes.length - 1 && isNoteEmpty(notes[currentNoteIndex + 1])) return true;
        }
        if (direction === 'up') {
            if (currentNoteIndex > 0 && isNoteEmpty(notes[currentNoteIndex - 1])) return true;
        }
        return false;
    }

    function canCreateNote(direction) {
        if (notes.length === 0) return true;
        if (isNoteEmpty(notes[currentNoteIndex])) return false;
        return !hasBlankNeighbor(direction);
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
    function createNoteBelow() {
        if (!canCreateNote('down')) return false;
        notes.splice(currentNoteIndex + 1, 0, {
            id: genId(), content: '', createdAt: Date.now(), updatedAt: Date.now()
        });
        currentNoteIndex = currentNoteIndex + 1;
        save();
        renderAll();
        setTimeout(() => {
            const cards = notesContainer.querySelectorAll('.note-card');
            const ta = cards[currentNoteIndex]?.querySelector('.note-textarea');
            if (ta) ta.focus();
        }, 450);
        return true;
    }

    function createNoteAbove() {
        if (!canCreateNote('up')) return false;
        notes.splice(currentNoteIndex, 0, {
            id: genId(), content: '', createdAt: Date.now(), updatedAt: Date.now()
        });
        save();
        renderAll();
        setTimeout(() => {
            const cards = notesContainer.querySelectorAll('.note-card');
            const ta = cards[currentNoteIndex]?.querySelector('.note-textarea');
            if (ta) ta.focus();
        }, 450);
        return true;
    }

    function createFirstNote() {
        if (notes.length > 0) return;
        notes.push({
            id: genId(), content: '', createdAt: Date.now(), updatedAt: Date.now()
        });
        currentNoteIndex = 0;
        save();
        renderAll();
        setTimeout(() => {
            const ta = notesContainer.querySelector('.note-textarea');
            if (ta) ta.focus();
        }, 450);
    }

    function deleteNote(id) {
        const i = notes.findIndex(n => n.id === id);
        if (i === -1) return;
        notes.splice(i, 1);
        if (!notes.length) currentNoteIndex = 0;
        else if (currentNoteIndex >= notes.length) currentNoteIndex = notes.length - 1;
        else if (i < currentNoteIndex) currentNoteIndex--;
        save();
        renderAll();
    }

    function updateNote(id, content) {
        const n = notes.find(n => n.id === id);
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
        setPosition(true);
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

    // ========== RENDER ==========
    function renderAll() {
        renderNotes();
        renderSidebar();
        renderDots();
        renderCounter();
        renderEmpty();
        setPosition(false);
    }

    function renderNotes() {
        notesContainer.innerHTML = '';
        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.dataset.id = note.id;
            const ta = document.createElement('textarea');
            ta.className = 'note-textarea';
            ta.placeholder = 'Start writing...';
            ta.value = note.content;
            ta.style.fontSize = fontSize + 'px';
            ta.addEventListener('input', () => updateNote(note.id, ta.value));
            card.appendChild(ta);
            notesContainer.appendChild(card);
        });
    }

    function renderSidebar(filter) {
        sidebarNotesList.innerHTML = '';
        const q = (filter || searchInput.value).toLowerCase().trim();
        const filtered = q
            ? notes.filter(n => n.content.toLowerCase().includes(q) || getTitle(n).toLowerCase().includes(q))
            : notes;

        filtered.forEach(note => {
            const idx = notes.indexOf(note);
            const item = document.createElement('div');
            item.className = 'sidebar-note-item';

            const del = document.createElement('div');
            del.className = 'sidebar-note-delete';
            del.innerHTML = '<i class="fas fa-trash-alt"></i>';
            del.addEventListener('click', e => {
                e.stopPropagation();
                showDeleteModal(note.id);
            });

            const content = document.createElement('div');
            content.className = 'sidebar-note-content' + (idx === currentNoteIndex ? ' active' : '');
            const preview = getPreview(note);
            content.innerHTML = `
                <div class="sidebar-note-icon"><i class="fas fa-file-alt"></i></div>
                <div class="sidebar-note-info">
                    <div class="sidebar-note-title">${escHtml(getTitle(note))}</div>
                    ${preview ? `<div class="sidebar-note-preview">${escHtml(preview)}</div>` : ''}
                </div>
                <div class="sidebar-note-date">${fmtDate(note.updatedAt)}</div>
            `;

            content.addEventListener('click', () => {
                if (content.classList.contains('swiped')) { content.classList.remove('swiped'); return; }
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
        const max = 25;
        let start = 0, end = notes.length;
        if (notes.length > max) {
            start = Math.max(0, currentNoteIndex - Math.floor(max / 2));
            end = Math.min(notes.length, start + max);
            if (end - start < max) start = Math.max(0, end - max);
        }
        for (let i = start; i < end; i++) {
            const dot = document.createElement('div');
            dot.className = 'dot' + (i === currentNoteIndex ? ' active' : '');
            dot.addEventListener('click', () => {
                currentNoteIndex = i;
                save();
                renderDots();
                renderSidebar();
                setPosition(true);
            });
            dotNavigation.appendChild(dot);
        }
    }

    function renderCounter() {
        const count = notes.length;
        const label = count + (count === 1 ? ' Note' : ' Notes');
        noteCounter.textContent = label;
        sidebarNoteCount.textContent = label;
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

    function setPosition(animate) {
        if (!notes.length) return;
        const h = notesViewport.offsetHeight;
        const offset = -currentNoteIndex * h;
        if (!animate) notesContainer.classList.add('no-transition');
        else notesContainer.classList.remove('no-transition');
        notesContainer.style.transform = `translateY(${offset}px)`;
        if (!animate) {
            notesContainer.offsetHeight;
            notesContainer.classList.remove('no-transition');
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
        document.querySelectorAll('.sidebar-note-content.swiped').forEach(el => el.classList.remove('swiped'));
    }

    // ========== DELETE MODAL ==========
    function showDeleteModal(id) {
        deleteTargetId = id;
        const n = notes.find(n => n.id === id);
        if (n) deleteModalText.textContent = `"${getTitle(n)}" will be permanently deleted.`;
        deleteModal.classList.add('active');
    }

    function hideDeleteModal() {
        deleteModal.classList.remove('active');
        deleteTargetId = null;
    }

    // ========== FONT SIZE ==========
    function changeFontSize(delta) {
        fontSize = Math.min(36, Math.max(10, fontSize + delta));
        document.querySelectorAll('.note-textarea').forEach(ta => (ta.style.fontSize = fontSize + 'px'));
        save();
    }

    // ========== TEXTAREA BOUNDARY ==========
    function getActiveTextarea() {
        const cards = notesContainer.querySelectorAll('.note-card');
        return cards[currentNoteIndex]?.querySelector('.note-textarea') || null;
    }

    function isAtBottom(ta) {
        return ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 2;
    }

    function isAtTop(ta) {
        return ta.scrollTop <= 2;
    }

    function isInsideViewport(el) {
        while (el) {
            if (el === notesViewport) return true;
            el = el.parentElement;
        }
        return false;
    }

    // ========== TOUCH DRAG ==========
    function setupTouch() {
        notesViewport.addEventListener('touchstart', e => {
            if (!notes.length) return;
            touchStartedInViewport = true;
            dragStartY = e.touches[0].clientY;
            dragOffset = 0;
            dragStartTime = Date.now();
            isDragging = false;
            dragStartedInTextarea = e.target.classList.contains('note-textarea');
            textareaAtBoundary = false;
        }, { passive: true });

        document.addEventListener('touchmove', e => {
            if (!touchStartedInViewport || dragStartY === 0) return;

            const cy = e.touches[0].clientY;
            const diff = dragStartY - cy;

            if (dragStartedInTextarea && !textareaAtBoundary) {
                const ta = getActiveTextarea();
                if (ta) {
                    const atBound = diff > 0 ? isAtBottom(ta) : isAtTop(ta);
                    if (!atBound) return;
                    if (Math.abs(diff) > 20) {
                        textareaAtBoundary = true;
                        dragStartY = cy;
                        return;
                    }
                }
            }

            if (Math.abs(diff) > 8) {
                const allowed = diff > 0 ? canGoNext() : canGoPrev();
                isDragging = true;
                notesContainer.classList.add('dragging');

                const h = notesViewport.offsetHeight;
                const base = -currentNoteIndex * h;
                let pull;

                if (!allowed) {
                    pull = -diff * 0.06;
                } else {
                    pull = -diff * 0.45;
                }

                dragOffset = diff;
                notesContainer.style.transform = `translateY(${base + pull}px)`;

                if (isDragging && dragStartedInTextarea) {
                    const ta = getActiveTextarea();
                    if (ta) ta.blur();
                }
            }
        }, { passive: true });

        document.addEventListener('touchend', e => {
            if (!touchStartedInViewport) return;
            touchStartedInViewport = false;
            finishDrag();
        }, { passive: true });

        document.addEventListener('touchcancel', e => {
            if (!touchStartedInViewport) return;
            touchStartedInViewport = false;
            finishDrag();
        }, { passive: true });
    }

    function finishDrag() {
        notesContainer.classList.remove('dragging');
        if (!isDragging) { dragStartY = 0; return; }

        const diff = dragOffset;
        const elapsed = Date.now() - dragStartTime;
        const velocity = Math.abs(diff) / Math.max(elapsed, 1);
        const threshold = velocity > 0.3 ? 25 : 70;

        if (Math.abs(diff) > threshold) {
            if (diff > 0 && canGoNext()) goNext();
            else if (diff < 0 && canGoPrev()) goPrev();
            else setPosition(true);
        } else {
            setPosition(true);
        }

        isDragging = false;
        dragStartY = 0;
        dragOffset = 0;
        textareaAtBoundary = false;
    }

    // ========== MOUSE SCROLL ==========
    function setupScroll() {
        notesViewport.addEventListener('wheel', e => {
            if (scrollCooldown) return;

            const ta = getActiveTextarea();
            if (ta) {
                const goingDown = e.deltaY > 0;
                const atBound = goingDown ? isAtBottom(ta) : isAtTop(ta);
                if (!atBound) return;
            }

            if (Math.abs(e.deltaY) < 30) return;

            const allowed = e.deltaY > 0 ? canGoNext() : canGoPrev();
            if (!allowed) return;

            scrollCooldown = true;
            setTimeout(() => { scrollCooldown = false; }, 500);

            if (e.deltaY > 0) goNext();
            else goPrev();
        }, { passive: true });
    }

    // ========== EMPTY STATE ==========
    function setupEmptyInteractions() {
        document.addEventListener('wheel', e => {
            if (notes.length > 0) return;
            if (scrollCooldown) return;
            if (Math.abs(e.deltaY) < 30) return;
            scrollCooldown = true;
            setTimeout(() => { scrollCooldown = false; }, 500);
            createFirstNote();
        }, { passive: true });

        let emptyTouchStart = 0;

        document.addEventListener('touchstart', e => {
            if (notes.length === 0) emptyTouchStart = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchend', e => {
            if (notes.length === 0 && emptyTouchStart) {
                const diff = emptyTouchStart - (e.changedTouches[0]?.clientY || 0);
                if (Math.abs(diff) > 50) createFirstNote();
                emptyTouchStart = 0;
            }
        }, { passive: true });
    }

    // ========== SIDEBAR SWIPE ==========
    function setupSidebarSwipe(el) {
        let sx = 0, cx = 0, sy = 0, swiping = false;

        el.addEventListener('touchstart', e => {
            document.querySelectorAll('.sidebar-note-content.swiped').forEach(s => {
                if (s !== el) s.classList.remove('swiped');
            });
            sx = e.touches[0].clientX;
            sy = e.touches[0].clientY;
            swiping = false;
        }, { passive: true });

        el.addEventListener('touchmove', e => {
            cx = e.touches[0].clientX;
            if (Math.abs(sx - cx) > Math.abs(sy - e.touches[0].clientY) && Math.abs(sx - cx) > 10) {
                swiping = true;
            }
        }, { passive: true });

        el.addEventListener('touchend', () => {
            if (swiping) {
                if (sx - cx > 50) el.classList.add('swiped');
                else if (cx - sx > 25) el.classList.remove('swiped');
            }
            sx = cx = 0;
            swiping = false;
        }, { passive: true });
    }

    // ========== EVENTS ==========
    function initEvents() {
        hamburgerBtn.addEventListener('click', openSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);
        searchInput.addEventListener('input', () => renderSidebar());
        fontDecreaseBtn.addEventListener('click', () => changeFontSize(-2));
        fontIncreaseBtn.addEventListener('click', () => changeFontSize(2));

        deleteBtn.addEventListener('click', () => {
            if (!notes.length) return;
            const n = notes[currentNoteIndex];
            if (n) showDeleteModal(n.id);
        });

        cancelDeleteBtn.addEventListener('click', hideDeleteModal);
        confirmDeleteBtn.addEventListener('click', () => {
            if (deleteTargetId) deleteNote(deleteTargetId);
            hideDeleteModal();
        });
        deleteModal.addEventListener('click', e => {
            if (e.target === deleteModal) hideDeleteModal();
        });

        window.addEventListener('resize', () => setPosition(false));

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

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();