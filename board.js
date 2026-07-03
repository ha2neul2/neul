// 건의게시판 (제품 추가 요청) 기능
// script.js에서 정의한 API_URL, apiGet, apiPost, currentUser, showToast를 그대로 사용합니다.

let boardPosts = [];
let boardComments = [];
let boardSearchQuery = '';
let boardReturnScreen = 'shop'; // 게시판에서 뒤로가기 시 돌아갈 화면 ('shop' | 'admin')

function formatDateTime(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openBoard(fromScreen) {
    boardReturnScreen = fromScreen || 'shop';
    boardSearchQuery = '';
    document.getElementById('app').innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-sub);">불러오는 중...</div>`;
    try {
        boardPosts = await apiGet('getPosts');
        boardPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (err) {
        boardPosts = [];
        showToast("게시글을 불러오지 못했습니다.");
    }
    renderBoardList();
}

function backFromBoard() {
    if (boardReturnScreen === 'admin') renderAdmin();
    else renderShop();
}

function renderBoardList() {
    const app = document.getElementById('app');

    const lowerQuery = boardSearchQuery.trim().toLowerCase();
    const filtered = boardPosts.filter(p => {
        if (!lowerQuery) return true;
        const plainBody = String(p.body || '').replace(/<[^>]*>/g, '');
        return p.title.toLowerCase().includes(lowerQuery) ||
               plainBody.toLowerCase().includes(lowerQuery) ||
               String(p.author).toLowerCase().includes(lowerQuery);
    });

    let html = `
        <div class="header">
            <h2>💡 제품 추가 요청 게시판</h2>
            <button onclick="backFromBoard()" style="padding: 6px 12px; font-size: 0.85rem; background:transparent; color:var(--text-sub); border: 1px solid var(--border-color);">← 뒤로</button>
        </div>
        <div class="search-container" style="display:flex; gap:8px;">
            <input type="text" id="boardSearchInput" class="search-input" placeholder="🔍 제목, 내용, 작성자 검색..." value="${boardSearchQuery}" oninput="handleBoardSearch(this.value)">
            <button onclick="renderPostEditor()" style="white-space:nowrap;">✏️ 글쓰기</button>
        </div>
        <div class="admin-content" style="padding-top:10px;">
    `;

    if (filtered.length === 0) {
        html += `<p style="text-align:center; color:var(--text-sub); margin-top:40px;">${lowerQuery ? '검색 결과가 없습니다.' : '아직 등록된 글이 없습니다. 첫 글을 남겨보세요!'}</p>`;
    } else {
        html += `<ul class="admin-list">`;
        filtered.forEach(p => {
            html += `
                <li onclick="openPostDetail(${p.id})" style="cursor:pointer;">
                    <div>
                        <strong style="display:block; margin-bottom:5px;">${escapeHtml(p.title)} ${p.edited ? '<span style="color:var(--text-sub); font-size:0.8rem; font-weight:400;">(수정됨)</span>' : ''}</strong>
                        <span style="font-size:0.85rem; color:var(--text-sub);">${escapeHtml(p.author)} · ${formatDateTime(p.created_at)}</span>
                    </div>
                </li>`;
        });
        html += `</ul>`;
    }

    html += `</div>`;
    app.innerHTML = html;
}

function handleBoardSearch(val) {
    boardSearchQuery = val;
    renderBoardList();
}

// ---------- 글쓰기 / 수정 ----------

function renderPostEditor(existingPost) {
    const app = document.getElementById('app');
    const isEdit = !!existingPost;

    app.innerHTML = `
        <div class="header">
            <h2>${isEdit ? '✏️ 글 수정' : '✏️ 새 글 작성'}</h2>
            <button onclick="${isEdit ? `openPostDetail(${existingPost.id})` : `renderBoardList()`}" style="padding: 6px 12px; font-size: 0.85rem; background:transparent; color:var(--text-sub); border: 1px solid var(--border-color);">취소</button>
        </div>
        <div class="admin-content">
            <div class="add-form">
                <input type="text" id="post-title-input" placeholder="제목을 입력하세요" value="${isEdit ? escapeHtml(existingPost.title) : ''}">

                <div class="rte-toolbar">
                    <button type="button" onclick="rteCmd('bold')" title="굵게"><b>B</b></button>
                    <button type="button" onclick="rteCmd('underline')" title="밑줄"><u>U</u></button>
                    <label class="rte-color-label" title="글씨 색상">A
                        <input type="color" onchange="rteCmd('foreColor', this.value)">
                    </label>
                    <label class="rte-color-label" title="배경(하이라이트) 색상">🖌
                        <input type="color" onchange="rteCmd('hiliteColor', this.value)">
                    </label>
                    <label class="rte-image-label" title="사진 첨부">🖼️ 사진
                        <input type="file" accept="image/*" onchange="handleBoardImageUpload(event)">
                    </label>
                </div>
                <div id="rte-body" class="rte-body" contenteditable="true">${isEdit ? existingPost.body : ''}</div>

                <button onclick="saveBoardPost(${isEdit ? existingPost.id : 'null'})">${isEdit ? '수정 완료' : '등록하기'}</button>
            </div>
        </div>
    `;
}

function rteCmd(cmd, val) {
    document.getElementById('rte-body').focus();
    document.execCommand(cmd, false, val || null);
}

async function handleBoardImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
        showToast("이미지 용량은 4MB 이하로 첨부해주세요.");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        const base64 = e.target.result.split(',')[1];
        showToast("이미지 업로드 중...");
        try {
            const res = await apiPost('uploadImage', { base64, mimeType: file.type, filename: file.name });
            document.getElementById('rte-body').focus();
            document.execCommand('insertImage', false, res.url);
        } catch (err) {
            showToast("이미지 업로드에 실패했습니다.");
        }
        event.target.value = '';
    };
    reader.readAsDataURL(file);
}

async function saveBoardPost(existingId) {
    const title = document.getElementById('post-title-input').value.trim();
    const body = document.getElementById('rte-body').innerHTML.trim();

    if (!title) return showToast("제목을 입력해주세요.");
    if (!body) return showToast("내용을 입력해주세요.");

    showToast("저장 중...");
    try {
        if (existingId) {
            const res = await apiPost('updatePost', { id: existingId, title, body, author: currentUser });
            if (!res.success) { showToast(res.error || "수정에 실패했습니다."); return; }
        } else {
            await apiPost('addPost', { title, body, author: currentUser });
        }
        boardPosts = await apiGet('getPosts');
        boardPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        showToast(existingId ? "수정이 완료되었습니다." : "글이 등록되었습니다.");
        renderBoardList();
    } catch (err) {
        showToast("저장에 실패했습니다. 네트워크를 확인해주세요.");
    }
}

// ---------- 상세보기 / 댓글 ----------

async function openPostDetail(postId) {
    document.getElementById('app').innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-sub);">불러오는 중...</div>`;
    try {
        boardComments = await apiGet(`getComments&postId=${postId}`);
    } catch (err) {
        boardComments = [];
    }
    renderPostDetail(postId);
}

function renderPostDetail(postId) {
    const post = boardPosts.find(p => p.id === postId);
    if (!post) { renderBoardList(); return; }

    const app = document.getElementById('app');
    const isAuthor = post.author === currentUser;

    const topComments = boardComments.filter(c => !c.parent_id);
    const repliesOf = pid => boardComments.filter(c => String(c.parent_id) === String(pid));

    let commentsHtml = '';
    if (topComments.length === 0) {
        commentsHtml = `<p style="color:var(--text-sub); text-align:center; padding:20px 0;">첫 댓글을 남겨보세요!</p>`;
    } else {
        topComments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(c => {
            commentsHtml += renderCommentBlock(c, postId, false);
            repliesOf(c.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(r => {
                commentsHtml += renderCommentBlock(r, postId, true);
            });
        });
    }

    app.innerHTML = `
        <div class="header">
            <h2>게시글</h2>
            <button onclick="renderBoardList()" style="padding: 6px 12px; font-size: 0.85rem; background:transparent; color:var(--text-sub); border: 1px solid var(--border-color);">← 목록으로</button>
        </div>
        <div class="admin-content">
            <div class="order-card">
                <div class="order-card-header" style="align-items:flex-start;">
                    <div>
                        <h4 style="margin-bottom:6px;">${escapeHtml(post.title)} ${post.edited ? '<span style="color:var(--text-sub); font-size:0.8rem; font-weight:400;">(수정됨)</span>' : ''}</h4>
                        <span style="font-size:0.85rem; color:var(--text-sub);">${escapeHtml(post.author)} · ${formatDateTime(post.created_at)}</span>
                    </div>
                    ${isAuthor ? `<button class="btn-outline" onclick="renderPostEditor(${JSON.stringify(post).replace(/"/g, '&quot;')})">수정</button>` : ''}
                </div>
                <div class="rte-view">${post.body}</div>
            </div>

            <div class="section-header" style="margin-top:30px;">
                <h3>댓글 ${boardComments.length}개</h3>
            </div>

            <div class="comment-form">
                <textarea id="comment-input-root" placeholder="댓글을 입력하세요" rows="2"></textarea>
                <button onclick="submitComment(${postId}, null, 'comment-input-root')">댓글 등록</button>
            </div>

            <div id="comment-list">${commentsHtml}</div>
        </div>
    `;
}

function renderCommentBlock(c, postId, isReply) {
    const inputId = `reply-input-${c.id}`;
    return `
        <div class="comment-block ${isReply ? 'is-reply' : ''}">
            <div class="comment-meta">
                <strong>${escapeHtml(c.author)}</strong>
                <span class="p-meta">${formatDateTime(c.created_at)}</span>
            </div>
            <div class="comment-body">${escapeHtml(c.body)}</div>
            ${!isReply ? `<button class="btn-reply" onclick="toggleReplyForm(${c.id})">답글</button>` : ''}
            <div id="reply-form-${c.id}" class="comment-form" style="display:none; margin-top:8px;">
                <textarea id="${inputId}" placeholder="답글을 입력하세요" rows="2"></textarea>
                <button onclick="submitComment(${postId}, ${c.id}, '${inputId}')">답글 등록</button>
            </div>
        </div>
    `;
}

function toggleReplyForm(commentId) {
    const el = document.getElementById(`reply-form-${commentId}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function submitComment(postId, parentId, textareaId) {
    const textarea = document.getElementById(textareaId);
    const body = textarea.value.trim();
    if (!body) return showToast("댓글 내용을 입력해주세요.");

    try {
        await apiPost('addComment', { postId, parentId: parentId || '', author: currentUser, body });
        boardComments = await apiGet(`getComments&postId=${postId}`);
        renderPostDetail(postId);
    } catch (err) {
        showToast("댓글 등록에 실패했습니다.");
    }
}

// ---------- 유틸 ----------

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = String(str == null ? '' : str);
    return div.innerHTML;
}
