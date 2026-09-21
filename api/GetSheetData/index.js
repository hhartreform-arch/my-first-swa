module.exports = async function (context, req) {
    const sheetId = '12bLSGCov_nXMiyU-GH1rUdb5ZPEWxe1iNAJsfK71Vd8'; // ★ここにシートIDを入れる（外部からは見えない）
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    try {
        // Azureの裏側からスプシへデータを取りに行く
        const response = await fetch(csvUrl);
        const csvText = await response.text();

        // 取得したCSVデータをそのままブラウザ（HTML）へ返す
        context.res = {
            status: 200,
            body: csvText
        };
    } catch (error) {
        context.res = {
            status: 500,
            body: "Error fetching data"
        };
    }
}
