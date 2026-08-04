import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the TypeScript Rapid Web Builder shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>TypeScript Rapid Web Builder<\/title>/i);
  assert.match(html, /TypeScript Rapid Web Builder/);
  assert.match(html, /Visual TypeScript prototype/);
  assert.match(html, /Toolbox/);
  assert.match(html, /Forms/);
  assert.match(html, /Files/);
  assert.match(html, /Form1/);
  assert.match(html, /Properties/);
  assert.match(html, /Frame/);
  assert.match(html, /Container/);
  assert.match(html, /Fit Screen/);
});

test("keeps the prototype focused on the requested minimum surface", async () => {
  const [page, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type ControlType = "Button" \| "Label" \| "TextArea" \| "Frame" \| "Container"/);
  assert.match(page, /ensureClickHandler/);
  assert.match(page, /setActiveTab\("code"\)/);
  assert.match(page, /event\.detail >= 2/);
  assert.match(page, /serializeForm/);
  assert.match(page, /Command is not allowed/);
  assert.match(page, /Navigator/);
  assert.match(page, /Frame1\.show/);
  assert.match(page, /renderFrameContent/);
  assert.match(page, /layoutChildren/);
  assert.match(page, /DockMode/);
  assert.match(page, /AlignMode/);
  assert.match(page, /dockOptions/);
  assert.match(page, /alignOptions/);
  assert.match(page, /mode-toggle/);
  assert.match(page, /togglePreviewMode/);
  assert.match(page, /createNewForm/);
  assert.match(page, /createNewModel/);
  assert.match(page, /openProjectFile/);
  assert.match(page, /openModelFile/);
  assert.match(page, /models_global\.ts/);
  assert.match(page, /models_global\.ts\.md/);
  assert.match(page, /initialModelCode/);
  assert.match(page, /normalizeDocs/);
  assert.match(page, /openDocFile/);
  assert.match(page, /activeTab === "form"/);
  assert.match(page, /indexedDB/);
  assert.match(page, /writeProjectDraft/);
  assert.match(page, /fit-screen/);
  assert.match(page, /Api/);
  assert.match(page, /isEditableElement/);
  assert.match(page, /Backspace/);
  assert.match(page, /skipBlankClickRef\.current = true/);
  assert.match(css, /\.form-surface/);
  assert.match(css, /\.form-viewport/);
  assert.match(css, /\.frame-control/);
  assert.match(css, /\.container-control/);
  assert.match(css, /\.file-list-window/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /\.doc-file/);
  assert.match(css, /\.left-tabs/);
  assert.match(css, /\.mode-toggle\.run-mode/);
  assert.match(css, /\.mode-toggle\.design-mode/);
  assert.match(css, /\.property-list/);
  assert.match(css, /\.property-list select/);
  assert.match(css, /\.document-pane/);
  assert.match(css, /\.form-workbench/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /cursor: grab/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
