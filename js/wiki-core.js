// Wiki核心引擎 - 支持基于完整路径的路由 (#/parent/child)，面包屑自动跳过首页节点
let wikiData = null;



function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
}



// 为每个节点添加 pathKey 属性（完整路径字符串）
function addPathKeys(nodes, parentPath = '') {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
        const currentPath = parentPath ? `${parentPath}/${node.id}` : node.id;
        node.pathKey = currentPath;
        if (node.children && node.children.length) {
            addPathKeys(node.children, currentPath);
        }
    }
}

async function loadWikiData() {
    try {
        const response = await fetch('data/wiki-data.json');
        if (!response.ok) throw new Error('数据加载失败');
        wikiData = await response.json();
        addPathKeys(wikiData.sidebar);
        document.title = wikiData.siteTitle;
        generateSidebarTree();
        return true;
    } catch (error) {
        console.error('加载失败:', error);
        document.querySelector('.wiki-content').innerHTML = '<div class="not-found">数据加载失败</div>';
        return false;
    }
}

function generateSidebarTree() {
    const container = document.querySelector('.sidebar-tree');
    if (!container) return;
    container.innerHTML = '';
    wikiData.sidebar.forEach(item => {
        container.appendChild(createTreeNode(item, 0));
    });
}

function createTreeNode(item, level) {
    const li = document.createElement('li');
    li.className = 'tree-node';
    li.dataset.id = item.id;
    li.dataset.path = item.pathKey;
    li.dataset.type = item.type;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'tree-node-content';
    contentDiv.style.paddingLeft = (8 + level * 12) + 'px';
    
    const savedStates = JSON.parse(localStorage.getItem('folderStates') || '{}');
    const isExpanded = savedStates[item.id] !== undefined ? savedStates[item.id] : (item.expanded === true);
    
    if (item.type === 'folder' && item.children && item.children.length > 0) {
        const expandIcon = document.createElement('span');
        expandIcon.className = 'tree-expand-icon';
        const arrowIcon = document.createElement('i');
        arrowIcon.className = 'fas fa-chevron-right';
        if (isExpanded) arrowIcon.classList.add('rotated');
        expandIcon.appendChild(arrowIcon);
        expandIcon.onclick = (e) => {
            e.stopPropagation();
            window.toggleFolder(item.id);
        };
        contentDiv.appendChild(expandIcon);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'spacer';
        contentDiv.appendChild(spacer);
    }
    
    let iconClass = item.icon || (item.type === 'folder' ? 'fas fa-folder' : 'fas fa-file-alt');
    const icon = document.createElement('i');
    icon.className = `tree-icon ${iconClass}`;
    contentDiv.appendChild(icon);
    
    const title = document.createElement('span');
    title.className = 'tree-title';
    title.textContent = item.title;
    contentDiv.appendChild(title);
    
    contentDiv.onclick = (e) => {
        if (e.target.closest('.tree-expand-icon')) return;
        if (item.type === 'folder') {
            if (item.path) {
                loadPageContent(item);
                highlightActiveNode(item.pathKey);
            } else {
                window.toggleFolder(item.id);
            }
        } else if (item.type === 'page') {
            loadPageContent(item);
            highlightActiveNode(item.pathKey);
        }
    };
    li.appendChild(contentDiv);
    
    if (item.type === 'folder' && item.children && item.children.length > 0) {
        const childrenUl = document.createElement('ul');
        childrenUl.className = `tree-children ${isExpanded ? 'expanded' : ''}`;
        childrenUl.id = `children-${item.id}`;
        item.children.forEach(child => {
            childrenUl.appendChild(createTreeNode(child, level + 1));
        });
        li.appendChild(childrenUl);
    }
    return li;
}

async function loadPageContent(item) {
    if (!item.path) {
        renderContent(item.title, '<p>该页面没有内容</p>', {}, item.pathKey);
        return;
    }
    const isMarkdown = item.path.endsWith('.md') || item.path.endsWith('.markdown');
    try {
        const response = await fetch('data/' + item.path);
        if (!response.ok) throw new Error('文件不存在');
        let raw = await response.text();
        let html = raw;
        if (isMarkdown) {
            html = marked.parse(raw);
            html = fixImagePaths(html, item.path);
            html = addImageCaptions(html);
            html = await renderMathInHtml(html);
        }
        
        let attributes = {};
        const pathParts = item.path.split('/');
        const dirPath = pathParts.slice(0, -1).join('/');
        const metaUrl = `data/${dirPath}/_meta.json`;
        try {
            const metaResp = await fetch(metaUrl);
            if (metaResp.ok) attributes = await metaResp.json();
        } catch (e) {}
        
        renderContent(item.title, html, attributes, item.pathKey);
    } catch (error) {
        console.error('加载失败:', error);
        renderContent(item.title, '<p>内容加载失败</p>', {}, item.pathKey);
    }
    history.replaceState(null, '', '#' + item.pathKey);
}

function fixImagePaths(html, mdFilePath) {
    const dirPath = mdFilePath.substring(0, mdFilePath.lastIndexOf('/') + 1);
    const baseUrl = '/shsg8c1wiki/data/';
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('img').forEach(img => {
        let src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('/')) {
            img.setAttribute('src', baseUrl + dirPath + src);
        }
    });
    return div.innerHTML;
}

async function renderMathInHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(div, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    }
    return div.innerHTML;
}

// 根据完整路径查找节点
function findNodeByPathKey(pathKey) {
    if (!wikiData || !wikiData.sidebar) return null;
    const segments = pathKey.split('/');
    let currentLevel = wikiData.sidebar;
    let target = null;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const found = currentLevel.find(node => node.id === seg);
        if (!found) return null;
        target = found;
        if (found.children && i < segments.length - 1) {
            currentLevel = found.children;
        }
    }
    return target;
}

// 生成面包屑：基于真实树路径，但跳过根节点中的 'home'（不显示）
function renderBreadcrumbByPath(pathKey) {
    if (!pathKey) return '';
    let segments = pathKey.split('/');
    // 如果第一个段是 'home'，则去掉它（不显示）
    if (segments[0] === 'home') {
        segments = segments.slice(1);
    }
    if (segments.length === 0) return '';
    
    let html = '<div class="breadcrumb">';
    let currentPath = '';
    let currentNodes = wikiData.sidebar;
    
    // 如果原始路径以 home/ 开头，需要从 home 的 children 开始定位
    if (pathKey.startsWith('home/')) {
        const homeNode = wikiData.sidebar.find(n => n.id === 'home');
        if (homeNode && homeNode.children) {
            currentNodes = homeNode.children;
        }
    }
    
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const node = currentNodes.find(n => n.id === seg);
        if (!node) break;
        currentPath = currentPath ? `${currentPath}/${seg}` : seg;
        if (i === segments.length - 1) {
            html += `<span class="breadcrumb-current">${escapeHtml(node.title)}</span>`;
        } else {
            html += `<a href="#/${currentPath}" class="breadcrumb-link">${escapeHtml(node.title)}</a>`;
            html += '<span class="breadcrumb-sep"> / </span>';
        }
        if (node.children) currentNodes = node.children;
    }
    html += '</div>';
    return html;
}

// 将字符串中的 Markdown 链接 [text](url) 转换为 HTML <a> 标签
function convertMarkdownLinks(str) {
    if (typeof str !== 'string') return str;
    // 匹配 [text](url) 格式，url 不能包含 )
    return str.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}


function renderContent(title, htmlContent, attributes = {}, currentPathKey = '') {
    const header = document.querySelector('.content-header h2');
    const contentDiv = document.querySelector('.wiki-content');
    const tocContainer = document.getElementById('tocList');
    
    if (header) header.textContent = title;
    
    const breadcrumbHtml = currentPathKey ? renderBreadcrumbByPath(currentPathKey) : '';
    
    // 生成属性框 HTML
    let attrHtml = '';
    if (Object.keys(attributes).length > 0) {
        attrHtml = '<div class="attribute-box"><table>';
        for (const [key, value] of Object.entries(attributes)) {
            let displayValue;
            if (Array.isArray(value)) {
                displayValue = value.map(v => convertMarkdownLinks(v)).join('、');
            } else if (typeof value === 'string') {
                displayValue = convertMarkdownLinks(value);
            } else {
                displayValue = String(value);
            }
            attrHtml += `<tr><th>${escapeHtml(key)}</th><td>${displayValue}</td></tr>`;
        }
        attrHtml += '</table></div>';
    }
    
    const fullHtml = (breadcrumbHtml ? breadcrumbHtml + '\n' : '') + attrHtml + htmlContent;
    
    if (contentDiv) {
        // 插入新内容，但不带动画类
        contentDiv.innerHTML = `<div class="wiki-body">${fullHtml}</div>`;
        
        // 渲染 LaTeX
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(contentDiv, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        }
        // 处理代码块：添加标题栏、复制按钮，并调整样式
        if (typeof hljs !== 'undefined') {
            contentDiv.querySelectorAll('.wiki-body pre').forEach((pre) => {
                const code = pre.querySelector('code');
                if (!code) return;
                
                // 高亮代码
                hljs.highlightElement(code);
                
                // 提取语言
                let lang = '';
                const langClass = Array.from(code.classList).find(c => c.startsWith('language-'));
                if (langClass) {
                    lang = langClass.replace('language-', '');
                } else {
                    lang = 'text';
                }
                
                // 避免重复包装（如果已经处理过）
                if (pre.parentNode.classList && pre.parentNode.classList.contains('code-block-wrapper')) return;
                
                // 创建包装器
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                
                // 创建标题栏
                const header = document.createElement('div');
                header.className = 'code-block-header';
                header.innerHTML = `
                    <span class="code-lang">${lang}</span>
                    <button class="code-copy-btn" title="复制代码">
                        <i class="fas fa-copy"></i> <span class="copy-label">复制</span>
                    </button>
                `;
                
                // 复制功能
                const copyBtn = header.querySelector('.code-copy-btn');
                copyBtn.addEventListener('click', async () => {
                    const text = code.textContent;
                    try {
                        await navigator.clipboard.writeText(text);
                        // 切换为成功图标
                        copyBtn.innerHTML = `<i class="fas fa-check" style="color: #28a745;"></i> <span class="copy-label">已复制</span>`;
                        setTimeout(() => {
                            copyBtn.innerHTML = `<i class="fas fa-copy"></i> <span class="copy-label">复制</span>`;
                        }, 2000);
                    } catch (err) {
                        console.error('复制失败:', err);
                        copyBtn.innerHTML = `<i class="fas fa-times" style="color: #dc3545;"></i> <span class="copy-label">失败</span>`;
                        setTimeout(() => {
                            copyBtn.innerHTML = `<i class="fas fa-copy"></i> <span class="copy-label">复制</span>`;
                        }, 2000);
                    }
                });
                
                // 将原 pre 包装进 wrapper，并插入标题栏
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(header);
                wrapper.appendChild(pre);
                
                // 调整 pre 的内边距（收紧下半部分）
                //pre.style.padding = '1em';   // 可根据喜好调整，比如 0.8em 1.2em
                pre.style.margin = '0';
                pre.style.background = 'transparent';
                pre.style.border = 'none';
            });
        }
        // 获取刚刚创建的 wiki-body 元素
        const wikiBody = contentDiv.querySelector('.wiki-body');
        
        // 等待下一帧，确保 DOM 完全更新后再添加动画类
        if (wikiBody) {
            // 先移除可能残留的动画类
            wikiBody.classList.remove('animate-in');
            // 强制重绘（可选，确保动画重新触发）
            void wikiBody.offsetHeight;
            // 添加动画类，触发 CSS 动画
            wikiBody.classList.add('animate-in');
        }
        
        // 生成目录
        generateTOC(wikiBody, tocContainer);
    }
    
    window.scrollTo(0, 0);
}

function highlightActiveNode(pathKey) {
    document.querySelectorAll('.tree-node-content').forEach(el => {
        const nodeLi = el.closest('.tree-node');
        if (nodeLi && nodeLi.dataset.path === pathKey) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

function generateTOC(container, tocContainer) {
    if (!container || !tocContainer) return;
    const headings = container.querySelectorAll('h2, h3');
    if (headings.length === 0) {
        tocContainer.innerHTML = '<li style="color:#8a8f99;">无标题</li>';
        return;
    }
    headings.forEach((heading, idx) => {
        if (!heading.id) heading.id = `heading-${idx}`;
    });
    const tocList = document.createElement('ul');
    tocList.className = 'toc-list';
    let currentH2 = null;
    headings.forEach(heading => {
        const tag = heading.tagName.toLowerCase();
        const link = document.createElement('a');
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            heading.scrollIntoView({ behavior: 'smooth' });
            history.pushState(null, '', `#${heading.id}`);
            setActiveTocLink(link);
        });
        const li = document.createElement('li');
        li.appendChild(link);
        if (tag === 'h2') {
            li.classList.add('toc-h2');
            tocList.appendChild(li);
            currentH2 = li;
        } else if (tag === 'h3') {
            li.classList.add('toc-h3');
            if (currentH2) {
                let subUl = currentH2.querySelector('ul');
                if (!subUl) {
                    subUl = document.createElement('ul');
                    subUl.style.listStyle = 'none';
                    subUl.style.paddingLeft = '16px';
                    currentH2.appendChild(subUl);
                }
                subUl.appendChild(li);
            } else {
                tocList.appendChild(li);
            }
        }
    });
    tocContainer.innerHTML = '';
    tocContainer.appendChild(tocList);
    setupScrollSpy(headings);
}

function setupScrollSpy(headings) {
    const observer = new IntersectionObserver((entries) => {
        let visibleHeading = null;
        for (const entry of entries) {
            if (entry.isIntersecting) {
                visibleHeading = entry.target;
                break;
            }
        }
        if (visibleHeading) {
            const id = visibleHeading.id;
            const tocLink = document.querySelector(`.toc-list a[href="#${id}"]`);
            if (tocLink) setActiveTocLink(tocLink);
        }
    }, { rootMargin: '-80px 0px -60% 0px', threshold: 0.6 });
    headings.forEach(h => observer.observe(h));
}

function setActiveTocLink(activeLink) {
    document.querySelectorAll('.toc-list a').forEach(a => a.classList.remove('active'));
    activeLink.classList.add('active');
}

async function loadFromHash() {
    let hash = window.location.hash.substring(1);
    if (!hash || hash === '/') {
        // 默认加载 home（如果存在）
        const homeNode = findNodeByPathKey('home');
        if (homeNode) loadPageContent(homeNode);
        return;
    }
    if (hash.startsWith('/')) hash = hash.slice(1);
    const node = findNodeByPathKey(hash);
    if (node && (node.path || node.type === 'folder')) {
        await loadPageContent(node);
        highlightActiveNode(node.pathKey);
    } else {
        renderNotFound();
    }
}

function renderNotFound() {
    const header = document.querySelector('.content-header h2');
    const contentDiv = document.querySelector('.wiki-content');
    if (header) header.textContent = '404';
    if (contentDiv) {
        contentDiv.innerHTML = `<div class="not-found"><h3>页面不存在</h3><a href="#">返回首页</a></div>`;
    }
}


function addImageCaptions(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const images = div.querySelectorAll('img');
    images.forEach(img => {
        // 获取图片本身的 src
        const imgSrc = img.getAttribute('src');
        
        // 方式1：直接设置 onclick 属性
        img.setAttribute('onclick', `window.open('${imgSrc}', '_blank')`);
        
        // 方式2：同时添加 CSS 类用于悬浮效果
        img.style.cursor = 'pointer';
        img.classList.add('clickable-image');
        
        // 添加图注
        let caption = img.getAttribute('alt');
        if (caption && caption.trim() !== '') {
            const figure = document.createElement('figure');
            figure.className = 'image-figure';
            img.parentNode.insertBefore(figure, img);
            figure.appendChild(img);
            const figcaption = document.createElement('figcaption');
            figcaption.textContent = caption;
            figure.appendChild(figcaption);
        }
    });
    return div.innerHTML;
}

window.addEventListener('hashchange', () => loadFromHash());
document.addEventListener('DOMContentLoaded', async () => {
    await loadWikiData();
    const states = JSON.parse(localStorage.getItem('folderStates') || '{}');
    for (const [id, expanded] of Object.entries(states)) {
        const ul = document.getElementById(`children-${id}`);
        if (ul && expanded) {
            ul.classList.add('expanded');
            const icon = document.querySelector(`.tree-node[data-id="${id}"] .tree-expand-icon i`);
            if (icon) icon.classList.add('rotated');
        }
    }
    await loadFromHash();
});