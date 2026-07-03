// ⚠️ Google Apps Script 편집기에 붙여넣는 백엔드 코드입니다.
// 기존 코드를 전부 지우고 이 내용으로 통째로 교체하세요.
// (기존 상품/사용자/주문 기능 + 건의게시판 기능 + 게시판 속도 개선이 모두 포함되어 있습니다)
//
// [변경점] addPost / addComment 가 생성된 id와 시각을 바로 응답으로 돌려줍니다.
// 프런트엔드(board.js)가 이 값을 받아 화면에 바로 반영하기 때문에,
// 글/댓글 등록 후 전체 목록을 다시 불러오는 왕복이 필요 없어져 체감 속도가 개선됩니다.

const SHEET_NAMES = {
  users: 'Users',
  products: 'Products',
  orders: 'Orders',
  posts: 'Posts',
  comments: 'Comments'
};

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getUsers') return jsonResponse(getUsersData());
  if (action === 'getProducts') return jsonResponse(sheetToJson(getSheet(SHEET_NAMES.products)));
  if (action === 'getOrders') return jsonResponse(sheetToJson(getSheet(SHEET_NAMES.orders)));
  if (action === 'getPosts') return jsonResponse(sheetToJson(getSheet(SHEET_NAMES.posts)));
  if (action === 'getComments') {
    const postId = e.parameter.postId;
    const all = sheetToJson(getSheet(SHEET_NAMES.comments));
    return jsonResponse(all.filter(c => String(c.post_id) === String(postId)));
  }

  return jsonResponse({ error: 'unknown action: ' + action });
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  switch (action) {
    case 'saveUser':
      saveUser(data.nickname, data.password, data.cart, data.confirmed);
      return jsonResponse({ success: true });

    case 'addOrder':
      getSheet(SHEET_NAMES.orders).appendRow([
        new Date(), data.nickname, data.productName, data.qty, data.price, data.qty * data.price
      ]);
      return jsonResponse({ success: true });

    // [속도 개선] 사용자 저장 + 주문 내역 기록을 요청 1번으로 처리.
    // 예전에는 프런트에서 saveUser 1번 + 담은 상품 개수만큼 addOrder를 따로 호출했습니다.
    case 'confirmOrder':
      confirmOrderCombined(data.nickname, data.password, data.cart, data.confirmed, data.items || []);
      return jsonResponse({ success: true });

    case 'addProduct': {
      const id = appendProduct(data.category, data.name, data.brand, data.price);
      return jsonResponse({ success: true, id: id });
    }

    // [속도 개선] 개별 appendRow 반복 대신 한 번의 setValues로 일괄 기록하고,
    // 생성된 상품(id 포함)을 그대로 응답해서 프런트가 재조회 없이 화면에 반영하게 함.
    case 'addProductsBulk': {
      const created = appendProductsBulk(data.products || []);
      return jsonResponse({ success: true, count: created.length, products: created });
    }

    case 'deleteProducts':
      deleteRowsByValue(SHEET_NAMES.products, 0, data.ids);
      return jsonResponse({ success: true });

    case 'deleteAllProducts':
      clearSheetData(SHEET_NAMES.products);
      return jsonResponse({ success: true });

    case 'deleteUsers':
      deleteRowsByValue(SHEET_NAMES.users, 0, data.nicknames);
      return jsonResponse({ success: true });

    case 'deleteAllUsers':
      clearSheetData(SHEET_NAMES.users);
      return jsonResponse({ success: true });

    case 'resetUserCarts':
      resetUserCarts(data.nicknames);
      return jsonResponse({ success: true });

    // ---------- 건의게시판 ----------

    case 'addPost': {
      const result = addPost(data.title, data.body, data.author);
      return jsonResponse({ success: true, id: result.id, created_at: result.created_at });
    }

    case 'updatePost':
      return jsonResponse(updatePost(data.id, data.title, data.body, data.author));

    case 'addComment': {
      const result = addComment(data.postId, data.parentId, data.author, data.body);
      return jsonResponse({ success: true, id: result.id, created_at: result.created_at });
    }

    case 'uploadImage': {
      const url = uploadImageToDrive(data.base64, data.mimeType, data.filename);
      return jsonResponse({ success: true, url: url });
    }

    case 'deletePost':
      return jsonResponse(deletePost(data.id, data.requester));

    case 'deleteComment':
      return jsonResponse(deleteComment(data.id, data.requester));

    default:
      return jsonResponse({ error: 'unknown action: ' + action });
  }
}

// ---------- 공통 헬퍼 ----------

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetToJson(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = values.slice(1);
  return rows
    .filter(function (row) { return row[0] !== ''; })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function nextId(sheet) {
  const ids = sheet.getDataRange().getValues().slice(1)
    .map(function (r) { return Number(r[0]); })
    .filter(function (n) { return !isNaN(n); });
  return ids.length > 0 ? Math.max.apply(null, ids) + 1 : 1;
}

// ---------- 사용자/상품/주문 ----------

function getUsersData() {
  return sheetToJson(getSheet(SHEET_NAMES.users)).map(function (u) {
    return {
      nickname: u.nickname,
      password: u.password,
      cart: safeParseJson(u.cart_json, {}),
      confirmed: !!u.confirmed
    };
  });
}

function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

function saveUser(nickname, password, cart, confirmed) {
  const sheet = getSheet(SHEET_NAMES.users);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === nickname) {
      sheet.getRange(i + 1, 2, 1, 3).setValues([[password, JSON.stringify(cart || {}), !!confirmed]]);
      return;
    }
  }
  sheet.appendRow([nickname, password, JSON.stringify(cart || {}), !!confirmed]);
}

function appendProduct(category, name, brand, price) {
  const sheet = getSheet(SHEET_NAMES.products);
  const newId = nextId(sheet);
  sheet.appendRow([newId, category, name, brand, price]);
  return newId;
}

// CSV 등으로 여러 상품을 한 번에 등록할 때 사용. id를 미리 한 번만 계산해서 순차 부여하고,
// appendRow를 여러 번 호출하는 대신 setValues 한 번으로 일괄 기록합니다(대량 등록 시 훨씬 빠름).
function appendProductsBulk(productsArr) {
  if (!productsArr || productsArr.length === 0) return [];
  const sheet = getSheet(SHEET_NAMES.products);
  let nextIdVal = nextId(sheet);
  const rows = productsArr.map(p => {
    const id = nextIdVal++;
    return [id, p.category, p.name, p.brand, p.price];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  return rows.map(r => ({ id: r[0], category: r[1], name: r[2], brand: r[3], price: r[4] }));
}

// confirmOrder: 사용자 정보 저장 + 주문 내역 일괄 기록을 한 번에 처리
function confirmOrderCombined(nickname, password, cart, confirmed, items) {
  saveUser(nickname, password, cart, confirmed);
  if (items && items.length > 0) {
    const sheet = getSheet(SHEET_NAMES.orders);
    const now = new Date();
    const rows = items.map(it => [now, nickname, it.productName, it.qty, it.price, it.qty * it.price]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  }
}

function deleteRowsByValue(sheetName, col, values) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const valueSet = new Set((values || []).map(String));

  for (let i = data.length - 1; i >= 1; i--) {
    if (valueSet.has(String(data[i][col]))) {
      sheet.deleteRow(i + 1);
    }
  }
}

function clearSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
}

function resetUserCarts(nicknames) {
  const sheet = getSheet(SHEET_NAMES.users);
  const data = sheet.getDataRange().getValues();
  const targetAll = !nicknames || nicknames.length === 0;
  const targetSet = new Set(nicknames || []);

  for (let i = 1; i < data.length; i++) {
    if (targetAll || targetSet.has(data[i][0])) {
      sheet.getRange(i + 1, 3, 1, 2).setValues([['{}', false]]);
    }
  }
}

// ---------- 건의게시판 ----------

// 생성된 id와 시각을 함께 반환 (프런트에서 재조회 없이 화면에 바로 반영하기 위함)
function addPost(title, body, author) {
  const sheet = getSheet(SHEET_NAMES.posts);
  const newId = nextId(sheet);
  const now = new Date();
  sheet.appendRow([newId, title, body, author, now, '', false]);
  return { id: newId, created_at: now };
}

// 작성자 본인 확인 후 수정 (서버단에서 한번 더 검증)
function updatePost(id, title, body, author) {
  const sheet = getSheet(SHEET_NAMES.posts);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      if (data[i][3] !== author) {
        return { success: false, error: '작성자만 수정할 수 있습니다.' };
      }
      const now = new Date();
      // title, body, author, created_at(유지), updated_at
      sheet.getRange(i + 1, 2, 1, 5).setValues([[title, body, author, data[i][4], now]]);
      sheet.getRange(i + 1, 7).setValue(true);
      return { success: true, updated_at: now };
    }
  }
  return { success: false, error: '게시글을 찾을 수 없습니다.' };
}

// 생성된 id와 시각을 함께 반환 (프런트에서 재조회 없이 화면에 바로 반영하기 위함)
function addComment(postId, parentId, author, body) {
  const sheet = getSheet(SHEET_NAMES.comments);
  const newId = nextId(sheet);
  const now = new Date();
  sheet.appendRow([newId, postId, parentId || '', author, body, now]);
  return { id: newId, created_at: now };
}

// 작성자 본인 또는 관리자만 삭제 가능 (게시글 삭제 시 딸린 댓글도 함께 삭제)
function deletePost(id, requester) {
  const sheet = getSheet(SHEET_NAMES.posts);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const author = data[i][3];
      if (requester !== author && requester !== 'admin') {
        return { success: false, error: '작성자 또는 관리자만 삭제할 수 있습니다.' };
      }
      sheet.deleteRow(i + 1);
      deleteCommentsByPostId(id);
      return { success: true };
    }
  }
  return { success: false, error: '게시글을 찾을 수 없습니다.' };
}

function deleteCommentsByPostId(postId) {
  const sheet = getSheet(SHEET_NAMES.comments);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(postId)) {
      sheet.deleteRow(i + 1);
    }
  }
}

// 작성자 본인 또는 관리자만 삭제 가능 (댓글 삭제 시 그 댓글에 달린 답글도 함께 삭제)
function deleteComment(id, requester) {
  const sheet = getSheet(SHEET_NAMES.comments);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const author = data[i][3];
      if (requester !== author && requester !== 'admin') {
        return { success: false, error: '작성자 또는 관리자만 삭제할 수 있습니다.' };
      }
      deleteRepliesOf(id);
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: '댓글을 찾을 수 없습니다.' };
}

function deleteRepliesOf(parentId) {
  const sheet = getSheet(SHEET_NAMES.comments);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][2]) === String(parentId)) {
      sheet.deleteRow(i + 1);
    }
  }
}

// 이미지를 구글 드라이브에 저장하고 공개 열람 링크를 반환
function uploadImageToDrive(base64, mimeType, filename) {
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, filename || 'image');
  const folder = getOrCreateFolder('PharmBoardImages');
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}
