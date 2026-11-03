// ==========================================
// English Tutor LMS - Telegram Mini App Engine
// ==========================================

const API_BASE = ""; // Relative paths to match our server.py
let currentUser = null;
let currentToken = localStorage.getItem('lms_token') || null;

let currentActiveLesson = null;
let currentActiveHomework = null;
let currentActiveSubmission = null;

// Initialize Telegram WebApp
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    tg.ready();
    tg.expand();
}

function triggerHaptic(type = 'medium') {
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(type);
    }
}

// --- API HELPER ---
async function apiRequest(endpoint, method = 'GET', data = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
    }
    
    const config = { method, headers };
    if (data) {
        config.body = JSON.stringify(data);
    }

    try {
        const res = await fetch(API_BASE + endpoint, config);
        const json = await res.json();
        if (!res.ok) {
            throw new Error(json.error || `Ошибка сервера (${res.status})`);
        }
        return json;
    } catch (err) {
        console.error(`API Error on ${endpoint}:`, err);
        throw err;
    }
}

// --- APP INITIALIZATION ---
window.onload = async function() {
    // 1. Check for invite code in URL or Telegram start_param
    const urlParams = new URLSearchParams(window.location.search);
    let inviteCode = urlParams.get('invite');
    
    if (!inviteCode && tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        const startParam = tg.initDataUnsafe.start_param;
        if (startParam.startsWith('invite_')) {
            inviteCode = startParam.replace('invite_', '');
        } else {
            inviteCode = startParam;
        }
    }

    if (inviteCode) {
        // Pre-fill invite code and show invite join box
        document.getElementById('join-invite-code').value = inviteCode.toUpperCase();
        document.getElementById('invite-join-box').classList.remove('hidden');
        document.getElementById('no-invite-box').classList.add('hidden');
    } else {
        document.getElementById('invite-join-box').classList.add('hidden');
        document.getElementById('no-invite-box').classList.remove('hidden');
    }

    // 2. Check existing session
    if (currentToken) {
        try {
            const res = await apiRequest('/api/auth/me');
            currentUser = res.user;
            setupUserSession();
            return;
        } catch (e) {
            console.warn("Session expired or invalid. Resetting token.");
            localStorage.removeItem('lms_token');
            currentToken = null;
        }
    }

    // Default screen: Auth
    showScreen('screen-auth');
};

function showInviteInputPrompt() {
    const code = prompt("Введите код приглашения (например, WELCOME2026):");
    if (code && code.trim()) {
        document.getElementById('join-invite-code').value = code.trim().toUpperCase();
        document.getElementById('invite-join-box').classList.remove('hidden');
        document.getElementById('no-invite-box').classList.add('hidden');
    }
}

// --- AUTHENTICATION ---
async function joinByInvite() {
    triggerHaptic();
    const code = document.getElementById('join-invite-code').value.trim();
    const fullName = document.getElementById('join-student-name').value.trim();

    if (!code) {
        alert("Пожалуйста, введите код приглашения.");
        return;
    }
    if (!fullName) {
        alert("Пожалуйста, введите ваше имя и фамилию.");
        return;
    }

    let telegramId = "";
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        telegramId = tg.initDataUnsafe.user.id.toString();
    }

    try {
        const res = await apiRequest('/api/auth/invite-join', 'POST', {
            code,
            full_name: fullName,
            telegram_id: telegramId
        });

        currentToken = res.token;
        localStorage.setItem('lms_token', currentToken);
        currentUser = res.user;
        setupUserSession();
    } catch (err) {
        alert(err.message);
    }
}

function openTeacherLoginModal() {
    triggerHaptic();
    document.getElementById('modal-teacher-login').classList.remove('hidden');
}

async function submitTeacherLogin() {
    triggerHaptic();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        alert("Введите логин и пароль.");
        return;
    }

    try {
        const res = await apiRequest('/api/auth/login', 'POST', { username, password });
        currentToken = res.token;
        localStorage.setItem('lms_token', currentToken);
        currentUser = res.user;
        closeModal('modal-teacher-login');
        setupUserSession();
    } catch (err) {
        alert(err.message);
    }
}

function setupUserSession() {
    // Update Header
    document.getElementById('header-user-status').innerText = currentUser.full_name;
    const roleBadge = document.getElementById('role-pill-display');
    roleBadge.innerText = currentUser.role === 'teacher' ? 'Преподаватель' : 'Ученик';
    roleBadge.className = `role-pill ${currentUser.role}`;
    roleBadge.classList.remove('hidden');

    // Show/Hide Teacher specific UI elements
    const isTeacher = currentUser.role === 'teacher';
    document.querySelectorAll('.teacher-only').forEach(el => {
        if (isTeacher) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    const addLessonBtn = document.getElementById('btn-add-lesson');
    if (addLessonBtn) {
        if (isTeacher) addLessonBtn.classList.remove('hidden');
        else addLessonBtn.classList.add('hidden');
    }

    const addHwBtn = document.getElementById('btn-add-hw');
    if (addHwBtn) {
        if (isTeacher) addHwBtn.classList.remove('hidden');
        else addHwBtn.classList.add('hidden');
    }

    // Show bottom nav
    document.getElementById('bottom-nav').classList.remove('hidden');

    // Load initial lessons tab
    switchNavTab('lessons');
}

function logout() {
    if (confirm("Вы действительно хотите выйти из профиля?")) {
        triggerHaptic();
        localStorage.removeItem('lms_token');
        currentToken = null;
        currentUser = null;
        document.getElementById('bottom-nav').classList.add('hidden');
        document.getElementById('role-pill-display').classList.add('hidden');
        document.getElementById('header-user-status').innerText = "Дистанционное обучение";
        showScreen('screen-auth');
    }
}

// --- NAVIGATION & TABS ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
}

function switchNavTab(tabName) {
    triggerHaptic();
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    // Highlight button
    const navButtons = document.querySelectorAll('.nav-item');
    if (tabName === 'lessons') navButtons[0].classList.add('active');
    else if (tabName === 'homeworks') navButtons[1].classList.add('active');
    else if (tabName === 'reviews' && navButtons[2]) navButtons[2].classList.add('active');
    else if (tabName === 'students' && navButtons[3]) navButtons[3].classList.add('active');

    if (tabName === 'lessons') {
        showScreen('screen-lessons');
        loadLessons();
    } else if (tabName === 'homeworks') {
        showScreen('screen-homeworks');
        loadHomeworks();
    } else if (tabName === 'reviews') {
        showScreen('screen-reviews');
        loadSubmissions();
    } else if (tabName === 'students') {
        showScreen('screen-students');
        loadStudentsAndInvites();
    }
}

function showLessonsScreen() {
    triggerHaptic();
    showScreen('screen-lessons');
}

function closeModal(modalId) {
    triggerHaptic();
    document.getElementById(modalId).classList.add('hidden');
}

// --- 1. LESSONS LOGIC ---
async function loadLessons() {
    try {
        const res = await apiRequest('/api/lessons');
        const container = document.getElementById('lessons-list');
        container.innerHTML = '';

        if (!res.lessons || res.lessons.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align: center; color: var(--text-secondary); padding: 30px;">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">📚</div>
                    <div>Учебные материалы пока не добавлены.</div>
                </div>
            `;
            return;
        }

        res.lessons.forEach(l => {
            const card = document.createElement('div');
            card.className = 'card card-clickable';
            card.onclick = () => openLessonDetail(l.id);
            card.innerHTML = `
                <div class="lesson-card-header">
                    <span class="level-tag">${l.level || 'All Levels'}</span>
                    ${currentUser.role === 'teacher' ? `
                        <button class="btn-icon btn-sm btn-danger" title="Удалить урок" onclick="event.stopPropagation(); deleteLesson(${l.id})">🗑️</button>
                    ` : ''}
                </div>
                <h3 class="lesson-card-title">${l.title}</h3>
                <p class="lesson-card-desc">${l.description || 'Нажмите, чтобы открыть конспект и материалы урока...'}</p>
                <div class="lesson-card-footer">
                    <span>📖 Читать материал</span>
                    <span>${l.homeworks_count > 0 ? `✍️ Есть ДЗ (${l.homeworks_count})` : 'Без ДЗ'}</span>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        alert(e.message);
    }
}

async function openLessonDetail(lessonId) {
    triggerHaptic();
    try {
        const res = await apiRequest(`/api/lessons/${lessonId}`);
        const lesson = res.lesson;
        currentActiveLesson = lesson;

        const container = document.getElementById('lesson-detail-container');
        let blocksHtml = '';

        lesson.blocks.forEach(block => {
            if (block.type === 'text') {
                let formatted = block.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br>');
                blocksHtml += `<div class="lesson-content-block lesson-text"><p>${formatted}</p></div>`;
            } else if (block.type === 'video') {
                let videoUrl = block.url || '';
                // Convert regular YouTube link to embed if needed
                if (videoUrl.includes('youtube.com/watch?v=')) {
                    videoUrl = videoUrl.replace('watch?v=', 'embed/');
                } else if (videoUrl.includes('youtu.be/')) {
                    videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
                }
                
                blocksHtml += `
                    <div class="lesson-content-block">
                        <div class="lesson-video-wrapper">
                            <iframe src="${videoUrl}" allowfullscreen></iframe>
                        </div>
                        ${block.caption ? `<div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; margin-top: 4px;">🎬 ${block.caption}</div>` : ''}
                    </div>
                `;
            } else if (block.type === 'image') {
                blocksHtml += `
                    <div class="lesson-content-block">
                        <img src="${block.url}" class="lesson-image" alt="Иллюстрация к уроку">
                        ${block.caption ? `<div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center;">🖼️ ${block.caption}</div>` : ''}
                    </div>
                `;
            } else if (block.type === 'vocab') {
                let itemsList = '';
                if (Array.isArray(block.items)) {
                    block.items.forEach(it => { itemsList += `<li>${it}</li>`; });
                }
                blocksHtml += `
                    <div class="lesson-content-block lesson-vocab-box">
                        <div class="lesson-vocab-title">📚 ${block.title || 'Словарь и правила'}</div>
                        <ul class="lesson-vocab-list">${itemsList}</ul>
                    </div>
                `;
            } else if (block.type === 'note') {
                blocksHtml += `
                    <div class="lesson-content-block lesson-note-box">
                        💡 <strong>Обратите внимание:</strong> ${block.content}
                    </div>
                `;
            }
        });

        // Homework link button if attached
        let hwButtonHtml = '';
        if (lesson.homework) {
            hwButtonHtml = `
                <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid var(--border-color);">
                    <div style="font-size: 0.9rem; font-weight: 700; margin-bottom: 8px;">✍️ Практическое задание к этому уроку:</div>
                    <button class="btn-primary" style="width: 100%;" onclick="openSolveHomeworkModal(${lesson.homework.id})">
                        Перейти к выполнению ДЗ →
                    </button>
                </div>
            `;
        }

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span class="level-tag">${lesson.level || 'All Levels'}</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${new Date(lesson.created_at).toLocaleDateString('ru-RU')}</span>
            </div>
            <h2 style="font-size: 1.35rem; font-weight: 800; margin-bottom: 14px; line-height: 1.35;">${lesson.title}</h2>
            <div class="lesson-body">${blocksHtml}</div>
            ${hwButtonHtml}
        `;

        showScreen('screen-lesson-detail');
    } catch (e) {
        alert(e.message);
    }
}

let pendingConfirmCallback = null;

function showConfirmDialog(title, text, onConfirm) {
    triggerHaptic('warning');
    const modal = document.getElementById('modal-confirm');
    if (!modal) {
        if (confirm(text)) onConfirm();
        return;
    }
    document.getElementById('confirm-modal-title').innerText = title || "Удаление";
    document.getElementById('confirm-modal-text').innerText = text;
    pendingConfirmCallback = onConfirm;
    
    const acceptBtn = document.getElementById('btn-confirm-accept');
    acceptBtn.onclick = async () => {
        closeModal('modal-confirm');
        if (pendingConfirmCallback) {
            await pendingConfirmCallback();
            pendingConfirmCallback = null;
        }
    };
    
    modal.classList.remove('hidden');
}

function deleteLesson(lessonId) {
    showConfirmDialog(
        "Удалить урок?",
        "Вы уверены, что хотите удалить этот урок и все его материалы?",
        async () => {
            triggerHaptic();
            try {
                await apiRequest(`/api/lessons/${lessonId}`, 'DELETE');
                loadLessons();
            } catch (e) {
                alert(e.message);
            }
        }
    );
}

// --- LESSON BUILDER ---
let currentLessonBlocks = [];

function openCreateLessonModal() {
    triggerHaptic();
    currentLessonBlocks = [];
    document.getElementById('lesson-title-input').value = '';
    document.getElementById('lesson-desc-input').value = '';
    document.getElementById('lesson-builder-blocks').innerHTML = '';
    
    // Add default initial text block
    addLessonBlock('text');
    document.getElementById('modal-create-lesson').classList.remove('hidden');
}

function addLessonBlock(type) {
    triggerHaptic();
    const id = Date.now() + Math.random().toString(36).substring(7);
    const container = document.getElementById('lesson-builder-blocks');

    const blockDiv = document.createElement('div');
    blockDiv.className = 'card';
    blockDiv.id = `block-${id}`;
    blockDiv.style.padding = '12px';
    blockDiv.style.marginBottom = '12px';
    blockDiv.style.backgroundColor = 'var(--bg-input)';

    let innerContent = '';
    if (type === 'text') {
        innerContent = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">📝 Текстовый блок / Теория</span>
                <button type="button" class="btn-icon btn-sm btn-danger" onclick="removeBlockElement('block-${id}')">✕</button>
            </div>
            <textarea class="form-textarea block-data-text" placeholder="Введите текст урока, правила, объяснения... (поддерживается **жирный шрифт**)"></textarea>
        `;
    } else if (type === 'video') {
        innerContent = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: #ef4444;">🎬 Видеоурок</span>
                <button type="button" class="btn-icon btn-sm btn-danger" onclick="removeBlockElement('block-${id}')">✕</button>
            </div>
            <input type="text" class="form-input block-data-url" placeholder="Ссылка на YouTube или прямое видео (https://...)" style="margin-bottom: 8px;">
            <input type="text" class="form-input block-data-caption" placeholder="Подпись к видео (необязательно)">
        `;
    } else if (type === 'image') {
        innerContent = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: #059669;">🖼️ Изображение</span>
                <button type="button" class="btn-icon btn-sm btn-danger" onclick="removeBlockElement('block-${id}')">✕</button>
            </div>
            <input type="text" class="form-input block-data-url" placeholder="URL картинки (например, https://example.com/img.jpg)" style="margin-bottom: 8px;">
            <input type="text" class="form-input block-data-caption" placeholder="Подпись к изображению (необязательно)">
        `;
    } else if (type === 'vocab') {
        innerContent = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: #d97706;">📚 Словарь / Важные слова</span>
                <button type="button" class="btn-icon btn-sm btn-danger" onclick="removeBlockElement('block-${id}')">✕</button>
            </div>
            <input type="text" class="form-input block-data-title" placeholder="Заголовок блока (например, Новые слова к уроку)" style="margin-bottom: 8px;">
            <textarea class="form-textarea block-data-items" placeholder="Введите слова и выражения, каждое с новой строки..."></textarea>
        `;
    }

    blockDiv.innerHTML = innerContent;
    blockDiv.dataset.blockType = type;
    container.appendChild(blockDiv);
}

function removeBlockElement(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.remove();
}

async function saveNewLesson() {
    triggerHaptic();
    const title = document.getElementById('lesson-title-input').value.trim();
    const level = document.getElementById('lesson-level-input').value;
    const description = document.getElementById('lesson-desc-input').value.trim();

    if (!title) {
        alert("Пожалуйста, введите название урока.");
        return;
    }

    const blockElements = document.querySelectorAll('#lesson-builder-blocks > div');
    const blocks = [];

    blockElements.forEach(el => {
        const type = el.dataset.blockType;
        if (type === 'text') {
            const content = el.querySelector('.block-data-text').value.trim();
            if (content) blocks.push({ type: 'text', content });
        } else if (type === 'video') {
            const url = el.querySelector('.block-data-url').value.trim();
            const caption = el.querySelector('.block-data-caption').value.trim();
            if (url) blocks.push({ type: 'video', url, caption });
        } else if (type === 'image') {
            const url = el.querySelector('.block-data-url').value.trim();
            const caption = el.querySelector('.block-data-caption').value.trim();
            if (url) blocks.push({ type: 'image', url, caption });
        } else if (type === 'vocab') {
            const title = el.querySelector('.block-data-title').value.trim() || 'Словарь';
            const rawItems = el.querySelector('.block-data-items').value.split('\n');
            const items = rawItems.map(i => i.trim()).filter(i => i.length > 0);
            if (items.length > 0) blocks.push({ type: 'vocab', title, items });
        }
    });

    if (blocks.length === 0) {
        alert("Добавьте хотя бы один блок с материалом урока.");
        return;
    }

    try {
        await apiRequest('/api/lessons', 'POST', {
            title,
            level,
            description,
            blocks
        });
        closeModal('modal-create-lesson');
        loadLessons();
    } catch (e) {
        alert(e.message);
    }
}

// --- 2. HOMEWORKS LOGIC ---
async function loadHomeworks() {
    try {
        const res = await apiRequest('/api/homeworks');
        const container = document.getElementById('homeworks-list');
        container.innerHTML = '';

        if (!res.homeworks || res.homeworks.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align: center; color: var(--text-secondary); padding: 30px;">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">✍️</div>
                    <div>Домашние задания пока не назначены.</div>
                </div>
            `;
            return;
        }

        res.homeworks.forEach(hw => {
            const card = document.createElement('div');
            card.className = 'card';
            
            let statusBadge = '';
            let actionBtn = '';

            if (currentUser.role === 'student') {
                if (!hw.my_status) {
                    statusBadge = '<span class="status-badge new">⏳ Новое</span>';
                    actionBtn = `<button class="btn-primary btn-sm" onclick="openSolveHomeworkModal(${hw.id})">Выполнить ДЗ ✍️</button>`;
                } else if (hw.my_status === 'submitted') {
                    statusBadge = '<span class="status-badge submitted">🟡 На проверке</span>';
                    actionBtn = `<button class="btn-secondary btn-sm" onclick="openSolveHomeworkModal(${hw.id})">Просмотреть свои ответы</button>`;
                } else if (hw.my_status === 'reviewed') {
                    statusBadge = `<span class="status-badge reviewed">🟢 Оценка: ${hw.my_score || '5'}</span>`;
                    actionBtn = `<button class="btn-secondary btn-sm" onclick="openSolveHomeworkModal(${hw.id})">Смотреть оценку и фидбек</button>`;
                }
            } else {
                // Teacher
                const pending = hw.pending_reviews || 0;
                statusBadge = pending > 0 
                    ? `<span class="status-badge submitted">Ждут проверки: ${pending}</span>`
                    : `<span class="status-badge reviewed">Сдано всего: ${hw.total_submissions || 0}</span>`;
                actionBtn = `
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-secondary btn-sm" onclick="switchNavTab('reviews')">К проверке →</button>
                        <button type="button" class="btn-icon btn-sm btn-danger" onclick="event.stopPropagation(); deleteHomework(${hw.id})" title="Удалить">🗑️</button>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="hw-header">
                    ${statusBadge}
                    ${hw.deadline ? `<span style="font-size: 0.78rem; color: var(--text-muted);">Дедлайн: ${hw.deadline}</span>` : ''}
                </div>
                <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 6px;">${hw.title}</h3>
                <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 14px;">${hw.description || 'Выполните задания и отправьте их на проверку учителю.'}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">${hw.lesson_title ? `📖 ${hw.lesson_title}` : 'Общее ДЗ'}</span>
                    ${actionBtn}
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        alert(e.message);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderClozeSentence(rawText, qIdx, prevAns, isReadOnly) {
    const ansStr = prevAns || '';

    // 1. Check if sentence has transformation arrow: "She is happy. -> [She's happy.]" or "She is happy. -> ________"
    const arrowMatch = rawText.match(/(->|→)/);
    if (arrowMatch) {
        const parts = rawText.split(/(?:->|→)/);
        const leftSide = parts[0].trim();
        return `
            <div class="cloze-sentence-wrapper">
                <span class="cloze-text">${escapeHtml(leftSide)}</span>
                <span class="cloze-arrow">➔</span>
                <input type="text" 
                       class="cloze-inline-input wide" 
                       data-q-idx="${qIdx}" 
                       data-gap-idx="0" 
                       value="${escapeHtml(ansStr)}" 
                       placeholder="введите ответ..." 
                       ${isReadOnly ? 'readonly' : ''} 
                       autocomplete="off" 
                       autocapitalize="none">
            </div>
        `;
    }

    // 2. Check if sentence has blanks like "I ___ fine." or "1. I ... fine." or "I [am] fine."
    const gapRegex = /(_{2,}|\.{3,}|\[[^\]]*\])/g;
    if (rawText.match(gapRegex)) {
        const parts = rawText.split(gapRegex);
        const savedVals = ansStr.includes(' / ') ? ansStr.split(' / ') : [ansStr];

        let gapCount = 0;
        let html = '<div class="cloze-sentence-wrapper">';

        parts.forEach(part => {
            if (part.match(gapRegex)) {
                const val = savedVals[gapCount] || '';
                html += `
                    <input type="text" 
                           class="cloze-inline-input" 
                           data-q-idx="${qIdx}" 
                           data-gap-idx="${gapCount}" 
                           value="${escapeHtml(val)}" 
                           placeholder="..." 
                           ${isReadOnly ? 'readonly' : ''} 
                           autocomplete="off" 
                           autocapitalize="none">
                `;
                gapCount++;
            } else if (part.length > 0) {
                const numMatch = part.match(/^(\d+[\.\)])\s*(.*)/);
                if (numMatch) {
                    html += `<span class="cloze-num">${escapeHtml(numMatch[1])}</span> `;
                    if (numMatch[2]) {
                        html += `<span class="cloze-text">${escapeHtml(numMatch[2])}</span>`;
                    }
                } else {
                    html += `<span class="cloze-text">${escapeHtml(part)}</span>`;
                }
            }
        });

        html += '</div>';
        return html;
    }

    // 3. Fallback for unscramble / error-correction (e.g. "(you / Are / ok) ?" or "He are a doctor.")
    return `
        <div class="cloze-sentence-wrapper">
            <span class="cloze-text">${escapeHtml(rawText)}</span>
            <span class="cloze-arrow">➔</span>
            <input type="text" 
                   class="cloze-inline-input wide" 
                   data-q-idx="${qIdx}" 
                   data-gap-idx="0" 
                   value="${escapeHtml(ansStr)}" 
                   placeholder="введите ответ..." 
                   ${isReadOnly ? 'readonly' : ''} 
                   autocomplete="off" 
                   autocapitalize="none">
        </div>
    `;
}

// Auto-advance cursor to next blank on Enter key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('cloze-inline-input')) {
        e.preventDefault();
        const allInputs = Array.from(document.querySelectorAll('.cloze-inline-input:not([readonly])'));
        const nextIdx = allInputs.indexOf(e.target) + 1;
        if (nextIdx < allInputs.length) {
            allInputs[nextIdx].focus();
        }
    }
});

async function openSolveHomeworkModal(hwId) {
    triggerHaptic();
    try {
        const res = await apiRequest(`/api/homeworks/${hwId}`);
        const hw = res.homework;
        currentActiveHomework = hw;

        document.getElementById('solve-hw-title').innerText = hw.title;
        document.getElementById('solve-hw-desc').innerText = hw.description || '';

        const container = document.getElementById('solve-questions-container');
        container.innerHTML = '';

        const isReadOnly = (currentUser.role === 'student' && hw.my_submission && hw.my_submission.status === 'reviewed');
        const existingAnswers = (hw.my_submission && hw.my_submission.answers) ? hw.my_submission.answers : [];

        // If reviewed, show grade alert
        if (hw.my_submission && hw.my_submission.status === 'reviewed') {
            const gradeBox = document.createElement('div');
            gradeBox.className = 'card';
            gradeBox.style.backgroundColor = 'var(--bg-input)';
            gradeBox.style.borderLeft = '4px solid var(--accent-green)';
            gradeBox.innerHTML = `
                <div style="font-size: 1.05rem; font-weight: 800; color: var(--accent-green); margin-bottom: 6px;">
                    Оценка преподавателя: ${hw.my_submission.score || 'Зачтено'}
                </div>
                <div style="font-size: 0.9rem; line-height: 1.5;">
                    ${hw.my_submission.feedback ? `<strong>Комментарий учителя:</strong><br>${hw.my_submission.feedback.replace(/\n/g, '<br>')}` : 'Задание успешно проверено!'}
                </div>
            `;
            container.appendChild(gradeBox);
        }

        // Render questions grouped by Exercise Section
        let currentSectionKey = null;
        let currentItemsContainer = null;

        hw.questions.forEach((q, idx) => {
            const secTitle = q.section_title || 'Упражнение';
            const secDesc = q.section_desc || '';

            // If section changed, open a new section block
            if (secTitle !== currentSectionKey) {
                currentSectionKey = secTitle;
                const sectionBlock = document.createElement('div');
                sectionBlock.className = 'exercise-section-block';

                const numMatch = secTitle.match(/^(Упражнение\s*\d+|Exercise\s*\d+|Задание\s*\d+)/i);
                const badgeText = numMatch ? numMatch[1] : 'Упражнение';
                let cleanTitle = secTitle.replace(/^(Упражнение\s*\d+[\.\:]?\s*|Exercise\s*\d+[\.\:]?\s*|Задание\s*\d+[\.\:]?\s*)/i, '');
                if (!cleanTitle) cleanTitle = secTitle;

                let descHtml = '';
                if (secDesc) {
                    descHtml = `<div class="exercise-section-desc">💬 ${escapeHtml(secDesc)}</div>`;
                }

                sectionBlock.innerHTML = `
                    <div class="exercise-section-header">
                        <div class="exercise-section-badge">📌 ${escapeHtml(badgeText)}</div>
                        <h4 class="exercise-section-title">${escapeHtml(cleanTitle)}</h4>
                        ${descHtml}
                    </div>
                    <div class="exercise-items-list"></div>
                `;
                container.appendChild(sectionBlock);
                currentItemsContainer = sectionBlock.querySelector('.exercise-items-list');
            }

            const prevAns = existingAnswers[idx] ? existingAnswers[idx].answer : '';
            const targetContainer = currentItemsContainer || container;

            // Check question type
            const isGapFill = q.type === 'gap_fill' || (q.type !== 'choice');

            if (isGapFill) {
                const qDiv = document.createElement('div');
                qDiv.className = 'cloze-exercise-card';
                qDiv.innerHTML = renderClozeSentence(q.text, idx, prevAns, isReadOnly);
                targetContainer.appendChild(qDiv);
            } else if (q.type === 'choice' && Array.isArray(q.options)) {
                const qDiv = document.createElement('div');
                qDiv.className = 'question-block';
                let optionsHtml = '';
                q.options.forEach(opt => {
                    const checked = (prevAns === opt) ? 'checked' : '';
                    optionsHtml += `
                        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.9rem; cursor: pointer;">
                            <input type="radio" name="question_${idx}" value="${opt}" ${checked} ${isReadOnly ? 'disabled' : ''}>
                            <span>${opt}</span>
                        </label>
                    `;
                });
                qDiv.innerHTML = `
                    <div class="question-title">Вопрос ${idx + 1}: ${escapeHtml(q.text)}</div>
                    <div>${optionsHtml}</div>
                `;
                targetContainer.appendChild(qDiv);
            } else {
                const qDiv = document.createElement('div');
                qDiv.className = 'question-block';
                qDiv.innerHTML = `
                    <div class="question-title">Вопрос ${idx + 1}: ${escapeHtml(q.text)}</div>
                    <textarea class="form-textarea question-answer-input" data-q-idx="${idx}" placeholder="Введите ваш ответ здесь..." ${isReadOnly ? 'readonly' : ''}>${prevAns}</textarea>
                `;
                targetContainer.appendChild(qDiv);
            }
        });

        // Hide or Show submit button
        const submitBtn = document.getElementById('btn-submit-answers');
        if (currentUser.role === 'teacher' || (hw.my_submission && hw.my_submission.status === 'reviewed')) {
            submitBtn.classList.add('hidden');
        } else {
            submitBtn.classList.remove('hidden');
        }

        document.getElementById('modal-solve-hw').classList.remove('hidden');
    } catch (e) {
        alert(e.message);
    }
}

async function submitHomeworkAnswers() {
    triggerHaptic();
    if (!currentActiveHomework) return;

    const answers = [];
    currentActiveHomework.questions.forEach((q, idx) => {
        let val = '';
        if (q.type === 'choice') {
            const selected = document.querySelector(`input[name="question_${idx}"]:checked`);
            if (selected) val = selected.value;
        } else {
            // Check for cloze inline inputs first
            const gapInputs = document.querySelectorAll(`.cloze-inline-input[data-q-idx="${idx}"]`);
            if (gapInputs.length > 0) {
                const vals = Array.from(gapInputs).map(inp => inp.value.trim());
                val = vals.join(' / ');
            } else {
                const txtInput = document.querySelector(`.question-answer-input[data-q-idx="${idx}"]`);
                if (txtInput) {
                    val = txtInput.value.trim();
                } else {
                    const allTxt = document.querySelectorAll('.question-answer-input');
                    if (allTxt[idx]) val = allTxt[idx].value.trim();
                }
            }
        }
        answers.push({ question_id: idx, answer: val });
    });

    try {
        await apiRequest('/api/submissions', 'POST', {
            homework_id: currentActiveHomework.id,
            answers
        });
        alert("Ваши ответы успешно отправлены на проверку преподавателю! 🚀");
        closeModal('modal-solve-hw');
        loadHomeworks();
    } catch (e) {
        alert(e.message);
    }
}

function deleteHomework(hwId) {
    showConfirmDialog(
        "Удалить задание?",
        "Вы уверены, что хотите удалить это домашнее задание?",
        async () => {
            triggerHaptic();
            try {
                await apiRequest(`/api/homeworks/${hwId}`, 'DELETE');
                loadHomeworks();
            } catch (e) {
                alert(e.message);
            }
        }
    );
}

// --- HOMEWORK BUILDER & BULK IMPORT ---
function toggleBulkImportPanel(forceState) {
    triggerHaptic();
    const panel = document.getElementById('bulk-import-panel');
    if (!panel) return;
    if (typeof forceState === 'boolean') {
        if (forceState) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
    } else {
        panel.classList.toggle('hidden');
    }
}

function insertBulkExample() {
    triggerHaptic();
    const textarea = document.getElementById('bulk-import-text');
    if (!textarea) return;
    textarea.value = `Упражнение 1. Быстрая связка (Вставьте am, is или are)
1. I ___ fine.
2. He ___ busy.
3. They ___ at home.
4. You ___ right.
5. She ___ tired.
6. We ___ ready.
7. It ___ new.
8. This ___ good, and that ___ old.
9. These ___ here, and those ___ there.
10. Who ___ there?

Упражнение 2. Переделайте в краткую форму (Сокращения)
1. She is happy. -> [She's happy.]
2. We are not late. -> [We aren't late.]
3. I am not sad. -> [I'm not sad.]`;
}

function applyBulkImport() {
    triggerHaptic();
    const rawText = document.getElementById('bulk-import-text').value.trim();
    if (!rawText) {
        alert("Пожалуйста, вставьте текст упражнений.");
        return;
    }

    const lines = rawText.split('\n').map(l => l.trim());
    let currentSectionTitle = "Упражнение 1";
    let currentSectionDesc = "";
    let addedCount = 0;
    let exerciseCount = 0;

    // Reset container if user has existing questions
    const container = document.getElementById('hw-questions-builder');
    if (container.children.length > 0) {
        if (confirm("Очистить предыдущие вопросы перед импортом новых?")) {
            container.innerHTML = '';
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Check if this line is an Exercise Header like:
        // "Упражнение 1. Быстрая связка (Вставьте am, is или are)Задача ученика — довести выбор глагола..."
        // or "Упражнение 2. Переделайте в краткую форму (Сокращения)..."
        const headerMatchWithParen = line.match(/^(Упражнение\s*\d+[^)]*\))(.*)/i) || 
                                     line.match(/^(Exercise\s*\d+[^)]*\))(.*)/i) ||
                                     line.match(/^(Задание\s*\d+[^)]*\))(.*)/i);

        const headerMatchGeneric = line.match(/^(Упражнение\s*\d+|Exercise\s*\d+|Задание\s*\d+)[\.:\s]*(.*)/i);

        if (headerMatchWithParen) {
            currentSectionTitle = headerMatchWithParen[1].trim();
            currentSectionDesc = headerMatchWithParen[2].trim();
            exerciseCount++;
            continue;
        } else if (headerMatchGeneric) {
            currentSectionTitle = line;
            currentSectionDesc = "";
            // Check if next line is an instruction description (not starting with 1. or number)
            if (i + 1 < lines.length && !lines[i + 1].match(/^\d+[\.\)]/)) {
                currentSectionDesc = lines[i + 1].trim();
                i++; // skip next line as description
            }
            exerciseCount++;
            continue;
        }

        // Check if line is an instruction line without header (e.g. "Задача ученика...", "Пример: ...")
        if (line.match(/^(Задача ученика|Инструкция|Пример:|Внимание:|Пусть ученик|Слова перепутаны|Отличное задание)/i)) {
            if (currentSectionDesc) currentSectionDesc += ' ' + line;
            else currentSectionDesc = line;
            continue;
        }

        // Check if line is an exercise item (e.g. "1. I ___ fine." or "1. (you / are / ok) ?" or "1. He are a doctor.")
        const isExerciseItem = line.match(/^\d+[\.\)]\s+/) || 
                               line.includes('___') || 
                               line.includes('..') || 
                               line.includes('->') || 
                               line.includes('→') || 
                               line.includes('(');

        if (isExerciseItem) {
            let qText = line;
            let correct = '';

            // Extract bracketed answer if provided: "I [am] fine" or "-> [She's happy.]"
            const bracketMatch = line.match(/\[(.*?)\]/);
            if (bracketMatch) {
                correct = bracketMatch[1].trim();
                qText = line.replace(/\[(.*?)\]/, '___');
            }

            addHwQuestionField('gap_fill', qText, '', correct, currentSectionTitle, currentSectionDesc);
            addedCount++;
        }
    }

    if (addedCount > 0) {
        toggleBulkImportPanel(false);
        document.getElementById('bulk-import-text').value = '';

        // Set clean homework title if empty
        const titleInput = document.getElementById('hw-title-input');
        if (!titleInput.value) {
            titleInput.value = 'Комплексные упражнения';
        }
        // Do NOT overwrite top description with all exercise instructions combined!
        const descInput = document.getElementById('hw-desc-input');
        if (!descInput.value) {
            descInput.value = 'Выполните упражнения ниже по разделам.';
        }

        alert(`✨ Успешно распознано: ${exerciseCount || 1} разделов и ${addedCount} заданий!\nКаждое упражнение теперь оформлено в отдельный аккуратный блок.`);
    } else {
        alert("Не удалось распознать упражнения в тексте. Убедитесь, что строки содержат номера (1. ...), пропуски (___) или стрелочки (->).");
    }
}

async function openCreateHomeworkModal() {
    triggerHaptic();
    document.getElementById('hw-title-input').value = '';
    document.getElementById('hw-desc-input').value = '';
    document.getElementById('hw-deadline-input').value = '';
    document.getElementById('hw-questions-builder').innerHTML = '';
    toggleBulkImportPanel(false);

    // Populate lessons select
    try {
        const res = await apiRequest('/api/lessons');
        const select = document.getElementById('hw-lesson-select');
        select.innerHTML = '<option value="">Без привязки (Самостоятельное ДЗ)</option>';
        res.lessons.forEach(l => {
            select.innerHTML += `<option value="${l.id}">${l.title}</option>`;
        });
    } catch (e) {
        console.error(e);
    }

    addHwQuestionField('gap_fill', '', '', '', 'Упражнение 1', 'Инструкция к упражнению');
    document.getElementById('modal-create-hw').classList.remove('hidden');
}

function addHwQuestionField(defaultType = 'gap_fill', initialText = '', initialOptions = '', initialCorrect = '', sectionTitle = '', sectionDesc = '') {
    triggerHaptic();
    const container = document.getElementById('hw-questions-builder');
    const id = Date.now() + Math.random().toString(36).substring(7);

    // If sectionTitle is provided, check if we need to insert a visual divider banner in the builder
    if (sectionTitle) {
        const lastDividers = container.querySelectorAll('.builder-section-divider');
        const lastDivider = lastDividers.length > 0 ? lastDividers[lastDividers.length - 1] : null;
        const lastTitle = lastDivider ? lastDivider.dataset.sectionTitle : '';
        if (lastTitle !== sectionTitle) {
            const divider = document.createElement('div');
            divider.className = 'builder-section-divider';
            divider.dataset.sectionTitle = sectionTitle;
            divider.innerHTML = `
                <div class="builder-section-divider-title">📌 ${escapeHtml(sectionTitle)}</div>
                ${sectionDesc ? `<div class="builder-section-divider-desc">💬 ${escapeHtml(sectionDesc)}</div>` : ''}
            `;
            container.appendChild(divider);
        }
    }

    const qCard = document.createElement('div');
    qCard.className = 'question-item-card';
    qCard.id = `q-${id}`;

    const isChoice = defaultType === 'choice';
    const isGap = defaultType === 'gap_fill';

    qCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; font-size: 0.85rem; color: var(--primary);">Вопрос / Предложение</span>
            <button type="button" class="btn-icon btn-sm btn-danger" onclick="removeBlockElement('q-${id}')">✕</button>
        </div>
        <input type="text" class="form-input q-text" placeholder="Например: 1. I ___ fine. или She is happy. -> [She's happy.]" value="${escapeHtml(initialText)}" style="margin-bottom: 8px; font-weight: 500;">
        <input type="hidden" class="q-section-title" value="${escapeHtml(sectionTitle)}">
        <input type="hidden" class="q-section-desc" value="${escapeHtml(sectionDesc)}">
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <select class="form-select q-type" onchange="toggleQuestionOptions(this)" style="flex: 1.2;">
                <option value="gap_fill" ${isGap ? 'selected' : ''}>🔤 Заполнение пропуска (I ___ fine)</option>
                <option value="choice" ${isChoice ? 'selected' : ''}>🔘 Выбор варианта ответа</option>
                <option value="text" ${defaultType === 'text' ? 'selected' : ''}>📝 Развернутый ответ / перевод</option>
            </select>
            <input type="text" class="form-input q-correct" placeholder="Эталонный ответ (необязательно)" value="${escapeHtml(initialCorrect)}" style="flex: 1;" title="Если указан, учитель сразу видит правильность при проверке">
        </div>
        <div class="q-options-wrapper ${isChoice ? '' : 'hidden'}">
            <input type="text" class="form-input q-options" placeholder="Варианты через точку с запятой (am; is; are)" value="${escapeHtml(initialOptions)}">
        </div>
    `;
    container.appendChild(qCard);
}

function toggleQuestionOptions(selectEl) {
    const parent = selectEl.closest('.question-item-card');
    const optsWrapper = parent.querySelector('.q-options-wrapper');
    if (selectEl.value === 'choice') {
        optsWrapper.classList.remove('hidden');
    } else {
        optsWrapper.classList.add('hidden');
    }
}

async function saveNewHomework() {
    triggerHaptic();
    const title = document.getElementById('hw-title-input').value.trim();
    const lessonId = document.getElementById('hw-lesson-select').value || null;
    const description = document.getElementById('hw-desc-input').value.trim();
    const deadline = document.getElementById('hw-deadline-input').value.trim();

    if (!title) {
        alert("Пожалуйста, введите название задания.");
        return;
    }

    const qCards = document.querySelectorAll('#hw-questions-builder > .question-item-card');
    const questions = [];

    qCards.forEach((card, idx) => {
        const text = card.querySelector('.q-text').value.trim();
        const type = card.querySelector('.q-type').value;
        const correctInput = card.querySelector('.q-correct');
        const correct = correctInput ? correctInput.value.trim() : '';
        const sectionTitleInput = card.querySelector('.q-section-title');
        const sectionDescInput = card.querySelector('.q-section-desc');
        const section_title = sectionTitleInput ? sectionTitleInput.value.trim() : '';
        const section_desc = sectionDescInput ? sectionDescInput.value.trim() : '';
        if (!text) return;

        const qObj = { id: idx + 1, text, type, correct, section_title, section_desc };
        if (type === 'choice') {
            const rawOpts = card.querySelector('.q-options').value.split(';');
            qObj.options = rawOpts.map(o => o.trim()).filter(o => o.length > 0);
        }
        questions.push(qObj);
    });

    if (questions.length === 0) {
        alert("Добавьте хотя бы одно упражнение или вопрос в домашнее задание.");
        return;
    }

    try {
        await apiRequest('/api/homeworks', 'POST', {
            title,
            lesson_id: lessonId ? parseInt(lessonId) : null,
            description,
            deadline,
            questions
        });
        closeModal('modal-create-hw');
        loadHomeworks();
    } catch (e) {
        alert(e.message);
    }
}

// --- 3. REVIEWS LOGIC (TEACHER ONLY) ---
async function loadSubmissions() {
    try {
        const res = await apiRequest('/api/submissions');
        const container = document.getElementById('submissions-list');
        container.innerHTML = '';

        if (!res.submissions || res.submissions.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align: center; color: var(--text-secondary); padding: 30px;">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">📋</div>
                    <div>Пока нет сданных работ от учеников.</div>
                </div>
            `;
            return;
        }

        res.submissions.forEach(sub => {
            const card = document.createElement('div');
            card.className = 'card';
            
            const isPending = sub.status === 'submitted';
            const statusTag = isPending
                ? `<span class="status-badge submitted">⏳ Требует проверки</span>`
                : `<span class="status-badge reviewed">✅ Проверено (Оценка: ${sub.score || '5'})</span>`;

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    ${statusTag}
                    <span style="font-size: 0.78rem; color: var(--text-muted);">${new Date(sub.submitted_at).toLocaleDateString('ru-RU')}</span>
                </div>
                <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 4px;">👤 Ученик: ${sub.student_name}</h3>
                <div style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 12px;">Задание: <strong>${sub.homework_title}</strong></div>
                <button class="btn-primary btn-sm" onclick="openReviewSubmissionModal(${sub.id})">
                    ${isPending ? 'Проверить и оценить ✍️' : 'Изменить оценку / отзыв'}
                </button>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        alert(e.message);
    }
}

async function openReviewSubmissionModal(subId) {
    triggerHaptic();
    try {
        const subsRes = await apiRequest('/api/submissions');
        const sub = subsRes.submissions.find(s => s.id === subId);
        if (!sub) return;
        currentActiveSubmission = sub;

        // Fetch original questions
        const hwRes = await apiRequest(`/api/homeworks/${sub.homework_id}`);
        const hw = hwRes.homework;

        document.getElementById('review-sub-title').innerText = `Проверка: ${sub.student_name}`;
        document.getElementById('review-sub-info').innerHTML = `Задание: <strong>${sub.homework_title}</strong>`;
        document.getElementById('review-score-input').value = sub.score || '5/5';
        document.getElementById('review-feedback-input').value = sub.feedback || '';

        const container = document.getElementById('review-answers-container');
        container.innerHTML = '';

        let currentReviewSectionKey = null;
        let currentReviewItemsContainer = null;

        hw.questions.forEach((q, idx) => {
            const secTitle = q.section_title || 'Упражнение';
            const secDesc = q.section_desc || '';

            if (secTitle !== currentReviewSectionKey) {
                currentReviewSectionKey = secTitle;
                const sectionBlock = document.createElement('div');
                sectionBlock.className = 'exercise-section-block';
                sectionBlock.style.marginBottom = '16px';

                const numMatch = secTitle.match(/^(Упражнение\s*\d+|Exercise\s*\d+|Задание\s*\d+)/i);
                const badgeText = numMatch ? numMatch[1] : 'Раздел';
                let cleanTitle = secTitle.replace(/^(Упражнение\s*\d+[\.\:]?\s*|Exercise\s*\d+[\.\:]?\s*|Задание\s*\d+[\.\:]?\s*)/i, '');
                if (!cleanTitle) cleanTitle = secTitle;

                sectionBlock.innerHTML = `
                    <div class="exercise-section-header" style="margin-bottom: 10px; padding-bottom: 8px;">
                        <div class="exercise-section-badge">📌 ${escapeHtml(badgeText)}</div>
                        <h4 class="exercise-section-title" style="font-size: 1rem;">${escapeHtml(cleanTitle)}</h4>
                        ${secDesc ? `<div class="exercise-section-desc" style="font-size: 0.82rem; padding: 6px 10px;">💬 ${escapeHtml(secDesc)}</div>` : ''}
                    </div>
                    <div class="review-items-list"></div>
                `;
                container.appendChild(sectionBlock);
                currentReviewItemsContainer = sectionBlock.querySelector('.review-items-list');
            }

            const studentAns = sub.answers[idx] ? sub.answers[idx].answer : '(Ответ не предоставлен)';
            const targetContainer = currentReviewItemsContainer || container;

            const qDiv = document.createElement('div');
            qDiv.className = 'card';
            qDiv.style.backgroundColor = 'var(--bg-input)';
            qDiv.style.padding = '10px 12px';
            qDiv.style.marginBottom = '8px';

            let checkBadge = '';
            if (q.correct && studentAns && studentAns !== '(Ответ не предоставлен)') {
                const isCorrect = studentAns.toLowerCase().trim() === q.correct.toLowerCase().trim();
                if (isCorrect) {
                    checkBadge = '<span class="cloze-badge-correct">✓ Совпало с эталоном</span>';
                } else {
                    checkBadge = `<span class="cloze-badge-wrong">✕ Отличие</span> <span style="font-size:0.8rem; color:var(--text-muted);">(Эталон: <strong>${escapeHtml(q.correct)}</strong>)</span>`;
                }
            }

            qDiv.innerHTML = `
                <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 6px;">Вопрос ${idx + 1}: ${escapeHtml(q.text)}</div>
                <div style="font-size: 0.88rem; background: var(--bg-card); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong>Ответ ученика:</strong>
                        ${checkBadge}
                    </div>
                    <span style="color: var(--primary); font-weight: 600; font-size: 0.95rem;">${escapeHtml(studentAns).replace(/\n/g, '<br>') || '<em>(Пустой ответ)</em>'}</span>
                </div>
            `;
            targetContainer.appendChild(qDiv);
        });

        document.getElementById('modal-review-sub').classList.remove('hidden');
    } catch (e) {
        alert(e.message);
    }
}

async function submitReviewGrade() {
    triggerHaptic();
    if (!currentActiveSubmission) return;

    const score = document.getElementById('review-score-input').value.trim();
    const feedback = document.getElementById('review-feedback-input').value.trim();

    try {
        await apiRequest(`/api/submissions/${currentActiveSubmission.id}/review`, 'POST', {
            score,
            feedback
        });
        alert("Оценка и комментарий успешно сохранены!");
        closeModal('modal-review-sub');
        loadSubmissions();
    } catch (e) {
        alert(e.message);
    }
}

// --- 4. INVITES & STUDENTS LOGIC (TEACHER ONLY) ---
async function loadStudentsAndInvites() {
    try {
        // Load Invites
        const invRes = await apiRequest('/api/invites');
        const invContainer = document.getElementById('invites-list');
        invContainer.innerHTML = '';

        if (!invRes.invites || invRes.invites.length === 0) {
            invContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">Нет созданных приглашений.</div>';
        } else {
            invRes.invites.forEach(inv => {
                const fullOfferUrl = `${window.location.origin}${window.location.pathname}?invite=${inv.code}`;
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span class="invite-code-pill">${inv.code}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">Использовано: ${inv.used_count}/${inv.max_uses}</span>
                    </div>
                    <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 6px;">${inv.student_name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); word-break: break-all; margin-bottom: 10px;">${fullOfferUrl}</div>
                    <button class="btn-secondary btn-sm" onclick="copyTextToClipboard('${fullOfferUrl}')">
                        Скопировать ссылку-оффер 📋
                    </button>
                `;
                invContainer.appendChild(card);
            });
        }

        // Load Registered Students
        const stdRes = await apiRequest('/api/students');
        const stdContainer = document.getElementById('students-list');
        stdContainer.innerHTML = '';

        if (!stdRes.students || stdRes.students.length === 0) {
            stdContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">Пока ни один ученик не зарегистрировался.</div>';
        } else {
            stdRes.students.forEach(st => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 700; font-size: 1rem;">🎓 ${st.full_name}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
                                Сдано ДЗ: <strong>${st.total_submitted}</strong> | Проверено: <strong>${st.total_graded}</strong>
                            </div>
                        </div>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(st.created_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                `;
                stdContainer.appendChild(card);
            });
        }
    } catch (e) {
        alert(e.message);
    }
}

async function generateNewInvite() {
    triggerHaptic();
    const name = document.getElementById('new-invite-name').value.trim() || 'Новый ученик';
    try {
        const res = await apiRequest('/api/invites', 'POST', {
            student_name: name,
            max_uses: 10
        });
        document.getElementById('new-invite-name').value = '';
        const link = `${window.location.origin}${window.location.pathname}?invite=${res.code}`;
        prompt("Персональная ссылка-оффер успешно создана! Скопируйте её для отправки ученику:", link);
        loadStudentsAndInvites();
    } catch (e) {
        alert(e.message);
    }
}

function copyTextToClipboard(text) {
    triggerHaptic();
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert("Ссылка скопирована в буфер обмена!");
        }).catch(() => {
            prompt("Скопируйте ссылку вручную:", text);
        });
    } else {
        prompt("Скопируйте ссылку вручную:", text);
    }
}

async function changeTeacherPassword() {
    triggerHaptic();
    const input = document.getElementById('new-teacher-password');
    const newPass = input.value.trim();

    if (!newPass || newPass.length < 4) {
        alert("Пожалуйста, введите пароль длиной не менее 4 символов.");
        return;
    }

    try {
        const res = await apiRequest('/api/auth/change-password', 'POST', { new_password: newPass });
        alert(res.message || "Пароль успешно обновлен!");
        input.value = '';
    } catch (e) {
        alert(e.message);
    }
}
