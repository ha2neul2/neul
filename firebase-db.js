// ---------- Firestore 기반 apiGet / apiPost ----------
// script.js, board.js는 전혀 수정하지 않고, 기존과 똑같은 이름의
// apiGet(action) / apiPost(action, payload) 함수를 이 파일에서 대신 구현합니다.
// (기존: fetch로 Google Apps Script 호출 → 지금: Firestore와 직접 통신)

function nowIso() { return new Date().toISOString(); }
function newId() { return Date.now() + Math.floor(Math.random() * 1000); }

async function apiGet(action) {
    const [name, query] = action.split('&');

    if (name === 'getUsers') {
        const snap = await db.collection('users').get();
        return snap.docs.map(d => ({ nickname: d.id, ...d.data() }));
    }

    if (name === 'getProducts') {
        const snap = await db.collection('products').get();
        return snap.docs.map(d => ({ id: Number(d.id), ...d.data() }));
    }

    if (name === 'getPosts') {
        const snap = await db.collection('posts').get();
        return snap.docs.map(d => ({ id: Number(d.id), ...d.data() }));
    }

    if (name === 'getComments') {
        const postId = query.split('=')[1];
        const snap = await db.collection('comments').where('post_id', '==', Number(postId)).get();
        return snap.docs.map(d => ({ id: Number(d.id), ...d.data() }));
    }

    throw new Error('알 수 없는 액션: ' + action);
}

async function apiPost(action, payload = {}) {

    if (action === 'saveUser') {
        const { nickname, password, cart, confirmed } = payload;
        await db.collection('users').doc(nickname).set({ password, cart, confirmed }, { merge: true });
        return { success: true };
    }

    if (action === 'addProduct') {
        const id = newId();
        const { category, name, brand, price } = payload;
        await db.collection('products').doc(String(id)).set({ category, name, brand, price });
        return { id };
    }

    if (action === 'addProductsBulk') {
        const batch = db.batch();
        payload.products.forEach((p, i) => {
            const id = newId() + i;
            batch.set(db.collection('products').doc(String(id)), p);
        });
        await batch.commit();
        return { success: true };
    }

    if (action === 'deleteProducts') {
        const batch = db.batch();
        payload.ids.forEach(id => batch.delete(db.collection('products').doc(String(id))));
        await batch.commit();
        return { success: true };
    }

    if (action === 'deleteAllProducts') {
        const snap = await db.collection('products').get();
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        return { success: true };
    }

    if (action === 'resetUserCarts') {
        const nicknames = (payload.nicknames && payload.nicknames.length > 0)
            ? payload.nicknames
            : (await db.collection('users').get()).docs.map(d => d.id);
        const batch = db.batch();
        nicknames.forEach(nick => batch.update(db.collection('users').doc(nick), { cart: {}, confirmed: false }));
        await batch.commit();
        return { success: true };
    }

    if (action === 'deleteUsers') {
        const batch = db.batch();
        payload.nicknames.forEach(nick => batch.delete(db.collection('users').doc(nick)));
        await batch.commit();
        return { success: true };
    }

    if (action === 'deleteAllUsers') {
        const snap = await db.collection('users').get();
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        return { success: true };
    }

    if (action === 'addOrder') {
        const { nickname, productName, qty, price } = payload;
        await db.collection('orders').add({ nickname, productName, qty, price, created_at: nowIso() });
        return { success: true };
    }

    if (action === 'addPost') {
        const id = newId();
        const { title, body, author } = payload;
        await db.collection('posts').doc(String(id)).set({ title, body, author, created_at: nowIso(), edited: false });
        return { id };
    }

    if (action === 'updatePost') {
        const { id, title, body, author } = payload;
        const ref = db.collection('posts').doc(String(id));
        const doc = await ref.get();
        if (!doc.exists) return { success: false, error: '존재하지 않는 글입니다.' };
        const post = doc.data();
        if (post.author !== author && author !== 'admin') return { success: false, error: '수정 권한이 없습니다.' };
        await ref.update({ title, body, edited: true });
        return { success: true };
    }

    if (action === 'deletePost') {
        const { id, requester } = payload;
        const ref = db.collection('posts').doc(String(id));
        const doc = await ref.get();
        if (!doc.exists) return { success: false, error: '존재하지 않는 글입니다.' };
        const post = doc.data();
        if (post.author !== requester && requester !== 'admin') return { success: false, error: '삭제 권한이 없습니다.' };

        const commentsSnap = await db.collection('comments').where('post_id', '==', Number(id)).get();
        const batch = db.batch();
        commentsSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(ref);
        await batch.commit();
        return { success: true };
    }

    if (action === 'addComment') {
        const id = newId();
        const { postId, parentId, author, body } = payload;
        await db.collection('comments').doc(String(id)).set({
            post_id: Number(postId),
            parent_id: parentId ? Number(parentId) : null,
            author, body, created_at: nowIso()
        });
        return { success: true };
    }

    if (action === 'deleteComment') {
        const { id, requester } = payload;
        const ref = db.collection('comments').doc(String(id));
        const doc = await ref.get();
        if (!doc.exists) return { success: false, error: '존재하지 않는 댓글입니다.' };
        const comment = doc.data();
        if (comment.author !== requester && requester !== 'admin') return { success: false, error: '삭제 권한이 없습니다.' };

        const repliesSnap = await db.collection('comments').where('parent_id', '==', Number(id)).get();
        const batch = db.batch();
        repliesSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(ref);
        await batch.commit();
        return { success: true };
    }

    throw new Error('알 수 없는 액션: ' + action);
}
