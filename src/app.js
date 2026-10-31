/* ===================================================================
   Jurnal Trading — app logic
   Pure vanilla JS + localStorage. No server, no dependencies.
   =================================================================== */
(function () {
  'use strict';

  /* ---------------- tiny utils ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var KEY = 'jurnal.v2';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sum(arr, f) { var t = 0; for (var i2 = 0; i2 < arr.length; i2++) t += f ? f(arr[i2]) : arr[i2]; return t; }

  /* ---------------- formatting ---------------- */
  function fmtMoney(v, cur) {
    if (v == null || !isFinite(v)) return '\u2014';
    var neg = v < 0, a = Math.abs(v);
    if (cur === 'IDR') {
      return (neg ? '\u2212' : '') + 'Rp ' + a.toLocaleString('id-ID', { maximumFractionDigits: 0 });
    }
    return (neg ? '\u2212' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtCompact(v, cur, withUnit) {
    var neg = v < 0, a = Math.abs(v), s2 = neg ? '\u2212' : '', pre = withUnit && cur === 'IDR' ? 'Rp ' : '';
    if (cur === 'IDR') {
      if (a >= 1e9) return s2 + pre + (a / 1e9).toFixed(1).replace('.', ',') + ' M';
      if (a >= 1e6) return s2 + pre + (a / 1e6).toFixed(1).replace('.', ',') + ' jt';
      if (a >= 1e3) return s2 + pre + Math.round(a / 1e3) + ' rb';
      return s2 + pre + Math.round(a);
    }
    if (a >= 1e6) return s2 + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s2 + (a / 1e3).toFixed(1) + 'k';
    return s2 + a.toFixed(2);
  }
  function fmtPct(v, dec) {
    if (v == null || !isFinite(v)) return '\u2014';
    return (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(dec == null ? 2 : dec) + '%';
  }
  function fmtR(v) {
    if (v == null || !isFinite(v)) return '\u2014';
    return (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(2) + 'R';
  }
  function fmtDate(v) {
    if (!v) return '\u2014';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '\u2014';
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
  }
  function fmtDateShort(v) {
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + '/' + (d.getMonth() + 1);
  }
  function cls(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat'; }
  function signStr(v, fn) { return v == null ? '\u2014' : fn(v); }

  /* ---------------- state ---------------- */
  function defaultSettings() {
    return { feeStockBuy: 0.15, feeStockSell: 0.25, feeCryptoBuy: 0.1, feeCryptoSell: 0.1, lotSize: 100 };
  }

  var state = {
    profiles: [],
    activeProfileId: null,
    trades: [],
    journal: [],
    settings: defaultSettings(),
    currency: 'IDR',
    hideMoney: false,
    prices: { at: 0, quotes: {} },
    priceLoading: false,
    priceNote: '',
    view: 'dash',
    filters: { market: '', status: '', tag: '', q: '', sort: 'date-desc' },
    editTrade: null,
    editJournal: null
  };

  /* ---------------- profiles ---------------- */
  function profileIndex(id, list) {
    var arr = list || state.profiles;
    for (var i2 = 0; i2 < arr.length; i2++) if (arr[i2].id === id) return i2;
    return -1;
  }
  function activeProfile() {
    var i2 = profileIndex(state.activeProfileId);
    return i2 >= 0 ? state.profiles[i2] : state.profiles[0];
  }
  function blankProfile(name) {
    return {
      id: 'p' + uid(), name: name, createdAt: new Date().toISOString(),
      trades: [], journal: [], settings: defaultSettings(), currency: 'IDR'
    };
  }
  function syncProfile() {
    var p = activeProfile();
    if (!p) return;
    p.trades = state.trades;
    p.journal = state.journal;
    p.settings = state.settings;
    p.currency = state.currency;
  }
  function loadProfileIntoState(p) {
    if (!p) return;
    state.activeProfileId = p.id;
    state.trades = Array.isArray(p.trades) ? p.trades : [];
    state.journal = Array.isArray(p.journal) ? p.journal : [];
    state.settings = Object.assign(defaultSettings(), p.settings || {});
    state.currency = p.currency || 'IDR';
  }
  function resetFilters() {
    state.filters = { market: '', status: '', tag: '', q: '', sort: 'date-desc' };
    var m = $('#fMarket'), st = $('#fStatus'), q = $('#fSearch');
    if (m) m.value = ''; if (st) st.value = ''; if (q) q.value = '';
  }

  function switchProfile(id) {
    if (!id || id === state.activeProfileId) return;
    var p = state.profiles[profileIndex(id)];
    if (!p) return;
    syncProfile();
    loadProfileIntoState(p);
    resetFilters();
    save();
    renderAll();
    renderProfileList();
    toast('Pindah ke profil ' + p.name + '.');
  }

  function addProfile(name) {
    syncProfile();
    var p = blankProfile(name);
    state.profiles.push(p);
    loadProfileIntoState(p);
    resetFilters();
    save();
    renderAll();
    renderProfileList();
    toast('Profil ' + name + ' dibuat.');
  }

  function deleteProfile(id) {
    if (state.profiles.length < 2) { toast('Minimal satu profil harus tetap ada.'); return; }
    var idx = profileIndex(id);
    if (idx < 0) return;
    var p = state.profiles[idx];
    var n = (id === state.activeProfileId ? state.trades.length : (p.trades || []).length);
    var next = (id === state.activeProfileId && state.profiles.length > 1)
      ? state.profiles.filter(function (x) { return x.id !== id; })[0].name : null;
    if (!confirm('Hapus profil "' + p.name + '" beserta ' + n + ' trade dan jurnalnya? Tidak bisa dibatalkan.'
      + (next ? ' Profil "' + next + '" akan jadi profil aktif.' : ''))) return;
    var wasActive = id === state.activeProfileId;
    if (wasActive) syncProfile();
    state.profiles.splice(idx, 1);
    if (wasActive) { loadProfileIntoState(state.profiles[0]); resetFilters(); }
    save();
    renderAll();
    renderProfileList();
    toast('Profil ' + p.name + ' dihapus.');
  }

  /* ---------------- persistence ---------------- */
  function save() {
    syncProfile();
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: 2,
        activeProfileId: state.activeProfileId,
        profiles: state.profiles,
        hideMoney: state.hideMoney,
        prices: { at: state.prices.at, quotes: state.prices.quotes }
      }));
    } catch (e) {
      toast('Gagal menyimpan — storage browser penuh / diblokir.');
    }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      var doc = null;
      try { doc = JSON.parse(raw); } catch (e) { doc = null; }
      if (doc && Array.isArray(doc.profiles) && doc.profiles.length) {
        state.profiles = doc.profiles;
        state.hideMoney = !!doc.hideMoney;
        if (doc.prices && doc.prices.quotes) state.prices = { at: doc.prices.at || 0, quotes: doc.prices.quotes };
        var idx = profileIndex(doc.activeProfileId, doc.profiles);
        loadProfileIntoState(idx >= 0 ? doc.profiles[idx] : doc.profiles[0]);
        return true;
      }
    }
    return false;
  }

  /* ---------------- harga live (Binance + IDX via Yahoo) ----------------
     src crypto : data-api.binance.vision (CORS *) -> api.binance.com
     src saham  : Yahoo chart (BBCA.JK) lewat CORS proxy -> AllOrigins / CodeTabs
     cache TTL  : 1 jam, disimpan di localStorage
  ---------------------------------------------------------------------- */
  var PRICE_TTL = 60 * 60 * 1000;
  var YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

  function quoteKey(t) {
    var sym = String(t.symbol || '').toUpperCase().replace(/\s+/g, '');
    if (!sym) return null;
    if (t.market === 'crypto') {
      if (!/(USDT|USDC|FDUSD|TUSD|BTC|ETH|BNB)$/.test(sym)) sym += 'USDT';
      return 'c:' + sym;
    }
    return 's:' + sym.replace(/\.JK$/, '');
  }

  /* harga otomatis hanya kalau mata uang trade cocok dengan sumbernya */
  function canQuote(t) {
    if (t.market === 'crypto') return (t.currency || 'IDR') === 'USD';
    return (t.currency || 'IDR') === 'IDR';
  }

  function quoteFor(t) {
    if (num(t.manualPrice) > 0) {
      return { px: num(t.manualPrice), ts: t.manualAt || 0, src: 'manual', manual: true };
    }
    if (!canQuote(t)) return null;
    var k = quoteKey(t);
    if (!k) return null;
    var q = state.prices.quotes[k];
    return (q && q.px != null) ? q : null;
  }

  function unrealized(t) {
    if (isClosed(t)) return null;
    var q = quoteFor(t);
    if (!q) return null;
    var c = calc(t);
    var dir = t.side === 'short' ? -1 : 1;
    var gross = (q.px - c.entry) * c.qty * dir;
    var pnl = gross - c.fee; /* fee beli saja; fee jual belum keluar */
    return {
      px: q.px, pnl: pnl, ts: q.ts, src: q.src, manual: !!q.manual,
      pct: c.invested ? (pnl / c.invested) * 100 : null,
      r: c.risk ? pnl / c.risk : null
    };
  }

  function unrealTotals(list) {
    var out = { IDR: 0, USD: 0, n: 0 };
    list.forEach(function (t) {
      if (isClosed(t)) return;
      var u = unrealized(t);
      if (!u) return;
      out[t.currency || 'IDR'] = (out[t.currency || 'IDR'] || 0) + u.pnl;
      out.n++;
    });
    return out;
  }

  function fetchJson(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error('timeout')); }, ms || 14000);
      fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (j) { clearTimeout(timer); resolve(j); })
        .catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function fetchCryptoPrices(symbols) {
    var batch = 'https://data-api.binance.vision/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(symbols));
    var single = function (sym) { return 'https://data-api.binance.vision/api/v3/ticker/price?symbol=' + sym; };
    var fallbackBatch = 'https://api.binance.com/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(symbols));

    function apply(rows, src) {
      var map = {};
      (Array.isArray(rows) ? rows : [rows]).forEach(function (r) {
        if (!r || !r.symbol || !r.price) return;
        map['c:' + r.symbol] = { px: Number(r.price), ts: Date.now(), src: src };
        state.prices.quotes['c:' + r.symbol] = map['c:' + r.symbol];
      });
      return map;
    }

    return fetchJson(batch)
      .then(function (rows) { return apply(rows, 'binance'); })
      .catch(function () { return fetchJson(fallbackBatch).then(function (rows) { return apply(rows, 'binance'); }); })
      .catch(function () {
        /* terakhir: satu per satu, biar simbol lain tetap dapat */
        return Promise.all(symbols.map(function (sym) {
          return fetchJson(single(sym)).then(function (row) { apply([row], 'binance'); }).catch(function () { });
        })).then(function () { });
      });
  }

  function fetchStockPrices(symbols) {
    var provs = [
      function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
      function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); }
    ];
    return Promise.all(symbols.map(function (sym) {
      var target = YAHOO_BASE + encodeURIComponent(sym + '.JK') + '?interval=1d&range=1d';
      function attempt(i) {
        if (i >= provs.length) return Promise.resolve(null);
        return fetchJson(provs[i](target))
          .then(function (j) {
            var res = j && j.chart && j.chart.result && j.chart.result[0];
            var px = res && res.meta && res.meta.regularMarketPrice;
            if (!px) throw new Error('no price');
            state.prices.quotes['s:' + sym] = { px: Number(px), ts: Date.now(), src: 'idx/yahoo' };
            return Number(px);
          })
          .catch(function () { return attempt(i + 1); });
      }
      return attempt(0);
    }));
  }

  function refreshPrices(force) {
    if (state.priceLoading) return;
    var fresh = (Date.now() - (state.prices.at || 0)) < PRICE_TTL;
    if (!force && fresh) { renderAll(); return; }

    var open = state.trades.filter(function (t) { return !isClosed(t) && canQuote(t) && !(num(t.manualPrice) > 0); });
    var crypto = [], stock = [];
    open.forEach(function (t) {
      var k = quoteKey(t);
      if (!k) return;
      var sym = k.slice(2);
      if (t.market === 'crypto') { if (crypto.indexOf(sym) < 0) crypto.push(sym); }
      else { if (stock.indexOf(sym) < 0) stock.push(sym); }
    });

    if (!crypto.length && !stock.length) {
      state.priceNote = 'Tidak ada posisi terbuka yang bisa dihargai otomatis.';
      renderPriceStatus(); renderAll();
      return;
    }

    state.priceLoading = true;
    state.priceNote = 'Mengambil harga…';
    renderPriceStatus();

    /* file:// (dobel klik) → proxy CORS menolak origin null; saham dilewati, crypto tetap */
    var fileMode = location.protocol === 'file:';
    if (fileMode && stock.length) {
      stock = [];
      state.priceNote = 'Mode file lokal: harga saham IDX tidak bisa diambil otomatis. Buka versi online, atau isi harga manual.';
      if (!crypto.length) { state.priceLoading = false; renderPriceStatus(); renderAll(); return; }
    }

    var jobs = [];
    if (crypto.length) jobs.push(fetchCryptoPrices(crypto));
    if (stock.length) jobs.push(fetchStockPrices(stock));

    Promise.all(jobs).then(function () {
      state.priceLoading = false;
      state.prices.at = Date.now();
      var got = open.filter(function (t) { return !!quoteFor(t); }).length;
      var miss = open.length - got;
      state.priceNote = miss
        ? 'Harga masuk untuk ' + got + ' dari ' + open.length + ' posisi. Yang gagal bisa diisi manual.'
        : 'Harga terbaru untuk ' + got + ' posisi terbuka.';
      if (fileMode) state.priceNote += ' Harga saham IDX butuh versi online (CORS), bukan file lokal.';
      save();
      renderAll();
      renderPriceStatus();
      toast(miss ? 'Harga diperbarui (' + got + '/' + open.length + ' posisi).' : 'Harga diperbarui: ' + got + ' posisi.');
    }).catch(function (e) {
      state.priceLoading = false;
      state.priceNote = 'Gagal ambil harga (' + (e && e.message ? e.message : 'error') + '). Isi manual kalau perlu.';
      renderPriceStatus();
      renderAll();
      toast('Gagal ambil harga otomatis.');
    });
  }

  function priceAge(ts) {
    if (!ts) return '—';
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return m + ' menit lalu';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' jam lalu';
    return Math.floor(h / 24) + ' hari lalu';
  }

  function renderPriceStatus() {
    var host = $('#priceStatus');
    if (!host) return;
    var open = state.trades.filter(function (t) { return !isClosed(t); });
    var quoted = open.filter(function (t) { return !!quoteFor(t); });
    var txt;
    if (state.priceLoading) txt = 'mengambil harga…';
    else if (!open.length) txt = 'tidak ada posisi terbuka';
    else if (state.prices.at) txt = 'harga ' + priceAge(state.prices.at) + ' · ' + quoted.length + '/' + open.length + ' posisi';
    else txt = 'belum ada harga';
    host.textContent = txt;
    var btn = $('#btnRefreshPrices');
    if (btn) {
      btn.disabled = state.priceLoading;
      btn.setAttribute('aria-busy', String(state.priceLoading));
    }
    var note = $('#priceNote');
    if (note) note.textContent = state.priceNote || '';
    var sHost = $('#priceStatusSettings');
    if (sHost) {
      sHost.textContent = state.priceLoading ? 'mengambil harga…'
        : (state.prices.at ? 'update terakhir ' + priceAge(state.prices.at) : 'belum pernah ambil harga');
    }
    var sNote = $('#priceNoteSettings');
    if (sNote) {
      var quotedN = quoted.length, openN = open.length;
      sNote.textContent = state.priceNote || (openN ? quotedN + ' dari ' + openN + ' posisi terbuka punya harga.' : 'Belum ada posisi terbuka.');
    }
  }

  /* ---------------- trade math ---------------- */
  function isClosed(t) { return num(t.exit) != null && num(t.exit) > 0; }

  function feeOf(t) {
    var s = state.settings;
    var buyPct = t.market === 'stock' ? s.feeStockBuy : s.feeCryptoBuy;
    var sellPct = t.market === 'stock' ? s.feeStockSell : s.feeCryptoSell;
    if (t.autoFee === false) return num(t.fee) || 0;
    var qty = num(t.qty) || 0, entry = num(t.entry) || 0;
    var f = entry * qty * (buyPct / 100);
    if (isClosed(t)) f += (num(t.exit) || 0) * qty * (sellPct / 100);
    return f;
  }

  function calc(t) {
    var qty = num(t.qty) || 0, entry = num(t.entry) || 0, exit = num(t.exit) || 0;
    var closed = isClosed(t);
    var dir = t.side === 'short' ? -1 : 1;
    var invested = entry * qty;
    var gross = closed ? (exit - entry) * qty * dir : 0;
    var fee = feeOf(t);
    var net = closed ? gross - fee : 0;
    var stop = num(t.stop);
    var risk = (stop != null && stop > 0) ? Math.abs(entry - stop) * qty : null;
    var r = (closed && risk) ? net / risk : null;
    var pct = (closed && invested) ? (net / invested) * 100 : null;
    var days = null;
    if (closed && t.entryDate && t.exitDate) {
      var d = (new Date(t.exitDate) - new Date(t.entryDate)) / 86400000;
      if (isFinite(d)) days = d;
    }
    return { qty: qty, entry: entry, exit: exit, invested: invested, gross: gross, fee: fee, net: net, risk: risk, r: r, pct: pct, closed: closed, days: days };
  }

  function sortDate(t) { return Date.parse(t.exitDate || t.entryDate || 0) || 0; }

  function stats(list) {
    var rows = list.filter(isClosed).map(function (t) { return { t: t, c: calc(t) }; });
    rows.sort(function (a, b) { return sortDate(a.t) - sortDate(b.t); });
    var n = rows.length;
    var wins = rows.filter(function (r) { return r.c.net > 0; });
    var losses = rows.filter(function (r) { return r.c.net < 0; });
    var gp = sum(wins, function (r) { return r.c.net; });
    var gl = Math.abs(sum(losses, function (r) { return r.c.net; }));
    var net = sum(rows, function (r) { return r.c.net; });
    var rs = rows.map(function (r) { return r.c.r; }).filter(function (v) { return v != null; });
    var streak = { win: 0, loss: 0, curWin: 0, curLoss: 0 };
    rows.forEach(function (r) {
      if (r.c.net > 0) { streak.curWin++; streak.curLoss = 0; if (streak.curWin > streak.win) streak.win = streak.curWin; }
      else if (r.c.net < 0) { streak.curLoss++; streak.curWin = 0; if (streak.curLoss > streak.loss) streak.loss = streak.curLoss; }
    });
    // max drawdown on the equity series (money) and on the R series (unit-free)
    var cum = 0, peak = 0, dd = 0;
    var rcum = 0, rpeak = 0, rdd = 0;
    rows.forEach(function (r) {
      cum += r.c.net;
      if (cum > peak) peak = cum;
      if (peak - cum > dd) dd = peak - cum;
      if (r.c.r != null) {
        rcum += r.c.r;
        if (rcum > rpeak) rpeak = rcum;
        if (rpeak - rcum > rdd) rdd = rpeak - rcum;
      }
    });
    return {
      n: n, wins: wins.length, losses: losses.length, breakeven: n - wins.length - losses.length,
      wr: n ? wins.length / n : null,
      gp: gp, gl: gl, net: net,
      avgWin: wins.length ? gp / wins.length : 0,
      avgLoss: losses.length ? gl / losses.length : 0,
      avgWinR: wins.length ? sum(wins.map(function (x) { return x.c.r; }).filter(function (v) { return v != null; })) / Math.max(1, wins.filter(function (x) { return x.c.r != null; }).length) : null,
      avgLossR: losses.length ? sum(losses.map(function (x) { return x.c.r; }).filter(function (v) { return v != null; })) / Math.max(1, losses.filter(function (x) { return x.c.r != null; }).length) : null,
      pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0),
      expectancy: n ? net / n : 0,
      avgR: rs.length ? sum(rs) / rs.length : null,
      totalR: rs.length ? sum(rs) : null,
      rCount: rs.length,
      best: n ? Math.max.apply(null, rows.map(function (r) { return r.c.net; })) : 0,
      worst: n ? Math.min.apply(null, rows.map(function (r) { return r.c.net; })) : 0,
      maxDD: dd,
      rMaxDD: rdd,
      streak: streak,
      rows: rows
    };
  }

  /* ---------------- filtering ---------------- */
  function matchesFilters(t) {
    var f = state.filters;
    if (state.currency !== 'ALL' && (t.currency || 'IDR') !== state.currency) return false;
    if (f.market && t.market !== f.market) return false;
    if (f.tag && (t.tags || []).indexOf(f.tag) < 0) return false;
    if (f.status === 'closed' && !isClosed(t)) return false;
    if (f.status === 'open' && isClosed(t)) return false;
    if (f.status === 'win' && !(isClosed(t) && calc(t).net > 0)) return false;
    if (f.status === 'loss' && !(isClosed(t) && calc(t).net < 0)) return false;
    if (f.q) {
      var hay = [t.symbol, t.notes, (t.tags || []).join(' '), t.emotion].join(' ').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function sortVal(t, key) {
    var c = calc(t);
    switch (key) {
      case 'date': return sortDate(t);
      case 'market': return t.market || '';
      case 'symbol': return String(t.symbol || '').toLowerCase();
      case 'side': return t.side || 'long';
      case 'qty': return c.qty;
      case 'entry': return c.entry;
      case 'exit': return c.closed ? c.exit : -Infinity;
      case 'pl': return c.closed ? c.net : -Infinity;
      case 'r': return c.r == null ? -Infinity : c.r;
      case 'tag': return (t.tags || []).join(',').toLowerCase();
      default: return sortDate(t);
    }
  }

  function visibleTrades(applySort) {
    var list = state.trades.filter(matchesFilters);
    if (applySort !== false) {
      var parts = String(state.filters.sort || 'date-desc').split('-');
      var key = parts[0] || 'date';
      var dir = parts[1] === 'asc' ? 1 : -1;
      list.sort(function (a, b) {
        var va = sortVal(a, key), vb = sortVal(b, key);
        if (typeof va === 'string' || typeof vb === 'string') {
          return String(va).localeCompare(String(vb)) * dir;
        }
        return (va - vb) * dir;
      });
    }
    return list;
  }

  function scopedTrades() {
    var list = visibleTrades();
    if (state.currency === 'ALL') return list;
    return list.filter(function (t) { return (t.currency || 'IDR') === state.currency; });
  }

  function netByCurrency(list) {
    var out = { IDR: 0, USD: 0 };
    list.forEach(function (t) {
      if (!isClosed(t)) return;
      var c = t.currency || 'IDR';
      out[c] = (out[c] || 0) + calc(t).net;
    });
    return out;
  }

  function moneyLabel(list, fallbackCur) {
    if (state.currency !== 'ALL') {
      var s = stats(list);
      return s.n ? fmtMoney(s.net, state.currency) : fmtMoney(0, state.currency);
    }
    var nb = netByCurrency(list);
    var parts = [];
    if (nb.IDR) parts.push(fmtMoney(nb.IDR, 'IDR'));
    if (nb.USD) parts.push(fmtMoney(nb.USD, 'USD'));
    if (!parts.length) return fmtMoney(0, fallbackCur || 'IDR');
    return parts.join('  ·  ');
  }

  /* ---------------- toast + icons + field errors ---------------- */
  function icon(name, size) {
    return '<svg class="ic' + (size ? ' ic-' + size : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';
  }

  function toast(msg, opts) {
    opts = opts || {};
    var w = $('#toastWrap');
    var el = document.createElement('div');
    el.className = 'toast';
    var span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    if (opts.action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = opts.action;
      b.addEventListener('click', function () {
        el.remove();
        if (typeof opts.onAction === 'function') opts.onAction();
      });
      el.appendChild(b);
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'toast-action';
    x.setAttribute('aria-label', 'Tutup notifikasi');
    x.textContent = '\u2715';
    x.addEventListener('click', function () { el.remove(); });
    el.appendChild(x);
    w.appendChild(el);
    setTimeout(function () { el.remove(); }, opts.action ? 6000 : 3600);
  }

  function setFieldError(sel, msg) {
    var input = $(sel);
    var err = $('#err-' + sel.replace('#', ''));
    if (!input || !err) return;
    if (msg) {
      err.textContent = msg;
      err.classList.add('is-shown');
      input.setAttribute('aria-invalid', 'true');
    } else {
      err.textContent = '';
      err.classList.remove('is-shown');
      input.removeAttribute('aria-invalid');
    }
  }

  function clearFieldErrors() {
    $$('.field-error').forEach(function (e) { e.textContent = ''; e.classList.remove('is-shown'); });
    $$('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
  }

  /* ---------------- shared html bits ---------------- */
  function emptyBlock(title, text) {
    return '<div class="empty"><strong>' + esc(title) + '</strong><p>' + esc(text) + '</p></div>';
  }
  function marketBadge(t) {
    return '<span class="badge b-' + (t.market === 'crypto' ? 'crypto' : 'stock') + '">' + (t.market === 'crypto' ? 'crypto' : 'idx') + '</span>';
  }
  function sideBadge(t) {
    return '<span class="badge b-' + (t.side === 'short' ? 'short' : 'long') + '">' + (t.side === 'short' ? 'short' : 'long') + '</span>';
  }

  /* ---------------- KPI rendering ---------------- */
  function kpi(lbl, val, meta, cls2, small, hero) {
    return '<div class="kpi' + (hero ? ' kpi-hero' : '') + '"><div class="lbl">' + esc(lbl) + '</div>' +
      '<div class="val ' + (small && !hero ? 'sm ' : '') + (cls2 || '') + '">' + val + '</div>' +
      (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div>';
  }

  function kpiSet(list) {
    var s = stats(list);
    var money = moneyLabel(list);
    var pf = s.n === 0 ? '—' : (s.pf === Infinity ? '∞' : s.pf.toFixed(2) + '×');
    var html = '';
    html += kpi('Net P/L · ' + (state.currency === 'ALL' ? 'semua mata uang' : state.currency), s.n ? money : '—',
      s.n + ' trade close · ' + list.filter(function (t) { return !isClosed(t); }).length + ' masih terbuka', cls(s.net), false, true);
    html += kpi('Win rate', s.n ? (s.wr * 100).toFixed(1) + '%' : '—', s.wins + ' win / ' + s.losses + ' loss');
    html += kpi('Profit factor', pf, state.currency === 'ALL'
      ? 'avg win ' + fmtR(s.avgWinR) + ' · avg loss ' + fmtR(s.avgLossR)
      : 'avg win ' + (s.avgWin ? fmtCompact(s.avgWin, state.currency) : '—') + ' · avg loss ' + (s.avgLoss ? fmtCompact(-s.avgLoss, state.currency) : '—'));
    html += kpi('Avg R', s.avgR == null ? '—' : fmtR(s.avgR), s.rCount + ' trade punya stop loss', cls(s.avgR));
    html += kpi('Expectancy', !s.n ? '—' : (state.currency === 'ALL' ? fmtR(s.avgR) : fmtMoney(s.expectancy, state.currency)),
      state.currency === 'ALL' ? 'rata-rata per trade (R)' : 'rata-rata per trade', cls(s.expectancy) + ' sm');
    var openList = list.filter(function (t) { return !isClosed(t); });
    var ut = unrealTotals(openList);
    if (openList.length) {
      var uTxt;
      if (state.currency === 'ALL') {
        var parts2 = [];
        if (ut.IDR) parts2.push(fmtMoney(ut.IDR, 'IDR'));
        if (ut.USD) parts2.push(fmtMoney(ut.USD, 'USD'));
        uTxt = parts2.length ? parts2.join('  ·  ') : '—';
      } else {
        uTxt = ut.n ? fmtMoney(ut[state.currency] || 0, state.currency) : '—';
      }
      html += kpi('Unrealized P/L', uTxt, ut.n + '/' + openList.length + ' posisi ada harga · ' + priceAge(state.prices.at), cls(state.currency === 'ALL' ? (ut.IDR + ut.USD) : (ut[state.currency] || 0)) + ' sm');
    }

    html += kpi('Max drawdown', !s.n ? '—' : (state.currency === 'ALL' ? fmtR(-s.rMaxDD) : fmtMoney(-s.maxDD, state.currency)), 'peak ke lembah', 'neg sm');
    return html;
  }

  /* ---------------- equity chart (tooltip + keyboard + table fallback) ---------------- */
  var eqModel = { series: [], W: 680, H: 252, padL: 58, padR: 12, useR: false, active: -1 };

  function renderEquity(list) {
    var wrap = $('#equityChartWrap');
    var legend = $('#equityLegend');
    var hint = $('#equityHint');
    var summary = $('#equitySummary');
    var tableHost = $('#equityTable');

    var rows = list.filter(isClosed).map(function (t) { return { t: t, c: calc(t) }; });
    rows.sort(function (a, b) { return sortDate(a.t) - sortDate(b.t); });

    if (!rows.length) {
      wrap.innerHTML = emptyBlock('Belum ada trade close', 'Kurva muncul otomatis setelah ada trade yang diisi harga exit-nya.');
      wrap.removeAttribute('tabindex');
      summary.textContent = '';
      legend.innerHTML = '';
      hint.textContent = '';
      tableHost.innerHTML = '';
      tableHost.hidden = true;
      eqModel.series = [];
      return;
    }

    var useR = state.currency === 'ALL';
    var series = [], cum = 0;
    rows.forEach(function (r, i2) {
      var step = useR ? (r.c.r == null ? 0 : r.c.r) : r.c.net;
      cum += step;
      series.push({ i: i2, y: cum, step: step, date: r.t.exitDate || r.t.entryDate, t: r.t, c: r.c });
    });

    var W = 680, H = 252, padL = 58, padR = 12, padT = 14, padB = 26;
    var ys = series.map(function (p) { return p.y; });
    var minY = Math.min(0, Math.min.apply(null, ys));
    var maxY = Math.max(0, Math.max.apply(null, ys));
    if (minY === maxY) maxY = minY + 1;
    var span = maxY - minY;
    minY -= span * 0.08; maxY += span * 0.08;
    var iw = W - padL - padR, ih = H - padT - padB;
    function X(i2) { return padL + (series.length === 1 ? iw / 2 : (i2 / (series.length - 1)) * iw); }
    function Y(v) { return padT + (1 - (v - minY) / (maxY - minY)) * ih; }

    var last = series[series.length - 1].y;
    var color = last >= 0 ? 'var(--pos)' : 'var(--neg)';
    var line = series.map(function (p, i2) { return (i2 ? 'L' : 'M') + X(p.i).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var area = line + ' L' + X(series.length - 1).toFixed(1) + ' ' + Y(Math.max(minY, 0)).toFixed(1) +
      ' L' + X(0).toFixed(1) + ' ' + Y(Math.max(minY, 0)).toFixed(1) + ' Z';

    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
    var ticks = 4;
    for (var k = 0; k <= ticks; k++) {
      var vv = minY + (maxY - minY) * (k / ticks);
      var yy = Y(vv);
      svg += '<line class="axis" x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" opacity="0.55"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end">' +
        (useR ? (vv >= 0 ? '' : '\u2212') + Math.abs(vv).toFixed(1) + 'R' : fmtCompact(vv, state.currency)) + '</text>';
    }
    if (minY < 0 && maxY > 0) {
      var y0 = Y(0);
      svg += '<line class="zero" x1="' + padL + '" y1="' + y0.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y0.toFixed(1) + '"/>';
    }
    svg += '<path class="area" d="' + area + '" fill="' + (last >= 0 ? 'var(--pos)' : 'var(--neg)') + '" opacity="0.16"/>';
    svg += '<path class="line" d="' + line + '" stroke="' + color + '"/>';
    if (series.length <= 60) {
      series.forEach(function (p) {
        svg += '<circle class="dot" cx="' + X(p.i).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="2.6" fill="' + color + '"/>';
      });
    }
    svg += '<circle class="chart-focus" id="chartFocus" cx="0" cy="0" r="6" style="display:none"/>';
    var idxs = series.length === 1 ? [0] : [0, Math.floor((series.length - 1) / 2), series.length - 1];
    idxs.forEach(function (i2, n) {
      var anchor = n === 0 ? 'start' : (n === idxs.length - 1 ? 'end' : 'middle');
      svg += '<text x="' + X(i2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(fmtDateShort(series[i2].date)) + '</text>';
    });
    svg += '</svg>';

    wrap.innerHTML = svg + '<div class="chart-tip" id="chartTip"></div>';
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('role', 'group');

    eqModel = { series: series, W: W, H: H, padL: padL, padR: padR, useR: useR, active: -1 };

    var st = stats(list);
    var totalTxt = useR ? fmtR(last) : fmtMoney(last, state.currency);
    var bestTrade = rows.reduce(function (a, b) { return (b.c.net > a.c.net ? b : a); }, rows[0]);
    var summaryTxt = series.length + ' trade closed. Kumulatif ' + (useR ? 'R' : 'net P/L') + ' ' + totalTxt +
      ', win rate ' + (st.wr == null ? '—' : (st.wr * 100).toFixed(1) + '%') +
      ', drawdown terdalam ' + (useR ? fmtR(-st.rMaxDD) : fmtMoney(-st.maxDD, state.currency)) +
      '. Trade terbaik ' + bestTrade.t.symbol + ' ' + (useR ? fmtR(bestTrade.c.r) : fmtMoney(bestTrade.c.net, bestTrade.t.currency || 'IDR')) + '.';
    summary.textContent = summaryTxt;
    wrap.setAttribute('aria-label', 'Kurva equity: ' + summaryTxt);

    hint.textContent = 'per trade (kronologis) · ' + series.length + ' titik';
    legend.innerHTML = '<span>' + (useR ? 'kumulatif R' : 'kumulatif net') + '</span><span class="' + cls(last) + '">' + (useR ? fmtR(last) : fmtCompact(last, state.currency)) + '</span>';

    /* keyboard + pointer tooltip */
    var tip = $('#chartTip');
    var focusDot = $('#chartFocus');

    function showPoint(i2) {
      if (i2 < 0 || i2 >= series.length) return;
      eqModel.active = i2;
      var p = series[i2];
      var svgEl = wrap.querySelector('svg');
      if (!svgEl) return;
      var rect = svgEl.getBoundingClientRect();
      var px = (X(p.i) / W) * rect.width;
      var py = (Y(p.y) / H) * rect.height;
      tip.innerHTML =
        '<div class="tip-head">' + esc(fmtDate(p.date)) + '</div>' +
        '<div class="tip-row"><span class="tip-sym">' + esc(p.t.symbol) + '</span><span class="' + cls(p.step) + '">' + (useR ? fmtR(p.step) : fmtCompact(p.step, p.t.currency || 'IDR')) + '</span></div>' +
        '<div class="tip-row"><span>kumulatif</span><span>' + (useR ? fmtR(p.y) : fmtCompact(p.y, p.t.currency || 'IDR')) + '</span></div>' +
        '<div class="tip-row"><span>R</span><span>' + fmtR(p.c.r) + '</span></div>';
      tip.classList.add('is-shown');
      tip.style.left = px + 'px';
      tip.style.top = py + 'px';
      if (focusDot) {
        focusDot.setAttribute('cx', X(p.i).toFixed(1));
        focusDot.setAttribute('cy', Y(p.y).toFixed(1));
        focusDot.style.display = '';
      }
    }
    function hidePoint() {
      eqModel.active = -1;
      tip.classList.remove('is-shown');
      if (focusDot) focusDot.style.display = 'none';
    }

    wrap.onmousemove = function (e) {
      var svgEl = wrap.querySelector('svg');
      if (!svgEl) return;
      var rect = svgEl.getBoundingClientRect();
      if (!rect.width) return;
      var vbX = ((e.clientX - rect.left) / rect.width) * W;
      var ratio = (vbX - padL) / iw;
      var i2 = Math.round(ratio * (series.length - 1));
      i2 = Math.max(0, Math.min(series.length - 1, i2));
      showPoint(i2);
    };
    wrap.onmouseleave = hidePoint;
    wrap.onfocus = function () { showPoint(series.length - 1); };
    wrap.onblur = hidePoint;
    wrap.onkeydown = function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        var cur2 = eqModel.active < 0 ? series.length - 1 : eqModel.active;
        if (e.key === 'ArrowRight') cur2 = Math.min(series.length - 1, cur2 + 1);
        if (e.key === 'ArrowLeft') cur2 = Math.max(0, cur2 - 1);
        if (e.key === 'Home') cur2 = 0;
        if (e.key === 'End') cur2 = series.length - 1;
        showPoint(cur2);
      } else if (e.key === 'Escape') {
        hidePoint();
      }
    };

    /* table alternative */
    tableHost.innerHTML = '<table><thead><tr><th>Tanggal close</th><th>Simbol</th><th class="num">Net P/L</th><th class="num">R</th><th class="num">Kumulatif</th></tr></thead><tbody>' +
      series.map(function (p) {
        return '<tr><td class="t-date">' + esc(fmtDate(p.date)) + '</td>' +
          '<td><span class="t-sym">' + esc(p.t.symbol) + '</span></td>' +
          '<td class="num ' + cls(p.step) + '">' + fmtMoney(p.step, p.t.currency || 'IDR') + '</td>' +
          '<td class="num">' + fmtR(p.c.r) + '</td>' +
          '<td class="num">' + fmtMoney(p.y, p.t.currency || 'IDR') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---------------- bars ---------------- */
  function barsFrom(pairs, fmtVal, diverging) {
    if (!pairs.length) return emptyBlock('Belum ada data', 'Isi beberapa trade dulu.');
    var maxAbs = Math.max.apply(null, pairs.map(function (p) { return Math.abs(p[1]); })) || 1;
    return pairs.map(function (p) {
      var v = p[1];
      if (diverging) {
        var half = Math.max(1, (Math.abs(v) / maxAbs) * 50);
        var style = v >= 0
          ? 'left:50%;width:' + half.toFixed(1) + '%'
          : 'right:50%;width:' + half.toFixed(1) + '%';
        return '<div class="bar-row"><span class="lbl">' + esc(p[0]) + '</span>' +
          '<span class="bar-track diverging"><span class="bar-center"></span>' +
          '<span class="bar-fill ' + (v >= 0 ? 'p' : 'n') + '" style="' + style + '"></span></span>' +
          '<span class="val ' + cls(v) + '">' + fmtVal(v, p[2]) + '</span></div>';
      }
      var w = Math.max(1.5, (Math.abs(v) / maxAbs) * 100);
      return '<div class="bar-row"><span class="lbl">' + esc(p[0]) + '</span>' +
        '<span class="bar-track"><span class="bar-fill ' + (v >= 0 ? 'p' : 'n') + '" style="width:' + w.toFixed(1) + '%"></span></span>' +
        '<span class="val ' + cls(v) + '">' + fmtVal(v, p[2]) + '</span></div>';
    }).join('');
  }

  function renderMonthly(list) {
    var map = {};
    list.filter(isClosed).forEach(function (t) {
      var d = new Date(t.exitDate || t.entryDate);
      if (isNaN(d.getTime())) return;
      var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      map[k] = (map[k] || 0) + calc(t).net;
    });
    var keys = Object.keys(map).sort().slice(-12);
    var pairs = keys.map(function (k) {
      var p = k.split('-');
      return [MON[Number(p[1]) - 1] + ' ' + p[0].slice(2), map[k]];
    });
    $('#monthlyBars').innerHTML = keys.length
      ? barsFrom(pairs, function (v) { return fmtCompact(v, state.currency === 'ALL' ? 'IDR' : state.currency, true); }, true)
      : emptyBlock('Belum ada bulan dengan trade closed', 'Coba isi harga exit pada trade yang sudah selesai.');
  }

  function renderRD() {
    var list = scopedTrades();
    var buckets = [[-Infinity, -2, '< −2R'], [-2, -1, '−2…−1R'], [-1, 0, '−1…0R'], [0, 1, '0…1R'], [1, 2, '1…2R'], [2, Infinity, '> 2R']];
    var counts = buckets.map(function () { return 0; });
    var total = 0;
    list.forEach(function (t) {
      var r = calc(t).r;
      if (r == null) return;
      total++;
      for (var i = 0; i < buckets.length; i++) {
        if (r >= buckets[i][0] && r < buckets[i][1]) { counts[i]++; break; }
      }
    });
    if (!total) { $('#anR').innerHTML = emptyBlock('Belum ada R multiple', 'Isi stop loss saat mencatat trade supaya R bisa dihitung.'); return; }
    var maxc = Math.max.apply(null, counts) || 1;
    $('#anR').innerHTML = buckets.map(function (b, i) {
      var c = counts[i], w = Math.max(1.5, (c / maxc) * 100);
      var positive = b[0] >= 0;
      return '<div class="bar-row"><span class="lbl">' + esc(b[2]) + '</span>' +
        '<span class="bar-track"><span class="bar-fill ' + (positive ? 'p' : 'n') + '" style="width:' + w.toFixed(1) + '%"></span></span>' +
        '<span class="val">' + c + ' trade</span></div>';
    }).join('');
  }

  /* ---------------- generic table ---------------- */
  function simpleTable(head, rows) {
    if (!rows.length) return emptyBlock('Belum ada data', 'Tambahkan trade untuk melihat rincian ini.');
    var h = '<table><thead><tr>' + head.map(function (x) {
      return '<th class="' + (x.num ? 'num' : '') + '">' + esc(x.label) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>' + r.map(function (cell, i) {
        var c = head[i];
        return '<td class="' + (c.num ? 'num' : '') + ' ' + (cell.cls || '') + '">' + cell.v + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  function groupStats(list, keyFn) {
    var groups = {};
    list.filter(isClosed).forEach(function (t) {
      var keys = keyFn(t);
      keys.forEach(function (k) {
        if (!k) return;
        (groups[k] = groups[k] || []).push(t);
      });
    });
    return groups;
  }

  function moneyOrDash(v) {
    if (!v) return '—';
    return state.currency === 'ALL' ? (v.IDR ? fmtMoney(v.IDR, 'IDR') : '') + (v.USD ? (v.IDR ? ' · ' : '') + fmtMoney(v.USD, 'USD') : '') : fmtMoney(v, state.currency);
  }

  function groupNet(group) {
    if (state.currency !== 'ALL') return stats(group).net;
    return netByCurrency(group);
  }

  function renderAnalytics() {
    var list = scopedTrades();

    renderRD();

    /* per tag */
    var tagGroups = groupStats(list, function (t) { return (t.tags && t.tags.length ? t.tags : ['(tanpa tag)']); });
    var tagRows = Object.keys(tagGroups).map(function (k) {
      var g = tagGroups[k], s = stats(g);
      return { k: k, s: s, money: groupNet(g) };
    }).sort(function (a, b) {
      var av = state.currency === 'ALL' ? (a.s.totalR || 0) : a.s.net;
      var bv = state.currency === 'ALL' ? (b.s.totalR || 0) : b.s.net;
      return bv - av;
    });
    $('#anTags').innerHTML = simpleTable(
      [{ label: 'Tag' }, { label: 'n', num: true }, { label: 'Win rate', num: true }, { label: 'Avg R', num: true }, { label: 'Net', num: true }],
      tagRows.map(function (r) {
        return [
          { v: '<span class="badge b-tag">' + esc(r.k) + '</span>' },
          { v: r.s.n },
          { v: r.s.wr == null ? '—' : (r.s.wr * 100).toFixed(0) + '%', cls: r.s.wr >= 0.5 ? 'pos' : '' },
          { v: fmtR(r.s.avgR), cls: cls(r.s.avgR) },
          { v: moneyOrDash(r.money), cls: cls(state.currency === 'ALL' ? r.s.totalR : r.s.net) }
        ];
      })
    );

    /* per symbol */
    var symGroups = groupStats(list, function (t) { return [t.symbol || '(kosong)']; });
    var symRows = Object.keys(symGroups).map(function (k) {
      var g = symGroups[k], s = stats(g);
      return { k: k, s: s, money: groupNet(g) };
    }).sort(function (a, b) { return b.s.n - a.s.n; }).slice(0, 10);
    var symHint = $('#anSymbolsHint');
    if (symHint) symHint.textContent = Object.keys(symGroups).length + ' simbol · urut jumlah trade';
    $('#anSymbols').innerHTML = simpleTable(
      [{ label: 'Simbol' }, { label: 'n', num: true }, { label: 'Win', num: true }, { label: 'Avg R', num: true }, { label: 'Net', num: true }],
      symRows.map(function (r) {
        return [
          { v: '<span class="t-sym">' + esc(r.k) + '</span>' },
          { v: r.s.n },
          { v: r.s.wins + '/' + r.s.n },
          { v: fmtR(r.s.avgR), cls: cls(r.s.avgR) },
          { v: moneyOrDash(r.money), cls: cls(state.currency === 'ALL' ? r.s.totalR : r.s.net) }
        ];
      })
    );

    /* per weekday */
    var dow = [0, 0, 0, 0, 0, 0, 0];
    list.filter(isClosed).forEach(function (t) {
      var d = new Date(t.exitDate || t.entryDate);
      if (isNaN(d.getTime())) return;
      var i = (d.getDay() + 6) % 7; // Monday first
      dow[i] += calc(t).net;
    });
    $('#anDow').innerHTML = barsFrom(DOW.map(function (d, i) { return [d, dow[i]]; }),
      function (v) { return fmtCompact(v, state.currency === 'ALL' ? 'IDR' : state.currency, true); }, true);

    /* long vs short */
    var sides = ['long', 'short'];
    var sideRows = sides.map(function (sd) {
      var g = list.filter(function (t) { return (t.side || 'long') === sd; });
      var s = stats(g);
      return [
        { v: '<span class="badge b-' + sd + '">' + sd + '</span>' },
        { v: s.n },
        { v: s.wr == null ? '—' : (s.wr * 100).toFixed(0) + '%' },
        { v: fmtR(s.avgR), cls: cls(s.avgR) },
        { v: moneyOrDash(groupNet(g)), cls: cls(state.currency === 'ALL' ? s.totalR : s.net) }
      ];
    });
    $('#anSide').innerHTML = simpleTable(
      [{ label: 'Arah' }, { label: 'n', num: true }, { label: 'Win rate', num: true }, { label: 'Avg R', num: true }, { label: 'Net', num: true }],
      sideRows
    );

    /* emotion */
    var emoGroups = groupStats(list, function (t) { return [t.emotion || '(tidak diisi)']; });
    var emoRows = Object.keys(emoGroups).map(function (k) {
      var g = emoGroups[k], s = stats(g);
      return { k: k, s: s, money: groupNet(g) };
    }).sort(function (a, b) { return b.s.n - a.s.n; });
    $('#anEmotion').innerHTML = simpleTable(
      [{ label: 'Psikologi' }, { label: 'n', num: true }, { label: 'Win', num: true }, { label: 'Avg R', num: true }, { label: 'Net', num: true }],
      emoRows.map(function (r) {
        return [
          { v: esc(r.k) },
          { v: r.s.n },
          { v: r.s.wr == null ? '—' : (r.s.wr * 100).toFixed(0) + '%' },
          { v: fmtR(r.s.avgR), cls: cls(r.s.avgR) },
          { v: moneyOrDash(r.money), cls: cls(state.currency === 'ALL' ? r.s.totalR : r.s.net) }
        ];
      })
    );
  }

  /* ---------------- trades table ---------------- */
  var SORTABLE = {
    date: 'Tanggal', market: 'Market', symbol: 'Simbol', side: 'Arah',
    qty: 'Qty', entry: 'Entry', exit: 'Exit', pl: 'Net P/L', r: 'R', tag: 'Tag'
  };

  function thSort(label, key, isNum) {
    var parts = String(state.filters.sort || 'date-desc').split('-');
    var dir = parts[0] === key ? parts[1] : '';
    var ariaSort = dir === 'asc' ? ' aria-sort="ascending"' : dir === 'desc' ? ' aria-sort="descending"' : '';
    return '<th class="sortable' + (isNum ? ' num' : '') + '"' + ariaSort + '>' +
      '<button type="button" data-sortkey="' + key + '">' + esc(label) +
      (dir ? '<span class="sort-arrow" aria-hidden="true">' + (dir === 'asc' ? '\u25b2' : '\u25bc') + '</span>' : '') +
      '</button></th>';
  }

  function rowActions(t) {
    return '<div class="row-actions">' +
      '<button class="icon-btn" type="button" data-edit="' + t.id + '" aria-label="Edit trade ' + esc(t.symbol) + '" title="Edit">' + icon('edit', 'sm') + '</button>' +
      '<button class="icon-btn danger" type="button" data-del="' + t.id + '" aria-label="Hapus trade ' + esc(t.symbol) + '" title="Hapus">' + icon('trash', 'sm') + '</button></div>';
  }

  function tradeRow(t, compact) {
    var c = calc(t);
    var dateCell = compact
      ? '<span class="t-date">' + esc(fmtDate(t.exitDate || t.entryDate)) + '</span>'
      : '<span class="t-date">' + esc(fmtDate(t.entryDate)) + (c.closed ? ' \u2192 ' + esc(fmtDate(t.exitDate)) : '') + '</span>' +
        (c.days != null ? '<div class="t-sub">' + (c.days < 1 ? Math.round(c.days * 24) + ' jam' : c.days.toFixed(1) + ' hari') + '</div>' : '');
    var u = !c.closed ? unrealized(t) : null;
    var pl = c.closed
      ? '<span class="' + cls(c.net) + '">' + fmtMoney(c.net, t.currency) + '</span><div class="t-sub ' + cls(c.net) + '">' + fmtPct(c.pct) + '</div>'
      : (u
        ? '<span class="' + cls(u.pnl) + '">' + fmtMoney(u.pnl, t.currency) + '</span><div class="t-sub ' + cls(u.pnl) + '">berjalan ' + fmtPct(u.pct) + '</div>'
        : '<span class="badge b-open">open</span>');
    var tagCell = (t.tags || []).slice(0, 2).map(function (g) { return '<span class="badge b-tag">' + esc(g) + '</span>'; }).join(' ') || '<span class="flat">\u2014</span>';
    var act = rowActions(t);

    if (compact) {
      return '<tr><td>' + dateCell + '</td>' +
        '<td><span class="t-sym">' + esc(t.symbol) + '</span></td>' +
        '<td>' + sideBadge(t) + '</td>' +
        '<td class="num">' + pl + '</td>' +
        '<td class="num">' + fmtR(c.r) + '</td>' +
        '<td>' + act + '</td></tr>';
    }
    return '<tr>' +
      '<td>' + dateCell + '</td>' +
      '<td>' + marketBadge(t) + '</td>' +
      '<td><span class="t-sym">' + esc(t.symbol) + '</span>' + (t.notes ? '<div class="t-sub" title="' + esc(t.notes) + '">' + esc(String(t.notes).slice(0, 42)) + (String(t.notes).length > 42 ? '\u2026' : '') + '</div>' : '') + '</td>' +
      '<td>' + sideBadge(t) + '</td>' +
      '<td class="num">' + (c.qty ? c.qty.toLocaleString('id-ID') : '\u2014') + '</td>' +
      '<td class="num">' + (c.entry ? c.entry.toLocaleString('id-ID') : '\u2014') + '</td>' +
      '<td class="num">' + (c.closed ? c.exit.toLocaleString('id-ID') : '\u2014') + '</td>' +
      '<td class="num">' + pl + '</td>' +
      '<td class="num">' + fmtR(c.r) + '</td>' +
      '<td>' + tagCell + '</td>' +
      '<td>' + act + '</td></tr>';
  }

  function renderFilterSummary(list) {
    var host = $('#filterSummary');
    if (!host) return;
    var chips = [];
    chips.push('<span class="chip">' + (state.currency === 'ALL' ? 'semua mata uang' : state.currency) + '</span>');
    if (state.filters.market) chips.push('<span class="chip">' + (state.filters.market === 'stock' ? 'saham idx' : 'crypto') + '</span>');
    if (state.filters.status) chips.push('<span class="chip">status: ' + esc(state.filters.status) + '</span>');
    if (state.filters.tag) chips.push('<span class="chip">tag: ' + esc(state.filters.tag) + '</span>');
    if (state.filters.q) chips.push('<span class="chip">cari: ' + esc(state.filters.q) + '</span>');
    var closedN = list.filter(isClosed).length;
    host.innerHTML = 'Menampilkan <b>' + list.length + '</b> dari ' + state.trades.length + ' trade · ' +
      closedN + ' close · ' + (list.length - closedN) + ' open ' + chips.join('');
  }

  function renderTradesTable() {
    var list = visibleTrades();
    var host = $('#tradesTable');
    renderFilterSummary(list);
    if (!list.length) {
      host.innerHTML = emptyBlock('Belum ada trade yang cocok', 'Ubah filter, atau tekan \u201cTrade baru\u201d untuk mencatat transaksi pertama kamu.');
    } else {
      host.innerHTML = '<table>' +
        '<caption class="sr-only">Daftar transaksi, ' + list.length + ' baris. Klik judul kolom untuk mengurutkan.</caption>' +
        '<thead><tr>' +
        thSort('Tanggal', 'date') + thSort('Market', 'market') + thSort('Simbol', 'symbol') + thSort('Arah', 'side') +
        thSort('Qty', 'qty', true) + thSort('Entry', 'entry', true) + thSort('Exit', 'exit', true) +
        thSort('Net P/L', 'pl', true) + thSort('R', 'r', true) + thSort('Tag', 'tag') +
        '<th class="th-plain">Aksi</th>' +
        '</tr></thead><tbody>' + list.map(function (t) { return tradeRow(t, false); }).join('') + '</tbody></table>';
    }
    $('#filteredKpis').innerHTML = kpiSet(scopedTrades());
  }

  function renderRecent() {
    var list = scopedTrades().filter(isClosed).slice(0, 8);
    var host = $('#recentTable');
    var openN = state.trades.filter(function (t) { return !isClosed(t); }).length;
    if (!list.length) {
      host.innerHTML = emptyBlock('Belum ada trade yang ditutup',
        openN ? 'Kamu punya ' + openN + ' posisi terbuka. Isi harga exit untuk melihat rekapnya di sini.' : 'Tekan \u201cTrade baru\u201d (atau tombol N) untuk mulai mencatat.');
      return;
    }
    host.innerHTML = '<table>' +
      '<caption class="sr-only">Delapan trade terakhir yang sudah ditutup.</caption>' +
      '<thead><tr><th>Tanggal close</th><th>Simbol</th><th>Arah</th><th>Status</th><th class="num">Net P/L</th><th class="num">R</th><th class="th-plain">Aksi</th></tr></thead><tbody>' +
      list.map(function (t) {
        var c = calc(t);
        return '<tr>' +
          '<td><span class="t-date">' + esc(fmtDate(t.exitDate)) + '</span></td>' +
          '<td><span class="t-sym">' + esc(t.symbol) + '</span></td>' +
          '<td>' + sideBadge(t) + '</td>' +
          '<td><span class="badge ' + (c.net > 0 ? 'b-long' : c.net < 0 ? 'b-short' : '') + '">' + (c.net > 0 ? 'profit' : c.net < 0 ? 'loss' : 'impas') + '</span></td>' +
          '<td class="num"><span class="' + cls(c.net) + '">' + fmtMoney(c.net, t.currency) + '</span><div class="t-sub ' + cls(c.net) + '">' + fmtPct(c.pct) + '</div></td>' +
          '<td class="num">' + fmtR(c.r) + '</td>' +
          '<td>' + rowActions(t) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderOpen() {
    var open = state.trades.filter(function (t) { return !isClosed(t); });
    if (state.currency !== 'ALL') open = open.filter(function (t) { return (t.currency || 'IDR') === state.currency; });
    $('#openCount').textContent = open.length + ' posisi';
    var host = $('#openList');
    if (!open.length) {
      host.innerHTML = emptyBlock('Tidak ada posisi terbuka', 'Posisi yang belum diisi harga exit akan muncul di sini beserta P/L berjalan dan risiko ke stop loss.');
      renderPriceStatus();
      return;
    }
    host.innerHTML = open.map(function (t) {
      var c = calc(t);
      var u = unrealized(t);
      var stop = num(t.stop);
      var stopDist = (stop && c.entry) ? ((Math.abs(c.entry - stop) / c.entry) * 100).toFixed(1) + '%' : null;
      var riskTxt = c.risk ? fmtMoney(c.risk, t.currency) : null;
      var pxLine;
      if (u) {
        pxLine = '<span class="pos-px">' + fmtMoney(u.px, t.currency) + '</span>' +
          '<span class="' + cls(u.pnl) + '">' + fmtMoney(u.pnl, t.currency) + ' (' + fmtPct(u.pct) + ')</span>' +
          (u.r != null ? '<span class="' + cls(u.r) + '">' + fmtR(u.r) + '</span>' : '') +
          '<span class="flat">' + (u.manual ? 'manual' : u.src + ' · ' + priceAge(u.ts)) + '</span>';
      } else {
        pxLine = '<span class="flat">harga belum ada</span>' +
          '<span class="pos-manual">' +
          '<label class="sr-only" for="mp-' + t.id + '">Harga manual ' + esc(t.symbol) + '</label>' +
          '<input id="mp-' + t.id + '" class="pos-manual-input num" type="number" step="any" min="0" inputmode="decimal" placeholder="isi harga" data-setprice="' + t.id + '">' +
          '</span>';
      }
      return '<div class="pos-row">' +
        '<div class="pos-main">' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<span class="t-sym">' + esc(t.symbol) + '</span>' + marketBadge(t) + sideBadge(t) +
        (num(t.manualPrice) > 0 ? '<button class="icon-btn" type="button" data-clearprice="' + t.id + '" aria-label="Hapus harga manual ' + esc(t.symbol) + '" title="Pakai harga otomatis lagi">' + icon('close', 'sm') + '</button>' : '') +
        '</div>' +
        '<div class="pos-risk">' +
        '<span>entry ' + c.entry.toLocaleString('id-ID') + ' × ' + c.qty.toLocaleString('id-ID') + '</span>' +
        '<span>' + fmtMoney(c.invested, t.currency) + '</span>' +
        (riskTxt ? '<span class="neg">risiko ' + riskTxt + (stopDist ? ' (' + stopDist + ')' : '') + '</span>' : '<span class="neg">tanpa stop loss</span>') +
        '<span>' + esc(fmtDate(t.entryDate)) + '</span>' +
        '</div>' +
        '<div class="pos-risk pos-live">' + pxLine + '</div>' +
        '</div>' +
        '<button class="btn btn-sm" type="button" data-close="' + t.id + '">Tutup posisi</button></div>';
    }).join('');
    renderPriceStatus();
  }

  /* ---------------- insights ---------------- */
  function renderInsights() {
    var list = scopedTrades();
    var closed = list.filter(isClosed);
    var out = [];
    if (closed.length < 3) {
      $('#dashInsight').innerHTML = emptyBlock('Butuh lebih banyak data', 'Setelah ±5 trade closed, bagian ini mulai menyoroti pola yang merugikan kamu.');
      return;
    }
    var s = stats(list);

    // worst / best tag
    var tagGroups = groupStats(list, function (t) { return (t.tags && t.tags.length ? t.tags : ['(tanpa tag)']); });
    var tagPerf = Object.keys(tagGroups).map(function (k) {
      var g = tagGroups[k], st = stats(g);
      return { k: k, st: st, net: st.net, n: st.n };
    }).filter(function (x) { return x.n >= 2; });
    if (tagPerf.length >= 2) {
      tagPerf.sort(function (a, b) { return a.net - b.net; });
      var worst = tagPerf[0], best = tagPerf[tagPerf.length - 1];
      if (worst.net < 0) {
        out.push('Setup <b>' + esc(worst.k) + '</b> paling merugikan: ' + worst.st.n + ' trade, win rate ' +
          (worst.st.wr * 100).toFixed(0) + '%, net ' + fmtMoney(worst.net, state.currency === 'ALL' ? 'IDR' : state.currency) +
          '. Pertimbangkan pause atau perkecil size untuk setup ini.');
      }
      if (best.net > 0) {
        out.push('Setup <b>' + esc(best.k) + '</b> paling produktif: ' + best.st.n + ' trade, avg R ' + fmtR(best.st.avgR) + '.');
      }
    }

    // stop loss discipline
    var noStop = closed.filter(function (t) { return num(t.stop) == null; }).length;
    if (noStop > 0) {
      out.push('<b>' + noStop + ' dari ' + closed.length + ' trade</b> tidak mencatat stop loss, jadi R multiple-nya tidak terhitung. Tanpa stop, risiko per trade tidak bisa dievaluasi.');
    }

    // overtrading
    var perDay = {};
    list.forEach(function (t) {
      var d = (t.entryDate || '').slice(0, 10);
      if (d) perDay[d] = (perDay[d] || 0) + 1;
    });
    var maxDay = 0, maxDate = '';
    Object.keys(perDay).forEach(function (d) { if (perDay[d] > maxDay) { maxDay = perDay[d]; maxDate = d; } });
    if (maxDay >= 4) {
      out.push('Hari tersibuk: <b>' + maxDay + ' entry</b> pada ' + fmtDate(maxDate) + '. Cek apakah hari itu overtrading atau memang banyak setup valid.');
    }

    // emotion
    var fomo = list.filter(function (t) { return /fomo|revenge|bosan/i.test(t.emotion || ''); });
    var calm = list.filter(function (t) { return /disiplin|tenang/i.test(t.emotion || ''); });
    if (fomo.length >= 2 && calm.length >= 2) {
      var fs = stats(fomo), cs = stats(calm);
      if (fs.net < cs.net) {
        out.push('Trade berlabel emosi (FOMO/revenge/bosan): ' + fs.n + ' trade, win rate ' + (fs.wr * 100).toFixed(0) +
          '% vs ' + (cs.wr * 100).toFixed(0) + '% saat disiplin. Ini sumber kebocoran modal yang paling jelas.');
      }
    }

    // biggest loss vs avg
    if (s.n > 3 && s.avgLoss > 0) {
      var ratio = Math.abs(s.worst) / s.avgLoss;
      if (ratio > 2) {
        out.push('Loss terbesar (' + fmtMoney(s.worst, state.currency === 'ALL' ? 'IDR' : state.currency) + ') = <b>' + ratio.toFixed(1) + '×</b> rata-rata loss. Satu trade buruk menghapus banyak trade bagus — cek disiplin cut loss.');
      }
    }

    // streak
    if (s.streak.curLoss >= 3) {
      out.push('Sedang <b>' + s.streak.curLoss + ' loss beruntun</b>. Aturan umum: kurangi size 50% sampai ada 2 win berturut.');
    }

    $('#dashInsight').innerHTML = out.length
      ? '<ul style="margin:0;padding-left:18px;display:grid;gap:9px;font-size:13px;color:var(--ink-2);line-height:1.55">' +
        out.slice(0, 5).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'
      : '<p style="margin:0;font-size:13px;color:var(--muted)">Belum ada pola mencolok. Data masih terlalu rapi untuk dikritik.</p>';
  }

  /* ---------------- journal ---------------- */
  var MOODS = ['Tenang & sesuai plan', 'Terlalu percaya diri', 'FOMO / buru-buru', 'Ragu & telat masuk', 'Revenge trading', 'Disiplin walau loss'];

  function renderJournal() {
    var list = state.journal.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var host = $('#journalList');
    if (!list.length) {
      host.innerHTML = emptyBlock('Jurnal masih kosong', 'Tulis review pertama kamu di form atas. Jurnal yang berguna: apa yang terjadi, apa yang kamu lakukan, apa yang harus diubah.');
      return;
    }
    host.innerHTML = list.map(function (j) {
      return '<article class="entry">' +
        '<div class="entry-top"><time>' + esc(fmtDate(j.date)) + '</time>' +
        '<span class="mood">' + esc(j.mood || '') + '</span>' +
        '<div class="spacer" style="flex:1"></div>' +
        '<div class="row-actions">' +
        '<button class="icon-btn" data-jedit="' + j.id + '" title="Edit">✎</button>' +
        '<button class="icon-btn danger" data-jdel="' + j.id + '" title="Hapus">✕</button></div></div>' +
        (j.title ? '<div style="font-size:13.5px;font-weight:600;margin-bottom:5px">' + esc(j.title) + '</div>' : '') +
        (j.body ? '<p>' + esc(j.body) + '</p>' : '') +
        (j.lesson ? '<div class="lesson"><b>pelajaran</b>' + esc(j.lesson) + '</div>' : '') +
        '</article>';
    }).join('');
  }

  /* ---------------- profiles UI ---------------- */
  function renderProfileUI() {
    var p = activeProfile();
    if (!p) return;
    var name = p.name || 'Profil';
    $('#profileName').textContent = name;
    $('#profileStat').textContent = state.trades.length + ' trade · ' + state.profiles.length + ' profil';
    $('#profileAvatar').textContent = name.trim().charAt(0).toUpperCase();
  }

  function renderProfileList() {
    var host = $('#profileList');
    if (!host) return;
    host.innerHTML = state.profiles.map(function (p) {
      var active = p.id === state.activeProfileId;
      var count = active ? state.trades.length : (p.trades || []).length;
      var initial = (p.name || '?').trim().charAt(0).toUpperCase();
      return '<div class="profile-row' + (active ? ' is-active' : '') + '">' +
        '<span class="avatar" aria-hidden="true">' + esc(initial) + '</span>' +
        '<div class="profile-row-main">' +
        '<label class="t-sub" for="pn-' + p.id + '" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase">nama &middot; klik untuk ganti</label>' +
        '<input class="profile-name-input" id="pn-' + p.id + '" value="' + esc(p.name) + '" data-prename="' + p.id + '" autocomplete="off">' +
        '<span class="t-sub">' + count + ' trade' + (active ? ' · sedang dipakai' : '') + '</span>' +
        '</div>' +
        (active
          ? '<span class="badge b-long">' + icon('check', 'sm') + ' aktif</span>'
          : '<button class="btn btn-sm" type="button" data-pswitch="' + p.id + '">Pakai</button>') +
        '<button class="icon-btn" type="button" data-prename-btn="' + p.id + '" aria-label="Ganti nama profil ' + esc(p.name) + '" title="Ganti nama">' + icon('edit', 'sm') + '</button>' +
        '<button class="icon-btn danger" type="button" data-pdel="' + p.id + '"' +
        (state.profiles.length < 2 ? ' disabled' : '') +
        ' aria-label="Hapus profil ' + esc(p.name) + ' secara permanen" title="Hapus profil">' + icon('trash', 'sm') + '</button>' +
        '</div>';
    }).join('');
  }

  function openProfileModal() {
    renderProfileList();
    $('#profileModal').classList.add('is-open');
    $('#btnProfile').setAttribute('aria-expanded', 'true');
    setFieldError('#newProfileName', '');
    setTimeout(function () {
      var panel = $('#profileModal .modal-panel');
      if (panel) { panel.setAttribute('tabindex', '-1'); panel.focus(); }
    }, 30);
  }
  function closeProfileModal() {
    $('#profileModal').classList.remove('is-open');
    $('#btnProfile').setAttribute('aria-expanded', 'false');
  }

  /* ---------------- main render ---------------- */
  var TITLES = {
    dash: ['Dashboard', 'ringkasan performa'],
    trades: ['Transaksi', 'semua catatan trade'],
    analytics: ['Analitik', 'apa yang benar-benar menghasilkan'],
    journal: ['Jurnal', 'review harian & psikologi'],
    settings: ['Pengaturan', 'fee, data, backup']
  };

  var announcedView = '';

  function setView(v, push) {
    if (!TITLES[v]) v = 'dash';
    state.view = v;
    if (push) {
      try { history.replaceState(null, '', '#' + v); } catch (e) { }
    }
    renderAll();
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { }
  }


  function renderAll() {
    var t = TITLES[state.view] || TITLES.dash;
    $('#viewTitle').textContent = t[0];
    $('#viewCrumb').textContent = t[1];
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + state.view); });
    $$('#nav button').forEach(function (b) { b.setAttribute('aria-current', String(b.dataset.view === state.view)); });
    $$('#curSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cur === state.currency)); });
    document.body.classList.toggle('hide-money', state.hideMoney);
    
    renderProfileUI();
    renderProfileList();

    // eye toggle: state exposed to assistive tech
    var eye = $('#btnEye');
    eye.setAttribute('aria-pressed', String(state.hideMoney));
    var eyeLabel = state.hideMoney ? 'Tampilkan nominal' : 'Sembunyikan nominal';
    eye.setAttribute('aria-label', eyeLabel);
    eye.setAttribute('title', eyeLabel);
    var useEl = eye.querySelector('use');
    if (useEl) useEl.setAttribute('href', state.hideMoney ? '#i-eye-off' : '#i-eye');

    // announce view change for screen readers
    if (announcedView !== state.view) {
      announcedView = state.view;
      $('#srView').textContent = 'Halaman ' + t[0] + ' dibuka.';
    }

    // sort select mirrors the sortable headers
    var sortSel = $('#fSort');
    if (sortSel) {
      var curSort = state.filters.sort || 'date-desc';
      var okSort = Object.keys(SORTABLE).some(function (k) { return curSort === k + '-asc' || curSort === k + '-desc'; });
      if (!okSort) { state.filters.sort = 'date-desc'; curSort = 'date-desc'; }
      sortSel.innerHTML = Object.keys(SORTABLE).map(function (k) {
        return '<option value="' + k + '-desc">' + esc(SORTABLE[k]) + ' \u2193</option>' +
          '<option value="' + k + '-asc">' + esc(SORTABLE[k]) + ' \u2191</option>';
      }).join('');
      sortSel.value = curSort;
    }

    var scoped = scopedTrades();
    $('#dashKpis').innerHTML = kpiSet(scoped);
    renderEquity(scoped);
    renderMonthly(scoped);
    renderRecent();
    renderOpen();
    renderInsights();
    renderTradesTable();
    renderAnalytics();
    renderJournal();

    var all = stats(state.trades.filter(function (t2) {
      return state.currency === 'ALL' ? true : (t2.currency || 'IDR') === state.currency;
    }));
    $('#sideNet').innerHTML = '<span class="' + cls(all.net) + '">' + (all.n ? moneyLabel(state.trades.filter(function (t2) {
      return state.currency === 'ALL' ? true : (t2.currency || 'IDR') === state.currency;
    })) : '—') + '</span>';
    $('#sideCount').textContent = state.trades.length;

    // tag filter options
    var tags = {};
    state.trades.forEach(function (t2) { (t2.tags || []).forEach(function (g) { tags[g] = 1; }); });
    var sel = $('#fTag'), cur = state.filters.tag;
    sel.innerHTML = '<option value="">Semua</option>' + Object.keys(tags).sort().map(function (g) {
      return '<option value="' + esc(g) + '"' + (g === cur ? ' selected' : '') + '>' + esc(g) + '</option>';
    }).join('');
  }

  /* ---------------- trade modal ---------------- */
  function nowLocal(offsetMin) {
    var d = new Date(Date.now() - (offsetMin || 0) * 60000);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openTradeModal(trade) {
    state.editTrade = trade ? trade.id : null;
    $('#tradeModalTitle').textContent = trade ? 'Edit trade — ' + trade.symbol : 'Trade baru';
    $('#btnDeleteTrade').style.display = trade ? 'inline-flex' : 'none';
    $('#tSymbol').value = trade ? trade.symbol : '';
    $('#tMarket').value = trade ? trade.market : 'stock';
    $('#tSide').value = trade ? (trade.side || 'long') : 'long';
    $('#tCurrency').value = trade ? (trade.currency || 'IDR') : (state.currency === 'USD' ? 'USD' : 'IDR');
    $('#tQty').value = trade ? trade.qty : '';
    $('#tEntry').value = trade ? trade.entry : '';
    $('#tStop').value = trade && trade.stop != null ? trade.stop : '';
    $('#tTarget').value = trade && trade.target != null ? trade.target : '';
    $('#tEntryDate').value = trade ? (trade.entryDate || nowLocal()) : nowLocal();
    $('#tExitDate').value = trade ? (trade.exitDate || '') : '';
    $('#tExit').value = trade && trade.exit != null ? trade.exit : '';
    $('#tFee').value = trade && trade.fee != null ? trade.fee : '';
    $('#tTags').value = trade ? (trade.tags || []).join(', ') : '';
    $('#tEmotion').value = trade ? (trade.emotion || '') : '';
    $('#tAutoFee').checked = trade ? trade.autoFee !== false : true;
    $('#tNotes').value = trade ? (trade.notes || '') : '';
    clearFieldErrors();
    updateFeeState();
    updatePreview();
    $('#tradeModal').classList.add('is-open');
    setTimeout(function () { $('#tSymbol').focus(); }, 30);
  }

  function closeTradeModal() {
    $('#tradeModal').classList.remove('is-open');
    state.editTrade = null;
  }

  function updateFeeState() {
    var auto = $('#tAutoFee').checked;
    var fee = $('#tFee');
    fee.disabled = auto;
    fee.style.opacity = auto ? '0.55' : '1';
    fee.placeholder = auto ? 'otomatis dari %' : 'isi manual';
  }

  function draftTrade() {
    return {
      id: state.editTrade || 'draft',
      market: $('#tMarket').value,
      symbol: $('#tSymbol').value.trim().toUpperCase(),
      side: $('#tSide').value,
      currency: $('#tCurrency').value,
      qty: num($('#tQty').value),
      entry: num($('#tEntry').value),
      stop: num($('#tStop').value),
      target: num($('#tTarget').value),
      entryDate: $('#tEntryDate').value,
      exitDate: $('#tExitDate').value,
      exit: num($('#tExit').value),
      fee: num($('#tFee').value),
      autoFee: $('#tAutoFee').checked,
      tags: $('#tTags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      emotion: $('#tEmotion').value,
      notes: $('#tNotes').value
    };
  }

  function updatePreview() {
    var t = draftTrade();
    var c = calc(t);
    var cur = t.currency || 'IDR';
    var html = '';
    html += '<div class="pv"><span class="l">Nilai posisi</span><span class="v">' + (c.invested ? fmtMoney(c.invested, cur) : '—') + '</span></div>';
    html += '<div class="pv"><span class="l">Fee</span><span class="v">' + (c.fee ? fmtMoney(c.fee, cur) : '—') + '</span></div>';
    html += '<div class="pv"><span class="l">Risiko (ke stop)</span><span class="v">' + (c.risk ? fmtMoney(c.risk, cur) : '—') + '</span></div>';
    html += '<div class="pv"><span class="l">Net P/L</span><span class="v ' + cls(c.net) + '">' + (c.closed ? fmtMoney(c.net, cur) : '—') + '</span></div>';
    html += '<div class="pv"><span class="l">Return</span><span class="v ' + cls(c.net) + '">' + (c.pct != null ? fmtPct(c.pct) : '—') + '</span></div>';
    html += '<div class="pv"><span class="l">R multiple</span><span class="v ' + cls(c.r) + '">' + fmtR(c.r) + '</span></div>';
    $('#tradePreview').innerHTML = html;
  }

  function saveTrade(e) {
    e.preventDefault();
    clearFieldErrors();
    var t = draftTrade();
    var firstBad = null;

    if (!t.symbol) { setFieldError('#tSymbol', 'Simbol wajib diisi (misal BBCA atau BTCUSDT).'); firstBad = firstBad || '#tSymbol'; }
    if (!t.qty || t.qty <= 0) { setFieldError('#tQty', 'Qty harus angka lebih dari 0.'); firstBad = firstBad || '#tQty'; }
    if (!t.entry || t.entry <= 0) { setFieldError('#tEntry', 'Harga entry harus lebih dari 0.'); firstBad = firstBad || '#tEntry'; }
    if (t.exit != null && t.exitDate && t.entryDate && new Date(t.exitDate) < new Date(t.entryDate)) {
      setFieldError('#tExitDate', 'Tanggal exit lebih awal dari tanggal entry.');
      firstBad = firstBad || '#tExitDate';
    }
    if (firstBad) {
      $(firstBad).focus();
      toast('Ada isian yang perlu dibetulkan.');
      return;
    }
    if (t.exit != null && !t.exitDate) {
      t.exitDate = nowLocal();
      $('#tExitDate').value = t.exitDate;
    }

    if (state.editTrade) {
      var i2 = state.trades.findIndex(function (x) { return x.id === state.editTrade; });
      if (i2 >= 0) { t.id = state.editTrade; state.trades[i2] = t; }
      toast('Trade ' + t.symbol + ' diperbarui.');
    } else {
      t.id = uid();
      t.createdAt = new Date().toISOString();
      state.trades.push(t);
      toast('Trade ' + t.symbol + ' dicatat.');
    }
    save();
    closeTradeModal();
    renderAll();

    /* harga live: hanya kalau posisi ini belum punya quote yang masih segar */
    if (!isClosed(t) && canQuote(t) && !(num(t.manualPrice) > 0)) {
      var qk = quoteKey(t);
      var cached = qk ? state.prices.quotes[qk] : null;
      if (!cached || (Date.now() - (cached.ts || 0)) > PRICE_TTL) {
        setTimeout(function () { refreshPrices(true); }, 60);
      }
    }
  }

  function deleteTrade(id) {
    var idx = state.trades.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return;
    var t = state.trades[idx];
    if (!confirm('Hapus trade ' + t.symbol + ' (' + fmtDate(t.entryDate) + ')? Bisa dibatalkan lewat tombol Undo.')) return;
    state.trades.splice(idx, 1);
    save(); renderAll();
    toast('Trade ' + t.symbol + ' dihapus.', {
      action: 'Undo',
      onAction: function () {
        state.trades.splice(idx, 0, t);
        save(); renderAll();
        toast('Trade ' + t.symbol + ' dikembalikan.');
      }
    });
  }

  /* ---------------- csv / backup ---------------- */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    var head = ['Tanggal Entry', 'Tanggal Exit', 'Market', 'Simbol', 'Arah', 'Qty', 'Harga Entry', 'Harga Exit', 'Stop Loss', 'Target', 'Fee', 'Net P/L', 'Return %', 'R', 'Mata Uang', 'Tag', 'Psikologi', 'Catatan'];
    var lines = [head.join(',')];
    visibleTrades().forEach(function (t) {
      var c = calc(t);
      lines.push([
        t.entryDate || '', t.exitDate || '', t.market, t.symbol, t.side || 'long', t.qty, t.entry,
        t.exit == null ? '' : t.exit, t.stop == null ? '' : t.stop, t.target == null ? '' : t.target,
        Math.round(c.fee * 100) / 100, c.closed ? Math.round(c.net * 100) / 100 : '',
        c.pct != null ? Math.round(c.pct * 100) / 100 : '', c.r != null ? Math.round(c.r * 100) / 100 : '',
        t.currency || 'IDR', (t.tags || []).join(' | '), t.emotion || '', t.notes || ''
      ].map(csvCell).join(','));
    });
    download('jurnal-' + new Date().toISOString().slice(0, 10) + '.csv', '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
    toast('CSV diexport.');
  }

  function exportJson() {
    syncProfile();
    var payload = {
      app: 'jurnal', version: 2, exportedAt: new Date().toISOString(),
      activeProfileId: state.activeProfileId,
      profiles: state.profiles
    };
    download('jurnal-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup ' + state.profiles.length + ' profil diexport.');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var d = null;
      try { d = JSON.parse(String(reader.result)); } catch (e) { d = null; }
      if (!d) { toast('File tidak valid — harus backup JSON dari app ini.'); return; }

      if (Array.isArray(d.profiles) && d.profiles.length) {
        if (!confirm('Import ' + d.profiles.length + ' profil? Semua profil yang ada sekarang akan DIGANTI.')) return;
        state.profiles = d.profiles;
        var idx = profileIndex(d.activeProfileId, d.profiles);
        loadProfileIntoState(idx >= 0 ? d.profiles[idx] : d.profiles[0]);
        resetFilters();
        save(); fillSettings(); renderAll(); renderProfileList();
        toast('Import selesai: ' + d.profiles.length + ' profil.');
        return;
      }

      if (Array.isArray(d.trades)) {
        var nm = 'Backup ' + new Date().toISOString().slice(0, 10);
        if (!confirm('Backup versi lama (tanpa profil). Import sebagai profil baru "' + nm + '"?')) return;
        syncProfile();
        var p = blankProfile(nm);
        p.trades = d.trades;
        p.journal = Array.isArray(d.journal) ? d.journal : [];
        p.settings = Object.assign(defaultSettings(), d.settings || {});
        p.currency = d.currency || 'IDR';
        state.profiles.push(p);
        loadProfileIntoState(p);
        resetFilters();
        save(); fillSettings(); renderAll(); renderProfileList();
        toast('Backup di-import sebagai profil baru.');
        return;
      }

      toast('File tidak dikenali — bukan backup dari app ini.');
    };
    reader.readAsText(file);
  }

  /* ---------------- sample data ---------------- */
  function sampleData() {
    var now = Date.now(), day = 86400000;
    var spec = [
      // [days ago, market, symbol, side, qty, entry, stop, exit, currency, tags, emotion, notes]
      [74, 'stock', 'BBCA', 'long', 500, 9550, 9300, 10200, 'IDR', ['swing', 'pullback'], 'Disiplin / sesuai plan', 'Beli di support MA20 setelah konsolidasi 3 hari, exit di resistance.'],
      [71, 'stock', 'GOTO', 'long', 5000, 62, 58, 55, 'IDR', ['breakout', 'momentum'], 'FOMO', 'Masuk karena ramai di timeline, bukan karena setup. Salah.'],
      [68, 'crypto', 'BTCUSDT', 'long', 0.05, 61200, 59500, 64800, 'USD', ['swing', 'pullback'], 'Disiplin / sesuai plan', 'Retest area support setelah breakout, hold 4 hari.'],
      [65, 'stock', 'ADRO', 'long', 300, 2450, 2380, 2610, 'IDR', ['breakout'], 'Tenang & sesuai plan', 'Volume naik 2x rata-rata saat breakout.'],
      [61, 'crypto', 'SOLUSDT', 'long', 4, 142.5, 138, 136.2, 'USD', ['scalping'], 'Overconfident', 'Size kebesaran, stop kena karena wick.'],
      [58, 'stock', 'ANTM', 'long', 1000, 1520, 1480, 1595, 'IDR', ['swing'], 'Disiplin / sesuai plan', ''],
      [55, 'crypto', 'ETHUSDT', 'short', 0.6, 3420, 3480, 3290, 'USD', ['breakout', 'short'], 'Tenang & sesuai plan', 'Lower high di TF 4H, entry setelah gagal reclaim.'],
      [52, 'stock', 'BBRI', 'long', 400, 4780, 4680, 4710, 'IDR', ['scalping'], 'Ragu', 'Ragu dari awal, cut loss cepat.'],
      [47, 'crypto', 'BTCUSDT', 'long', 0.03, 58900, 57800, 62400, 'USD', ['swing'], 'Disiplin / sesuai plan', ''],
      [44, 'stock', 'TLKM', 'long', 800, 3120, 3050, 3090, 'IDR', ['pullback'], 'FOMO', 'Chase setelah naik 4%, langsung balik.'],
      [41, 'stock', 'MDKA', 'long', 1500, 2210, 2150, 2380, 'IDR', ['breakout', 'momentum'], 'Tenang & sesuai plan', ''],
      [38, 'crypto', 'SOLUSDT', 'long', 5, 128.4, 124.5, 141.9, 'USD', ['swing', 'breakout'], 'Disiplin / sesuai plan', 'Hold 6 hari, trailing stop.'],
      [35, 'stock', 'GOTO', 'short', 3000, 58, 61, 63, 'IDR', ['short', 'scalping'], 'Revenge', 'Balas dendam habis loss sebelumnya. Rugi dua kali.'],
      [31, 'crypto', 'ETHUSDT', 'long', 0.5, 3180, 3090, 3245, 'USD', ['pullback'], 'Tenang & sesuai plan', ''],
      [27, 'stock', 'ASII', 'long', 400, 4920, 4840, 5010, 'IDR', ['swing'], 'Disiplin / sesuai plan', ''],
      [24, 'stock', 'INCO', 'long', 700, 3980, 3890, 3860, 'IDR', ['breakout'], 'FOMO', 'Breakout gagal, exit di stop.'],
      [20, 'crypto', 'BTCUSDT', 'short', 0.02, 66800, 68200, 65300, 'USD', ['short'], 'Tenang & sesuai plan', ''],
      [17, 'stock', 'BBCA', 'long', 300, 10100, 9900, 10550, 'IDR', ['swing', 'pullback'], 'Disiplin / sesuai plan', ''],
      [13, 'crypto', 'SOLUSDT', 'long', 3, 152.8, 147, 149.5, 'USD', ['scalping'], 'Bosan / iseng', 'Trade tanpa setup, cuma bosan.'],
      [10, 'stock', 'ADRO', 'long', 500, 2380, 2310, 2470, 'IDR', ['swing'], 'Tenang & sesuai plan', ''],
      [7, 'crypto', 'ETHUSDT', 'long', 0.4, 3290, 3210, 3480, 'USD', ['swing', 'pullback'], 'Disiplin / sesuai plan', ''],
      [4, 'stock', 'ANTM', 'long', 1200, 1610, 1565, 1580, 'IDR', ['breakout'], 'Ragu', ''],
      [2, 'crypto', 'BTCUSDT', 'long', 0.015, 64100, 63000, null, 'USD', ['swing'], 'Tenang & sesuai plan', 'Masih jalan, stop di 63.000.'],
      [1, 'stock', 'BBRI', 'long', 600, 4820, 4740, null, 'IDR', ['pullback'], 'Disiplin / sesuai plan', 'Posisi terbuka, target 5.100.']
    ];
    var trades = spec.map(function (s) {
      var entryTs = now - s[0] * day;
      var holdDays = 1 + Math.round(Math.random() * 4);
      var closeTs = s[7] == null ? null : entryTs + holdDays * day;
      return {
        id: uid(), market: s[1], symbol: s[2], side: s[3], currency: s[8],
        qty: s[4], entry: s[5], stop: s[6], target: null,
        entryDate: toLocal(entryTs), exitDate: closeTs ? toLocal(closeTs) : '',
        exit: s[7], fee: null, autoFee: true,
        tags: s[9], emotion: s[10], notes: s[11], createdAt: new Date(entryTs).toISOString()
      };
    });
    return trades;
  }

  function toLocal(ts) {
    var d = new Date(ts), pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function sampleJournal() {
    var now = Date.now(), day = 86400000;
    return [
      {
        id: uid(), date: new Date(now - 6 * day).toISOString().slice(0, 10),
        mood: 'FOMO / buru-buru', title: 'Masuk karena timeline, bukan karena chart',
        body: 'IHSG buka naik, saya buka 3 posisi dalam 20 menit hanya karena lihat orang posting profit. Tidak ada satu pun yang punya setup jelas.',
        lesson: 'Sebelum entry, tulis dulu alasan dan stop loss. Kalau tidak bisa, jangan entry.'
      },
      {
        id: uid(), date: new Date(now - 3 * day).toISOString().slice(0, 10),
        mood: 'Tenang & sesuai plan', title: 'Hari dengan eksekusi paling rapi',
        body: 'Hanya 1 trade, tunggu retest, size normal, exit di target. Hasilnya +2R dan tidak ada keinginan menambah posisi setelahnya.',
        lesson: 'Satu trade bagus lebih baik daripada lima trade iseng. Ulangi pola hari ini.'
      }
    ];
  }

  /* ---------------- settings bind ---------------- */
  function fillSettings() {
      $('#sFeeStockBuy').value = state.settings.feeStockBuy;
    $('#sFeeStockSell').value = state.settings.feeStockSell;
    $('#sFeeCryptoBuy').value = state.settings.feeCryptoBuy;
    $('#sFeeCryptoSell').value = state.settings.feeCryptoSell;
    $('#sLotSize').value = state.settings.lotSize;
  }

  /* ---------------- events ---------------- */
  function bind() {
    $$('#nav button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view, true); });
    });
    $$('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.goto, true); });
    });
    window.addEventListener('hashchange', function () {
      var v = (location.hash || '').replace('#', '');
      if (TITLES[v] && v !== state.view) setView(v, false);
    });
    $$('#curSeg button').forEach(function (b) {
      b.addEventListener('click', function () { state.currency = b.dataset.cur; save(); renderAll(); });
    });
    $('#btnEye').addEventListener('click', function () {
      state.hideMoney = !state.hideMoney; save(); renderAll();
      toast(state.hideMoney ? 'Nominal disembunyikan (hover untuk lihat).' : 'Nominal ditampilkan.');
    });

    $('#btnNew').addEventListener('click', function () { openTradeModal(null); });
    $('#btnCloseModal').addEventListener('click', closeTradeModal);
    $('#btnCancelModal').addEventListener('click', closeTradeModal);
    $('#tradeModal').addEventListener('click', function (e) { if (e.target.id === 'tradeModal') closeTradeModal(); });

    ['#tMarket', '#tSide', '#tQty', '#tEntry', '#tStop', '#tTarget', '#tExit', '#tCurrency', '#tAutoFee'].forEach(function (sel) {
      var el = $(sel);
      el.addEventListener('input', updatePreview);
      el.addEventListener('change', updatePreview);
    });
    $('#tAutoFee').addEventListener('change', function () { updateFeeState(); updatePreview(); });
    $('#tMarket').addEventListener('change', function () {
      if (!$('#tCurrency').dataset.touched) {
        $('#tCurrency').value = $('#tMarket').value === 'crypto' ? 'USD' : 'IDR';
      }
    });
    $('#tCurrency').addEventListener('change', function () { $('#tCurrency').dataset.touched = '1'; });
    $('#tradeForm').addEventListener('submit', saveTrade);
    $('#btnDeleteTrade').addEventListener('click', function () {
      if (state.editTrade) { var id = state.editTrade; closeTradeModal(); deleteTrade(id); }
    });

    // harga live: refresh manual + isi harga manual per posisi
    var rp = $('#btnRefreshPrices');
    if (rp) rp.addEventListener('click', function () { refreshPrices(true); });
    var rp2 = $('#btnRefreshPrices2');
    if (rp2) rp2.addEventListener('click', function () { refreshPrices(true); });

    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.dataset) return;
      if (el.dataset.setprice) {
        var t = state.trades.find(function (x) { return x.id === el.dataset.setprice; });
        if (!t) return;
        var v = num(el.value);
        if (v == null || v <= 0) { toast('Harga manual harus angka lebih dari 0.'); return; }
        t.manualPrice = v;
        t.manualAt = Date.now();
        save(); renderAll(); toast('Harga manual ' + t.symbol + ' disimpan.');
      }
    });

    // profil: buka/tutup + tambah + ganti nama
    $('#btnProfile').addEventListener('click', openProfileModal);
    $('#btnCloseProfile').addEventListener('click', closeProfileModal);
    $('#btnDoneProfile').addEventListener('click', closeProfileModal);
    $('#btnGoBackup').addEventListener('click', function () {
      closeProfileModal();
      setView('settings', true);
    });
    $('#profileModal').addEventListener('click', function (e) { if (e.target.id === 'profileModal') closeProfileModal(); });

    $('#profileForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#newProfileName');
      var name = input.value.trim();
      if (!name) { setFieldError('#newProfileName', 'Nama profil wajib diisi.'); input.focus(); return; }
      var dup = state.profiles.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); });
      if (dup) { setFieldError('#newProfileName', 'Nama ini sudah dipakai profil lain.'); input.focus(); return; }
      setFieldError('#newProfileName', '');
      input.value = '';
      addProfile(name);
    });

    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.dataset || !el.dataset.prename) return;
      var p = state.profiles[profileIndex(el.dataset.prename)];
      if (!p) return;
      var v = el.value.trim();
      if (!v) { el.value = p.name; toast('Nama profil tidak boleh kosong.'); return; }
      var dup = state.profiles.some(function (x) { return x.id !== p.id && x.name.toLowerCase() === v.toLowerCase(); });
      if (dup) { el.value = p.name; toast('Nama itu sudah dipakai profil lain.'); return; }
      p.name = v;
      save(); renderProfileUI(); renderProfileList();
      toast('Nama profil disimpan.');
    });

    // chart data-table fallback
    $('#btnEquityTable').addEventListener('click', function () {
      var host = $('#equityTable');
      var open = host.hidden;
      host.hidden = !open;
      this.setAttribute('aria-expanded', String(open));
      this.lastChild.textContent = open ? ' Sembunyikan data' : ' Lihat data';
    });

    // validate on blur (not on keystroke)
    ['#tSymbol', '#tQty', '#tEntry'].forEach(function (sel) {
      $(sel).addEventListener('blur', function () {
        var v = this.value.trim();
        if (sel === '#tSymbol' && !v) setFieldError(sel, 'Simbol wajib diisi.');
        else if (sel !== '#tSymbol' && (!v || Number(v) <= 0)) setFieldError(sel, 'Harus angka lebih dari 0.');
        else setFieldError(sel, '');
      });
    });

    // filters
    $('#fMarket').addEventListener('change', function () { state.filters.market = this.value; renderAll(); });
    $('#fStatus').addEventListener('change', function () { state.filters.status = this.value; renderAll(); });
    $('#fTag').addEventListener('change', function () { state.filters.tag = this.value; renderAll(); });
    $('#fSort').addEventListener('change', function () { state.filters.sort = this.value; renderAll(); });
    $('#fSearch').addEventListener('input', function () { state.filters.q = this.value; renderAll(); });
    $('#btnResetFilter').addEventListener('click', function () {
      state.filters = { market: '', status: '', tag: '', q: '', sort: 'date-desc' };
      $('#fMarket').value = ''; $('#fStatus').value = ''; $('#fTag').value = '';
      $('#fSort').value = 'date-desc'; $('#fSearch').value = '';
      renderAll();
    });
    $('#btnCsv').addEventListener('click', exportCsv);

    // delegated rows
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-edit],[data-del],[data-close],[data-jedit],[data-jdel],[data-sortkey],[data-pswitch],[data-pdel],[data-prename-btn],[data-clearprice]') : null;
      if (!el) return;
      if (el.dataset.clearprice) {
        var tc = state.trades.find(function (x) { return x.id === el.dataset.clearprice; });
        if (tc) {
          delete tc.manualPrice; delete tc.manualAt;
          save(); renderAll(); toast('Harga manual dihapus, pakai harga otomatis.');
        }
      } else if (el.dataset.prenameBtn) {
        var inp = $('#pn-' + el.dataset.prenameBtn);
        if (inp) { inp.focus(); inp.select(); }
      } else if (el.dataset.pswitch) {
        switchProfile(el.dataset.pswitch);
      } else if (el.dataset.pdel) {
        deleteProfile(el.dataset.pdel);
      } else if (el.dataset.sortkey) {
        var k = el.dataset.sortkey;
        var parts = String(state.filters.sort || 'date-desc').split('-');
        var dir = parts[0] === k && parts[1] === 'desc' ? 'asc' : 'desc';
        state.filters.sort = k + '-' + dir;
        renderAll();
      } else if (el.dataset.edit) {
        var t = state.trades.find(function (x) { return x.id === el.dataset.edit; });
        if (t) openTradeModal(t);
      } else if (el.dataset.del) {
        deleteTrade(el.dataset.del);
      } else if (el.dataset.close) {
        var t2 = state.trades.find(function (x) { return x.id === el.dataset.close; });
        if (t2) { openTradeModal(t2); $('#tExit').focus(); }
      } else if (el.dataset.jedit) {
        var j = state.journal.find(function (x) { return x.id === el.dataset.jedit; });
        if (j) {
          state.editJournal = j.id;
          $('#jDate').value = j.date || ''; $('#jMood').value = j.mood || MOODS[0];
          $('#jTitle').value = j.title || ''; $('#jBody').value = j.body || ''; $('#jLesson').value = j.lesson || '';
          $('#journalEditHint').textContent = 'mengedit jurnal ' + fmtDate(j.date);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (el.dataset.jdel) {
        if (!confirm('Hapus catatan jurnal ini?')) return;
        state.journal = state.journal.filter(function (x) { return x.id !== el.dataset.jdel; });
        save(); renderAll(); toast('Jurnal dihapus.');
      }
    });

    // journal form
    $('#journalForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {
        date: $('#jDate').value, mood: $('#jMood').value,
        title: $('#jTitle').value.trim(), body: $('#jBody').value.trim(), lesson: $('#jLesson').value.trim()
      };
      if (!d.date) { setFieldError('#jDate', 'Tanggal wajib diisi.'); $('#jDate').focus(); toast('Tanggal jurnal wajib diisi.'); return; }
      setFieldError('#jDate', '');
      if (!d.body && !d.title) { toast('Isi judul atau catatan dulu.'); return; }
      if (state.editJournal) {
        var i = state.journal.findIndex(function (x) { return x.id === state.editJournal; });
        if (i >= 0) { d.id = state.editJournal; state.journal[i] = d; }
        state.editJournal = null;
        $('#journalEditHint').textContent = '';
        toast('Jurnal diperbarui.');
      } else {
        d.id = uid();
        state.journal.push(d);
        toast('Jurnal disimpan.');
      }
      $('#jTitle').value = ''; $('#jBody').value = ''; $('#jLesson').value = '';
      save(); renderAll();
    });

    // settings
    $('#btnSaveSettings').addEventListener('click', function () {
      state.settings.feeStockBuy = num($('#sFeeStockBuy').value) || 0;
      state.settings.feeStockSell = num($('#sFeeStockSell').value) || 0;
      state.settings.feeCryptoBuy = num($('#sFeeCryptoBuy').value) || 0;
      state.settings.feeCryptoSell = num($('#sFeeCryptoSell').value) || 0;
      state.settings.lotSize = num($('#sLotSize').value) || 100;
      save(); renderAll(); toast('Preferensi disimpan.');
    });
    $('#btnExportJson').addEventListener('click', exportJson);
    $('#btnExportCsv2').addEventListener('click', exportCsv);
    $('#btnImportJson').addEventListener('click', function () { $('#fileImport').click(); });
    $('#fileImport').addEventListener('change', function () {
      if (this.files && this.files[0]) importJson(this.files[0]);
      this.value = '';
    });
    $('#btnSample').addEventListener('click', function () {
      if (state.trades.length && !confirm('Data contoh akan DITAMBAHKAN ke data yang ada. Lanjut?')) return;
      state.trades = state.trades.concat(sampleData());
      state.journal = state.journal.concat(sampleJournal());
      save(); renderAll(); toast('Data contoh dimuat.');
    });
    $('#btnWipe').addEventListener('click', function () {
      var pn = activeProfile() ? activeProfile().name : 'ini';
      if (!confirm('Hapus semua trade dan jurnal di profil "' + pn + '"? Profil lain tidak terpengaruh.')) return;
      if (!confirm('Yakin? Ini penghapusan permanen (profilnya tetap ada).')) return;
      state.trades = []; state.journal = [];
      save(); renderAll(); toast('Data profil ' + pn + ' dihapus.');
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape' && $('#tradeModal').classList.contains('is-open')) { closeTradeModal(); return; }
      if (e.key === 'Escape' && $('#profileModal').classList.contains('is-open')) { closeProfileModal(); return; }
      if (!typing && (e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); openTradeModal(null);
      }
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    var hadData = load();
    if (!state.profiles.length) {
      state.profiles = [blankProfile('Profil 1')];
      loadProfileIntoState(state.profiles[0]);
    }
    var initial = (location.hash || '').replace('#', '');
    if (TITLES[initial]) state.view = initial;
    bind();
    if (!hadData) {
      save();
      setTimeout(function () {
        toast('Mulai: tekan "+ Trade baru", atau muat data contoh di Pengaturan.');
      }, 700);
    }
    $('#jDate').value = new Date().toISOString().slice(0, 10);
    fillSettings();
    renderAll();

    /* harga live: ambil kalau cache > 1 jam, lalu cek tiap 60 menit */
    setTimeout(function () { refreshPrices(false); }, 400);
    setInterval(function () { refreshPrices(false); }, PRICE_TTL);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshPrices(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
