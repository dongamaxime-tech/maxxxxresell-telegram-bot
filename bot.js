
// ── HTTP SERVER (pour Render Web Service gratuit) ──
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer(function(req, res){
  res.writeHead(200);
  res.end(JSON.stringify({ status: 'MAXXXXRESELL Bot actif' }));
}).listen(PORT, function(){
  console.log('HTTP alive sur port ' + PORT);
});

/**
 * MAXXXXRESELL — Bot Telegram
 */

const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN || '8187138766:AAEZnwyND_QQmYTwskGYK5eu5dSdmcTix_k';
const JSONBIN_ID = process.env.JSONBIN_ID || '69ff9ea1c0954111d8fde588';
const JSONBIN_KEY = process.env.JSONBIN_KEY || '$2a$10$hVeLbATRHcoLHdVB/JAYiOpid7Oy.og8ly7077j.bl7tVJz3wyk8S';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dongamaxime-tech.github.io/maxxxxresell-dashboard';

// Comptes fixes (admin seulement)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Maxdonga!';

// Cherche un compte dans JSONBin + admin fixe
async function findAccount(username, password) {
  if(username === 'admin' && password === ADMIN_PASSWORD) {
    return { username: 'admin', role: 'admin', permissions: ['all'] };
  }
  // Cherche dans JSONBin
  try {
    var db = await jsonbinGet();
    // Comptes built-in (charles etc)
    var builtIn = {
      'charles': { password: process.env.CHARLES_PASSWORD || 'charlou', role: 'user', permissions: ['maillots-hist','maillots-transit','maillots-stock','acc-hist','acc-transit','acc-stock'] }
    };
    var deleted = db.deletedAccounts || [];
    // Check built-in
    if(builtIn[username] && builtIn[username].password === password && deleted.indexOf(username) === -1) {
      return { username, role: 'user', permissions: builtIn[username].permissions };
    }
    // Check custom accounts from JSONBin
    var custom = db.customAccounts || [];
    for(var i = 0; i < custom.length; i++) {
      if(custom[i].username === username && custom[i].password === password) {
        return { username, role: 'user', permissions: custom[i].permissions || [] };
      }
    }
  } catch(e) { console.error('findAccount error:', e.message); }
  return null;
}

// Sessions: { chatId: { username, role, state } }
var sessions = {};
var lastUpdate = 0;

// ── JSONBIN ──
function jsonbinGet() {
  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: 'api.jsonbin.io',
      path: '/v3/b/' + JSONBIN_ID,
      method: 'GET',
      headers: { 'X-Master-Key': JSONBIN_KEY }
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data).record || {}); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function() { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function jsonbinPut(data) {
  var body = JSON.stringify(data);
  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: 'api.jsonbin.io',
      path: '/v3/b/' + JSONBIN_ID,
      method: 'PUT',
      headers: {
        'X-Master-Key': JSONBIN_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Bin-Versioning': 'false'
      }
    }, function(res) {
      var data2 = '';
      res.on('data', function(c) { data2 += c; });
      res.on('end', function() { resolve(); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── TELEGRAM API ──
function tgRequest(method, params) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify(params);
    var req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + BOT_TOKEN + '/' + method,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function() { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

function sendMsg(chatId, text, keyboard) {
  var params = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if(keyboard) params.reply_markup = keyboard;
  return tgRequest('sendMessage', params);
}

function editMsg(chatId, msgId, text, keyboard) {
  var params = {
    chat_id: chatId,
    message_id: msgId,
    text: text,
    parse_mode: 'HTML'
  };
  if(keyboard) params.reply_markup = keyboard;
  return tgRequest('editMessageText', params);
}

function inlineKeyboard(buttons) {
  return { inline_keyboard: buttons };
}

// ── MENUS ──
function getMainMenu(role) {
  if(role === 'admin') {
    return inlineKeyboard([
      [{ text: '👕 Maillots', callback_data: 'cat_maillots' }, { text: '🎩 Accessoires', callback_data: 'cat_acc' }],
      [{ text: '👔 T-Shirts', callback_data: 'cat_tshirt' }],
      [{ text: '📊 Stats globales', callback_data: 'stats' }],
      [{ text: '👥 Collaborateurs', callback_data: 'collabs' }],
      [{ text: '🌐 Ouvrir le dashboard', callback_data: 'dashboard_url' }]
    ]);
  } else {
    return inlineKeyboard([
      [{ text: '👕 Maillots', callback_data: 'cat_maillots' }, { text: '🎩 Accessoires', callback_data: 'cat_acc' }],
      [{ text: '📊 Mes stats', callback_data: 'stats' }],
      [{ text: '🌐 Ouvrir le dashboard', callback_data: 'dashboard_url' }]
    ]);
  }
}

function getCatMenu(catId) {
  var labels = { maillots: '👕 Maillots', acc: '🎩 Accessoires', tshirt: '👔 T-Shirts' };
  return inlineKeyboard([
    [{ text: '📋 Historique', callback_data: 'view_' + catId + '_hist' }],
    [{ text: '🚚 En transit', callback_data: 'view_' + catId + '_transit' }],
    [{ text: '📦 Stock', callback_data: 'view_' + catId + '_stock' }],
    [{ text: '⬅️ Retour', callback_data: 'main_menu' }]
  ]);
}

// ── STATS ──
async function getStats(username, role) {
  var db = await jsonbinGet();
  var orders = db.orders || { maillots: [], acc: [], tshirt: [] };
  var allOrders = [];
  Object.values(orders).forEach(function(cat) {
    (cat || []).forEach(function(o) {
      if(role === 'admin' || (o.visibleTo && o.visibleTo.indexOf(username) > -1)) {
        allOrders.push(o);
      }
    });
  });
  var transit = allOrders.filter(function(o) { return o.status === 'transit'; }).length;
  var stock = allOrders.filter(function(o) { return o.status === 'stock'; }).length;
  var vendus = allOrders.filter(function(o) { return o.status === 'vendu'; });
  var ca = vendus.reduce(function(s, o) { return s + (o.sell || 0) * (o.qty || 1); }, 0);
  var ben = vendus.reduce(function(s, o) { return s + ((o.sell || 0) - (o.buy || 0)) * (o.qty || 1); }, 0);
  var investi = allOrders.filter(function(o) { return o.status !== 'vendu'; })
    .reduce(function(s, o) { return s + (o.buy || 0) * (o.qty || 1); }, 0);

  return { transit, stock, vendus: vendus.length, ca, ben, investi, total: allOrders.length };
}

async function getOrdersList(catId, status, username, role) {
  var db = await jsonbinGet();
  var orders = (db.orders || {})[catId] || [];
  return orders.filter(function(o) {
    var statusOk = o.status === status;
    var visibleOk = role === 'admin' || (o.visibleTo && o.visibleTo.indexOf(username) > -1);
    return statusOk && visibleOk;
  });
}

// ── HANDLE UPDATES ──
async function handleMessage(msg) {
  var chatId = msg.chat.id;
  var text = (msg.text || '').trim();
  var session = sessions[chatId] || {};

  // State machine for login
  if(session.state === 'await_username') {
    session.pendingUsername = text;
    session.state = 'await_password';
    sessions[chatId] = session;
    await sendMsg(chatId, '🔒 Mot de passe :');
    return;
  }

  if(session.state === 'await_password') {
    var username = session.pendingUsername;
    var password = text;
    var acc = await findAccount(username, password);
    if(acc) {
      session.username = username;
      session.role = acc.role;
      session.state = 'logged';
      sessions[chatId] = session;
      await sendMsg(chatId,
        '✅ <b>Connecté en tant que ' + username + '</b>\n\n🚀 Bienvenue sur <b>MAXXXXRESELL</b>',
        getMainMenu(acc.role)
      );
    } else {
      session.state = null;
      sessions[chatId] = session;
      await sendMsg(chatId, '❌ Identifiants incorrects. Tape /start pour réessayer.');
    }
    return;
  }

  if(text === '/start') {
    session.state = 'await_username';
    sessions[chatId] = session;
    await sendMsg(chatId,
      '👋 Bienvenue sur <b>MAXXXXRESELL</b>\n\n🔐 Connexion requise\n\nTon identifiant :'
    );
    return;
  }

  if(!session.username) {
    await sendMsg(chatId, 'Tape /start pour te connecter.');
    return;
  }

  await sendMsg(chatId, 'Utilise les boutons du menu ⬇️', getMainMenu(session.role));
}



async function handleCallback(query) {
  var chatId = query.message.chat.id;
  var msgId = query.message.message_id;
  var data = query.data;
  var session = sessions[chatId] || {};

  await tgRequest('answerCallbackQuery', { callback_query_id: query.id });

  if(!session.username) {
    await editMsg(chatId, msgId, 'Session expirée. Tape /start');
    return;
  }

  var role = session.role;
  var username = session.username;

  if(data === 'main_menu') {
    await editMsg(chatId, msgId, '🏠 <b>Menu principal</b>', getMainMenu(role));
    return;
  }

  if(data === 'dashboard_url') {
    await editMsg(chatId, msgId, '🌐 <b>Dashboard web :</b>\n' + DASHBOARD_URL, inlineKeyboard([[{ text: '⬅️ Retour', callback_data: 'main_menu' }]]));
    return;
  }

  if(data.startsWith('cat_')) {
    var catId = data.replace('cat_', '');
    var labels = { maillots: '👕 Maillots', acc: '🎩 Accessoires', tshirt: '👔 T-Shirts' };
    await editMsg(chatId, msgId, labels[catId] || catId, getCatMenu(catId));
    return;
  }

  if(data === 'stats') {
    var s = await getStats(username, role);
    var text2 = '📊 <b>Statistiques</b>\n\n';
    text2 += '🚚 En transit : <b>' + s.transit + '</b>\n';
    text2 += '📦 En stock : <b>' + s.stock + '</b>\n';
    text2 += '✅ Vendus : <b>' + s.vendus + '</b>\n';
    text2 += '💰 CA encaissé : <b>' + s.ca.toFixed(2) + '€</b>\n';
    if(role === 'admin') {
      text2 += '📈 Bénéfice : <b>' + s.ben.toFixed(2) + '€</b>\n';
      text2 += '💸 Investi : <b>' + s.investi.toFixed(2) + '€</b>\n';
    }
    await editMsg(chatId, msgId, text2, inlineKeyboard([[{ text: '⬅️ Retour', callback_data: 'main_menu' }]]));
    return;
  }

  if(data.startsWith('view_')) {
    var parts = data.split('_');
    var catId2 = parts[1];
    var status = parts[2];
    var statusLabels = { hist: 'Historique', transit: 'En transit', stock: 'Stock' };
    var orders = await getOrdersList(catId2, status === 'hist' ? 'transit' : status === 'transit' ? 'transit' : 'stock', username, role);
    
    // For hist, get all
    if(status === 'hist') {
      var db2 = await jsonbinGet();
      var allCat = (db2.orders || {})[catId2] || [];
      orders = allCat.filter(function(o) {
        return role === 'admin' || (o.visibleTo && o.visibleTo.indexOf(username) > -1);
      });
    } else if(status === 'transit') {
      orders = orders.filter(function(o) { return o.status === 'transit'; });
    } else {
      orders = orders.filter(function(o) { return o.status === 'stock'; });
    }

    var catLabels = { maillots: '👕', acc: '🎩', tshirt: '👔' };
    var txt = catLabels[catId2] + ' <b>' + statusLabels[status] + '</b> — ' + orders.length + ' article(s)\n\n';
    
    if(!orders.length) {
      txt += 'Aucun article';
    } else {
      orders.slice(0, 10).forEach(function(o, i) {
        txt += (i+1) + '. ' + (o.flag || '') + ' <b>' + (o.team || '?') + '</b>';
        if(o.type) txt += ' ' + o.type;
        if(o.size) txt += ' — ' + o.size;
        txt += ' × ' + (o.qty || 1);
        if(role === 'admin') txt += ' | ' + (o.buy || 0) + '€→' + (o.sell || 0) + '€';
        txt += '\n';
      });
      if(orders.length > 10) txt += '\n... et ' + (orders.length - 10) + ' autres';
    }

    var btns = [[{ text: '⬅️ Retour', callback_data: 'cat_' + catId2 }]];
    
    // Add sell buttons for stock items
    if(status === 'stock' && orders.length > 0 && role !== 'admin') {
      orders.slice(0, 5).forEach(function(o) {
        btns.unshift([{ text: '✅ Vendre : ' + (o.flag||'') + ' ' + (o.team||'') + ' ' + (o.size||''), callback_data: 'sell_' + o.id }]);
      });
    }

    await editMsg(chatId, msgId, txt, inlineKeyboard(btns));
    return;
  }

  if(data.startsWith('sell_')) {
    var orderId = parseFloat(data.replace('sell_', ''));
    var db3 = await jsonbinGet();
    var updated = false;
    Object.keys(db3.orders || {}).forEach(function(cat) {
      (db3.orders[cat] || []).forEach(function(o) {
        if(o.id === orderId && o.status === 'stock') {
          o.status = 'vendu';
          o.soldAt = new Date().toLocaleDateString('fr-FR');
          o.soldBy = username;
          updated = true;
          // Add notification
          if(!db3.notifications) db3.notifications = [];
          db3.notifications.unshift({
            id: Date.now(),
            msg: username + ' a vendu : ' + (o.flag||'') + ' ' + (o.team||'') + ' ' + (o.size||'') + ' — ' + (o.sell||0) + '€',
            type: 'vente',
            read: false,
            time: new Date().toISOString()
          });
        }
      });
    });
    if(updated) {
      await jsonbinPut(db3);
      await editMsg(chatId, msgId, '✅ <b>Article vendu !</b> Bravo 💰', inlineKeyboard([[{ text: '⬅️ Menu principal', callback_data: 'main_menu' }]]));
    } else {
      await editMsg(chatId, msgId, '❌ Article introuvable', inlineKeyboard([[{ text: '⬅️ Retour', callback_data: 'main_menu' }]]));
    }
    return;
  }

  if(data === 'collabs' && role === 'admin') {
    var db4 = await jsonbinGet();
    var accounts = db4.customAccounts || [];
    var txt2 = '👥 <b>Collaborateurs</b>\n\n';
    txt2 += '• charles (charlou)\n';
    accounts.forEach(function(a) { txt2 += '• ' + a.username + '\n'; });
    await editMsg(chatId, msgId, txt2, inlineKeyboard([[{ text: '⬅️ Retour', callback_data: 'main_menu' }]]));
    return;
  }
}

// ── POLLING ──
async function poll() {
  try {
    var params = 'offset=' + (lastUpdate + 1) + '&timeout=30&allowed_updates=["message","callback_query"]';
    var res = await new Promise(function(resolve, reject) {
      var req = https.request({
        hostname: 'api.telegram.org',
        path: '/bot' + BOT_TOKEN + '/getUpdates?' + params,
        method: 'GET'
      }, function(res2) {
        var data = '';
        res2.on('data', function(c) { data += c; });
        res2.on('end', function() {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(35000, function() { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });

    if(res.ok && res.result) {
      for(var i = 0; i < res.result.length; i++) {
        var update = res.result[i];
        lastUpdate = update.update_id;
        try {
          if(update.message) await handleMessage(update.message);
          if(update.callback_query) await handleCallback(update.callback_query);
        } catch(e) {
          console.error('Error handling update:', e.message);
        }
      }
    }
  } catch(e) {
    console.error('Poll error:', e.message);
    await new Promise(function(r) { setTimeout(r, 5000); });
  }
  poll();
}

console.log('MAXXXXRESELL Bot Telegram démarré');
poll();
