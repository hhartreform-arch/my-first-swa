/* =========================================================================
   shared.js  … 2つのダッシュボードで共通して使う処理
   ========================================================================= */

/* ---------------------------------------------------------------
   1. 設定
   --------------------------------------------------------------- */
const CONFIG = {
  // これより前の年のデータは使わない（支店・担当者のプルダウンにも出さない）
  minYear: 2026,

  // 完工の判定に使う日付
  //   'plan'   … 完成日(予定) を優先（実績が入っていない運用向け）★いまはこちら
  //   'actual' … 完成日(実績) を優先し、無ければ予定
  completionBasis: 'plan',

  // 目標を読むシート名
  targetSheet: '目標',

  // 目標シートの金額の単位  'auto' | 'yen'（円） | 'man'（万円）
  targetUnit: 'auto',

  // 目標シートが読めなかったときに使う値（万円／1〜12月）
  fallbackTargets: {
    sales:  [400, 500, 500, 1000, 1000, 1000, 500, 500, 400, 400, 400, 400],
    profit: [100, 125, 125, 250, 250, 250, 125, 125, 100, 100, 100, 100]
  },

  // 契約売上の目標を、目標シートの年間売上に対して何倍で見るか（1 = 同じ）
  contractTargetRatio: 1,

  // 価格帯の並び順（シートの「正規価格帯」の値に合わせて書き換える）
  priceBandOrder: ['～300万', '300～500万', '500～1,000万', '1,000万～'],

  // 見込みに含めるランク（PDFの「斜線=見込み（S・Aのみ）」）
  forecastRanks: ['S', 'A']
};

/* ---------------------------------------------------------------
   2. 列名の定義
   配列で書いた列は「上から順に探して、最初に見つかったもの」を使う。
   全角・半角カッコやスペースのゆれは自動で吸収する。
   --------------------------------------------------------------- */
const COL = {
  id:            ['システムID', 'ID'],
  name:          ['案件名', '顧客名'],
  branch:        ['支店名', '支店'],
  owner:         ['主担当', '担当者', '担当'],
  block:         ['ブロック', 'ブロック名'],

  inquiryDate:   ['反響日', '発生日'],
  lostDate:      ['失注日'],
  quoteDate:     ['概算見積提出日(実績)', '概算見積提出日', '見積提出日(実績)', '見積提出日'],
  surveyDate:    ['現調日(実績)', '現調日'],
  contractDate:  ['契約日(実績)', '契約日'],
  completePlan:  ['完成日(予定)', '完工日(予定)', '完成予定日', '完工予定日'],
  completeDate:  ['完成日(実績)', '完工日(実績)', '完成日', '完工日'],
  planDate:      ['契約予定日'],
  salesDate:     ['売上日'],
  startDate:     ['着工日(実績)', '着工日'],   // 無くても動く

  propertyType:  ['物件種別'],
  mediaL:        ['媒体大分類'],
  mediaM:        ['媒体中分類'],
  mediaS:        ['媒体小分類'],
  amount:        ['契約金額（税込）', '契約金額(税込)', '契約金額'],
  cost:          ['最終原価'],
  profit:        ['最終粗利'],
  profitRate:    ['最終粗利率'],
  budget:        ['予算', '実行予算'],
  storeType:     ['店直種別'],
  buildingType:  ['建物種別2'],
  contractBand:  ['契約価格帯'],
  priceBand:     ['正規価格帯'],
  rank:          ['見込'],
  cityGroup:     ['物件市区群'],

  occurYear:     ['発生年'],
  occurMonth:    ['発生月'],
  contractYear:  ['契約年'],
  contractMonth: ['契約月'],
  completeYear:  ['完工年'],
  completeMonth: ['完工月'],
  planYear:      ['契約予定年'],
  planMonth:     ['契約予定月'],

  // --- ここから下は「いまのシートに無い」列。足せば自動で使われる ---
  nextAction:    ['次にやること'],
  blockerPrice:  ['阻害_価格'],
  blockerPlan:   ['阻害_提案'],
  blockerOwner:  ['阻害_担当者'],
  blockerComp:   ['阻害_会社'],
  blockerTiming: ['阻害_時期'],
  blockerDecide: ['阻害_決裁者'],
  blockerRival:  ['阻害_競合'],
  lossReason:    ['毀損要因']
};

/* 目標シートの列 */
const TCOL = {
  block:  ['ブロック名', 'ブロック'],
  branch: ['支店名', '支店'],
  owner:  ['担当者', '主担当'],
  year:   ['年度', '年'],
  month:  ['月'],
  sales:  ['売上'],
  profit: ['粗利']
};

/* 阻害要因チップの定義（PDFの赤枠部分） */
const BLOCKERS = [
  { key: 'blockerPrice',  label: '価', full: '価格'   },
  { key: 'blockerPlan',   label: '提', full: '提案'   },
  { key: 'blockerOwner',  label: '担', full: '担当者' },
  { key: 'blockerComp',   label: '社', full: '会社'   },
  { key: 'blockerTiming', label: '時', full: '時期'   },
  { key: 'blockerDecide', label: '決', full: '決裁者' },
  { key: 'blockerRival',  label: '競', full: '競合'   }
];

/* ---------------------------------------------------------------
   3. CSVの解釈
   --------------------------------------------------------------- */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
      continue;
    }
    if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** 列名の表記ゆれを吸収するためのキー化（全角→半角、スペース除去） */
function normKey(s) {
  return String(s == null ? '' : s).normalize('NFKC').replace(/\s/g, '').trim();
}

/** CSV → { headers, rows(オブジェクト配列) } */
function csvToTable(text) {
  const raw = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!raw.length) return { headers: [], rows: [] };

  const headers = raw[0].map(h => String(h).trim());
  const keys = headers.map(normKey);

  const rows = raw.slice(1).map(cols => {
    const o = {};
    keys.forEach((k, i) => { o[k] = cols[i] !== undefined ? String(cols[i]).trim() : ''; });
    return o;
  });
  return { headers, rows };
}

/** 定義した列名（文字列 or 配列）から、実際に存在するキーを探す */
function resolveKey(rowKeys, colDef) {
  const list = Array.isArray(colDef) ? colDef : [colDef];
  for (const name of list) {
    const k = normKey(name);
    if (rowKeys.has(k)) return k;
  }
  return null;
}

/** 1行から値を取り出す（表記ゆれ対応） */
function cell(row, colDef) {
  const list = Array.isArray(colDef) ? colDef : [colDef];
  for (const name of list) {
    const k = normKey(name);
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  for (const name of list) {
    const k = normKey(name);
    if (row[k] !== undefined) return row[k];
  }
  return '';
}

/* ---------------------------------------------------------------
   4. 値の変換
   --------------------------------------------------------------- */
function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).normalize('NFKC').replace(/[¥,、\s円]/g, '').replace(/[%]/g, '');
  if (s === '' || s === '-' || s === '－' || s.startsWith('#')) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function num0(v) { const n = num(v); return n === null ? 0 : n; }

/** 「2026年度」「9月」なども数値にする */
function numLoose(v) {
  const s = String(v == null ? '' : v).normalize('NFKC').replace(/[^\d.\-]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function rate(v) {
  const s = String(v == null ? '' : v);
  const n = num(s);
  if (n === null) return null;
  return /[％%]/.test(s) ? n / 100 : (Math.abs(n) > 1 ? n / 100 : n);
}

function parseDate(v) {
  if (!v) return null;
  const s = String(v).normalize('NFKC').trim();
  if (!s || s === '-' || s === '－') return null;

  const m = s.match(/^Date\((\d+),(\d+),(\d+)/);           // gvizの Date(2026,0,5)
  if (m) return new Date(+m[1], +m[2], +m[3]);

  const m2 = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);

  const m3 = s.match(/^(\d{4})[\/\-.年](\d{1,2})[月]?$/);   // 年月だけ → 1日扱い
  if (m3) return new Date(+m3[1], +m3[2] - 1, 1);

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const sameMonth = (d, base) => !!d && d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth();
const sameYear  = (d, y)    => !!d && d.getFullYear() === y;

const fmtMan   = v => (v === null || v === undefined || !Number.isFinite(v)) ? '―' : Math.round(v / 10000).toLocaleString('ja-JP');
const fmtMan1  = v => (v === null || !Number.isFinite(v)) ? '―' : (v / 10000).toFixed(1);
const fmtMil   = v => (v === null || !Number.isFinite(v)) ? '―' : (v / 1000000).toFixed(1);
const fmtYen   = v => (v === null || !Number.isFinite(v)) ? '―' : Math.round(v).toLocaleString('ja-JP');
const fmtPct   = (v, d = 1) => (v === null || !Number.isFinite(v)) ? '―' : (v * 100).toFixed(d) + '%';
const fmtPt    = v => (v === null || !Number.isFinite(v)) ? '―' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + 'pt';
const fmtMD    = d => d ? `${d.getMonth() + 1}/${d.getDate()}` : '―';
const fmtM     = d => d ? `${d.getMonth() + 1}月` : '未定';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------------
   5. 1行 → 案件オブジェクト
   --------------------------------------------------------------- */
function toDeal(row) {
  const amount = num(cell(row, COL.amount));
  const budget = num(cell(row, COL.budget));
  const profit = num(cell(row, COL.profit));

  const d = {
    raw: row,
    id:     cell(row, COL.id),
    name:   cell(row, COL.name),
    branch: cell(row, COL.branch),
    owner:  cell(row, COL.owner),
    block:  cell(row, COL.block),

    inquiry:      parseDate(cell(row, COL.inquiryDate)),
    lost:         parseDate(cell(row, COL.lostDate)),
    quote:        parseDate(cell(row, COL.quoteDate)),
    survey:       parseDate(cell(row, COL.surveyDate)),
    contract:     parseDate(cell(row, COL.contractDate)),
    start:        parseDate(cell(row, COL.startDate)),
    completePlan: parseDate(cell(row, COL.completePlan)),
    complete:     parseDate(cell(row, COL.completeDate)),
    plan:         parseDate(cell(row, COL.planDate)),
    salesDate:    parseDate(cell(row, COL.salesDate)),

    amount, budget, profit,
    cost:       num(cell(row, COL.cost)),
    profitRate: rate(cell(row, COL.profitRate)),

    priceBand:    cell(row, COL.priceBand) || cell(row, COL.contractBand),
    contractBand: cell(row, COL.contractBand),
    mediaL:       cell(row, COL.mediaL),
    mediaM:       cell(row, COL.mediaM),
    mediaS:       cell(row, COL.mediaS),
    propertyType: cell(row, COL.propertyType),
    buildingType: cell(row, COL.buildingType),
    storeType:    cell(row, COL.storeType),
    cityGroup:    cell(row, COL.cityGroup),
    rank:         normalizeRank(cell(row, COL.rank)),
    nextAction:   cell(row, COL.nextAction),
    lossReason:   cell(row, COL.lossReason),

    occurYear:    numLoose(cell(row, COL.occurYear)),
    occurMonth:   numLoose(cell(row, COL.occurMonth)),
    contractYear: numLoose(cell(row, COL.contractYear)),
    completeYear: numLoose(cell(row, COL.completeYear)),
    planMonth:    numLoose(cell(row, COL.planMonth))
  };

  /* ★ 完工の基準日
     CONFIG.completionBasis = 'plan' のとき、完成日(予定) を優先して使う。
     予定日が今日以前なら「実績」、今日より先なら「見込み」として扱う。 */
  d.completeBase = CONFIG.completionBasis === 'plan'
    ? (d.completePlan || d.complete)
    : (d.complete || d.completePlan);
  d.isCompleted  = !!(d.completeBase && d.contract && !d.lost && d.completeBase <= today());
  d.isPlanned    = !!(d.completeBase && d.contract && !d.lost && d.completeBase >  today());

  // 契約時粗利（= 契約金額 − 実行予算）
  d.plannedProfit = (amount !== null && budget !== null) ? amount - budget : null;
  d.plannedRate   = (d.plannedProfit !== null && amount) ? d.plannedProfit / amount : null;
  d.finalRate     = d.profitRate !== null ? d.profitRate
                  : (profit !== null && amount ? profit / amount : null);
  d.loss    = (d.finalRate !== null && d.plannedRate !== null) ? d.finalRate - d.plannedRate : null;
  d.lossYen = (d.profit !== null && d.plannedProfit !== null) ? d.profit - d.plannedProfit : null;

  d.blockers = BLOCKERS.map(b => ({ ...b, remaining: isTruthy(cell(row, COL[b.key])) }));
  d.blockerKnown = BLOCKERS.some(b => cell(row, COL[b.key]) !== '');
  d.blockerLeft  = d.blockers.filter(b => b.remaining).length;

  d.status = statusOf(d);
  return d;
}

function isTruthy(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return ['1', 'TRUE', '○', '◯', '●', '残', '未', 'YES', 'Y'].includes(s);
}
function normalizeRank(v) {
  const m = String(v == null ? '' : v).trim().toUpperCase().match(/[SABC]/);
  return m ? m[0] : '';
}

/* この案件が「どの年のものか」。minYear の足切りに使う */
function dealYear(d) {
  const years = [d.completeBase, d.contract, d.inquiry, d.plan]
    .filter(Boolean).map(x => x.getFullYear());
  if (d.occurYear) years.push(d.occurYear);
  return years.length ? Math.max(...years) : null;
}

/* ---------------------------------------------------------------
   6. ステータス判定
   --------------------------------------------------------------- */
const STATUS = {
  LOST: 'lost', PRE_SURVEY: 'preSurvey', SURVEYED: 'surveyed', QUOTED: 'quoted',
  BEFORE_START: 'beforeStart', IN_WORK: 'inWork', DONE: 'done'
};
const STATUS_LABEL = {
  preSurvey:   'これから現調',
  surveyed:    '現調済み<br>見積提出前',
  quoted:      '見積提出済み<br>クロージング前',
  beforeStart: '契約済み<br>着工前',
  inWork:      '工事中',
  done:        '完工',
  lost:        '失注'
};

function statusOf(d) {
  if (d.lost) return STATUS.LOST;
  if (d.isCompleted) return STATUS.DONE;
  if (d.contract) {
    if (d.start) return d.start <= today() ? STATUS.IN_WORK : STATUS.BEFORE_START;
    if (d.completeBase && d.completeBase <= addMonths(today(), 1)) return STATUS.IN_WORK;
    return STATUS.BEFORE_START;
  }
  if (d.quote)  return STATUS.QUOTED;
  if (d.survey) return STATUS.SURVEYED;
  return STATUS.PRE_SURVEY;
}
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

/* ---------------------------------------------------------------
   7. データ取得
   --------------------------------------------------------------- */
const DIAG = { deal: null, target: null };   // 診断用に生データを控える

async function fetchSheet(sheet) {
  const res = await fetch('/api/GetSheetData?sheet=' + encodeURIComponent(sheet));
  if (!res.ok) throw new Error((await res.text()) || ('HTTP ' + res.status));
  return csvToTable(await res.text());
}

async function loadDeals(sheet = '発生案件') {
  const table = await fetchSheet(sheet);
  const all = table.rows.map(toDeal).filter(d => d.id || d.name);
  const kept = all.filter(d => { const y = dealYear(d); return y === null ? false : y >= CONFIG.minYear; });

  DIAG.deal = { sheet, headers: table.headers, rows: table.rows, all, kept };
  return kept;
}

/** 目標シート（ブロック名・支店名・担当者・年度・月・売上・粗利） */
async function loadTargets() {
  try {
    const table = await fetchSheet(CONFIG.targetSheet);
    const keys = new Set(Object.keys(table.rows[0] || {}));
    const rows = table.rows.map(r => ({
      block:  cell(r, TCOL.block),
      branch: cell(r, TCOL.branch),
      owner:  cell(r, TCOL.owner),
      year:   numLoose(cell(r, TCOL.year)),
      month:  numLoose(cell(r, TCOL.month)),
      sales:  num(cell(r, TCOL.sales)),
      profit: num(cell(r, TCOL.profit))
    })).filter(r => r.year && r.month);

    // 単位の判定（万円で入っているか、円で入っているか）
    let unit = CONFIG.targetUnit;
    if (unit === 'auto') {
      const max = Math.max(0, ...rows.map(r => Math.abs(r.sales || 0)));
      unit = max >= 100000 ? 'yen' : 'man';
    }
    const k = unit === 'yen' ? 1 : 10000;
    rows.forEach(r => { r.sales = (r.sales || 0) * k; r.profit = (r.profit || 0) * k; });

    DIAG.target = { ok: true, headers: table.headers, count: rows.length, unit, missing: [
      ...Object.entries(TCOL).filter(([, def]) => !resolveKey(keys, def)).map(([k2]) => k2)
    ] };
    return rows;
  } catch (e) {
    DIAG.target = { ok: false, error: e.message || String(e) };
    return null;
  }
}

/** 選択中の条件に合う目標を、月別（円）で返す */
function targetsFrom(targetRows, params, year) {
  if (!targetRows || !targetRows.length) {
    return {
      source: 'fallback',
      sales:  CONFIG.fallbackTargets.sales.map(v => v * 10000),
      profit: CONFIG.fallbackTargets.profit.map(v => v * 10000)
    };
  }
  let rows = targetRows.filter(r => r.year === year);
  if (params.block)  rows = rows.filter(r => r.block  === params.block);
  if (params.branch) rows = rows.filter(r => r.branch === params.branch);
  if (params.owner)  rows = rows.filter(r => r.owner  === params.owner);

  // 担当者行と支店合計行が混在していても二重計上しないよう、細かいほうを優先
  if (!params.owner) {
    const withOwner = rows.filter(r => r.owner !== '');
    rows = withOwner.length ? withOwner : rows.filter(r => r.owner === '');
  }

  const sales = Array(12).fill(0), profit = Array(12).fill(0);
  rows.forEach(r => {
    const m = Math.min(12, Math.max(1, r.month)) - 1;
    sales[m]  += r.sales  || 0;
    profit[m] += r.profit || 0;
  });
  return { source: rows.length ? 'sheet' : 'empty', rows: rows.length, sales, profit };
}

/* ---------------------------------------------------------------
   8. 絞り込み（URLの ?block= &branch= &owner= &year=）
   --------------------------------------------------------------- */
function getParams() {
  const p = new URLSearchParams(location.search);
  const y = Number(p.get('year'));
  return {
    block:  p.get('block')  || '',
    branch: p.get('branch') || '',
    owner:  p.get('owner')  || '',
    year:   y && y >= CONFIG.minYear ? y : Math.max(CONFIG.minYear, new Date().getFullYear()),
    debug:  p.get('debug') === '1'
  };
}

function applyFilter(deals, { block, branch, owner }) {
  return deals.filter(d =>
    (!block  || d.block  === block) &&
    (!branch || d.branch === branch) &&
    (!owner  || d.owner  === owner));
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(v => v !== '' && v != null))].sort((a, b) => String(a).localeCompare(String(b), 'ja'));
}

/** ブロック→支店→担当者の順に、選ばれた範囲のものだけ出す */
function buildSelectors(deals, params, onChange) {
  const el = id => document.getElementById(id);
  const opt = (v, cur, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label || v)}</option>`;

  const blockSel = el('blockSelect'), branchSel = el('branchSelect'),
        ownerSel = el('ownerSelect'), yearSel = el('yearSelect');

  if (blockSel) {
    blockSel.innerHTML = opt('', params.block, '全ブロック')
      + uniqueSorted(deals.map(d => d.block)).map(b => opt(b, params.block)).join('');
    blockSel.onchange = onChange;
  }
  if (branchSel) {
    const src = deals.filter(d => !params.block || d.block === params.block);
    branchSel.innerHTML = opt('', params.branch, '全支店')
      + uniqueSorted(src.map(d => d.branch)).map(b => opt(b, params.branch)).join('');
    branchSel.onchange = onChange;
  }
  if (ownerSel) {
    const src = deals.filter(d =>
      (!params.block || d.block === params.block) &&
      (!params.branch || d.branch === params.branch));
    ownerSel.innerHTML = opt('', params.owner, '全担当')
      + uniqueSorted(src.map(d => d.owner)).map(o => opt(o, params.owner)).join('');
    ownerSel.onchange = onChange;
  }
  if (yearSel) {
    const years = uniqueSorted(deals.map(dealYear).filter(y => y && y >= CONFIG.minYear))
      .map(Number).sort((a, b) => b - a);
    const list = years.length ? years : [params.year];
    yearSel.innerHTML = list.map(y => opt(String(y), String(params.year), y + '年')).join('');
    yearSel.onchange = onChange;
  }
}

function navigateBySelectors() {
  const cur = getParams();
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const p = new URLSearchParams();

  const block = val('blockSelect'), branch = val('branchSelect'), owner = val('ownerSelect');
  const blockChanged  = block !== cur.block;
  const branchChanged = branch !== cur.branch;

  if (block) p.set('block', block);
  if (branch && !blockChanged) p.set('branch', branch);
  if (owner && !blockChanged && !branchChanged) p.set('owner', owner);
  if (val('yearSelect')) p.set('year', val('yearSelect'));
  if (cur.debug) p.set('debug', '1');
  location.search = p.toString();
}

/* ---------------------------------------------------------------
   9. 集計のヘルパー
   --------------------------------------------------------------- */
const sum = (arr, f) => arr.reduce((a, d) => a + (f(d) || 0), 0);
const monthlyBuckets = () => Array.from({ length: 12 }, () => ({ amount: 0, profit: 0, count: 0 }));

function groupBy(arr, keyFn, fallback = '未入力') {
  const map = new Map();
  arr.forEach(d => {
    const k = keyFn(d) || fallback;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(d);
  });
  return map;
}

/* ---------------------------------------------------------------
   10. データ診断（列がちゃんと読めているかの確認）
   --------------------------------------------------------------- */
function diagnosticsHTML() {
  const d = DIAG.deal;
  if (!d) return '<p>まだデータを読み込んでいません。</p>';

  const keys = new Set(Object.keys(d.rows[0] || {}));
  const checkCols = [
    ['反響日', COL.inquiryDate], ['現調日', COL.surveyDate], ['見積提出日', COL.quoteDate],
    ['契約日', COL.contractDate], ['完成日(予定)', COL.completePlan], ['完成日(実績)', COL.completeDate],
    ['契約予定日', COL.planDate], ['契約金額', COL.amount], ['予算', COL.budget],
    ['最終粗利', COL.profit], ['ブロック', COL.block], ['支店名', COL.branch], ['主担当', COL.owner]
  ];

  const rows = checkCols.map(([label, def]) => {
    const key = resolveKey(keys, def);
    if (!key) return `<tr><td class="l">${label}</td><td class="c neg">見つからない</td>
      <td class="c">―</td><td class="c">―</td><td class="l">―</td></tr>`;

    const vals = d.rows.map(r => r[key]).filter(v => v !== '');
    const isDate = /日$/.test(label) || /日\)/.test(label);
    let okCount, samples = [];
    if (isDate) {
      okCount = vals.filter(v => parseDate(v) !== null).length;
      samples = vals.filter(v => parseDate(v) === null).slice(0, 3);
    } else {
      okCount = vals.filter(v => num(v) !== null || !/金額|予算|粗利/.test(label)).length;
      samples = vals.filter(v => /金額|予算|粗利/.test(label) && num(v) === null).slice(0, 3);
    }
    const bad = vals.length - okCount;
    return `<tr>
      <td class="l">${label}</td>
      <td class="c">${esc(key)}</td>
      <td class="num">${vals.length.toLocaleString('ja-JP')}</td>
      <td class="num ${bad ? 'neg' : ''}">${okCount.toLocaleString('ja-JP')}</td>
      <td class="l" style="font-size:11px">${samples.length ? esc(samples.join(' / ')) : '―'}</td>
    </tr>`;
  }).join('');

  const t = DIAG.target;
  const targetInfo = !t ? '未読込'
    : t.ok ? `読み込みOK：${t.count}行／単位は${t.unit === 'yen' ? '円' : '万円'}として解釈`
           + (t.missing && t.missing.length ? `／<span class="neg">見つからない列：${esc(t.missing.join('、'))}</span>` : '')
    : `<span class="neg">読み込み失敗：${esc(t.error)}</span>`;

  return `
    <p style="font-size:12px;margin:0 0 8px">
      シート「${esc(d.sheet)}」から <b>${d.rows.length.toLocaleString('ja-JP')}行</b> 取得。
      うち案件として認識 <b>${d.all.length.toLocaleString('ja-JP')}件</b>、
      ${CONFIG.minYear}年以降に絞って <b>${d.kept.length.toLocaleString('ja-JP')}件</b>。<br>
      完工の判定に使っている日付：<b>${CONFIG.completionBasis === 'plan' ? '完成日(予定)' : '完成日(実績)'}</b>
      （予定日が今日以前なら実績、今日より先なら見込み）。<br>
      目標シート「${esc(CONFIG.targetSheet)}」：${targetInfo}
    </p>
    <div class="tbl-scroll"><table>
      <thead><tr><th class="l">使っている項目</th><th>実際のヘッダー</th><th>入力あり</th><th>読めた数</th><th class="l">読めなかった例</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p style="font-size:11px;color:var(--muted);margin:8px 0 0">
      シートのヘッダー（${d.headers.length}列）：${esc(d.headers.join('｜'))}</p>`;
}

function mountDiagnostics(params) {
  const box = document.getElementById('diagBox');
  const link = document.getElementById('diagLink');
  if (!box || !link) return;
  box.innerHTML = diagnosticsHTML();
  box.style.display = params.debug ? 'block' : 'none';
  link.onclick = (e) => {
    e.preventDefault();
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  };
}

/* ---------------------------------------------------------------
   11. 画面共通
   --------------------------------------------------------------- */
function showError(message) {
  const el = document.getElementById('errorBox');
  if (!el) { alert(message); return; }
  el.style.display = 'block';
  el.textContent = 'データを読み込めませんでした： ' + message;
}
function setLoading(on) {
  const el = document.getElementById('loading');
  if (el) el.style.display = on ? 'flex' : 'none';
}
function filterLabel(p) {
  return [p.block || '全ブロック', p.branch || '全支店', p.owner ? '担当者：' + p.owner : '全担当'].join('　');
}
