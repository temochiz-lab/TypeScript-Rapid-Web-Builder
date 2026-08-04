# TypeScript Rapid Web Builder

Browser-based prototype of a Visual TypeScript IDE inspired by VB6, Delphi, and C++Builder.

The first prototype focuses on a small, verifiable loop:

1. Place `Button`, `Label`, and `TextArea` on `Form1`.
2. Move and resize controls with absolute `Left`, `Top`, `Width`, and `Height`.
3. Edit properties in the inspector.
4. Double-click a button to generate a TypeScript click handler.
5. Write TypeScript against runtime control objects such as `Label1.Text`.
6. Add another form from the Forms window.
7. Run the preview and click the button to update the form or navigate.
8. Keep work-in-progress saved automatically in the browser.

Deploy is intentionally left as a later Docker + SSH stage.

## Adopted Structure

```text
app/
  page.tsx        Visual designer, form list, property inspector, code editor, runtime preview
  globals.css    IDE layout and control styling
  layout.tsx     App metadata
tests/
  rendered-html.test.mjs
package.json
```

This keeps the prototype small while leaving room to split the same concepts into future packages:

```text
packages/
  ide-client/
  local-agent/
  app-runtime/
  shared/
examples/
  SampleApp/
```

## Main Data Types

```ts
type ControlType = "Button" | "Label" | "TextArea";

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
};
```

## Form JSON

The active form's JSON tab shows formatted JSON suitable for Git diffs. Export writes a project JSON bundle containing:

- `forms`: the screen definitions
- `files["src/client/forms/Form1.ts"]`: per-form user TypeScript code

Import accepts that bundle shape, a single `form`, or a plain form JSON object with `components`.

## Work-In-Progress Save

The IDE autosaves the current project to browser IndexedDB after edits. On the next launch, the draft is restored automatically, so local work survives reloads while the prototype is still browser-only.

The `Save` and `Open` buttons use the same browser draft store. Packaging, downloadable project bundles, and Git/Vercel publishing are later stages.

## PC Layout And Form Scaling

The IDE shell is responsive for PC resolutions: the toolbox, designer, properties panel, code editor, and preview resize with the browser window.

The form itself stays an absolute-positioned design surface, currently `800 x 600`, so `Left`, `Top`, `Width`, and `Height` remain stable. The designer has zoom modes:

- `100%`
- `Fit Width`
- `Fit Screen`

Future container controls can add padding and alignment inside the form without changing this absolute-coordinate foundation.

## Event Generation

Double-clicking a `Button` creates the missing click handler only when it does not already exist:

```ts
async function Button1_Click(): Promise<void> {
  // Write your TypeScript here.
}
```

Existing handlers are preserved and the editor cursor moves to the function.

## Runtime Preview

Run mode evaluates the selected button handler with runtime objects:

```ts
Label1.Text = "Executed";
TextArea1.Text = "Hello, TypeScript Rapid Web Builder";
```

The prototype also exposes:

- `Api.get(path)`
- `Api.post(path, payload)`
- `Command.run("showDate")`
- `Navigator.go(formName)`

Only `showDate` is allowed for `Command.run`; arbitrary shell commands are rejected.

Use this to move from `Form1` to `Form2`:

```ts
await Navigator.go("Form2");
```

## Local Preview

```bash
pnpm install
pnpm run dev
pnpm run test
```

On this Windows workspace, the Codex-bundled Node path must be available in `PATH` when running scripts directly.
