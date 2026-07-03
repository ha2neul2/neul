// 건의게시판 (제품 추가 요청) 기능
// script.js에서 정의한 API_URL, apiGet, apiPost, currentUser, showToast를 그대로 사용합니다.
//
// [속도 개선 버전]
// - 글/댓글 작성 시 서버 응답을 기다리며 전체 목록을 재조회하지 않고,
//   화면에 먼저 반영(낙관적 업데이트)한 뒤 서버가 돌려준 id/시간으로 조용히 교체합니다.
// - 이미지 첨부 시 업로드 전에 리사이즈/압축해서 전송량을 줄입니다.

let boardPosts = [];
let boardComments = [];
let boardSearchQuery = '';
let boardReturnScreen = 'shop'; // 게시판에서 뒤로가기 시 돌아갈 화면 ('shop' | 'admin')
let openReplyForms = new Set(); // 다시 그려도 열려있는 상태를 유지하기 위한 답글 입력창 id 목록

function renderAuthorName(author) {
    if (author === 'admin') return `<span class="admin-badge">👑 관리자</span>`;
    return escapeHtml(author);
}

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
                <li onclick="openPostDetail(${JSON.stringify(p.id)})" style="cursor:pointer;">
                    <div>
                        <strong style="display:block; margin-bottom:5px;">${escapeHtml(p.title)} ${p.edited ? '<span style="color:var(--text-sub); font-size:0.8rem; font-weight:400;">(수정됨)</span>' : ''}</strong>
                        <span style="font-size:0.85rem; color:var(--text-sub);">${renderAuthorName(p.author)} · ${formatDateTime(p.created_at)}</span>
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
            <button onclick="${isEdit ? `openPostDetail(${JSON.stringify(existingPost.id)})` : `renderBoardList()`}" style="padding: 6px 12px; font-size: 0.85rem; background:transparent; color:var(--text-sub); border: 1px solid var(--border-color);">취소</button>
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

                <button id="post-save-btn" onclick="saveBoardPost(${isEdit ? JSON.stringify(existingPost.id) : 'null'})">${isEdit ? '수정 완료' : '등록하기'}</button>
            </div>
        </div>
    `;
}

function rteCmd(cmd, val) {
    document.getElementById('rte-body').focus();
    document.execCommand(cmd, false, val || null);
}

// 이미지를 최대 가로 1280px, JPEG 품질 0.82로 리사이즈/압축해서 base64로 반환
// (휴대폰 원본 사진 3~5MB → 보통 수백 KB로 줄어들어 업로드 속도가 크게 개선됩니다)
function resizeImageToBase64(file, maxWidth = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
            };
            img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
        reader.readAsDataURL(file);
    });
}

async function handleBoardImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 12 * 1024 * 1024) {
        showToast("이미지 용량은 12MB 이하로 첨부해주세요.");
        event.target.value = '';
        return;
    }

    showToast("이미지 처리 중...");
    try {
        const { base64, mimeType } = await resizeImageToBase64(file);
        showToast("이미지 업로드 중...");
        const res = await apiPost('uploadImage', { base64, mimeType, filename: file.name });
        document.getElementById('rte-body').focus();
        document.execCommand('insertImage', false, res.url);
    } catch (err) {
        showToast("이미지 업로드에 실패했습니다.");
    }
    event.target.value = '';
}

async function saveBoardPost(existingId) {
    const title = document.getElementById('post-title-input').value.trim();
    const body = document.getElementById('rte-body').innerHTML.trim();

    if (!title) return showToast("제목을 입력해주세요.");
    if (!body) return showToast("내용을 입력해주세요.");

    const btn = document.getElementById('post-save-btn');
    if (btn) btn.disabled = true;

    if (existingId) {
        // ---- 수정: 낙관적 업데이트 ----
        const idx = boardPosts.findIndex(p => String(p.id) === String(existingId));
        const prevPost = idx !== -1 ? { ...boardPosts[idx] } : null;
        if (idx !== -1) {
            boardPosts[idx] = { ...boardPosts[idx], title, body, edited: true };
        }
        renderPostDetail(existingId);
        showToast("저장 중...");
        try {
            const res = await apiPost('updatePost', { id: existingId, title, body, author: currentUser });
            if (!res.success) {
                if (prevPost && idx !== -1) boardPosts[idx] = prevPost;
                showToast(res.error || "수정에 실패했습니다.");
                renderPostDetail(existingId);
                return;
            }
            showToast("수정이 완료되었습니다.");
        } catch (err) {
            if (prevPost && idx !== -1) boardPosts[idx] = prevPost;
            showToast("저장에 실패했습니다. 네트워크를 확인해주세요.");
            renderPostDetail(existingId);
        }
    } else {
        // ---- 새 글: 임시 id로 즉시 화면에 반영 ----
        const tempId = 'temp-' + Date.now();
        const newPost = { id: tempId, title, body, author: currentUser, created_at: new Date().toISOString(), edited: false };
        boardPosts.unshift(newPost);
        renderBoardList();
        showToast("등록 중...");
        try {
            const res = await apiPost('addPost', { title, body, author: currentUser });
            const i = boardPosts.findIndex(p => p.id === tempId);
            if (i !== -1) {
                boardPosts[i] = {
                    id: res.id,
                    title, body, author: currentUser,
                    created_at: res.created_at || newPost.created_at,
                    edited: false
                };
            }
            showToast("글이 등록되었습니다.");
            renderBoardList();
        } catch (err) {
            boardPosts = boardPosts.filter(p => p.id !== tempId);
            showToast("등록에 실패했습니다. 네트워크를 확인해주세요.");
            renderBoardList();
        }
    }
}

// ---------- 상세보기 / 댓글 ----------

async function openPostDetail(postId) {
    document.getElementById('app').innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-sub);">불러오는 중...</div>`;
    openReplyForms = new Set();
    try {
        boardComments = await apiGet(`getComments&postId=${postId}`);
    } catch (err) {
        boardComments = [];
    }
    renderPostDetail(postId);
}

function renderPostDetail(postId) {
    const post = boardPosts.find(p => String(p.id) === String(postId));
    if (!post) { renderBoardList(); return; }

    const app = document.getElementById('app');
    const isAuthor = post.author === currentUser;
    const isAdmin = currentUser === 'admin';
    const canManagePost = isAuthor || isAdmin;

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
                        <span style="font-size:0.85rem; color:var(--text-sub);">${renderAuthorName(post.author)} · ${formatDateTime(post.created_at)}</span>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        ${isAuthor ? `<button class="btn-outline" onclick="renderPostEditor(${JSON.stringify(post).replace(/"/g, '&quot;')})">수정</button>` : ''}
                        ${canManagePost ? `<button class="btn-danger" onclick="deletePostConfirm(${JSON.stringify(post.id)})">삭제</button>` : ''}
                    </div>
                </div>
                <div class="rte-view">${post.body}</div>
            </div>

            <div class="section-header" style="margin-top:30px;">
                <h3>댓글 ${boardComments.length}개</h3>
            </div>

            <div class="comment-form">
                <textarea id="comment-input-root" placeholder="댓글을 입력하세요" rows="2"></textarea>
                <button onclick="submitComment(${JSON.stringify(postId)}, null, 'comment-input-root')">댓글 등록</button>
            </div>

            <div id="comment-list">${commentsHtml}</div>
        </div>
    `;
}

function renderCommentBlock(c, postId, isReply) {
    const inputId = `reply-input-${c.id}`;
    const canManageComment = c.author === currentUser || currentUser === 'admin';
    const isOpen = openReplyForms.has(c.id);
    return `
        <div class="comment-block ${isReply ? 'is-reply' : ''}">
            <div class="comment-meta">
                <strong>${renderAuthorName(c.author)}</strong>
                <span class="p-meta">${formatDateTime(c.created_at)}</span>
            </div>
            <div class="comment-body">${escapeHtml(c.body)}</div>
            <div style="display:flex; gap:12px; margin-top:4px;">
                ${!isReply ? `<button class="btn-reply" onclick="toggleReplyForm(${JSON.stringify(c.id)})">답글</button>` : ''}
                ${canManageComment ? `<button class="btn-reply" style="color:var(--danger);" onclick="deleteCommentConfirm(${JSON.stringify(postId)}, ${JSON.stringify(c.id)})">삭제</button>` : ''}
            </div>
            <div id="reply-form-${c.id}" class="comment-form" style="${isOpen ? '' : 'display:none;'} margin-top:8px;">
                <textarea id="${inputId}" placeholder="답글을 입력하세요" rows="2"></textarea>
                <button onclick="submitComment(${JSON.stringify(postId)}, ${JSON.stringify(c.id)}, '${inputId}')">답글 등록</button>
            </div>
        </div>
    `;
}

function toggleReplyForm(commentId) {
    if (openReplyForms.has(commentId)) openReplyForms.delete(commentId);
    else openReplyForms.add(commentId);
    const el = document.getElementById(`reply-form-${commentId}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function submitComment(postId, parentId, textareaId) {
    const textarea = document.getElementById(textareaId);
    const body = textarea.value.trim();
    if (!body) return showToast("댓글 내용을 입력해주세요.");

    // ---- 낙관적 업데이트: 임시 id로 즉시 화면에 반영 ----
    const tempId = 'temp-' + Date.now();
    const newComment = {
        id: tempId, post_id: postId, parent_id: parentId || '',
        author: currentUser, body, created_at: new Date().toISOString()
    };
    boardComments.push(newComment);
    if (parentId) openReplyForms.add(parentId);
    renderPostDetail(postId);

    try {
        const res = await apiPost('addComment', { postId, parentId: parentId || '', author: currentUser, body });
        const i = boardComments.findIndex(c => c.id === tempId);
        if (i !== -1) {
            boardComments[i] = {
                id: res.id, post_id: postId, parent_id: parentId || '',
                author: currentUser, body,
                created_at: res.created_at || newComment.created_at
            };
        }
        renderPostDetail(postId);
    } catch (err) {
        boardComments = boardComments.filter(c => c.id !== tempId);
        showToast("댓글 등록에 실패했습니다.");
        renderPostDetail(postId);
    }
}

async function deletePostConfirm(postId) {
    if (!confirm("이 글을 삭제하시겠습니까? 딸린 댓글도 함께 삭제됩니다.")) return;
    try {
        const res = await apiPost('deletePost', { id: postId, requester: currentUser });
        if (!res.success) return showToast(res.error || "삭제에 실패했습니다.");
        boardPosts = boardPosts.filter(p => String(p.id) !== String(postId));
        showToast("삭제되었습니다.");
        renderBoardList();
    } catch (err) {
        showToast("삭제에 실패했습니다. 네트워크를 확인해주세요.");
    }
}

async function deleteCommentConfirm(postId, commentId) {
    if (!confirm("이 댓글을 삭제하시겠습니까? 달린 답글도 함께 삭제됩니다.")) return;
    try {
        const res = await apiPost('deleteComment', { id: commentId, requester: currentUser });
        if (!res.success) return showToast(res.error || "삭제에 실패했습니다.");
        boardComments = boardComments.filter(c =>
            String(c.id) !== String(commentId) && String(c.parent_id) !== String(commentId)
        );
        showToast("삭제되었습니다.");
        renderPostDetail(postId);
    } catch (err) {
        showToast("삭제에 실패했습니다. 네트워크를 확인해주세요.");
    }
}

// ---------- 유틸 ----------

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = String(str == null ? '' : str);
    return div.innerHTML;
}
