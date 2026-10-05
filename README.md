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
- The snapshot CSV has no per-bed load dates or use status, so current bed state is shown as unknown. The "Beds in use" card counts, out of all 80 beds, those with an open lot on the live sheet. `no_of_debes` is never treated as a percentage.
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

### スマートフォンでの使い方

- 幅720px以下では「マップ」と「一覧」を切り替えられます。一覧は80台を大きなボタン（1列5台）で並べ、色・番号・経過日数が分かります。
- マップは「＋」「−」で拡大でき、指でスクロールして動かします。
- ベッドをタップすると、画面の下に詳細（乗せた日・占有率・経過日数・14日目の予定日・色の理由）が出ます。「×」で閉じます。
- デモ表示は廃止しました。

### 閾値の変更

乾燥期間、色の境界、水分目安、占有率警告などの設定は `site/config.js` にまとめています。通常は次の値を編集します。

- `DRYING_DAYS`: 固定乾燥期間（現在14日）
- `AGE_GREEN_MAX` / `AGE_ORANGE_MAX`: 色の経過日数境界
- `MOISTURE_TARGET`: 実測水分の目安値（推定には使いません）
- `OCCUPANCY_ALERT`: 使用中ベッドの割合の警告（80床のうち何%以上で出すか）

### ライブ連携（Shahシートを直接読む）

ネイティブ版の「Traceability Record Sheet_2026crop」のShahタブを読みます。`site/config.js` の `CURRENT_STATUS_URL` にそのタブのCSV URLを入れると有効になります（`null` の間は、これまでどおり公開スナップショットを表示）。

- 読むのは Tables ブロックの `Date In`、`Table Nos`、`Date Out`（列は見出しで探すので、列を足しても動きます）。`Occupancy %` 列は使いません。
- `Table Nos` があり `Date Out` が空の行を「そのテーブルに乗っている」と判断します。`Date In` は各ロットの先頭行にだけあるため、下の行へ引き継ぎます。
- 同じテーブルに複数行ある場合は、一番古い `Date In` で色を決めます。1行に複数のテーブル番号があるときは、その全テーブルを使用中として数えます。
- 画面の「使用中ベッド」は、全80床のうちロットが乗っているテーブルの数です（例: 52 / 80）。ライブシートを読めない間は「不明」です。使用中が `OCCUPANCY_ALERT`（%）以上になると警告を出します。
- 乗っている行が1つもないテーブルは「空き」です。引き払ったら `Date Out` を入れてください。入れ忘れると、そのテーブルは使用中のまま日数が増え、赤になります。
- 日付は `dd/mm/yyyy`（シートの表示形式）で読みます。年の誤入力（例: 2926）は「日付不正」と表示します。
- `Table Nos` が `4-15` のような範囲表記の未完了行、または81番以上のテーブルは、マップに載せられないため画面に注意書きが出ます。
- ライブ連携中は、記録一覧がシートの内容になり、「CSVを読む」はCSVをダウンロードする代わりに、シートをブラウザで開くリンク（新しいタブ）になります。

ブラウザへサービスアカウント鍵や認証情報を置かないでください。公開するのはShahのタブだけにします。
