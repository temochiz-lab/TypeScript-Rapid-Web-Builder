# TypeScript Rapid Web Builder

TypeScript Rapid Web Builder は、VB6、Delphi、C++Builder のようなビジュアル開発体験を、ブラウザ上で TypeScript 向けに再構成する試作 IDE です。

最初の試作版では、小さく確認しやすい開発ループに集中しています。

1. `Form1` に `Button`、`Label`、`TextArea`、`Frame`、`Container` を配置する。
2. `Left`、`Top`、`Width`、`Height` の絶対座標でコントロールを移動・リサイズする。
3. Properties でコントロールのプロパティを編集する。
4. Button をダブルクリックして TypeScript のクリックハンドラを生成する。
5. `Label1.Text` のような実行時コントロールオブジェクトに対して TypeScript を書く。
6. Forms ウィンドウからフォームを追加する。
7. Files ウィンドウから `Form1.ts` や `Form1.json` を開く。
8. Preview を実行し、ボタンをクリックしてフォーム更新、画面遷移、Frame内表示、Containerレイアウトを確認する。
9. 作業中の内容をブラウザ内に自動保存する。

デプロイは、まず GitHub + Vercel を想定しています。作成したアプリのパッケージ化は後続フェーズで扱います。

## 現在の構成

```text
app/
  page.tsx        ビジュアルデザイナ、フォーム一覧、プロパティ、コードエディタ、実行プレビュー
  globals.css    IDEレイアウトとコントロールのスタイル
  layout.tsx     アプリのメタデータ
tests/
  rendered-html.test.mjs
package.json
```

試作版では構成を小さく保っています。将来的には、同じ概念を次のようなパッケージに分割できます。

```text
packages/
  ide-client/
  local-agent/
  app-runtime/
  shared/
examples/
  SampleApp/
```

## 主なデータ型

```ts
type ControlType = "Button" | "Label" | "TextArea" | "Frame" | "Container";
type DockMode = "None" | "Top" | "Left" | "Right" | "Bottom" | "Fill";
type AlignMode = "Absolute" | "Vertical" | "Horizontal";

type ComponentDef = {
  id: string;
  type: ControlType;
  name: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  enabled?: boolean;
  visible?: boolean;
  readOnly?: boolean;
  frameForm?: string;
  parentId?: string;
  dock?: DockMode;
  align?: AlignMode;
  padding?: number;
  gap?: number;
  events: Record<string, string>;
};

type ProjectDef = {
  name: string;
  activeFormName: string;
  forms: Array<{
    name: string;
    width: number;
    height: number;
    components: ComponentDef[];
  }>;
  codeByForm: Record<string, string>;
  models: Record<string, string>;
  docs: Record<string, string>;
};
```

## フォームJSON

アクティブなフォームの JSON タブでは、Git の差分で追いやすい整形済み JSON を表示します。

左ペインの Files ウィンドウには、フォームごとの `.ts` と `.json` が表示されます。クリックすると対象フォームを開き、コードタブまたはJSONタブへ切り替わります。

左ペインは `Toolbox`、`Forms`、`Files` のタブに分かれています。画面部品を置くときは `Toolbox`、フォームを切り替えるときは `Forms`、コードやJSONやModelを開くときは `Files` を使います。

各ファイルには、対応する `.md` メモファイルも自動生成されます。

```text
models_global.ts
models_global.ts.md
Form1.ts
Form1.ts.md
Form1.json
Form1.json.md
```

`.md` には設計意図、注意点、TODO、AIに読ませたい補足などを自由に書けます。コードコメントを増やしすぎずに、後から人間やAIが解析しやすい手掛かりを残すための場所です。

## Modelファイル

新規プロジェクトには、デフォルトで `models_global.ts` が作成されます。

`models_global.ts` は、アプリ全体で共有するModelを書く場所です。Filesタブから開いて編集できます。

```ts
const AppModel = {
  title: "TypeScript Rapid Web Builder",

  async status() {
    return await Api.get("/status");
  },
};
```

機能ごとのModelは、Filesタブの `newModel` から `models_model1.ts` のように追加できます。将来的な出力時には、IDE上の `models_global.ts` を `src/models/global.ts` のような通常のTypeScript構成へ変換できます。

フォーム側のクリックハンドラからは、Modelをそのまま呼び出せます。

```ts
async function Button1_Click(): Promise<void> {
  const status = await AppModel.status();
  Label1.Text = status.message;
}
```

Export では、次の情報を含むプロジェクトJSONを書き出します。

- `forms`: 画面定義
- `files["src/client/forms/Form1.ts"]`: フォームごとのユーザーTypeScriptコード

Import は、プロジェクトJSON、単一の `form`、または `components` を持つ素のフォームJSONを受け付けます。

## 作業中保存

IDE上の作業内容は、編集後にブラウザの IndexedDB へ自動保存されます。次回起動時やリロード後にはドラフトが自動復元されるため、ブラウザだけで動いている試作段階でも作業を継続できます。

`Save` と `Open` ボタンも同じブラウザ内ドラフト保存を使います。ダウンロード可能なプロジェクトバンドル、アプリのパッケージ化、Git/Vercel 連携は後続フェーズです。

## PCレイアウトとフォーム拡大縮小

IDE全体はPC解像度に合わせて伸縮します。Toolbox、Designer、Properties、Code Editor、Preview はブラウザウィンドウに合わせてサイズが変わります。

一方で、フォーム自体は現在 `800 x 600` の絶対座標デザイン面として扱います。そのため、`Left`、`Top`、`Width`、`Height` の値は安定します。

Designer には次のズームモードがあります。

- `100%`
- `Fit Width`
- `Fit Screen`

Container コントロールでは、この絶対座標の土台の上に padding や align を追加できます。

## ContainerとDock/Align

`Container` は、部品をまとめるためのレイアウト用コンポーネントです。

Container の中に Button や Label を配置し、Properties で次の値を調整できます。

- `Dock`: 親のどこに張り付くか。`None`、`Top`、`Left`、`Right`、`Bottom`、`Fill`
- `Align`: Container内の並べ方。`Absolute`、`Vertical`、`Horizontal`
- `Padding`: Container内側の余白
- `Gap`: 子部品同士の間隔

たとえば、`Container1` を `Dock=Left`、`Align=Vertical` にすると、左メニュー領域を作れます。右側に `Frame1` を `Dock=Fill` で置くと、PC解像度が変わっても「左メニュー + 右コンテンツ」の構成を保ちやすくなります。

## Frameによる部分画面表示

`Frame` は、フォームの中に別フォームを表示するためのレイアウトコンポーネントです。

たとえば `Form1` に左メニューの Button と `Frame1` を配置し、ボタンのクリックハンドラで次のように書くと、画面全体を遷移せずに `Frame1` の中だけを `Form2` に差し替えられます。

```ts
async function Button1_Click(): Promise<void> {
  await Frame1.show("Form2");
}
```

Properties の `Form` にフォーム名を入れておけば、初期表示するフォームも指定できます。`Container` と組み合わせることで、最近の業務アプリやSPAのような「左メニュー + 右側コンテンツ」型の画面を作れます。

## イベント生成

`Button` をダブルクリックすると、まだ存在しない場合だけクリックハンドラを生成します。

```ts
async function Button1_Click(): Promise<void> {
  // Write your TypeScript here.
}
```

既存のハンドラは保持され、エディタのカーソルだけが対象の関数へ移動します。

## 実行プレビュー

Run モードでは、選択したボタンのハンドラを実行時オブジェクトとともに評価します。

```ts
Label1.Text = "Executed";
TextArea1.Text = "Hello, TypeScript Rapid Web Builder";
```

試作版では、次のAPIも利用できます。

- `Api.get(path)`
- `Api.post(path, payload)`
- `Command.run("showDate")`
- `Navigator.go(formName)`
- `Frame1.show(formName)`

`Command.run` で許可されているのは `showDate` だけです。任意のシェルコマンド実行は拒否します。

`Form1` から `Form2` へ移動するコード例です。

```ts
await Navigator.go("Form2");
```

通常は、次のようにボタンのクリックハンドラ内に書きます。

```ts
async function Button1_Click(): Promise<void> {
  await Navigator.go("Form2");
}
```

## ローカルプレビュー

```bash
pnpm install
pnpm run dev
pnpm run test
```

この Windows ワークスペースで Codex から直接スクリプトを実行する場合は、Codex同梱の Node.js のパスを `PATH` に通す必要があります。
