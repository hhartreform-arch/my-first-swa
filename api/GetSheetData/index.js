/**
 * GetSheetData
 * スプレッドシートの指定シートをCSVで取得して返す。
 * シートIDはここに置いたままなので、ブラウザ側からは見えない。
 *
 * 使い方:  /api/GetSheetData?sheet=発生案件
 *          /api/GetSheetData?gid=123456789
 */

// ★ スプレッドシートのID（URLの /d/ と /edit の間）
const SHEET_ID = '1dJdFMsFymInhQ-M5qSlHO4tRQaoqKAMhlvDJZ2g_Sio';

// ★ シート名を指定しなかったときに読むシート
const DEFAULT_SHEET = '発生案件';

// ★ 外から指定できるシート名を、ここに列挙したものだけに限定する（誤爆・情報漏れ防止）
const ALLOWED_SHEETS = ['発生案件', '目標', 'アンケート'];

module.exports = async function (context, req) {
    const requested = (req.query.sheet || '').trim();
    const gid = (req.query.gid || '').trim();

    let url;
    if (gid && /^\d+$/.test(gid)) {
        // gid 指定（シート名に変更が入っても壊れない）
        url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    } else {
        const sheet = ALLOWED_SHEETS.includes(requested) ? requested : DEFAULT_SHEET;
        // gviz ならシート名で取れる。headers=1 で1行目をヘッダーとして扱う
        url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`
            + `?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheet)}`;
    }

    try {
        const response = await fetch(url, { redirect: 'follow' });

        if (!response.ok) {
            context.res = {
                status: 502,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                body: `スプレッドシートの取得に失敗しました (HTTP ${response.status})。`
                    + `共有設定が「リンクを知っている全員が閲覧可」になっているか確認してください。`
            };
            return;
        }

        const csvText = await response.text();

        // ログイン画面のHTMLが返ってきていないかの簡易チェック
        if (csvText.trimStart().startsWith('<')) {
            context.res = {
                status: 502,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                body: 'CSVではなくHTMLが返ってきました。スプレッドシートの共有設定を確認してください。'
            };
            return;
        }

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                // 5分キャッシュ。すぐ反映したいときは 0 にする
                'Cache-Control': 'public, max-age=300'
            },
            body: csvText
        };
    } catch (error) {
        context.log.error(error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: 'Error fetching data'
        };
    }
};
