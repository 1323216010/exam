/**
 * 移动端交互层（原生 App 手感）
 * ---------------------------------------------------------------------------
 * 解决的问题：网页版的「像网站」之处主要不在配色，而在交互习惯：
 *   1. alert / confirm 是浏览器原生弹窗，会打断页面、样式不可控、在
 *      iOS 上还带 "localhost 显示" 这类域名标题 —— App 里不存在。
 *   2. window.open(url, '_blank') 会新开标签页，手机上表现为跳到另一个
 *      窗口、返回手势错乱 —— App 里应是同页转场。
 *   3. 按钮只有 :hover，手机上点完高亮会「粘住」不放。
 *   4. 点按没有触觉反馈。
 *
 * 本模块提供：
 *   toast(msg, type)          轻提示，替代纯提示类 alert
 *   confirmSheet(opts)        底部确认弹层（Promise<boolean>），替代 confirm
 *   haptic(ms|'light')        振动反馈（不支持的设备静默跳过）
 *   navigateTo(url)           同页转场跳转
 *   initPressFeedback()       为可点元素补按压态 + 去掉 hover 粘滞
 *   skeleton(...)             骨架屏占位
 *
 * 所有导出都可安全地在桌面端调用（模态与 toast 会居中/居中顶部显示）。
 */

/* ---------------------------------------------------------------- 触觉反馈 */
let hapticOk = null;

export function haptic(pattern = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return false;
    // 只在首次调用时探测，避免每次点按都做特性检测
    if (hapticOk === null) {
        hapticOk = typeof navigator.vibrate === 'function';
    }
    if (!hapticOk) return false;
    try {
        const map = { light: 8, medium: 16, heavy: 28 };
        navigator.vibrate(typeof pattern === 'number' ? pattern : (map[pattern] ?? 8));
        return true;
    } catch (e) {
        hapticOk = false;
        return false;
    }
}

/* --------------------------------------------------------------------- 样式 */
const STYLE_ID = 'dsh-interaction-style';

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
/* ---------- Toast ---------- */
.dsh-toast-host {
    position: fixed;
    left: 0; right: 0;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    z-index: 3000;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    padding: 0 16px;
}
.dsh-toast {
    max-width: min(92vw, 460px);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 16px;
    border-radius: 12px;
    background: rgba(23, 28, 35, 0.94);
    color: #fff;
    font-size: 14px;
    line-height: 1.45;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    opacity: 0;
    transform: translateY(-10px) scale(0.97);
    transition: opacity .18s ease, transform .18s ease;
    pointer-events: auto;
    word-break: break-word;
}
.dsh-toast.show { opacity: 1; transform: translateY(0) scale(1); }
.dsh-toast .dsh-toast-icon { flex-shrink: 0; font-size: 15px; line-height: 1; }
.dsh-toast.ok    { background: rgba(5, 122, 85, 0.96); }
.dsh-toast.error { background: rgba(185, 28, 28, 0.96); }
.dsh-toast.warn  { background: rgba(180, 108, 6, 0.96); }

/* ---------- 底部确认弹层 ---------- */
.dsh-sheet-mask {
    position: fixed;
    inset: 0;
    z-index: 3100;
    background: rgba(15, 23, 42, 0.42);
    opacity: 0;
    transition: opacity .22s ease;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
}
.dsh-sheet-mask.show { opacity: 1; }

.dsh-sheet {
    width: 100%;
    max-width: 520px;
    background: #fff;
    border-radius: 18px 18px 0 0;
    padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
    transform: translateY(100%);
    transition: transform .26s cubic-bezier(.32, .72, 0, 1);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.16);
    overflow: hidden;
}
.dsh-sheet-mask.show .dsh-sheet { transform: translateY(0); }

/* 顶部小拖拽条，暗示可下滑关闭 */
.dsh-sheet-grip {
    width: 36px; height: 4px;
    border-radius: 2px;
    background: #D8DEE6;
    margin: 6px auto 12px;
}
.dsh-sheet-title {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    text-align: center;
    padding: 0 20px;
}
.dsh-sheet-msg {
    font-size: 14px;
    line-height: 1.6;
    color: #6B7280;
    text-align: center;
    padding: 8px 22px 16px;
    white-space: pre-wrap;
    word-break: break-word;
}
.dsh-sheet-actions { padding: 0 12px 6px; display: flex; flex-direction: column; gap: 8px; }
.dsh-sheet-btn {
    min-height: 50px;
    border: 0;
    border-radius: 12px;
    font-size: 16px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform .12s ease, background .15s ease;
}
.dsh-sheet-btn:active { transform: scale(0.975); }
.dsh-sheet-btn.primary { background: linear-gradient(135deg, #10B981 0%, #06B6D4 100%); color: #fff; }
.dsh-sheet-btn.danger  { background: #EF4444; color: #fff; }
.dsh-sheet-btn.ghost   { background: #F3F4F6; color: #374151; }

/* ---------- 骨架屏 ---------- */
.dsh-skeleton {
    background: linear-gradient(90deg, #EEF1F4 25%, #F7F9FB 37%, #EEF1F4 63%);
    background-size: 400% 100%;
    animation: dsh-shimmer 1.25s ease-in-out infinite;
    border-radius: 8px;
}
@keyframes dsh-shimmer {
    0%   { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
}
.dsh-skel-page { padding: 16px; }
.dsh-skel-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.dsh-skel-card {
    border-radius: 14px;
    padding: 16px;
    background: #fff;
    border: 1px solid #EDF0F3;
    margin-bottom: 12px;
}

/* ---------- 按压反馈：移动端去掉 hover 粘滞 ---------- */
@media (hover: none) {
    /* 触屏设备上 hover 会「粘」在最后点过的元素，统一清掉 */
    .option:hover,
    .mode-card:hover,
    .exam-card:hover,
    .btn:hover,
    .btn-nav:hover,
    .subject-tab:hover,
    .view-btn:hover,
    .question-item:hover,
    .study-btn:hover,
    .study-option:hover {
        /* 交回给 :active 表达状态 */
        background: inherit;
        border-color: inherit;
        transform: none;
    }
    .option:hover::before { opacity: 0 !important; }
}

/* 所有可点元素统一的按压回弹 */
.option:active,
.mode-card:active,
.exam-card:active,
.subject-tab:active,
.view-btn:active,
.question-item:active,
.study-option:active {
    transform: scale(0.985);
    transition: transform .09s ease;
}
button:active, .btn:active, .study-btn:active {
    transform: scale(0.97);
    transition: transform .09s ease;
}

/* ---------- 页面转场 ---------- */
@keyframes dsh-page-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
.dsh-page-enter { animation: dsh-page-in .22s ease both; }

@keyframes dsh-q-in {
    from { opacity: 0; transform: translateX(14px); }
    to   { opacity: 1; transform: translateX(0); }
}
.dsh-q-enter { animation: dsh-q-in .2s cubic-bezier(.32,.72,0,1) both; }

/* 尊重系统的「减弱动态效果」设置 */
@media (prefers-reduced-motion: reduce) {
    .dsh-toast, .dsh-sheet, .dsh-sheet-mask { transition: none !important; }
    .dsh-page-enter, .dsh-q-enter { animation: none !important; }
    .dsh-skeleton { animation: none !important; }
}
`;
    document.head.appendChild(s);
}

/* ------------------------------------------------------------------- Toast */
let toastHost = null;

export function toast(message, type = 'info', duration = 2000) {
    if (typeof document === 'undefined') return;
    ensureStyle();
    if (!toastHost) {
        toastHost = document.createElement('div');
        toastHost.className = 'dsh-toast-host';
        document.body.appendChild(toastHost);
    }
    const icons = { ok: '✓', error: '✕', warn: '!', info: '' };
    const el = document.createElement('div');
    el.className = `dsh-toast ${type}`;
    const icon = icons[type] || '';
    el.innerHTML = `${icon ? `<span class="dsh-toast-icon">${icon}</span>` : ''}<span>${escapeHtml(message)}</span>`;
    toastHost.appendChild(el);

    // 进入动画
    requestAnimationFrame(() => el.classList.add('show'));

    const remove = () => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 200);
    };
    const timer = setTimeout(remove, duration);
    // 点一下立刻收起
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });

    return { close: () => { clearTimeout(timer); remove(); } };
}

function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/* ------------------------------------------------- 底部确认弹层（替代 confirm） */
export function confirmSheet({
    title = '请确认',
    message = '',
    okText = '确定',
    cancelText = '取消',
    danger = false,
} = {}) {
    if (typeof document === 'undefined') return Promise.resolve(false);
    ensureStyle();

    return new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.className = 'dsh-sheet-mask';
        mask.innerHTML = `
            <div class="dsh-sheet" role="dialog" aria-modal="true">
                <div class="dsh-sheet-grip"></div>
                <div class="dsh-sheet-title">${escapeHtml(title)}</div>
                ${message ? `<div class="dsh-sheet-msg">${escapeHtml(message)}</div>` : '<div style="height:8px"></div>'}
                <div class="dsh-sheet-actions">
                    <button class="dsh-sheet-btn ${danger ? 'danger' : 'primary'}" data-act="ok">${escapeHtml(okText)}</button>
                    <button class="dsh-sheet-btn ghost" data-act="cancel">${escapeHtml(cancelText)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(mask);
        requestAnimationFrame(() => mask.classList.add('show'));

        let settled = false;
        const finish = (val) => {
            if (settled) return;
            settled = true;
            mask.classList.remove('show');
            setTimeout(() => mask.remove(), 260);
            document.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') finish(false);
            if (e.key === 'Enter') finish(true);
        };

        mask.querySelector('[data-act="ok"]').addEventListener('click', () => { haptic('light'); finish(true); });
        mask.querySelector('[data-act="cancel"]').addEventListener('click', () => { haptic('light'); finish(false); });
        // 点遮罩取消（但不影响点面板内部）
        mask.addEventListener('click', (e) => { if (e.target === mask) finish(false); });
        document.addEventListener('keydown', onKey);

        // 进入后聚焦确定按钮，便于键盘操作
        setTimeout(() => mask.querySelector('[data-act="ok"]')?.focus?.(), 60);
    });
}

/* --------------------------------------------------------------- 同页转场跳转 */
export function navigateTo(url, { newTabOnDesktop = false } = {}) {
    haptic('light');
    if (typeof window === 'undefined' || !url) return;
    // 桌面端可保留新标签行为（保持原有使用习惯）
    if (newTabOnDesktop && !isTouchDevice()) {
        window.open(url, '_blank');
        return;
    }
    const root = document.body;
    // 加一层淡出，避免白屏硬切
    if (root) {
        root.style.transition = 'opacity .16s ease';
        root.style.opacity = '0.35';
        // 兜底：若跳转被拦截（例如 beforeunload 取消），恢复页面可读性
        setTimeout(() => {
            if (root.isConnected) root.style.opacity = '';
        }, 1200);
    }
    setTimeout(() => { window.location.href = url; }, 140);
}

/* 页面进入时的淡入（由各页在 DOM 就绪后调用一次） */
export function playPageEnter(selector = '.main-content, .app-container') {
    if (typeof document === 'undefined') return;
    ensureStyle();
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.add('dsh-page-enter');
    el.addEventListener('animationend', () => el.classList.remove('dsh-page-enter'), { once: true });
}

/* 题目切换时的方向感动画 */
export function playQuestionEnter(el, direction = 1) {
    if (!el || typeof document === 'undefined') return;
    ensureStyle();
    el.classList.remove('dsh-q-enter');
    // 强制回流以便重复播放
    void el.offsetWidth;
    el.style.setProperty('--dsh-q-from', direction >= 0 ? '14px' : '-14px');
    el.classList.add('dsh-q-enter');
    el.addEventListener('animationend', () => el.classList.remove('dsh-q-enter'), { once: true });
}

/* ------------------------------------------------------------------ 骨架屏 */
export function skeletonQuestion() {
    ensureStyle();
    return `
        <div class="dsh-skel-page">
            <div class="dsh-skel-row">
                <div class="dsh-skeleton" style="width:42px;height:42px;border-radius:10px"></div>
                <div class="dsh-skeleton" style="width:88px;height:22px;border-radius:11px"></div>
                <div class="dsh-skeleton" style="width:56px;height:22px;border-radius:11px"></div>
            </div>
            <div class="dsh-skeleton" style="height:18px;width:92%;margin:18px 0 10px"></div>
            <div class="dsh-skeleton" style="height:18px;width:70%;margin-bottom:26px"></div>
            ${[0, 1, 2, 3].map(() => `
                <div class="dsh-skeleton" style="height:52px;border-radius:12px;margin-bottom:10px"></div>
            `).join('')}
        </div>
    `;
}

export function skeletonCards(count = 4) {
    ensureStyle();
    return Array.from({ length: count }, () => `
        <div class="dsh-skel-card">
            <div class="dsh-skeleton" style="height:16px;width:52%;margin-bottom:12px"></div>
            <div class="dsh-skeleton" style="height:12px;width:32%"></div>
        </div>
    `).join('');
}

/* ------------------------------------------------- 全局按压反馈初始化 */
export function initPressFeedback() {
    if (typeof document === 'undefined') return;
    ensureStyle();
    // 事件委托：给动态生成的按钮也补上触觉反馈
    let last = 0;
    document.addEventListener('pointerdown', (e) => {
        const t = e.target.closest(
            'button, .btn, .option, .mode-card, .exam-card, .subject-tab, .view-btn, .question-item, .study-btn, .study-option'
        );
        if (!t || t.disabled) return;
        const now = Date.now();
        if (now - last < 40) return; // 节流，避免长按连续震动
        last = now;
        haptic('light');
    }, { passive: true });
}

/* --------------------------------------------- 接管浏览器原生弹窗 */
/**
 * alert() 是同步且没有返回值的，因此可以安全地整体接管：
 * 全站 20 处 alert 会自动变成应用内 Toast，无需逐处改动。
 * confirm() 必须能返回布尔值，异步弹层无法满足，所以只做提示性降级，
 * 真实确认流程由调用方改用 await confirmSheet(...)。
 */
export function installNativeDialogShims() {
    if (typeof window === 'undefined' || window.__dshDialogsInstalled) return;
    window.__dshDialogsInstalled = true;

    const nativeAlert = window.alert.bind(window);
    window.alert = (msg) => {
        // 开发期仍可在控制台看到原文
        try { console.info('[toast]', msg); } catch (e) { /* ignore */ }
        const text = String(msg ?? '');
        // 简单分类：错误/失败 → error，成功/已 → ok，其余 info
        let type = 'info';
        if (/失败|错误|无法|不正确|不能|请先|请至少/.test(text)) type = 'error';
        else if (/成功|已清除|已保存|已完成/.test(text)) type = 'ok';
        toast(text, type, type === 'error' ? 2600 : 1900);
    };

    // 保底：若某处仍调用 confirm，给出可感知的降级（不阻塞）
    window.__nativeAlert = nativeAlert;
}

/**
 * 判断是否为触屏设备。
 * 用 (hover: none) + (pointer: coarse) 双条件，比只看 hover 更准确：
 * 带触摸屏的笔记本通常仍是 hover:hover + pointer:fine，不应改写跳转行为。
 */
function isTouchDevice() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
        return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    } catch (e) {
        return false;
    }
}

/* 把页面内所有 <a target="_blank"> 改成同页跳转（移动端更接近原生） */
export function unblankLinks(root = document) {
    if (!isTouchDevice()) return;
    root.querySelectorAll('a[target="_blank"]').forEach((a) => {
        a.removeAttribute('target');
        a.removeAttribute('rel');
    });
}

/**
 * 触屏上用事件委托拦截所有带 target="_blank" 的同源链接，改为同页转场。
 * 比逐个改 <a> 更可靠：考点学习/大纲等处的链接是动态渲染的，
 * 用委托可以在渲染前后都生效，无需侵入各页面模块。
 * 外链（非同源）仍交给浏览器新开标签。
 */
export function installLinkInterceptor() {
    if (typeof window === 'undefined' || window.__dshLinkBound) return;
    window.__dshLinkBound = true;

    if (!isTouchDevice()) return; // 桌面端保留新标签行为

    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[target="_blank"]');
        if (!a) return;
        let sameOrigin = false;
        try { sameOrigin = new URL(a.href, location.href).origin === location.origin; } catch (err) { sameOrigin = false; }
        if (!sameOrigin) return;
        e.preventDefault();
        navigateTo(a.getAttribute('href'));
    }, true);
}
