# Coffee Bed Dashboard

GitHub Pages project for monitoring Shah's coffee drying beds.

- Public site: https://tanja-corp.github.io/coffee-bed-dashboard/
- Read-only Shah CSV: https://tanja-corp.github.io/coffee-bed-dashboard/data/shah-drying-records.csv
- Source data snapshot: `site/data/shah-drying-records.csv` (only rows associated with `SH-` storage-lot IDs)
- Public visitors can read/download the CSV. The static site has no write endpoint.
- This CSV is a snapshot from a Drive-hosted `.xlsx` retrieved on 2026-10-03; it does not auto-sync with the source workbook.
- The source export contains dryer dates, table numbers, Debes counts, date out, moisture, and storage-lot IDs. It does not contain a bed-level occupancy percentage. `no_of_debes` is not an occupancy percentage.
- Do not infer present bed occupancy from historical rows. The latest extracted dryer Date In is 2026-09-12 00:00:00 and the latest Date Out is 2026-09-23 00:00:00.

## Dashboard behavior

- The language switcher in the top bar changes the UI between English (default), Kiswahili, and Japanese. A valid `?lang=en`, `?lang=sw`, or `?lang=ja` URL parameter overrides the saved browser preference. Edit interface translations in `site/i18n.js`.
- `site/index.html` renders the Shah dashboard and an approximate facility diagram based on the five user-provided aerial/reference photos. It marks the drying areas and Factory, Store, Dam, and Skin dryer. The diagram is illustrative, not a surveyed floor plan; actual bed-number-to-position mapping has not been confirmed. The reference photos themselves are not published.
- Selecting a bed shows matching historical rows when its number occurs in the CSV `table_numbers` field. This is a possible history lookup, not confirmation that the bed is currently occupied.
- The CSV's occupancy percentage is blank, and no current per-bed load dates are provided. The dashboard therefore reports current occupancy and bed state as unknown. It does not treat `no_of_debes` as a percentage.
- Age color guide: 0–7 days yellow-green, 8–10 days orange, and 11+ days red. The drying period remains fixed at 14 days. These colors are never assigned to historical rows in the snapshot.
- Shah's 80 total beds and Nylex condition counts (15 good, 65 worn) are shown as provided. The individual beds corresponding to those condition counts are not identified.

## Updating the snapshot

This is a static read-only website; it does not connect live to Drive and it has no write endpoint. To refresh data, export/filter Shah rows from the approved source, review that no other farm's data is included, update `site/data/shah-drying-records.csv` and `site/data/source-info.json`, then commit and push to `main`. GitHub Actions will redeploy the `site/` directory. Never add API keys or service account credentials to this public repository.

For local preview, run a static HTTP server from the repository root and open `http://localhost:8000/site/` (for example: `python -m http.server 8000`). Opening `index.html` as a `file://` URL may block CSV fetches in the browser.

GitHub Pages deploys the `site/` directory on pushes to `main` via `.github/workflows/pages.yml`.

## 日本語の運用案内

### 言語切り替え

上部バーの言語切り替えで、英語（初期表示）・Kiswahili・日本語を選べます。URLに `?lang=en`、`?lang=sw`、`?lang=ja` のいずれかを付けると、ブラウザに保存された選択よりURL指定が優先されます。翻訳文は `site/i18n.js` で編集します。

### 公開URLとローカル起動

- 公開URL: https://tanja-corp.github.io/coffee-bed-dashboard/
- リポジトリのルートで `python -m http.server 8000` を実行し、http://localhost:8000/site/ を開きます。
- `file://` で直接開くとブラウザがCSVの取得を制限する場合があるため、HTTPサーバーを使用してください。

### CSVスナップショットの更新

1. 承認済みの元XLSXから、Storage Lotが `SH-` のShah行だけを抽出します。
2. BF、Tingatinga、その他農園の行が混ざっていないことを確認します。
3. 列順を保ったまま `site/data/shah-drying-records.csv` を更新します。
4. 取得日、行数、最新のDate In / Date Outを確認し、`site/data/source-info.json` を更新します。
5. ローカル表示を確認してから通常のレビュー・公開手順に進みます。

### 公開範囲の注意

このリポジトリとGitHub Pagesは公開されます。公開してよいのはShahの行だけです。BFやTingatingaのデータ、認証情報、APIキー、サービスアカウント鍵、参照写真を追加しないでください。静的サイトには書き込み口はありませんが、CSVは誰でも閲覧・ダウンロードできます。

### デモ表示

「デモ表示」は固定シードで作る架空の現在状況です。色、空き、日付不正、占有率警告、水分の「確認」をUI上で確認するためのもので、実際のベッド状況ではありません。`?demo=1` を付けても、最近の乾燥記録とBed詳細の「過去記録」は実CSVのままです。

### 閾値の変更

乾燥期間、色の境界、水分目安、占有率警告などの設定は `site/config.js` にまとめています。通常は次の値を編集します。

- `DRYING_DAYS`: 固定乾燥期間（現在14日）
- `AGE_GREEN_MAX` / `AGE_ORANGE_MAX`: 色の経過日数境界
- `MOISTURE_TARGET`: 実測水分の目安値（推定には使いません）
- `OCCUPANCY_ALERT`: 全80床の平均占有率警告

### 自動同期がない理由と、同期を有効にする最小手順

現在のDriveファイルはネイティブGoogle SheetsではなくXLSXです。また、現在の投入日とベッド別占有率の列がないため、現時点の稼働状態を安全に自動判定できません。`no_of_debes` は占有率ではありません。

同期を有効にする場合は、ファイル所有者の判断で次の手順を行います。

1. 現況の入力用に、ネイティブのGoogleスプレッドシート「Shah Current Bed Status」を作りました（列は `Bed No`、`Date In`、`Occupancy %` のみ。`templates/shah-current-status-template.csv` と同じ内容）。元のXLSXとは別のファイルです。空きベッドは `Occupancy %` に必ず0を入れます。`Moisture %` 列を足せば水分も表示されます（任意）。
2. ファイルをネイティブGoogle Sheetsへ変換するか、Google Sheetsとして保存します。
3. そのシートだけをCSVとして「ウェブに公開」します。`Date In` 列は書式を「yyyy-mm-dd」にそろえると確実です（`4/10/2026` のような形式も、日付として判別できる場合は読みます）。
4. `site/config.js` の `CURRENT_STATUS_URL` に公開CSV URLを設定します。

ブラウザへサービスアカウント鍵や認証情報を置かないでください。公開CSVに含める範囲はShahの現在状況だけに限定します。
