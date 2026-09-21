/* =========================================================================
   shared.js  … 2つのダッシュボードで共通して使う処理
   - スプレッドシートの取得とCSVの解釈
   - 列名の定義（シートの見出しを変えたら、ここだけ直せば両方直る）
   - 案件のステータス判定と集計
   ========================================================================= */

/* ---------------------------------------------------------------
   1. 設定
   --------------------------------------------------------------- */
const CONFIG = {
  // 集計の対象年（null なら今日の年）
  targetYear: null,

  // 月次目標（万円）。担当者名をキーにすると個人別に上書きできる。
  // 1月〜12月の順。PDFの表に入っていた数字を初期値として入れてある。
  targets: {
    default: {
      // 完工売上目標（万円）
      sales:  [400, 500, 500, 1000, 1000, 1000, 500, 500, 400, 400, 400, 400],
      // 完工粗利目標（万円）
      profit: [100, 125, 125, 250, 250, 250, 125, 125, 100, 100, 100, 100]
    }
    // 例）個人別に変える場合:
    // '山田 太郎': { sales: [...12個...], profit: [...12個...] }
  },

  // 契約売上の年間目標（万円）※PDFの「目標12,000万」
  contractTargetYear: 12000,

  // 価格帯の並び順（シートの「正規価格帯」の値に合わせて書き換える）
  priceBandOrder: ['～300万', '300～500万', '500～1,000万', '1,000万～'],

  // 見込ランクとして扱う値
  rankOrder: ['S', 'A', 'B', 'C'],

  // 見込みに含めるランク（PDFの「斜線=見込み（S・Aのみ）」）
  forecastRanks: ['S', 'A']
};

/* ---------------------------------------------------------------
   2. 列名の定義
   シートの見出しを1文字でも変えたら、ここを合わせる
   --------------------------------------------------------------- */
const COL = {
  id:            'システムID',
  name:          '案件名',
  branch:        '支店名',
  owner:         '主担当',
  inquiryDate:   '反響日',
  lostDate:      '失注日',
  quoteDate:     '概算見積提出日(実績)',
  surveyDate:    '現調日(実績)',
  contractDate:  '契約日(実績)',
  completePlan:  '完成日(予定)',
  completeDate:  '完成日(実績)',
  propertyType:  '物件種別',
  mediaL:        '媒体大分類',
  mediaM:        '媒体中分類',
  mediaS:        '媒体小分類',
  cntCase:       '案件カウント',
  cntQuote:      '見積りカウント',
  cntSurvey:     '現調カウント',
  cntContract:   '契約カウント',
  salesDate:     '売上日',
  amount:        '契約金額（税込）',
  cost:          '最終原価',
  profit:        '最終粗利',
  profitRate:    '最終粗利率',
  storeType:     '店直種別',
  budget:        '予算',
  buildingType:  '建物種別2',
  contractBand:  '契約価格帯',
  rank:          '見込',
  halfComplete:  '半期(完工)',
  qtrComplete:   '四半期(完工)',
  completeYear:  '完工年',
  completeMonth: '完工月',
  block500:      '500万区画',
  block:         'ブロック',
  isKansai:      '関西？',
  occurYear:     '発生年',
  occurMonth:    '発生月',
  priceBand:     '正規価格帯',
  contractYear:  '契約年',
  contractMonth: '契約月',
  halfContract:  '半期(契約)',
  qtrContract:   '四半期(契約)',
  cityGroup:     '物件市区群',
  planDate:      '契約予定日',
  planYear:      '契約予定年',
  planMonth:     '契約予定月',
  halfPlan:      '半期(契約予定)',
  qtrPlan:       '四半期(契約予定)',
  isShinjuku:    '新宿・杉並支店？',

  // --- ここから下は「いまのシートに無い」列 ---
  // 追加すれば自動で表示に使われる。無ければ「未入力」扱いで動く。
  startDate:     '着工日(実績)',   // 着工前と工事中を分けるのに使う
  nextAction:    '次にやること',
  blockerPrice:  '阻害_価格',
  blockerPlan:   '阻害_提案',
  blockerOwner:  '阻害_担当者',
  blockerComp:   '阻害_会社',
  blockerTiming: '阻害_時期',
  blockerDecide: '阻害_決裁者',
  blockerRival:  '阻害_競合',
  lossReason:    '毀損要因'
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
   引用符の中のカンマ・改行を壊さずに読む（split(',')では壊れる）
   --------------------------------------------------------------- */
function parseCSV(text) {
  // BOMを除去
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }   // "" はエスケープされた "
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* 無視（\nで改行を判定する） */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows;
}

/** CSV文字列 → オブジェクトの配列（1行目をヘッダーとして使う） */
function csvToObjects(text) {
  const rows = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length) return [];

  const headers = rows[0].map(h => String(h).replace(/\s+/g, '').trim());

  return rows.slice(1).map(cols => {
    const o = {};
    headers.forEach((h, i) => { o[h] = cols[i] !== undefined ? String(cols[i]).trim() : ''; });
    return o;
  });
}

/** ヘッダーの空白ゆれを吸収して値を取り出す */
function cell(row, colName) {
  if (!colName) return '';
  const key = colName.replace(/\s+/g, '');
  return row[key] !== undefined ? row[key] : '';
}

/* ---------------------------------------------------------------
   4. 値の変換
   --------------------------------------------------------------- */

/** "¥1,234,567" "1234567" "26.8%" → 数値。空なら null */
function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[¥,、\s円]/g, '').replace(/[％%]/g, '');
  if (s === '' || s === '-' || s === '－' || s === '#DIV/0!' || s === '#N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 数値、空なら0 */
function num0(v) { const n = num(v); return n === null ? 0 : n; }

/** 率。"26.8%" → 0.268 / "0.268" → 0.268 */
function rate(v) {
  const s = String(v == null ? '' : v);
  const n = num(s);
  if (n === null) return null;
  return /[％%]/.test(s) ? n / 100 : (Math.abs(n) > 1 ? n / 100 : n);
}

/** 日付文字列 → Date。空・不正なら null */
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === '-' || s === '－') return null;

  // gvizが返す Date(2026,0,5) 形式
  const m = s.match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return new Date(+m[1], +m[2], +m[3]);

  // 2026/1/5  2026-01-05  2026.1.5
  const m2 = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const sameMonth = (d, base) => !!d && d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth();
const sameYear  = (d, y)    => !!d && d.getFullYear() === y;

/* 表示用フォーマット */
const fmtMan   = v => (v === null || v === undefined || !Number.isFinite(v)) ? '―' : Math.round(v / 10000).toLocaleString('ja-JP');
const fmtMan1  = v => (v === null || !Number.isFinite(v)) ? '―' : (v / 10000).toFixed(1);
const fmtMil   = v => (v === null || !Number.isFinite(v)) ? '―' : (v / 1000000).toFixed(1);   // 百万円
const fmtYen   = v => (v === null || !Number.isFinite(v)) ? '―' : Math.round(v).toLocaleString('ja-JP');
const fmtPct   = (v, d = 1) => (v === null || !Number.isFinite(v)) ? '―' : (v * 100).toFixed(d) + '%';
const fmtPt    = v => (v === null || !Number.isFinite(v)) ? '―' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + 'pt';
const fmtNum   = v => (v === null || !Number.isFinite(v)) ? '―' : Math.round(v).toLocaleString('ja-JP');
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
    id:       cell(row, COL.id),
    name:     cell(row, COL.name),
    branch:   cell(row, COL.branch),
    owner:    cell(row, COL.owner),

    inquiry:      parseDate(cell(row, COL.inquiryDate)),
    lost:         parseDate(cell(row, COL.lostDate)),
    quote:        parseDate(cell(row, COL.quoteDate)),
    survey:       parseDate(cell(row, COL.surveyDate)),
    contract:     parseDate(cell(row, COL.contractDate)),
    start:        parseDate(cell(row, COL.startDate)),      // 無い場合は null
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
    block:        cell(row, COL.block),
    cityGroup:    cell(row, COL.cityGroup),
    rank:         normalizeRank(cell(row, COL.rank)),
    nextAction:   cell(row, COL.nextAction),
    lossReason:   cell(row, COL.lossReason),

    occurYear:    num(cell(row, COL.occurYear)),
    occurMonth:   num(cell(row, COL.occurMonth)),
    contractYear: num(cell(row, COL.contractYear)),
    completeYear: num(cell(row, COL.completeYear)),
    completeMonth:num(cell(row, COL.completeMonth)),
    planYear:     num(cell(row, COL.planYear)),
    planMonth:    num(cell(row, COL.planMonth)),

    cntCase:     num0(cell(row, COL.cntCase)),
    cntSurvey:   num0(cell(row, COL.cntSurvey)),
    cntQuote:    num0(cell(row, COL.cntQuote)),
    cntContract: num0(cell(row, COL.cntContract))
  };

  // 契約時粗利（= 契約金額 − 実行予算）。予算が入っていないと出せない
  d.plannedProfit = (amount !== null && budget !== null) ? amount - budget : null;
  d.plannedRate   = (d.plannedProfit !== null && amount) ? d.plannedProfit / amount : null;
  d.finalRate     = d.profitRate !== null ? d.profitRate
                  : (profit !== null && amount ? profit / amount : null);
  // 毀損（完工粗利率 − 契約時粗利率）
  d.loss = (d.finalRate !== null && d.plannedRate !== null) ? d.finalRate - d.plannedRate : null;
  d.lossYen = (d.profit !== null && d.plannedProfit !== null) ? d.profit - d.plannedProfit : null;

  // 阻害要因（列が無ければ空配列）
  d.blockers = BLOCKERS.map(b => {
    const v = cell(row, COL[b.key]);
    return { ...b, remaining: isTruthy(v) };
  });
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
  const s = String(v == null ? '' : v).trim().toUpperCase();
  const m = s.match(/[SABC]/);
  return m ? m[0] : '';
}

/* ---------------------------------------------------------------
   6. ステータス判定
   失注 → 完工 → 工事中 → 着工前 → 見積提出済 → 現調済 → 現調前
   ※「着工日」列が無い場合、契約済み・未完工はすべて「着工前/工事中」に
     まとめて表示する（STATUS_LABEL の注記を参照）
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
  if (d.complete) return STATUS.DONE;
  if (d.contract) {
    if (d.start) return d.start <= today() ? STATUS.IN_WORK : STATUS.BEFORE_START;
    // 着工日が無いときは、完成予定日が近い（当月内）ものを工事中とみなす
    if (d.completePlan && d.completePlan <= addMonths(today(), 1)) return STATUS.IN_WORK;
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
async function loadDeals(sheet = '発生案件') {
  const res = await fetch('/api/GetSheetData?sheet=' + encodeURIComponent(sheet));
  if (!res.ok) throw new Error(await res.text() || ('HTTP ' + res.status));
  const text = await res.text();
  return csvToObjects(text).map(toDeal).filter(d => d.id || d.name);
}

/* ---------------------------------------------------------------
   8. 絞り込み（URLの ?branch= &owner= を使う）
   --------------------------------------------------------------- */
function getParams() {
  const p = new URLSearchParams(location.search);
  return {
    branch: p.get('branch') || '',
    owner:  p.get('owner')  || '',
    year:   Number(p.get('year')) || CONFIG.targetYear || new Date().getFullYear()
  };
}

function applyFilter(deals, { branch, owner }) {
  return deals.filter(d =>
    (!branch || d.branch === branch) &&
    (!owner  || d.owner  === owner));
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(v => v !== '' && v != null))].sort((a, b) => a.localeCompare(b, 'ja'));
}

/** ヘッダーの支店・担当者セレクトを組み立てる */
function buildSelectors(allDeals, params, onChange) {
  const branchSel = document.getElementById('branchSelect');
  const ownerSel  = document.getElementById('ownerSelect');
  const yearSel   = document.getElementById('yearSelect');
  if (!branchSel || !ownerSel) return;

  const branches = uniqueSorted(allDeals.map(d => d.branch));
  branchSel.innerHTML = '<option value="">全支店</option>'
    + branches.map(b => `<option value="${esc(b)}"${b === params.branch ? ' selected' : ''}>${esc(b)}</option>`).join('');

  const owners = uniqueSorted(allDeals.filter(d => !params.branch || d.branch === params.branch).map(d => d.owner));
  ownerSel.innerHTML = '<option value="">全担当</option>'
    + owners.map(o => `<option value="${esc(o)}"${o === params.owner ? ' selected' : ''}>${esc(o)}</option>`).join('');

  if (yearSel) {
    const years = uniqueSorted(allDeals
      .map(d => d.contract || d.inquiry || d.complete)
      .filter(Boolean).map(dt => String(dt.getFullYear()))).reverse();
    const list = years.length ? years : [String(new Date().getFullYear())];
    yearSel.innerHTML = list.map(y => `<option value="${y}"${+y === params.year ? ' selected' : ''}>${y}年</option>`).join('');
    yearSel.onchange = onChange;
  }
  branchSel.onchange = onChange;
  ownerSel.onchange  = onChange;
}

/** セレクトの内容をURLに反映して読み込み直す */
function navigateBySelectors() {
  const p = new URLSearchParams();
  const b = document.getElementById('branchSelect');
  const o = document.getElementById('ownerSelect');
  const y = document.getElementById('yearSelect');
  // 支店を変えたら担当者は一旦クリア
  const changedBranch = b && b.value !== getParams().branch;
  if (b && b.value) p.set('branch', b.value);
  if (o && o.value && !changedBranch) p.set('owner', o.value);
  if (y && y.value) p.set('year', y.value);
  location.search = p.toString();
}

/* ---------------------------------------------------------------
   9. 集計のヘルパー
   --------------------------------------------------------------- */
const sum = (arr, f) => arr.reduce((a, d) => a + (f(d) || 0), 0);

/** 目標（万円）を取り出す */
function targetsFor(owner) {
  const t = (owner && CONFIG.targets[owner]) || CONFIG.targets.default;
  return {
    sales:  (t.sales  || []).map(v => v * 10000),
    profit: (t.profit || []).map(v => v * 10000)
  };
}

/** 月別に集計する土台を作る */
function monthlyBuckets() {
  return Array.from({ length: 12 }, () => ({ amount: 0, profit: 0, count: 0 }));
}

/** グルーピング */
function groupBy(arr, keyFn, fallback = '未入力') {
  const map = new Map();
  arr.forEach(d => {
    const k = keyFn(d) || fallback;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(d);
  });
  return map;
}

/** 読み込み失敗時の表示 */
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
