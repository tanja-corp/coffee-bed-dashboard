# Coffee Bed Dashboard

GitHub Pages project for monitoring coffee drying beds at three sites: Shah (numbered through 84), Bergfrieden (45 beds) and Tingatinga (25 beds).

## Sites

- The header tabs switch the site. `?site=shah`, `?site=bergfrieden` or `?site=tingatinga` in the URL selects one directly; the last choice is remembered in the browser.
- Each site reads its own tab of the native "Traceability Record Sheet_2026crop" workbook as CSV in the browser: Shah → `Shah`, Bergfrieden → `BF`, Tingatinga → `TTC`. Site settings (bed count, tab URLs, Nylex counts) are in `SITES` in `site/config.js`. Nothing from the BF or TTC tabs is committed to this repository.
- The top of each site (the hero) shows the site map and a rail with beds in use, state counts, **Due out** (in-use beds grouped by Date In, with the planned Date Out = Date In + 14 days) and **Recent Date Out** (tables cleared, newest first). Selecting a bed shows its Date In, and either its planned Date Out (still on the bed) or the last Date Out (empty bed).
- Site maps are in `site/maps.js`. Bergfrieden is drawn from a hand sketch of the site (supplied mirrored left to right; the map keeps the mirrored layout with the numbers read the right way round). Bed 40 has no outline in the sketch and is placed between beds 41 and 39; the short bed beside the power house is read as 31. Tingatinga is traced in the pixel coordinates of a satellite image (`Tingatinga maps for drying beds.png`, not published). The Tingatinga photo shows 19 beds; beds 20–25 sit in a "not located" tray until their positions are confirmed. Bed numbers have not been checked against the numbers used on site.
- The TTC tab currently has open rows (no Date Out) for tables above 25. Those are listed in the warning under the map and are not drawn.

- Public site: https://tanja-corp.github.io/coffee-bed-dashboard/
- Read-only Shah CSV: https://tanja-corp.github.io/coffee-bed-dashboard/data/shah-drying-records.csv
- Source data snapshot: `site/data/shah-drying-records.csv` (only rows associated with `SH-` storage-lot IDs)
- Public visitors can read/download the CSV. The static site has no write endpoint.
- This CSV is a snapshot from a Drive-hosted `.xlsx` retrieved on 2026-10-03; it does not auto-sync with the source workbook.
- The source export contains dryer dates, table numbers, Debes counts, date out, moisture, and storage-lot IDs. It does not contain a bed-level occupancy percentage. `no_of_debes` is not an occupancy percentage.
- Do not infer present bed occupancy from historical rows. The latest extracted dryer Date In is 2026-09-12 00:00:00 and the latest Date Out is 2026-09-23 00:00:00.

## Dashboard behavior

- The language switcher in the top bar changes the UI between English (default), Kiswahili, and Japanese. A valid `?lang=en`, `?lang=sw`, or `?lang=ja` URL parameter overrides the saved browser preference. Edit interface translations in `site/i18n.js`.
- `site/index.html` renders the Shah dashboard and an approximate facility diagram based on the supplied photos and annotated field print. It marks the drying areas and Factory, Store, Dam, and Skin dryer. The diagram is illustrative, not a surveyed floor plan. The reference photos themselves are not published. The central-west upper row has 70 at its far left and beds 24–1 continuing to the right. The lower row runs 42–25 from left to right; 25 is directly below 8, with no beds farther right. The north runs are 43–53 and 54–64 from bottom to top, with 71 just above 53. Bed 65 is at the far left with an unnumbered bed beside it. Beds 7 and 8 are each one bed despite a pole gap. Bed 66 has no divider, and 75 appears twice. Number 68 was not found and sits in an unlocated tray, not at an invented yard position. East beds 73–78 and 79–84 form two lines of long vertical beds.
- Selecting a bed shows matching historical rows when its number occurs in the CSV `table_numbers` field. This is a possible history lookup, not confirmation that the bed is currently occupied.
- The snapshot CSV has no per-bed load dates or use status, so current bed state is shown as unknown. The "Beds in use" card counts numbered IDs with an open lot on the live sheet, using 84 as the current numbering ceiling. The unnumbered bed is not tied to sheet data; both 75 shapes use the same record. `no_of_debes` is never treated as a percentage.
- Age color guide: 0–7 days yellow-green, 8–10 days orange, and 11+ days red. The drying period remains fixed at 14 days. These colors are never assigned to historical rows in the snapshot.
- Shah's Nylex condition counts (15 good, 65 worn) cover 80 beds in the earlier record; the individual beds corresponding to those counts and the condition of any additional beds are not identified.

## Edit bed states from the dashboard

On desktop, select a bed once to open its current state and populated input fields in a bottom sheet up to 1,040px wide. The left side shows the current state; the right side contains the entry form. For an occupied bed, the existing record is selected for correction by default; clearing the bed is a separate action within the form. Merely opening or closing the sheet creates no draft. Hover details show the load date, planned or actual clearing date, elapsed days and measured moisture. They fit inside the viewport and disappear while the entry sheet is open. CSV file actions live under the small **CSV** control beside the source link. CSV editing is a separate, local working copy for each site. The live Google Sheet and the published Shah snapshot remain read-only.

- On phones, selecting a bed first opens a collapsed status sheet showing the bed number, current state, age and key dates in roughly 130px. Other beds remain tappable. **More detail** expands it; the close button or a downward swipe on its heading dismisses it. **Update** opens the entry form in a separate narrow bottom sheet. Load coffee, clear an occupied bed, correct its details, or confirm an unknown bed is empty. Dates use the Nairobi calendar day; measured moisture is optional.
- **Apply to draft** updates the map, counts, due dates, history and status sheet immediately. It does not save the CSV. Only actual edits create the compact fixed save bar. Select the change count to review a vertical list; the undo arrow reverses the last operation (up to 30 operations during the current session). Cancelling a new form leaves the live source untouched.
- **Save CSV** writes to a file chosen through the browser's file picker when supported (secure-context Chrome/Edge). Reopen an existing CSV to connect it for direct writes. The original file text is checked before a subsequent write; an external change stops the save instead of overwriting it. File permissions remain under the browser's control.
- Other browsers save a UTF-8 CSV with a BOM by download. A download notification says that the download started; the browser cannot confirm where the user ultimately stored it. **File options** also offers a copy/download. Downloading a copy of a directly connected file leaves that file's unsaved changes pending.
- Success notifications disappear after about 4.5 seconds and pause while hovered/focused or while the tab is hidden. Errors remain until dismissed or replaced. File errors from an open bottom sheet appear inside that sheet.
- Drafts stay in memory only while this page is open. Reloading, leaving the page or returning through browser history clears the draft and pending-save bar; there is no draft recovery or leave-page prompt. The previous version's saved browser drafts are removed on startup. To retain changes, save the CSV and reopen it after reloading. Tabs have independent drafts and cannot disable each other's controls; an external change to a connected CSV still stops an overwrite. Undoing every edit or applying unchanged values also clears/avoids the save bar. Closing a dirty form within the page still asks before discarding its input. No records are uploaded by the editor.

The dedicated CSV columns are `site,bed,status,date_in,date_out,moisture_percent,note,updated_at`. `status` is `unknown`, `empty` or `in_use`. Dates are `YYYY-MM-DD`; site IDs match `SITES` in `site/config.js`. The final row for each numbered bed is its current state. Earlier rows must be closed cycles, so clearing and subsequently reloading one bed preserves its history. Every bed in the selected site must be represented. The initial copy contains current bed states and available last-cleared dates; it does not convert the source workbook's full lot history, quantities or grades. Historical snapshots alone never establish current occupancy. Use **File options → Return to live source** after saving to return to the source sheet view.

Run the CSV data-integrity checks with `node --test tests/bed-csv.test.mjs`. No package installation or build step is required.

## Updating the snapshot

The published snapshot has no write endpoint. The dashboard reads current data from the configured Google Sheets CSV exports; the bed editor saves a separate local bed-status CSV. To refresh the published historical snapshot, export/filter Shah rows from the approved source, review that no other farm's data is included, update `site/data/shah-drying-records.csv` and `site/data/source-info.json`, then commit and push to `main`. GitHub Actions will redeploy the `site/` directory. Never add API keys or service account credentials to this public repository.

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

PCでは、ベッドを1回クリックすると、左に現在の状況、右に現在値が入った入力欄を備えた広いボトムシートが開きます。使用中の床は「記録を修正」が初期選択です。下ろす場合はシート内で操作を切り替えます。ホバーでは乗せた日・下ろす予定／実績・経過日数・実測水分を確認でき、入力シートを開くと重複表示しません。スマホでは、小さな状態確認シートで背景のマップ・一覧を操作したまま他の床を確認でき、「詳しく見る」で展開、×または見出しの下スワイプで閉じられます。スマホで入力する場合は「記録を変更」を押してください。いずれも確認して閉じるだけでは下書きを作りません。「下書きに反映」の後、「CSVに保存」でファイルへ保存してください。成功通知は約4.5秒で消えます。実際に変更したときだけ、画面下部にコンパクトな保存バーが出ます。対応ブラウザでは選択したCSVへ直接保存し、それ以外はダウンロードします。以前のファイルはマップ横の小さな「CSV」ボタンから開けます。

ベッド状態CSVは拠点ごとの専用形式です。元のGoogle Sheetsや公開スナップショットへの書き戻し、他端末との自動共有は行いません。下ろした記録は乾燥履歴として残ります。公開スナップショット自体を更新する場合は、次の手順を使います。

下書きは開いているページ内だけで保持します。再読み込み・ページ移動・ブラウザの履歴からの復帰では下書きを破棄し、「CSV未保存」のバーを消します。残す変更は先にCSVへ保存してください。以前ブラウザ内に保存された下書きは復元せず削除します。別タブの操作によってボタンを無効にすることもありません。

1. 承認済みの元XLSXから、Storage Lotが `SH-` のShah行だけを抽出します。
2. BF、Tingatinga、その他農園の行が混ざっていないことを確認します。
3. 列順を保ったまま `site/data/shah-drying-records.csv` を更新します。
4. 取得日、行数、最新のDate In / Date Outを確認し、`site/data/source-info.json` を更新します。
5. ローカル表示を確認してから通常のレビュー・公開手順に進みます。

### 公開範囲の注意

このリポジトリとGitHub Pagesは公開されます。公開してよいのはShahの行だけです。BFやTingatingaのデータ、認証情報、APIキー、サービスアカウント鍵、参照写真を追加しないでください。静的サイトには書き込み口はありませんが、CSVは誰でも閲覧・ダウンロードできます。

### スマートフォンでの使い方

- 幅720px以下では「マップ」と「一覧」を切り替えられます。一覧は番号1〜84を大きなボタン（1列5台）で並べ、色・番号・経過日数が分かります。番号のないベッドは一覧に含みません。
- マップは「＋」「−」で拡大でき、指でスクロールして動かします。
- ベッドをタップすると、画面の下に詳細（乗せた日・占有率・経過日数・14日目の予定日・色の理由）が出ます。「×」で閉じます。
- デモ表示は廃止しました。

### 閾値の変更

乾燥期間、色の境界、水分目安、占有率警告などの設定は `site/config.js` にまとめています。通常は次の値を編集します。

- `DRYING_DAYS`: 固定乾燥期間（現在14日）
- `AGE_GREEN_MAX` / `AGE_ORANGE_MAX`: 色の経過日数境界
- `MOISTURE_TARGET`: 実測水分の目安値（推定には使いません）
- `OCCUPANCY_ALERT`: 使用中ベッドの割合の警告（設定上の番号上限に対して何%以上で出すか）

### ライブ連携（各拠点のタブを直接読む）

ネイティブ版の「Traceability Record Sheet_2026crop」から、拠点ごとに Shah・BF（Bergfrieden）・TTC（Tingatinga）タブを読みます。設定は `site/config.js` の `SITES` にあり、`statusUrl` を `null` にするとその拠点のライブ読み込みを止めます（Shahだけは公開スナップショットに戻ります）。BF・TTCのデータはリポジトリに保存しません。ブラウザがシートから直接読みます。

- ヘッダーのタブで拠点を切り替えます。各タブの数字は「使用中 / 全床」です。
- 画面上部の右側に「下ろす予定」（乗せた日ごとに、予定日 = 乗せた日 + 14日）と「最近下ろした日」（Date Out の新しい順）を出します。ベッドを選ぶと、使用中なら予定日、空きなら最後に下ろした日を表示します。
- Date In が今日より後の行は入力ミス（日と月の入れ違い）とみなし、記録一覧には出しません。

- 読むのは Tables ブロックの `Date In`、`Table Nos`、`Date Out`（列は見出しで探すので、列を足しても動きます）。`Occupancy %` 列は使いません。
- `Table Nos` があり `Date Out` が空の行を「そのテーブルに乗っている」と判断します。`Date In` は各ロットの先頭行にだけあるため、下の行へ引き継ぎます。
- 同じテーブルに複数行ある場合は、一番古い `Date In` で色を決めます。1行に複数のテーブル番号があるときは、その全テーブルを使用中として数えます。
- 画面の「使用中ベッド」は、番号1〜84のうちロットが乗っているテーブル番号の数です。番号のないベッドは含まず、重複する75は1件として数えます。ライブシートを読めない間は「不明」です。使用中が `OCCUPANCY_ALERT`（%）以上になると警告を出します。
- 乗っている行が1つもないテーブルは「空き」です。引き払ったら `Date Out` を入れてください。入れ忘れると、そのテーブルは使用中のまま日数が増え、赤になります。
- 日付は `dd/mm/yyyy`（シートの表示形式）で読みます。年の誤入力（例: 2926）は「日付不正」と表示します。
- `Table Nos` が `4-15` のような範囲表記の未完了行、またはその拠点の床数を超える番号のテーブル（Shah 81番以上、BF 46番以上、TTC 26番以上）は、マップに載せられないため画面に注意書きが出ます。
- ライブ連携中は、記録一覧がシートの内容になり、「CSVを読む」はCSVをダウンロードする代わりに、シートをブラウザで開くリンク（新しいタブ）になります。

ブラウザへサービスアカウント鍵や認証情報を置かないでください。ダッシュボードが読むのは Shah・BF・TTC の3タブです。
