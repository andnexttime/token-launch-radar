/* Token Radar's dashboard: board, detail view, live view and model view.
   Reads window.RADAR (written by main.ts from the same board), renders with no
   network and no framework. State lives in the hash, so a view is a link:
   #/board, #/board?category=Lending&watchlist=1, #/detail/<slug>, #/live, #/model. */
(function () {
  'use strict';
  var R = window.RADAR;
  var panel = document.getElementById('panel');
  var controls = document.getElementById('controls');
  var main = document.getElementById('board');
  var method = document.getElementById('method');

  if (!R || !Array.isArray(R.rows)) {
    panel.innerHTML = '<p class="empty">No radar data. The program that builds this page writes data.js next to it.</p>';
    main.setAttribute('aria-busy', 'false');
    return;
  }

  var watchlist = {};
  R.rows.forEach(function (r) { if (r.watchlist) watchlist[r.slug] = true; });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function usd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function pctClass(v) { return v === null || v === undefined ? '' : v >= 0 ? 'up' : 'down'; }
  function age(v) {
    if (v === null || v === undefined) return '—';
    if (v < 365) return v + 'd';
    return (v / 365).toFixed(1) + 'y';
  }
  function chains(r) {
    if (!r.chains || r.chains.length === 0) return '—';
    return r.chains.length > 2 ? r.chains.slice(0, 2).join(', ') + ' +' + (r.chains.length - 2) : r.chains.join(', ');
  }

  /* Header statistics: board size, watchlist covered, total implied value, snapshot date. */
  var stats = document.getElementById('stats');
  var covered = R.rows.filter(function (r) { return r.watchlist; }).length;
  stats.innerHTML =
    '<div><dt>Board rows</dt><dd>' + R.board_size + '</dd></div>' +
    '<div><dt>Watchlist covered</dt><dd>' + covered + ' / ' + R.watchlist_size + '</dd></div>' +
    '<div><dt>Total implied value</dt><dd>' + usd(R.total_implied_usd) + '</dd></div>' +
    '<div><dt>Snapshot</dt><dd>' + esc(R.as_of) + '</dd></div>';
  method.textContent = 'Model ' + R.model_version + ': implied value = TVL × category multiple × growth × maturity × breadth. ' +
    'The category multiple is the median market-cap-to-TVL ratio of that category\'s live-token protocols in this snapshot ' +
    '(global median ' + R.global_multiple.toFixed(3) + ' when a category has fewer than ' + R.model.min_samples + ' live protocols). ' +
    'Growth clamps the 7-day TVL change to [' + R.model.growth_floor + '%, +' + R.model.growth_cap + '%]; maturity rises with days listed, capped at ' +
    R.model.maturity_days + ' days; breadth adds ' + (R.model.breadth_step * 100).toFixed(0) + '% per extra chain, up to ' + R.model.breadth_max + '.';

  /* Hash state: #/board, #/board?category=Lending&watchlist=1&q=..., #/detail/<slug>, #/live, #/model. */
  function parseHash() {
    var h = window.location.hash || '#/board';
    var m = h.match(/^#\/([a-z]+)(?:\/([^?]*))?(?:\?(.*))?$/);
    if (!m) return { tab: 'board' };
    var out = { tab: m[1], slug: m[2] ? decodeURIComponent(m[2]) : null };
    if (m[3]) {
      m[3].split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    return out;
  }
  function boardHash(state) {
    var q = [];
    if (state.q) q.push('q=' + encodeURIComponent(state.q));
    if (state.category) q.push('category=' + encodeURIComponent(state.category));
    if (state.chain) q.push('chain=' + encodeURIComponent(state.chain));
    if (state.watchlist) q.push('watchlist=1');
    if (state.sort && state.sort !== 'implied') q.push('sort=' + encodeURIComponent(state.sort));
    if (state.dir && state.dir !== 'desc') q.push('dir=' + encodeURIComponent(state.dir));
    return '#/board' + (q.length ? '?' + q.join('&') : '');
  }

  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    change: function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d); },
    age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    multiple: function (a, b) { return b.category_multiple - a.category_multiple; },
  };

  function filteredRows(state) {
    var q = (state.q || '').toLowerCase();
    return R.rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function sortRows(rows, state) {
    var key = SORTS[state.sort] ? state.sort : 'implied';
    var out = rows.slice().sort(SORTS[key]);
    if (state.dir === 'asc' && key !== 'rank') out.reverse();
    if (key === 'rank') out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  }

  function optionList(values, current, allLabel) {
    var html = '<option value="">' + esc(allLabel) + '</option>';
    values.forEach(function (v) {
      html += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return html;
  }

  function renderControls(state, shown) {
    var cats = [];
    var chainSet = {};
    R.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      (r.chains || []).forEach(function (c) { chainSet[c] = true; });
    });
    cats.sort();
    var chainList = Object.keys(chainSet).sort();
    controls.innerHTML =
      '<div class="field"><label for="f-q">Search</label><input id="f-q" type="search" placeholder="Name or slug" value="' + esc(state.q || '') + '"></div>' +
      '<div class="field"><label for="f-cat">Category</label><select id="f-cat">' + optionList(cats, state.category || '', 'All categories') + '</select></div>' +
      '<div class="field"><label for="f-chain">Chain</label><select id="f-chain">' + optionList(chainList, state.chain || '', 'All chains') + '</select></div>' +
      '<label class="check"><input id="f-wl" type="checkbox"' + (state.watchlist ? ' checked' : '') + '> Watchlist only</label>' +
      '<div class="field"><label for="f-sort">Sort by</label><select id="f-sort">' +
      '<option value="implied"' + (state.sort === 'implied' || !state.sort ? ' selected' : '') + '>Implied value</option>' +
      '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
      '<option value="change"' + (state.sort === 'change' ? ' selected' : '') + '>7-day change</option>' +
      '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Age listed</option>' +
      '<option value="multiple"' + (state.sort === 'multiple' ? ' selected' : '') + '>Category multiple</option>' +
      '</select></div>' +
      '<span class="count">' + shown + ' of ' + R.board_size + ' rows</span>';
    var apply = function () {
      state.q = document.getElementById('f-q').value.trim();
      state.category = document.getElementById('f-cat').value;
      state.chain = document.getElementById('f-chain').value;
      state.watchlist = document.getElementById('f-wl').checked ? '1' : '';
      state.sort = document.getElementById('f-sort').value;
      window.location.hash = boardHash(state);
    };
    document.getElementById('f-q').addEventListener('input', apply);
    document.getElementById('f-cat').addEventListener('change', apply);
    document.getElementById('f-chain').addEventListener('change', apply);
    document.getElementById('f-wl').addEventListener('change', apply);
    document.getElementById('f-sort').addEventListener('change', apply);
  }

  function boardTable(rows, state) {
    if (rows.length === 0) return '<p class="empty">No protocols match this filter. Clear the search or pick another category.</p>';
    var cols = [
      { key: 'rank', label: '#' },
      { key: null, label: 'Protocol' },
      { key: null, label: 'Category' },
      { key: null, label: 'Chains' },
      { key: 'tvl', label: 'TVL' },
      { key: 'change', label: '7d' },
      { key: 'age', label: 'Age' },
      { key: 'implied', label: 'Implied value' },
      { key: 'multiple', label: 'Category ×' },
    ];
    var head = cols.map(function (c) {
      if (!c.key) return '<th scope="col">' + c.label + '</th>';
      var dir = state.sort === c.key ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return '<th scope="col" aria-sort="' + dir + '"><button type="button" data-sort="' + c.key + '">' + c.label + '</button></th>';
    }).join('');
    var body = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
        (r.watchlist ? ' <span class="badge">Watchlist</span>' : '') +
        '<span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(chains(r)) + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><strong>' + usd(r.implied_value_usd) + '</strong></td>' +
        '<td class="num">' + r.category_multiple.toFixed(3) + '×</td>' +
        '</tr>';
    }).join('');
    return '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderBoard(state) {
    var rows = sortRows(filteredRows(state), state);
    renderControls(state, rows.length);
    panel.innerHTML = boardTable(rows, state);
    panel.querySelectorAll('th button[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort = key; state.dir = 'desc'; }
        window.location.hash = boardHash(state);
      });
    });
    panel.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      var go = function () { window.location.hash = '#/detail/' + tr.getAttribute('data-slug'); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
  }

  function stepParts(step) {
    var costAt = step.indexOf(' Cost: ');
    var timeAt = step.indexOf('. Time: ');
    if (costAt < 0 || timeAt < 0) return { text: step, meta: '' };
    return {
      text: step.slice(0, costAt),
      meta: step.slice(costAt + 1, timeAt) + ' · ' + step.slice(timeAt + 2).replace(/\.$/, ''),
    };
  }

  function renderDetail(slug) {
    controls.innerHTML = '';
    var r = null;
    R.rows.forEach(function (row) { if (row.slug === slug) r = row; });
    if (!r) {
      panel.innerHTML = '<p class="empty">No protocol on this board has the slug ' + esc(slug) + '.</p>';
      return;
    }
    var base = Math.round(r.tvl_usd * r.category_multiple);
    var steps = (r.farm_steps || []).map(function (s) {
      var p = stepParts(s);
      return '<li>' + esc(p.text) + (p.meta ? '<br><span class="cost">' + esc(p.meta) + '</span>' : '') + '</li>';
    }).join('');
    panel.innerHTML =
      '<article class="detail">' +
      '<button type="button" class="back" id="back">← Back to the board</button>' +
      '<h2>' + esc(r.name) + ' <span class="badge">Rank #' + r.rank + '</span>' + (r.watchlist ? ' <span class="badge">Watchlist</span>' : '') + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') +
      ' · listed ' + esc(r.listed_at || 'date unknown') + ' · records no token in the snapshot</p>' +
      '<dl class="grid">' +
      '<div><dt>Implied value</dt><dd>' + usdFull(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + usdFull(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd class="' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</dd></div>' +
      '<div><dt>Age listed</dt><dd>' + age(r.age_days) + (r.age_days === null ? '<small>listed date unknown, model uses 365 days</small>' : '') + '</dd></div>' +
      '<div><dt>Category multiple</dt><dd>' + r.category_multiple.toFixed(3) + '×<small>from ' + r.benchmark_samples + ' live ' + esc(r.category || 'protocols') + ' priced by the market' + (r.benchmark_samples === 0 ? ' (global median — too few live in this category)' : '') + '</small></dd></div>' +
      '</dl>' +
      '<h3>How the implied value is built</h3>' +
      '<table class="math"><tbody>' +
      '<tr><td>Base — TVL × category multiple</td><td>' + usdFull(r.tvl_usd) + ' × ' + r.category_multiple.toFixed(3) + ' = ' + usdFull(base) + '</td></tr>' +
      '<tr><td>Growth — 7-day TVL change</td><td>× ' + r.growth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity — days listed with no token</td><td>× ' + r.maturity_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Breadth — chains the TVL sits on</td><td>× ' + r.breadth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td><strong>Implied value</strong></td><td><strong>' + usdFull(r.implied_value_usd) + '</strong></td></tr>' +
      '</tbody></table>' +
      '<h3>How to farm it</h3>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<p class="note">This plan assumes no token exists yet and none is promised. Check the protocol\'s own pages before you deposit anything, and never pay anyone to claim for you.</p>' +
      '</article>';
    document.getElementById('back').addEventListener('click', function () { window.location.hash = '#/board'; });
  }

  function renderLive() {
    controls.innerHTML = '';
    var body = R.live.map(function (p) {
      return '<tr>' +
        '<td><span class="name">' + esc(p.name) + '</span><span class="sub">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + usd(p.tvl_usd) + '</td>' +
        '<td class="num"><strong>' + usd(p.mcap_usd) + '</strong></td>' +
        '<td class="num">' + (p.mcap_tvl === null ? '—' : p.mcap_tvl.toFixed(3) + '×') + '</td>' +
        '<td class="num ' + pctClass(p.change_7d) + '">' + pct(p.change_7d) + '</td>' +
        '</tr>';
    }).join('');
    panel.innerHTML =
      '<div class="model-text"><h2>Already trading — the market\'s own values</h2>' +
      '<p>These ' + R.live.length + ' protocols already have a token that trades, so the board does not rank them: their market cap is the market\'s verdict, not a model\'s. They are here because they price the categories — the median market-cap-to-TVL ratio of each category is the multiple the board applies to the pre-token protocols in it.</p></div>' +
      '<table><thead><tr><th scope="col">Protocol</th><th scope="col">Category</th><th scope="col" class="num">TVL</th><th scope="col" class="num">Market cap</th><th scope="col" class="num">Mcap / TVL</th><th scope="col" class="num">7d</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderModel() {
    controls.innerHTML = '';
    var bench = R.benchmarks.map(function (b) {
      return '<tr><td>' + esc(b.category) + '</td><td class="num">' + b.multiple.toFixed(3) + '×</td><td class="num">' + b.samples + '</td></tr>';
    }).join('');
    panel.innerHTML =
      '<div class="model-text">' +
      '<h2>Model ' + esc(R.model_version) + ' — priced by the market, not by a list</h2>' +
      '<p>Every implied value on this board comes from the snapshot alone. No protocol name is special-cased: the same four factors score every row.</p>' +
      '<p class="formula">implied = TVL × category&nbsp;multiple × growth × maturity × breadth</p>' +
      '<p><strong>Category multiple.</strong> For each category, the median market-cap-to-TVL ratio of the live-token protocols in that category. A lending protocol is priced like lending protocols trade, a DEX like DEXes trade. Categories with fewer than ' + R.model.min_samples + ' live protocols fall back to the global median (' + R.global_multiple.toFixed(3) + '×). Multiples are clamped to [' + R.model.multiple_floor + ', ' + R.model.multiple_cap + '].</p>' +
      '<p><strong>Growth.</strong> The 7-day TVL change, clamped to [' + R.model.growth_floor + '%, +' + R.model.growth_cap + '%], weighted ' + R.model.growth_weight + ': a protocol growing 10% in a week scores 1.06×, one shrinking 10% scores 0.94×.</p>' +
      '<p><strong>Maturity.</strong> Days since DefiLlama began tracking the protocol, rising from ' + R.model.maturity_floor + ' to ' + (R.model.maturity_floor + R.model.maturity_range) + ' over ' + R.model.maturity_days + ' days. A protocol that has run for years with no token carries more pent-up value than one listed last month. Unknown listing dates count as ' + R.model.unknown_age_days + ' days.</p>' +
      '<p><strong>Breadth.</strong> ' + (R.model.breadth_step * 100).toFixed(0) + '% per extra chain beyond the first, up to ' + R.model.breadth_max + ' extra chains: a launch that can distribute across chains is worth more than one confined to a single chain.</p>' +
      '<h3>Category benchmarks (from this snapshot)</h3>' +
      '<table class="math"><thead><tr><th scope="col">Category</th><th scope="col" style="text-align:right">Multiple</th><th scope="col" style="text-align:right">Live protocols</th></tr></thead><tbody>' + bench + '</tbody></table>' +
      '<p class="note">The watchlist is the floor, never the ceiling: the board covers all ' + R.watchlist_size + ' watchlist protocols and adds ' + R.early_size + ' pre-token protocols below the $50M floor, ranked the same way. Protocols that are a wrapped, staked or bridged product of a token that already trades are left out — WBTC is Bitcoin on Ethereum, not a launch waiting to happen.</p>' +
      '</div>';
  }

  function render() {
    var state = parseHash();
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tab') === state.tab || (state.tab === 'detail' && b.getAttribute('data-tab') === 'board') ? 'true' : 'false');
    });
    if (state.tab === 'detail' && state.slug) renderDetail(state.slug);
    else if (state.tab === 'live') renderLive();
    else if (state.tab === 'model') renderModel();
    else renderBoard(state);
    main.setAttribute('aria-busy', 'false');
  }

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { window.location.hash = '#/' + b.getAttribute('data-tab'); });
  });
  window.addEventListener('hashchange', render);
  render();
})();
