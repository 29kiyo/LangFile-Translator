# json-translator

JSON などの言語ファイルを、翻訳 API やローカル LLM で自動翻訳する、Windows 用のデスクトップアプリです。Electron + TypeScript 製。

A Windows desktop app that automatically translates JSON language files with translation APIs or local LLMs. Built with Electron + TypeScript.

## 特長 / Features

- 翻訳プロバイダー: Gemini / Claude / ChatGPT / Google Translate / DeepL / LM Studio / Ollama / LibreTranslate (API・ローカル実行)
- 同じプロバイダーの複数登録、優先順位 (ドラッグ&ドロップ)、障害・トークン不足時の自動フォールバック、複数プロバイダーでの並列翻訳 (分配)
- 約 140 言語。検索して複数選択し、一括で翻訳。出力ファイル名は `ja_jp.json` / `ja.json` 形式を選べる
- JSON 構造維持 / キーも翻訳。無視キー (カンマ区切り、または行番号横の赤い点で行単位)。`{0}` `%s` などのプレースホルダを保護
- 翻訳されなかった行の表示・移動・再翻訳
- ファイル選択 / ドラッグ&ドロップ、左右分割の行番号付きエディタ (Monaco)、個別・一括ダウンロード (ZIP / フォルダ)
- ダーク / ライトテーマ、表示言語 (英語・日本語。PC の言語に自動で合わせる。JSON ファイルで言語を追加できる)

English:

- Providers: Gemini / Claude / ChatGPT / Google Translate / DeepL / LM Studio / Ollama / LibreTranslate (API and local run)
- Register the same provider more than once, set priorities (drag and drop), automatic fallback on errors or out-of-tokens, and parallel translation with several providers (distribution)
- About 140 languages. Search, select several, and translate them all at once. Output file names can be `ja_jp.json` or `ja.json` style
- Keep the JSON structure or translate the keys too. Ignore keys (comma-separated, or per line with the red dot next to the line number). Placeholders such as `{0}` and `%s` are protected
- Shows untranslated lines, jumps to them, and retranslates them
- File picker and drag and drop, a split editor with line numbers (Monaco), individual and bulk download (ZIP or folder)
- Dark and light themes, UI language (English and Japanese, follows the PC language, more languages can be added as JSON files)

## 動作確認の状況 / Verification status

実際のサービスやアプリに接続して動作を確認したのは **LM Studio のみ** です。それ以外のプロバイダーは、実際には接続も翻訳も実行していません。リクエストの形式と応答の解釈を、モックを使った単体テストで確認しているだけなので、実際には動作しない場合があります。

GitHub Actions でのビルドは成功しています。配布版 (インストーラー・zip・ポータブル) の動作は、まだ確認していません。

動作しない場合は、GitHub の Issues でお知らせください。

Only **LM Studio** has been tested against a real service. The other providers have never been run against their real services: their request formats and response handling are covered only by mock-based unit tests, so they may not work in practice.

The build succeeds on GitHub Actions. The distributed builds (installer, zip, portable) have not been verified yet.

If something does not work, please open an issue on GitHub.

| プロバイダー / Provider | 実機での動作確認 / Tested on the real service | 確認の内容 / What was checked |
|---|---|---|
| LM Studio | 済み / Done | 接続テスト、翻訳、フォールバック、並列翻訳 / Connection test, translation, fallback, distribution |
| Gemini | 未実施 / Not tested | モックを使った単体テストのみ / Mock-based unit tests only |
| Claude | 未実施 / Not tested | 同上 / Same |
| ChatGPT (OpenAI) | 未実施 / Not tested | 同上 / Same |
| Google Translate | 未実施 / Not tested | 同上 / Same |
| DeepL | 未実施 / Not tested | 同上 / Same |
| Ollama | 未実施 / Not tested | 同上 / Same |
| LibreTranslate (API / ローカル実行 / local) | 未実施 / Not tested | 同上 / Same |

## ダウンロード / Download

[Releases ページ](https://github.com/29kiyo/json-translator/releases) から、次のいずれかを取得できます。

| 種類 / Type | ファイル / File | 使い方 / How to use |
|---|---|---|
| インストーラー / Installer | `json-translator-<version>-setup.exe` | 実行してインストール (管理者権限は不要) / Run it to install (no administrator rights needed) |
| zip | `json-translator-<version>-win.zip` | 展開して `json-translator.exe` を実行 / Extract and run `json-translator.exe` |
| ポータブル / Portable | `json-translator-<version>-portable.exe` | そのまま実行 (インストール不要) / Run it as is (no installation) |

署名していないため、初回の起動時に Windows SmartScreen の警告が出ることがあります。「詳細情報」→「実行」で起動できます。

The files are not code-signed, so Windows SmartScreen may show a warning the first time. Click "More info", then "Run anyway".

You can get any of the files above from the [Releases page](https://github.com/29kiyo/json-translator/releases).

## 使い方 / Usage

1. 「プロバイダー」画面で、使うプロバイダーを登録して「接続テスト」を押す (LM Studio は、ローカルサーバーを起動しておく)。
2. 「エディタ」画面で、ファイルを選択またはドロップする (直接入力もできる)。
3. 「対象言語」で、翻訳先の言語を選ぶ。1つなら右のエディタに、2つ以上なら結果一覧に出る。
4. 「翻訳」を押して、ダウンロードする。出力先と一括ダウンロードの方式は、「設定」画面で選ぶ。

English:

1. On the "Providers" tab, register the providers you want to use and press "Test connection" (for LM Studio, start its local server first).
2. On the "Editor" tab, choose a file or drop it in (you can also type directly).
3. Under "Target languages", choose the languages to translate into. One language shows the result in the right editor; two or more show a results list.
4. Press "Translate", then download. The output folder and the bulk download method are set on the "Settings" tab.

## 表示言語の追加 / Adding a UI language

「設定」→「表示言語の追加」から、JSON ファイルで表示言語を追加できます。

1. 「雛形 (en.json) を書き出す」で、英語のファイルを保存する。
2. 翻訳して、ファイル名を言語コードにする (`fr.json`、`pt_br.json`、`zh_cn.json` など)。このアプリで2言語以上を同時に翻訳して出力された `fr_fr.json` は、そのまま使えます。
3. 「言語ファイルを追加...」で選ぶ。追加すると、「表示言語」の選択肢に出ます。

- 足りないキーは、英語で表示されます。`{n}` のような記号が欠けているキーも、英語で表示されます。
- 追加が終わったあと、元のファイルを削除するかを、設定で選べます (確認する / 確認せずに削除 / 削除しない)。
- 追加した言語は、設定画面の一覧から削除できます。

English: you can add UI languages as JSON files from "Settings" → "Add UI language".

1. Press "Export template (en.json)" to save the English file.
2. Translate it and name the file with a language code (`fr.json`, `pt_br.json`, `zh_cn.json`, and so on). A file such as `fr_fr.json`, produced by translating two or more languages at once with this app, can be used as is.
3. Press "Add language file..." and choose it. The language then appears in the "UI language" list.

- Missing keys are shown in English. Keys that lose a placeholder such as `{n}` are also shown in English.
- After adding, you can choose in the settings whether to delete the original file (ask / delete without asking / keep).
- Added languages can be removed from the list on the settings tab.

## 注意 / Notes

- 設定は `%APPDATA%\json-translator\settings.json` に保存されます。API キーは平文で保存されます。
- Settings are saved in `%APPDATA%\json-translator\settings.json`. API keys are stored in plain text.

## 開発 / Development

    npm install
    npm run dev          # 開発用に起動 / run in development
    npm test             # 単体テスト / unit tests
    npm run typecheck    # 型チェック / type check
    npm run check:i18n   # 翻訳キーの点検 (UI の文言を足したら実行) / check translation keys (run it after adding UI text)

exe のビルドと配布は GitHub Actions (`.github/workflows/build.yml`) で行います。ローカルにビルド環境は不要です。

- `main` へのプッシュでは、テスト・型チェック・翻訳キーの点検・ビルドだけを行います (配布物は作りません)。
- リリースは、GitHub の Actions タブで `build` を選び、「Run workflow」を押して、`version` に `v1.0.0` のようにバージョンを入力します。タグ (`v1.0.0`) と GitHub Release が自動で作られ、インストーラー・zip・ポータブル exe が添付されます。入力したバージョンが、ファイル名と、アプリ・インストーラーのバージョンになります (`package.json` の version は、ビルド時に書き換えられるので、手で変える必要はありません)。同じバージョンのタグやリリースがすでにあると、ビルドの最初で止まります。
- Release の説明には、この README の更新履歴の、同じバージョンの節が使われます。

Builds and releases are done with GitHub Actions (`.github/workflows/build.yml`). No local build environment is needed.

- A push to `main` only runs the tests, the type check, the translation key check and the build (no release files are made).
- To release, open the Actions tab on GitHub, choose `build`, press "Run workflow", and enter a version such as `v1.0.0` in `version`. The tag (`v1.0.0`) and a GitHub Release are created automatically, with the installer, the zip and the portable exe attached. The version you enter becomes the file names and the app and installer version (the version in `package.json` is overwritten at build time, so you do not need to edit it).
- If a tag or release with the same version already exists, the build stops at the start.
- The release description uses the section of this changelog for the same version.

## 更新履歴 / Changelog

### v2.0.0 (開発中 / in development)

- 対応するファイル形式の追加 (予定): ARB、INI、.properties / .lang、CSV / TSV、YAML、PO / POT、Android の strings.xml
- 元ファイルの拡張子から形式を自動で判定し、翻訳の方法を切り替える (予定)
- 汎用の XML と TOML には対応しません

English:

- Planned: more file formats (ARB, INI, .properties / .lang, CSV / TSV, YAML, PO / POT, Android strings.xml)
- Planned: detect the format from the file extension and switch the translation method automatically
- Generic XML and TOML will not be supported

### v1.0.0

初版です。JSON ファイルの翻訳に対応しています。

- 翻訳プロバイダー 8 種の登録、同じプロバイダーの複数登録、優先順位 (ドラッグ&ドロップ)、障害・トークン不足時の自動フォールバック、複数プロバイダーでの並列翻訳 (分配)
- 翻訳モード: 値のみ翻訳 / キーも翻訳。無視キー (カンマ区切り、または行番号横の赤い点で行単位)、プレースホルダ (`{0}` `%s` など) の保護
- 約 140 言語から翻訳先を検索して選択。1 言語なら右のエディタに、2 言語以上なら結果一覧に自動で切り替わり、一括で翻訳できる。結果一覧は、行を開いて編集・保存できる
- 出力ファイル名は `ja_jp.json` / `ja.json` 形式を選べる。個別・一括ダウンロード (ZIP / 出力先フォルダ)
- 翻訳されなかった行の表示、その行への移動、右クリックでの対象外、赤い点とボタンでの再翻訳
- 行番号付きの左右分割エディタ (Monaco)、ファイル選択・ドラッグ&ドロップ
- ダーク / ライトテーマ、表示言語 (英語・日本語。PC の言語に自動で合わせる。JSON ファイルで言語を追加できる)
- 配布物: インストーラー (Inno Setup) / zip / ポータブル exe (GitHub Actions でビルドし、GitHub Releases で配布)
- 実機で動作を確認したのは LM Studio のみ (詳細は「動作確認の状況」)

English:

First release. It translates JSON files.

- Register 8 kinds of translation providers, register the same provider more than once, set priorities (drag and drop), automatic fallback on errors or out-of-tokens, and parallel translation with several providers (distribution)
- Translate modes: values only, or keys too. Ignore keys (comma-separated, or per line with the red dot next to the line number) and protection of placeholders (such as `{0}` and `%s`)
- Search and select target languages from about 140. One language shows the result in the right editor; two or more switch automatically to a results list and are translated at once. Each row of the results list can be opened, edited and saved
- Output file names can be `ja_jp.json` or `ja.json` style. Individual and bulk download (ZIP or output folder)
- Shows untranslated lines, jumps to them, lets you exclude them with a right click, and retranslates them with the red dot or the button
- A split editor with line numbers (Monaco), file picker and drag and drop
- Dark and light themes, UI language (English and Japanese, follows the PC language, more languages can be added as JSON files)
- Distribution: installer (Inno Setup), zip and portable exe (built with GitHub Actions, published on GitHub Releases)
- Only LM Studio has been tested on a real service (see "Verification status")
