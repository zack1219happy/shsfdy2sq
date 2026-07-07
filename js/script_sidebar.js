// 侧边栏折叠功能
document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleBtn');
    const mainContent = document.querySelector('.main-content');
    if (!sidebar || !toggleBtn) return;
    
    // 浮动打开按钮
    const floatBtn = document.createElement('button');
    floatBtn.className = 'sidebar-toggle-float';
    floatBtn.innerHTML = '<i class="fas fa-bars"></i>';
    // 浮动打开按钮的点击事件
    floatBtn.onclick = function() {
        sidebar.classList.remove('collapsed');
        if (mainContent) mainContent.style.marginLeft = '280px';
        const icon = toggleBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-left');
        }
        localStorage.setItem('sidebarCollapsed', 'false');
    };
    document.body.appendChild(floatBtn);
    
    function toggleSidebar() {
        sidebar.classList.toggle('collapsed');
        const icon = toggleBtn.querySelector('i');
        if (sidebar.classList.contains('collapsed')) {
            icon.classList.remove('fa-chevron-left');
            icon.classList.add('fa-chevron-right');
            if (mainContent) mainContent.style.marginLeft = '0';
        } else {
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-left');
            if (mainContent) mainContent.style.marginLeft = '280px';
        }
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
    toggleBtn.addEventListener('click', toggleSidebar);
    
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
        sidebar.classList.add('collapsed');
        const icon = toggleBtn.querySelector('i');
        icon.classList.remove('fa-chevron-left');
        icon.classList.add('fa-chevron-right');
        if (mainContent) mainContent.style.marginLeft = '0';
    } else {
        if (mainContent) mainContent.style.marginLeft = '280px';
    }
    // 恢复保存的侧边栏宽度
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (!isNaN(width) && width >= 180 && width <= 400) {
            sidebar.style.width = width + 'px';
            // 同步更新拖拽手柄位置
            const handle = document.getElementById('sidebarResizeHandle');
            if (handle) handle.style.left = width + 'px';
            // 同步更新主内容左边距（如果不是收起状态）
            if (!sidebar.classList.contains('collapsed')) {
                if (mainContent) mainContent.style.marginLeft = width + 'px';
            }
        }
    }
});

// 切换文件夹（用于树形菜单）
function toggleFolder(folderId) {
    const childrenUl = document.getElementById(`children-${folderId}`);
    if (!childrenUl) return;
    childrenUl.classList.toggle('expanded');
    const isExpanded = childrenUl.classList.contains('expanded');
    
    const expandIcon = document.querySelector(`.tree-node[data-id="${folderId}"] .tree-expand-icon`);
    const arrowIcon = expandIcon ? expandIcon.querySelector('i') : null;
    if (arrowIcon) {
        if (isExpanded) arrowIcon.classList.add('rotated');
        else arrowIcon.classList.remove('rotated');
    }
    let states = JSON.parse(localStorage.getItem('folderStates') || '{}');
    states[folderId] = isExpanded;
    localStorage.setItem('folderStates', JSON.stringify(states));
}


// ========== 侧边栏拖拽拉伸功能 ==========
(function initResizableSidebar() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sidebarResizeHandle');
    const mainContent = document.querySelector('.main-content');
    
    // 如果手柄不存在，创建它
    let resizeHandle = handle;
    if (!resizeHandle) {
        resizeHandle = document.createElement('div');
        resizeHandle.id = 'sidebarResizeHandle';
        resizeHandle.className = 'sidebar-resize-handle';
        document.body.appendChild(resizeHandle);
    }
    
    if (!sidebar) return;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    function startResize(e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        document.body.classList.add('resizing');
        e.preventDefault();
    }
    
    function doResize(e) {
        if (!isResizing) return;
        
        // 如果侧边栏是收起状态，先展开
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            const toggleBtn = document.getElementById('toggleBtn');
            const icon = toggleBtn?.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-left');
            }
            localStorage.setItem('sidebarCollapsed', 'false');
        }
        
        const delta = e.clientX - startX;
        let newWidth = startWidth + delta;
        
        // 限制侧边栏宽度范围：最小 180px，最大 400px
        newWidth = Math.min(400, Math.max(180, newWidth));
        
        sidebar.style.width = newWidth + 'px';
        resizeHandle.style.left = newWidth + 'px';
        if (mainContent) mainContent.style.marginLeft = newWidth + 'px';
        
        // 保存宽度到 localStorage
        localStorage.setItem('sidebarWidth', newWidth);
    }
    
    function stopResize() {
        isResizing = false;
        document.body.classList.remove('resizing');
    }
    
    resizeHandle.addEventListener('mousedown', startResize);
    window.addEventListener('mousemove', doResize);
    window.addEventListener('mouseup', stopResize);
    
    // 恢复保存的宽度
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (!isNaN(width) && width >= 180 && width <= 400) {
            sidebar.style.width = width + 'px';
            resizeHandle.style.left = width + 'px';
            if (mainContent) mainContent.style.marginLeft = width + 'px';
        }
    }
})();

// ========== 公告栏功能（支持一级标题和 LaTeX） ==========
(function initAnnouncement() {
    const announcementContent = document.getElementById('announcementContent');
    const refreshBtn = document.getElementById('refreshAnnouncement');
    
    if (!announcementContent) return;
    
    const ANNOUNCEMENT_URL = '/shsg8c1wiki/data/announcement.md';
    
    // 公告栏 Markdown 解析器（支持斜体、加粗、删除线、链接、标题、列表）
    function parseMarkdown(text) {
        if (!text) return '';
        
        // 1. 转义 HTML 特殊字符
        let html = text.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
        
        // 2. 处理链接 [text](url)（优先，避免内部强调被误转）
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // 3. 处理加粗（双星号、双下划线）
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // 4. 处理斜体（单星号、单下划线）——注意不要匹配到加粗残留
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');
        
        // 5. 处理删除线
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
        
        // 6. 处理标题（一级、二级、三级）
        html = html.replace(/^# (.*$)/gm, '<h1 style="font-size:1.2rem; margin:8px 0 4px 0;">$1</h1>');
        html = html.replace(/^## (.*$)/gm, '<strong style="font-size:1rem;">$1</strong>');
        html = html.replace(/^### (.*$)/gm, '<em>$1</em>');
        
        // 7. 处理无序列表（使用 - 或 *，注意行首）
        html = html.replace(/^- (.*$)/gm, '• $1');
        html = html.replace(/^\* (.*$)/gm, '• $1');  // 注意：行首的 "* " 作为列表，不解析为斜体
        
        // 8. 处理换行和段落
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        if (!html.startsWith('<p>')) {
            html = '<p>' + html + '</p>';
        }
        
        // 9. 处理分割线
        html = html.replace(/---/g, '<hr style="margin: 8px 0;">');
        
        return html;
    }
    
    async function loadAnnouncement() {
        announcementContent.innerHTML = '<p style="color:#8a8f99;"><i class="fas fa-spinner fa-pulse"></i> 加载中...</p>';
        
        try {
            const response = await fetch(ANNOUNCEMENT_URL + '?t=' + Date.now(), {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            
            const text = await response.text();
            let parsedHtml = parseMarkdown(text);
            
            // 设置内容
            announcementContent.innerHTML = parsedHtml;
            
            // 渲染 LaTeX 公式（如果存在）
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(announcementContent, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError: false
                });
            }
        } catch (error) {
            console.error('公告加载失败:', error);
            announcementContent.innerHTML = '<p style="color:#e74c3c;">⚠️ 公告加载失败</p>';
        }
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function(e) {
            e.preventDefault();
            loadAnnouncement();
        });
    }
    
    loadAnnouncement();
})();


// ========== 底部栏弹窗代码 - 放在这里 ==========
(function initBottomBar() {
    // 创建弹窗（如果还没创建）
    let modal = document.getElementById('legalModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'legalModal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close">&times;</span>
                <div id="modalBody"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.onclick = () => modal.style.display = 'none';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    const modalBody = document.getElementById('modalBody');
    
    // 条例内容
    const disclaimerText = `
        <h3>📜 使用条例</h3>
        <p>欢迎使用上中初二 Wiki！</p>
        <ul>
            <li>本Wiki为班级内部交流平台，内容由同学们共同维护</li>
            <li>请勿恶意传播、篡改或复制本Wiki内容</li>
            <li>请尊重每位同学的隐私和个人信息</li>
            <li>禁止发布攻击性、歧视性或不适当的内容</li>
            <li>如发现不当内容，请联系管理员处理</li>
        </ul>
        <p><strong>本Wiki保留最终解释权。</strong></p>
    `;
    
    const privacyText = `
        <h3>🔒 隐私说明</h3>
        <p>本Wiki重视每一位同学的隐私保护。</p>
        <ul>
            <li>Wiki中收录的外号、梗等均为班级内部文化，不构成恶意</li>
            <li>如您认为某个词条侵犯了您的权益，请联系管理员删除</li>
            <li>本Wiki不收集任何用户的个人信息</li>
            <li>所有内容均存储在GitHub Pages上，遵守GitHub服务条款</li>
        </ul>
        <p>联系邮箱：class8wiki@example.com</p>
    `;
    
    const contactText = `
        <h3>📧 联系我们</h3>
        <p>如有问题、建议或投诉，请通过以下方式联系：</p>
        <ul>
            <li>邮箱：class8wiki@example.com</li>
            <li>可联系班级管理员（张同学/李同学）</li>
        </ul>
        <p>我们会在24小时内回复您。</p>
    `;
    
    // 绑定底部栏的链接
    document.getElementById('showDisclaimerBottom')?.addEventListener('click', (e) => {
        e.preventDefault();
        modalBody.innerHTML = disclaimerText;
        modal.style.display = 'flex';
    });
    
    document.getElementById('showPrivacyBottom')?.addEventListener('click', (e) => {
        e.preventDefault();
        modalBody.innerHTML = privacyText;
        modal.style.display = 'flex';
    });
    
    document.getElementById('showContactBottom')?.addEventListener('click', (e) => {
        e.preventDefault();
        modalBody.innerHTML = contactText;
        modal.style.display = 'flex';
    });
})();