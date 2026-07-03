// ⚠️ 아래 URL을 본인이 배포한 Apps Script 웹앱 URL로 바꿔주세요.
const API_URL = "https://script.google.com/macros/s/AKfycbwx85nG9guPvcQzKPyxAaIgOf3IxJHGeaxU3b8m4nARtrZyD7miRECJb9Rl-08yaLt-/exec";

let users = [];
let products = [];
let currentUser = null; // 새로고침 시 항상 초기화 (자동 로그인 없음)

let adminTab = 'products';
let openCategories = null;
let searchQuery = '';
let saveTimeout = null;

// ---------- API 헬퍼 ----------

async function apiGet(action) {
    const res = await fetch(`${API_URL}?action=${action}`);
    if (!res.ok) throw new Error('GET 실패: ' + action);
    return res.json();
}

async function apiPost(action, payload = {}) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // CORS preflight 회피용
        body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) throw new Error('POST 실패: ' + action);
    return res.json();
}

// ---------- 초기화 ----------

async function init() {
    document.getElementById('app').innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-sub);">불러오는 중...</div>`;
    try {
        [users, products] = await Promise.all([
            apiGet('getUsers'),
            apiGet('getProducts')
        ]);
    } catch (err) {
        document.getElementById('app').innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--danger);">데이터를 불러오지 못했습니다.<br>네트워크 상태를 확인하고 새로고침 해주세요.</div>`;
        return;
    }
    renderLogin();
}

function renderLogin() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="login-box">
            <h1>💊</h1>
            <p>신규 정보 기입시 신규 생성됩니다.</p>
            <input type="text" id="nickInput" placeholder="닉네임 입력" autocomplete="off">
            <div id="nick-msg" class="error-text"></div>
            <input type="password" id="passInput" placeholder="비밀번호 입력" autocomplete="off" onkeypress="handleEnter(event)">
            <P></P><button onclick="handleLogin()">시작하기</button>
        </div>
    `;

    const nickInput = document.getElementById('nickInput');
    nickInput.addEventListener('blur', function() {
        const nick = this.value.trim();
        const msg = document.getElementById('nick-msg');
        const exists = users.find(u => u.nickname === nick);

        if (exists) {
            this.classList.add('shake');
            this.classList.add('error-border');
            msg.innerText = '이미 생성된 닉네임 입니다.';
            setTimeout(() => this.classList.remove('shake'), 400);
        } else {
            this.classList.remove('error-border');
            msg.innerText = '';
        }
    });
}

function handleEnter(e) { if(e.key === 'Enter') handleLogin(); }

async function handleLogin() {
    const nick = document.getElementById('nickInput').value.trim();
    const pass = document.getElementById('passInput').value.trim();

    if (!nick || !pass) return showToast("닉네임과 비밀번호를 모두 입력해주세요.");

    if (nick === 'admin') {
        if (pass === 'haneul715') {
            currentUser = 'admin'; renderAdmin(); return;
        } else {
            return showToast("관리자 비밀번호가 일치하지 않습니다.");
        }
    }

    let user = users.find(u => u.nickname === nick);
    if (user) {
        if (user.password === pass) {
            currentUser = nick; renderShop();
        } else { showToast("비밀번호를 재확인해 주세요."); }
    } else {
        const newUser = { nickname: nick, password: pass, cart: {}, confirmed: false };
        users.push(newUser); // 화면에는 바로 반영 (낙관적 업데이트)
        currentUser = nick;
        showToast(`환영합니다, ${nick}님! 계정이 생성되었습니다.`);
        renderShop();

        try {
            await apiPost('saveUser', newUser);
        } catch (err) {
            showToast("서버 저장에 실패했습니다. 네트워크를 확인하세요.");
        }
    }
}

// 상품 한 줄을 그려주는 헬퍼 함수
function generateProductRow(p, qty) {
    return `
        <div class="product-row">
            <div>
                <div class="p-name">${p.name}</div>
                <div class="p-meta">${p.brand} | ${p.price.toLocaleString()}원</div>
            </div>
            <div class="qty-control">
                <button onclick="updateQty(${p.id}, -1)">-</button>
                <input type="number" min="0" value="${qty}" onchange="setQty(${p.id}, this.value)">
                <button onclick="updateQty(${p.id}, 1)">+</button>
            </div>
        </div>
    `;
}

function renderShop() {
    const user = users.find(u => u.nickname === currentUser);
    if(!user) { logout(); return; }

    const app = document.getElementById('app');

    if (!document.getElementById('shop-shell')) {
        app.innerHTML = `
            <div id="shop-shell" style="display:flex; flex-direction:column; height:100vh;">
                <div class="header">
                    <h2>안녕하세요, <strong>${currentUser}</strong>님</h2>
                    <div style="display:flex; gap:8px;">
                        <button onclick="openBoard('shop')" style="padding: 6px 12px; font-size: 0.85rem; background:transparent; color:var(--text-sub); border: 1px solid var(--border-color);">💡 건의게시판</button>
                        <button onclick="openCart()" style="padding: 6px 12px; font-size: 0.85rem; background:var(--accent-color); color:#fff; border: none; font-weight:700;">🛒 장바구니 <span id="cart-count">0</span></button>
                        <button onclick="logout()" style="padding: 6px 12px; font-size: 0.85rem; background:transparent; color:var(--text-sub); border: 1px solid var(--border-color);">로그아웃</button>
                    </div>
                </div>

                <div class="search-container">
                    <input type="text" id="searchInput" class="search-input" placeholder="🔍 상품명 또는 제조사 검색..." oninput="handleSearch(this.value)">
                </div>

                <div id="product-list-container" style="flex-grow:1; overflow-y:auto; padding-bottom: 20px;">
                    </div>

                <div class="sticky-footer">
                    <div class="total-price">총 실시간 합계 <span id="total-price-display">0원</span></div>
                    <button id="btn-confirm-order" class="btn-confirm" onclick="confirmOrder()">${user.confirmed ? '수정 내용 저장' : '수량 확정하기'}</button>
                </div>

                <div id="cartModal" class="modal-overlay" style="display:none;" onclick="closeCartOnOutsideClick(event)">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 style="margin:0; font-size:1.1rem; color:#4b593f;">🛒 담은 상품 확인</h3>
                            <button class="close-btn" onclick="closeCart()">✕</button>
                        </div>
                        <div id="cart-items-container" class="modal-body">
                            </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderProductList();
    updateFooterAndCartCount();
}

function handleSearch(val) {
    searchQuery = val;
    renderProductList();
}

function renderProductList() {
    const user = users.find(u => u.nickname === currentUser);
    const container = document.getElementById('product-list-container');
    if(!container) return;

    let html = '';

    if (searchQuery.trim() !== '') {
        const lowerQuery = searchQuery.trim().toLowerCase();
        const matched = products.filter(p =>
            p.name.toLowerCase().includes(lowerQuery) ||
            p.brand.toLowerCase().includes(lowerQuery) ||
            p.category.toLowerCase().includes(lowerQuery)
        );

        html += `<div style="padding: 20px 20px 0 20px;">
                    <h3 style="margin:0 0 15px 0; font-size:1.05rem;">검색 결과 (${matched.length}건)</h3>`;
        if(matched.length === 0) {
            html += `<p style="color:var(--text-sub); text-align:center; margin-top:20px;">일치하는 상품이 없습니다.</p>`;
        } else {
            matched.forEach(p => {
                const qty = user.cart[p.id] || 0;
                html += generateProductRow(p, qty);
            });
        }
        html += `</div>`;
    } else {
        const categories = [...new Set(products.map(p => p.category))];
        if (openCategories === null) {
            openCategories = categories.length > 0 ? [categories[0]] : [];
        }

        categories.forEach((cat) => {
            const isOpen = openCategories.includes(cat);
            const isActive = isOpen ? 'active' : '';
            const isDisplay = isOpen ? 'block' : 'none';

            html += `
                <button class="accordion ${isActive}" onclick="toggleAccordion(this, '${cat}')">${cat}</button>
                <div class="panel" style="display: ${isDisplay};">
            `;

            const catProducts = products.filter(p => p.category === cat);
            catProducts.forEach(p => {
                const qty = user.cart[p.id] || 0;
                html += generateProductRow(p, qty);
            });
            html += `</div>`;
        });
    }
    container.innerHTML = html;
}

function updateFooterAndCartCount() {
    const user = users.find(u => u.nickname === currentUser);
    if(!user) return;

    let total = 0;
    let cartTypeCount = 0;

    products.forEach(p => {
        const qty = user.cart[p.id] || 0;
        if (qty > 0) {
            total += qty * p.price;
            cartTypeCount++;
        }
    });

    const totalEl = document.getElementById('total-price-display');
    if(totalEl) totalEl.innerText = total.toLocaleString() + '원';

    const countEl = document.getElementById('cart-count');
    if(countEl) countEl.innerText = cartTypeCount;

    const confirmBtn = document.getElementById('btn-confirm-order');
    if(confirmBtn) confirmBtn.innerText = user.confirmed ? '수정 내용 저장' : '수량 확정하기';
}

// ---------- 장바구니 모달 ----------

function openCart() {
    document.getElementById('cartModal').style.display = 'flex';
    renderCartItems();
}

function closeCart() {
    document.getElementById('cartModal').style.display = 'none';
}

function closeCartOnOutsideClick(event) {
    if (event.target.id === 'cartModal') {
        closeCart();
    }
}

function renderCartItems() {
    const user = users.find(u => u.nickname === currentUser);
    const container = document.getElementById('cart-items-container');
    if(!container) return;

    let cartItems = products.filter(p => (user.cart[p.id] || 0) > 0);

    if (cartItems.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-sub); margin-top:50px;">장바구니가 비어 있습니다.<br><br>뒤로 돌아가서 상품을 담아보세요!</p>`;
        return;
    }

    let html = '';
    cartItems.forEach(p => {
        const qty = user.cart[p.id];
        html += `
            <div class="cart-item">
                <div style="flex:1; padding-right:10px;">
                    <div class="p-name" style="font-size:0.95rem; margin-bottom:4px;">${p.name}</div>
                    <div class="p-meta" style="color:#6d8058;">${p.price.toLocaleString()}원</div>
                </div>
                <div style="display:flex; align-items:center;">
                    <div class="qty-control" style="border: 1px solid #d5e3c8; background: #fff;">
                        <button onclick="updateQty(${p.id}, -1)">-</button>
                        <input type="number" min="0" value="${qty}" onchange="setQty(${p.id}, this.value)">
                        <button onclick="updateQty(${p.id}, 1)">+</button>
                    </div>
                    <button class="btn-delete-item" onclick="setQty(${p.id}, 0)">✕ 삭제</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function toggleAccordion(element, catName) {
    const idx = openCategories.indexOf(catName);
    if (idx > -1) { openCategories.splice(idx, 1); }
    else { openCategories.push(catName); }
    element.classList.toggle("active");
    const panel = element.nextElementSibling;
    panel.style.display = panel.style.display === "block" ? "none" : "block";
}

// 서버 저장은 즉시 하지 않고, 조작이 멈춘 뒤 1초 후 한 번만 전송 (API 호출 과다 방지)
function scheduleUserSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const user = users.find(u => u.nickname === currentUser);
        if (user) apiPost('saveUser', user).catch(() => showToast("자동 저장에 실패했습니다."));
    }, 1000);
}

function updateQty(pid, delta) {
    const user = users.find(u => u.nickname === currentUser);
    let current = user.cart[pid] || 0;
    let next = current + delta;
    if (next < 0) next = 0;
    user.cart[pid] = next;
    scheduleUserSave();

    renderProductList();
    updateFooterAndCartCount();
    if (document.getElementById('cartModal') && document.getElementById('cartModal').style.display === 'flex') {
        renderCartItems();
    }
}

function setQty(pid, value) {
    const user = users.find(u => u.nickname === currentUser);
    let val = parseInt(value);
    if (isNaN(val) || val < 0) val = 0;
    user.cart[pid] = val;
    scheduleUserSave();

    renderProductList();
    updateFooterAndCartCount();
    if (document.getElementById('cartModal') && document.getElementById('cartModal').style.display === 'flex') {
        renderCartItems();
    }
}

async function confirmOrder() {
    const user = users.find(u => u.nickname === currentUser);
    user.confirmed = true;
    clearTimeout(saveTimeout);
    updateFooterAndCartCount();
    showToast("저장 중...");

    // [속도 개선] 예전에는 saveUser 1번 + 담은 상품 개수만큼 addOrder를 동시에 호출했습니다.
    // 장바구니에 담은 상품이 많을수록 서버 왕복이 늘어나(N+1) 느려지던 부분을,
    // 서버에 요청 1번으로 사용자 저장 + 주문 내역 일괄 기록까지 한 번에 처리하도록 합쳤습니다.
    const items = products
        .filter(p => (user.cart[p.id] || 0) > 0)
        .map(p => ({ productName: p.name, qty: user.cart[p.id], price: p.price }));

    try {
        await apiPost('confirmOrder', {
            nickname: user.nickname,
            password: user.password,
            cart: user.cart,
            confirmed: true,
            items
        });
        showToast("장바구니 내역이 성공적으로 저장(확정) 되었습니다.");
    } catch (err) {
        showToast("저장에 실패했습니다. 네트워크를 확인해주세요.");
    }
}


/* ---------- 관리자 패널 ---------- */

function renderAdmin() {
    const app = document.getElementById('app');
    let html = `
        <div class="header">
            <h2>관리자 마스터 패널</h2>
            <div style="display:flex; gap:8px;">
                <button onclick="openBoard('admin')" style="padding: 6px 12px; font-size: 0.85rem; background:transparent; color:var(--text-sub); border: 1px solid var(--border-color);">💡 건의게시판</button>
                <button onclick="logout()" style="padding: 6px 12px; font-size: 0.85rem;">종료</button>
            </div>
        </div>
        <div class="tabs">
            <button class="${adminTab==='products'?'active':''}" onclick="changeAdminTab('products')">상품 관리</button>
            <button class="${adminTab==='orders'?'active':''}" onclick="changeAdminTab('orders')">주문 현황</button>
            <button class="${adminTab==='users'?'active':''}" onclick="changeAdminTab('users')">계정 관리</button>
        </div>
        <div class="admin-content">
    `;

    if (adminTab === 'products') {
        const uniqueCategories = [...new Set(products.map(p => p.category))];
        const uniqueBrands = [...new Set(products.map(p => p.brand))];

        html += `
            <datalist id="category-list">
                ${uniqueCategories.map(c => `<option value="${c}">`).join('')}
            </datalist>
            <datalist id="brand-list">
                ${uniqueBrands.map(b => `<option value="${b}">`).join('')}
            </datalist>

            <div class="add-form">
                <h4 style="margin:0 0 10px 0;">새 상품 직접 등록</h4>
                <input type="text" id="p-cat" list="category-list" placeholder="대분류 (선택하거나 직접 입력하세요)">
                <input type="text" id="p-name" placeholder="상품명 (예: 지르텍정 10T)">
                <input type="text" id="p-brand" list="brand-list" placeholder="제조사 (검색어 자동완성 지원)">
                <input type="number" id="p-price" placeholder="매출단가 (숫자만 입력)">
                <button onclick="addProduct()">목록에 추가하기</button>

                <div class="file-upload-box">
                    <p style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-main);">대량 엑셀 파일이 있으신가요?</p>
                    <label for="csvUpload">CSV 엑셀 파일 일괄 등록 (클릭)</label>
                    <input type="file" id="csvUpload" accept=".csv" onchange="handleCSVUpload(event)">
                    <p style="margin:5px 0 0 0; font-size:0.75rem; color:var(--text-sub);">*엑셀 파일을 'CSV(쉼표로 분리)' 형식으로 저장 후 업로드 해주세요.<br>(양식 순서: 대분류, 상품명, 제조사, 단가)</p>
                </div>
            </div>

            <div class="section-header">
                <h3>등록된 상품 목록 (${products.length}건)</h3>
                <div class="header-actions">
                    <button class="btn-outline" onclick="deleteSelectedProducts()">선택 삭제</button>
                    <button class="btn-danger" onclick="deleteAllProducts()">전체 삭제</button>
                </div>
            </div>
            <ul class="admin-list">
        `;
        products.forEach(p => {
            html += `
                <li>
                    <div class="item-info">
                        <input type="checkbox" class="checkbox-custom chk-product" value="${p.id}">
                        <div>
                            <strong style="display:block; margin-bottom:5px;">[${p.category}] ${p.name}</strong>
                            <span style="font-size:0.85rem; color:var(--text-sub);">${p.brand} | ${p.price.toLocaleString()}원</span>
                        </div>
                    </div>
                    <button onclick="deleteProduct(${p.id})">삭제</button>
                </li>`;
        });
        html += `</ul>`;

    } else if (adminTab === 'orders') {
         html += `
            <div class="section-header">
                <h3>사용자별 장바구니/확정 현황</h3>
                <div class="header-actions">
                    <button class="btn-outline" onclick="clearSelectedOrders()">선택 초기화</button>
                    <button class="btn-danger" onclick="clearAllOrders()">전체 초기화</button>
                </div>
            </div>
        `;

         let hasOrders = false;
         users.forEach(u => {
             const keys = Object.keys(u.cart);
             let hasItems = false;
             let uTotal = 0;
             let orderListHtml = '';

             keys.forEach(pid => {
                 const p = products.find(x => x.id == parseInt(pid));
                 if(p && u.cart[pid] > 0) {
                     hasItems = true;
                     const itemTotal = p.price * u.cart[pid];
                     uTotal += itemTotal;
                     orderListHtml += `
                        <li>
                            <span style="flex:1;">${p.name}</span>
                            <span style="color:var(--text-sub); font-size:0.85rem; margin-right:15px;">(${p.price.toLocaleString()}원)</span>
                            <span style="font-weight:500;">${u.cart[pid]}개</span>
                        </li>`;
                 }
             });

             if(hasItems) {
                 hasOrders = true;
                 html += `
                    <div class="order-card">
                        <div class="order-card-header">
                            <div class="item-info">
                                <input type="checkbox" class="checkbox-custom chk-order" value="${u.nickname}">
                                <h4>${u.nickname} <span style="color:${u.confirmed ? 'green' : 'gray'}; font-size:0.85rem; font-weight:normal;">${u.confirmed ? '(확정완료)' : '(담는중)'}</span></h4>
                            </div>
                        </div>
                        <ul>${orderListHtml}</ul>
                        <div class="u-total">총 합계: ${uTotal.toLocaleString()}원</div>
                    </div>
                 `;
             }
         });

         if(!hasOrders) {
             html += `<p style="text-align:center; color:var(--text-sub); margin-top: 50px;">현재 접수된 내역이 없습니다.</p>`;
         }

    } else if (adminTab === 'users') {
         html += `
            <div class="section-header">
                <h3>가입된 사용자 계정 (${users.length}명)</h3>
                <div class="header-actions">
                    <button class="btn-outline" onclick="deleteSelectedUsers()">선택 삭제</button>
                    <button class="btn-danger" onclick="deleteAllUsers()">전체 삭제</button>
                </div>
            </div>
            <ul class="admin-list">
         `;
         users.forEach(u => {
             html += `
                <li>
                    <div class="item-info">
                        <input type="checkbox" class="checkbox-custom chk-user" value="${u.nickname}">
                        <div>
                            <strong>닉네임: ${u.nickname}</strong><br>
                            <span style="font-size:0.85rem; color:var(--text-sub);">비밀번호: ${u.password}</span>
                        </div>
                    </div>
                    <button onclick="deleteUser('${u.nickname}')">삭제</button>
                </li>`;
         });
         if(users.length === 0) html += `<p style="text-align:center; color:var(--text-sub); margin-top:50px;">가입된 사용자가 없습니다.</p>`;
         html += `</ul>`;
    }

    html += `</div>`;
    app.innerHTML = html;
}

function changeAdminTab(tab) { adminTab = tab; renderAdmin(); }

async function addProduct() {
    const cat = document.getElementById('p-cat').value.trim();
    const name = document.getElementById('p-name').value.trim();
    const brand = document.getElementById('p-brand').value.trim();
    const price = parseInt(document.getElementById('p-price').value);

    if(!cat || !name || isNaN(price)) return showToast("대분류, 상품명, 매출단가는 필수 입력 항목입니다.");

    showToast("등록 중...");
    try {
        const res = await apiPost('addProduct', { category: cat, name, brand, price });
        products.push({ id: res.id, category: cat, name, brand, price });
        showToast("상품이 추가되었습니다.");
        renderAdmin();
    } catch (err) {
        showToast("등록에 실패했습니다. 네트워크를 확인해주세요.");
    }
}

async function deleteProduct(id) {
    if(!confirm("이 상품을 삭제하시겠습니까?")) return;
    products = products.filter(p => p.id !== id);
    renderAdmin();
    try { await apiPost('deleteProducts', { ids: [id] }); }
    catch (err) { showToast("서버 삭제에 실패했습니다. 새로고침 후 다시 확인해주세요."); }
}

async function deleteSelectedProducts() {
    const checked = document.querySelectorAll('.chk-product:checked');
    if(checked.length === 0) return showToast("삭제할 상품을 선택해주세요.");
    if(!confirm(`선택한 ${checked.length}개의 상품을 삭제하시겠습니까?`)) return;

    const idsToDelete = Array.from(checked).map(cb => parseInt(cb.value));
    products = products.filter(p => !idsToDelete.includes(p.id));
    renderAdmin();
    try { await apiPost('deleteProducts', { ids: idsToDelete }); }
    catch (err) { showToast("서버 삭제에 실패했습니다."); }
}

async function deleteAllProducts() {
    if(!confirm("등록된 '전체 상품'을 정말 삭제하시겠습니까? (복구 불가)")) return;
    products = [];
    renderAdmin();
    try { await apiPost('deleteAllProducts'); }
    catch (err) { showToast("서버 삭제에 실패했습니다."); }
}

async function clearSelectedOrders() {
    const checked = document.querySelectorAll('.chk-order:checked');
    if(checked.length === 0) return showToast("초기화할 사용자 주문을 선택해주세요.");
    if(!confirm(`선택한 ${checked.length}명 사용자의 주문 내역을 초기화하시겠습니까?`)) return;

    const nicksToClear = Array.from(checked).map(cb => cb.value);
    users.forEach(u => { if(nicksToClear.includes(u.nickname)) { u.cart = {}; u.confirmed = false; } });
    renderAdmin();
    try { await apiPost('resetUserCarts', { nicknames: nicksToClear }); }
    catch (err) { showToast("서버 초기화에 실패했습니다."); }
}

async function clearAllOrders() {
     if(!confirm("모든 사용자의 '장바구니 및 주문 내역'을 전체 초기화하시겠습니까?")) return;
     users.forEach(u => { u.cart = {}; u.confirmed = false; });
     renderAdmin();
     try { await apiPost('resetUserCarts', { nicknames: [] }); }
     catch (err) { showToast("서버 초기화에 실패했습니다."); }
}

async function deleteUser(nick) {
     if(!confirm(`[${nick}] 계정을 삭제하시겠습니까?`)) return;
     users = users.filter(u => u.nickname !== nick);
     renderAdmin();
     try { await apiPost('deleteUsers', { nicknames: [nick] }); }
     catch (err) { showToast("서버 삭제에 실패했습니다."); }
}

async function deleteSelectedUsers() {
    const checked = document.querySelectorAll('.chk-user:checked');
    if(checked.length === 0) return showToast("삭제할 계정을 선택해주세요.");
    if(!confirm(`선택한 ${checked.length}개의 계정을 삭제하시겠습니까?`)) return;

    const nicksToDelete = Array.from(checked).map(cb => cb.value);
    users = users.filter(u => !nicksToDelete.includes(u.nickname));
    renderAdmin();
    try { await apiPost('deleteUsers', { nicknames: nicksToDelete }); }
    catch (err) { showToast("서버 삭제에 실패했습니다."); }
}

async function deleteAllUsers() {
     if(!confirm("모든 사용자 계정을 삭제하시겠습니까? (주문 내역도 모두 날아갑니다)")) return;
     users = [];
     renderAdmin();
     try { await apiPost('deleteAllUsers'); }
     catch (err) { showToast("서버 삭제에 실패했습니다."); }
}

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();

    reader.onload = async function(e) {
        const text = e.target.result;
        const rows = text.split(/\r?\n/);
        const parsedProducts = [];

        for(let i = 1; i < rows.length; i++) {
            if(!rows[i].trim()) continue;

            let cols = [];
            let curVal = '';
            let inQuotes = false;
            for (let j = 0; j < rows[i].length; j++) {
                let char = rows[i][j];
                if (inQuotes) {
                    if (char === '"') inQuotes = false;
                    else curVal += char;
                } else {
                    if (char === '"') inQuotes = true;
                    else if (char === ',') { cols.push(curVal.trim()); curVal = ''; }
                    else curVal += char;
                }
            }
            cols.push(curVal.trim());

            if(cols.length >= 4) {
                 const priceRaw = cols[3].replace(/[^0-9]/g, '');
                 parsedProducts.push({ category: cols[0], name: cols[1], brand: cols[2], price: parseInt(priceRaw || 0) });
            }
        }

        if (parsedProducts.length === 0) { showToast("등록할 데이터가 없습니다."); event.target.value = ''; return; }

        showToast(`${parsedProducts.length}개 상품 업로드 중...`);
        try {
            // [속도 개선] 예전에는 저장 후 상품 목록을 처음부터 다시 조회했습니다.
            // 이제는 서버가 새로 생성된 상품(id 포함)을 바로 응답해주므로 재조회가 필요 없습니다.
            const res = await apiPost('addProductsBulk', { products: parsedProducts });
            products.push(...(res.products || []));
            renderAdmin();
            showToast(`${parsedProducts.length}개의 상품이 성공적으로 일괄 등록되었습니다.`);
        } catch (err) {
            showToast("업로드에 실패했습니다. 네트워크를 확인해주세요.");
        }
        event.target.value = '';
    };

    reader.readAsText(file, 'utf-8');
}

function logout() {
    clearTimeout(saveTimeout);
    currentUser = null;
    searchQuery = '';
    renderLogin();
    showToast("로그아웃 되었습니다.");
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.innerText = msg; toast.className = "toast show";
    setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
}

init();
