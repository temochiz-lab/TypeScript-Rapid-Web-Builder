"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ControlType = "Button" | "Label" | "TextArea" | "Frame";
type ToolType = "Select" | ControlType;

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
  events: Record<string, string>;
};

type FormDef = {
  name: string;
  width: number;
  height: number;
  components: ComponentDef[];
};

type ProjectDef = {
  name: string;
  activeFormName: string;
  forms: FormDef[];
  codeByForm: Record<string, string>;
};

const STORAGE_KEY = "typescript-rapid-web-builder-project";
const DB_NAME = "typescript-rapid-web-builder";
const DB_STORE = "projects";
const DB_PROJECT_KEY = "current";
const formWidth = 800;
const formHeight = 600;
const zoomOptions = ["100", "fit-width", "fit-screen"] as const;
type ZoomMode = (typeof zoomOptions)[number];

const defaults: Record<ControlType, Omit<ComponentDef, "id" | "name" | "events">> = {
  Button: {
    type: "Button",
    text: "Button",
    left: 20,
    top: 20,
    width: 100,
    height: 32,
    enabled: true,
    visible: true,
  },
  Label: {
    type: "Label",
    text: "Label",
    left: 20,
    top: 70,
    width: 120,
    height: 24,
    visible: true,
  },
  TextArea: {
    type: "TextArea",
    text: "",
    left: 20,
    top: 110,
    width: 300,
    height: 120,
    enabled: true,
    visible: true,
    readOnly: false,
  },
  Frame: {
    type: "Frame",
    text: "",
    left: 180,
    top: 28,
    width: 560,
    height: 420,
    visible: true,
  },
};

const initialCode = `// Double-click a Button on the form to create its Click handler.
// Runtime controls expose Text, Enabled, Visible, ReadOnly, and Frame.show().
// Navigate with: await Navigator.go("Form2");
// Show a form inside a Frame with: await Frame1.show("Form2");
`;

function createForm(name: string, components: ComponentDef[] = []): FormDef {
  return {
    name,
    width: formWidth,
    height: formHeight,
    components,
  };
}

function createInitialProject(): ProjectDef {
  return {
    name: "TypeScript Rapid Web Builder",
    activeFormName: "Form1",
    forms: [createForm("Form1")],
    codeByForm: {
      Form1: initialCode,
    },
  };
}

const initialProject = createInitialProject();

function getActiveForm(project: ProjectDef) {
  return project.forms.find((form) => form.name === project.activeFormName) ?? project.forms[0];
}

function getActiveCode(project: ProjectDef) {
  return project.codeByForm[getActiveForm(project).name] ?? initialCode;
}

function updateActiveForm(project: ProjectDef, updater: (form: FormDef) => FormDef): ProjectDef {
  const activeName = getActiveForm(project).name;
  return {
    ...project,
    forms: project.forms.map((form) => (form.name === activeName ? updater(form) : form)),
  };
}

function normalizeProject(raw: any): ProjectDef {
  if (Array.isArray(raw?.forms)) {
    return {
      name: raw.name ?? "TypeScript Rapid Web Builder",
      activeFormName: raw.activeFormName ?? raw.forms[0]?.name ?? "Form1",
      forms: raw.forms.length > 0 ? raw.forms : [createForm("Form1")],
      codeByForm: raw.codeByForm ?? { Form1: raw.code ?? initialCode },
    };
  }

  const form = raw?.form ?? createForm("Form1");
  return {
    name: raw?.name ?? "TypeScript Rapid Web Builder",
    activeFormName: form.name ?? "Form1",
    forms: [
      {
        name: form.name ?? "Form1",
        width: Number(form.width ?? formWidth),
        height: Number(form.height ?? formHeight),
        components: form.components ?? [],
      },
    ],
    codeByForm: {
      [form.name ?? "Form1"]: raw?.code ?? initialCode,
    },
  };
}

function openProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readProjectDraft(): Promise<ProjectDef | null> {
  if (typeof indexedDB === "undefined") {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeProject(JSON.parse(raw)) : null;
  }

  const db = await openProjectDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readonly");
    const request = transaction.objectStore(DB_STORE).get(DB_PROJECT_KEY);
    request.onsuccess = () => resolve(request.result ? normalizeProject(request.result) : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeProjectDraft(project: ProjectDef): Promise<void> {
  if (typeof indexedDB === "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return;
  }

  const db = await openProjectDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(project, DB_PROJECT_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

const tools: ControlType[] = ["Button", "Label", "TextArea", "Frame"];

function nextName(type: ControlType, components: ComponentDef[]) {
  const used = new Set(components.filter((item) => item.type === type).map((item) => item.name));
  let index = 1;
  while (used.has(`${type}${index}`)) index += 1;
  return `${type}${index}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function createControl(type: ControlType, components: ComponentDef[], left: number, top: number): ComponentDef {
  const base = defaults[type];
  const name = nextName(type, components);
  return {
    ...base,
    id: crypto.randomUUID(),
    name,
    text: type === "TextArea" || type === "Frame" ? "" : name,
    left: clamp(Math.round(left), 0, formWidth - base.width),
    top: clamp(Math.round(top), 0, formHeight - base.height),
    events: type === "Button" ? { click: "" } : {},
  };
}

function serializeForm(form: FormDef) {
  return JSON.stringify(
    {
      name: form.name,
      width: form.width,
      height: form.height,
      components: form.components.map((item) => ({
        type: item.type,
        name: item.name,
        properties: {
          text: item.text,
          left: item.left,
          top: item.top,
          width: item.width,
          height: item.height,
          enabled: item.enabled,
          visible: item.visible,
          readOnly: item.readOnly,
          frameForm: item.frameForm,
        },
        events: item.events,
      })),
    },
    null,
    2,
  );
}

function ensureClickHandler(code: string, control: ComponentDef) {
  const handlerName = control.events.click || `${control.name}_Click`;
  const pattern = new RegExp(`async\\s+function\\s+${handlerName}\\s*\\(`);
  if (pattern.test(code)) return { code, handlerName, created: false };

  const nextCode = `${code.trimEnd()}

async function ${handlerName}(): Promise<void> {
  // Write your TypeScript here.
}
`;
  return { code: nextCode, handlerName, created: true };
}

function getHandlerBody(code: string, handlerName: string) {
  const header = new RegExp(`async\\s+function\\s+${handlerName}\\s*\\([^)]*\\)\\s*(?::\\s*Promise\\s*<\\s*void\\s*>)?\\s*\\{`, "m");
  const match = header.exec(code);
  if (!match) return "";

  let depth = 1;
  let cursor = match.index + match[0].length;
  while (cursor < code.length) {
    const char = code[cursor];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return code.slice(match.index + match[0].length, cursor);
    cursor += 1;
  }
  return "";
}

export default function Home() {
  const formRef = useRef<HTMLDivElement | null>(null);
  const designerViewportRef = useRef<HTMLDivElement | null>(null);
  const codeEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const skipBlankClickRef = useRef(false);
  const autosaveReadyRef = useRef(false);
  const [project, setProject] = useState<ProjectDef>(initialProject);
  const [selectedTool, setSelectedTool] = useState<ToolType>("Select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; startX: number; startY: number; width: number; height: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"code" | "json">("code");
  const [previewMode, setPreviewMode] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("100");
  const [fitZoom, setFitZoom] = useState(1);
  const [status, setStatus] = useState("Ready");

  const activeForm = getActiveForm(project);
  const activeCode = getActiveCode(project);
  const components = activeForm.components;
  const selected = selectedIds.length === 1 ? components.find((item) => item.id === selectedIds[0]) ?? null : null;
  const currentZoom = zoomMode === "100" ? 1 : fitZoom;

  const getFormPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = formRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: clamp((clientX - rect.left) / currentZoom, 0, formWidth),
        y: clamp((clientY - rect.top) / currentZoom, 0, formHeight),
      };
    },
    [currentZoom],
  );

  const focusHandler = useCallback((handlerName: string, code: string) => {
    requestAnimationFrame(() => {
      const editor = codeEditorRef.current;
      if (!editor) return;
      const index = code.indexOf(`async function ${handlerName}`);
      if (index < 0) return;
      editor.focus();
      editor.setSelectionRange(index, index);
    });
  }, []);

  const recalculateFitZoom = useCallback(() => {
    const viewport = designerViewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(1, viewport.clientWidth - 32);
    const availableHeight = Math.max(1, viewport.clientHeight - 32);
    const widthZoom = availableWidth / formWidth;
    const screenZoom = Math.min(widthZoom, availableHeight / formHeight);
    setFitZoom(clamp(zoomMode === "fit-screen" ? screenZoom : widthZoom, 0.25, 2));
  }, [zoomMode]);

  useEffect(() => {
    let cancelled = false;
    readProjectDraft()
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setProject(draft);
          setStatus("Draft restored");
        } else {
          setStatus("Ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("Autosave restore failed");
      })
      .finally(() => {
        if (!cancelled) autosaveReadyRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autosaveReadyRef.current) return;
    const timer = window.setTimeout(() => {
      writeProjectDraft(project)
        .then(() => setStatus("Autosaved"))
        .catch(() => setStatus("Autosave failed"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    recalculateFitZoom();
    const viewport = designerViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(recalculateFitZoom);
    observer.observe(viewport);
    window.addEventListener("resize", recalculateFitZoom);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recalculateFitZoom);
    };
  }, [recalculateFitZoom]);

  const updateComponent = useCallback((id: string, patch: Partial<ComponentDef>) => {
    setProject((current) =>
      updateActiveForm(current, (form) => ({
        ...form,
        components: form.components.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      })),
    );
  }, []);

  const addControl = useCallback((type: ControlType, x: number, y: number) => {
    setProject((current) => {
      const form = getActiveForm(current);
      const component = createControl(type, form.components, x, y);
      setSelectedIds([component.id]);
      setSelectedTool("Select");
      setStatus(`${component.name} placed`);
      return {
        ...updateActiveForm(current, (form) => ({
          ...form,
          components: [...form.components, component],
        })),
      };
    });
  }, []);

  const handleFormClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || previewMode) return;
    if (skipBlankClickRef.current) {
      skipBlankClickRef.current = false;
      return;
    }
    if (selectedTool === "Select") {
      setSelectedIds([]);
      return;
    }
    const point = getFormPoint(event.clientX, event.clientY);
    if (point) addControl(selectedTool, point.x, point.y);
  };

  const handleFormPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || previewMode || selectedTool !== "Select") return;
    const point = getFormPoint(event.clientX, event.clientY);
    if (!point) return;
    setSelectionBox({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
    setSelectedIds([]);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (previewMode) return;
    const type = event.dataTransfer.getData("control") as ControlType;
    if (!tools.includes(type)) return;
    const point = getFormPoint(event.clientX, event.clientY);
    if (point) addControl(type, point.x, point.y);
  };

  const handleDoubleClick = (component: ComponentDef) => {
    if (component.type !== "Button" || previewMode) return;
    const result = ensureClickHandler(activeCode, component);
    let nextCode = result.code;
    setProject((current) => ({
      ...updateActiveForm(current, (form) => ({
        ...form,
        components: form.components.map((item) =>
          item.id === component.id ? { ...item, events: { ...item.events, click: result.handlerName } } : item,
        ),
      })),
      codeByForm: {
        ...current.codeByForm,
        [activeForm.name]: nextCode,
      },
    }));
    setActiveTab("code");
    focusHandler(result.handlerName, nextCode);
    setStatus(result.created ? `${result.handlerName} generated` : `${result.handlerName} selected`);
  };

  const runButton = async (component: ComponentDef) => {
    const handlerName = component.events.click;
    if (!handlerName) {
      setStatus(`${component.name} has no Click handler`);
      return;
    }
    const body = getHandlerBody(activeCode, handlerName);
    if (!body.trim()) {
      setStatus(`${handlerName} is empty`);
      return;
    }

    const draft = new Map(components.map((item) => [item.name, { ...item }]));
    const runtime = Object.fromEntries(
      [...draft.entries()].map(([name, item]) => [
        name,
        {
          get Text() {
            return item.text;
          },
          set Text(value: string) {
            item.text = String(value);
          },
          get Enabled() {
            return item.enabled ?? true;
          },
          set Enabled(value: boolean) {
            item.enabled = Boolean(value);
          },
          get Visible() {
            return item.visible ?? true;
          },
          set Visible(value: boolean) {
            item.visible = Boolean(value);
          },
          get ReadOnly() {
            return item.readOnly ?? false;
          },
          set ReadOnly(value: boolean) {
            item.readOnly = Boolean(value);
          },
          get Form() {
            return item.frameForm ?? "";
          },
          set Form(value: string) {
            const target = String(value);
            if (item.type !== "Frame") throw new Error(`${name} is not a Frame`);
            if (!project.forms.some((form) => form.name === target)) throw new Error(`Form not found: ${target}`);
            item.frameForm = target;
          },
          show: async (formName: string) => {
            const target = String(formName);
            if (item.type !== "Frame") throw new Error(`${name} is not a Frame`);
            if (!project.forms.some((form) => form.name === target)) throw new Error(`Form not found: ${target}`);
            item.frameForm = target;
          },
        },
      ]),
    );

    try {
      let nextFormName: string | null = null;
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      await new AsyncFunction(...Object.keys(runtime), "Api", "Command", "Navigator", body)(
        ...Object.values(runtime),
        {
          get: async (path: string) => ({
            message: path === "/status" ? "API status: OK" : `GET ${path}`,
          }),
          post: async (path: string, payload: unknown) => ({
            message: `POST ${path}`,
            payload,
          }),
        },
        {
          run: async (commandId: string) => {
            if (commandId !== "showDate") throw new Error(`Command is not allowed: ${commandId}`);
            return { output: new Date().toString() };
          },
        },
        {
          go: async (formName: string) => {
            const target = String(formName);
            if (!project.forms.some((form) => form.name === target)) throw new Error(`Form not found: ${target}`);
            nextFormName = target;
          },
        },
      );
      setProject((current) => ({
        ...updateActiveForm(current, (form) => ({
          ...form,
          components: form.components.map((item) => draft.get(item.name) ?? item),
        })),
        activeFormName: nextFormName ?? current.activeFormName,
      }));
      if (nextFormName) setSelectedIds([]);
      setStatus(nextFormName ? `${handlerName} opened ${nextFormName}` : `${handlerName} executed`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Execution failed");
    }
  };

  const saveProject = async () => {
    try {
      await writeProjectDraft(project);
      setStatus("Project saved to IndexedDB");
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      setStatus("Project saved locally");
    }
  };

  const openProject = async () => {
    const draft = await readProjectDraft();
    if (!draft) {
      setStatus("No saved project found");
      return;
    }
    setProject(draft);
    setSelectedIds([]);
    setStatus("Project opened");
  };

  const newProject = () => {
    setProject(createInitialProject());
    setSelectedIds([]);
    setPreviewMode(false);
    setStatus("New project created");
  };

  const createNewForm = () => {
    setProject((current) => {
      let index = current.forms.length + 1;
      const used = new Set(current.forms.map((form) => form.name));
      while (used.has(`Form${index}`)) index += 1;
      const name = `Form${index}`;
      setSelectedIds([]);
      setSelectedTool("Select");
      setActiveTab("code");
      setPreviewMode(false);
      setStatus(`${name} created`);
      return {
        ...current,
        activeFormName: name,
        forms: [...current.forms, createForm(name)],
        codeByForm: {
          ...current.codeByForm,
          [name]: `// ${name}.ts\n// Navigate with: await Navigator.go("Form1");\n`,
        },
      };
    });
  };

  const switchForm = (name: string) => {
    setProject((current) => ({ ...current, activeFormName: name }));
    setSelectedIds([]);
    setPreviewMode(false);
    setStatus(`${name} opened`);
  };

  const loadSample = () => {
    const button: ComponentDef = {
      ...defaults.Button,
      id: crypto.randomUUID(),
      name: "Button1",
      text: "Show Form2",
      left: 32,
      top: 28,
      width: 118,
      height: 34,
      events: { click: "Button1_Click" },
    };
    const label: ComponentDef = {
      ...defaults.Label,
      id: crypto.randomUUID(),
      name: "Label1",
      text: "Left menu",
      left: 32,
      top: 82,
      width: 220,
      height: 26,
      events: {},
    };
    const frame: ComponentDef = {
      ...defaults.Frame,
      id: crypto.randomUUID(),
      name: "Frame1",
      left: 176,
      top: 28,
      width: 580,
      height: 500,
      frameForm: "Form2",
      events: {},
    };
    const form2Label: ComponentDef = {
      ...defaults.Label,
      id: crypto.randomUUID(),
      name: "Label1",
      text: "Welcome to Form2",
      left: 52,
      top: 48,
      width: 240,
      height: 28,
      events: {},
    };
    const code = `async function Button1_Click(): Promise<void> {
  Label1.Text = "Form2 loaded";
  await Frame1.show("Form2");
}
`;
    setProject({
      name: "TypeScript Rapid Web Builder",
      activeFormName: "Form1",
      forms: [
        createForm("Form1", [button, label, frame]),
        createForm("Form2", [form2Label]),
      ],
      codeByForm: {
        Form1: code,
        Form2: `// Form2.ts\n// This form is shown inside Frame1.\n`,
      },
    });
    setSelectedIds([button.id]);
    setSelectedTool("Select");
    setActiveTab("code");
    setPreviewMode(false);
    focusHandler("Button1_Click", code);
    setStatus("Sample project loaded");
  };

  const exportProject = () => {
    const payload = JSON.stringify(
      {
        projectName: project.name,
        activeFormName: project.activeFormName,
        forms: project.forms.map((form) => JSON.parse(serializeForm(form))),
        files: Object.fromEntries(project.forms.map((form) => [`src/client/forms/${form.name}.ts`, project.codeByForm[form.name] ?? initialCode])),
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trwb-project.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Project JSON exported");
  };

  const importProject = async (file: File | null) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const sourceForms = payload.forms ?? [payload.form ?? payload];
      const importedForms: FormDef[] = sourceForms.map((form: any) => ({
        name: form.name ?? "Form1",
        width: Number(form.width ?? formWidth),
        height: Number(form.height ?? formHeight),
        components: (form.components ?? []).map((item: any) => ({
          id: crypto.randomUUID(),
          type: item.type,
          name: item.name,
          text: item.properties?.text ?? "",
          left: Number(item.properties?.left ?? 20),
          top: Number(item.properties?.top ?? 20),
          width: Number(item.properties?.width ?? 100),
          height: Number(item.properties?.height ?? 32),
          enabled: item.properties?.enabled,
          visible: item.properties?.visible,
          readOnly: item.properties?.readOnly,
          frameForm: item.properties?.frameForm,
          events: item.events ?? {},
        })),
      }));
      const codeByForm = Object.fromEntries(
        importedForms.map((form) => [form.name, payload.files?.[`src/client/forms/${form.name}.ts`] ?? payload.codeByForm?.[form.name] ?? payload.code ?? initialCode]),
      );
      setProject({
        name: payload.projectName ?? "TypeScript Rapid Web Builder",
        activeFormName: payload.activeFormName ?? importedForms[0]?.name ?? "Form1",
        forms: importedForms.length > 0 ? importedForms : [createForm("Form1")],
        codeByForm,
      });
      setSelectedIds(importedForms[0]?.components[0]?.id ? [importedForms[0].components[0].id] : []);
      setStatus("Project JSON imported");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    setProject((current) =>
      updateActiveForm(current, (form) => ({
        ...form,
        components: form.components.filter((item) => !selectedIds.includes(item.id)),
      })),
    );
    setSelectedIds([]);
    setStatus(selectedIds.length === 1 ? "Control deleted" : "Controls deleted");
  }, [selectedIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (selectionBox) {
        const point = getFormPoint(event.clientX, event.clientY);
        if (!point) return;
        setSelectionBox((current) =>
          current
            ? {
                ...current,
                currentX: point.x,
                currentY: point.y,
              }
            : null,
        );
      }
      if (drag) {
        const point = getFormPoint(event.clientX, event.clientY);
        if (!point) return;
        const component = components.find((item) => item.id === drag.id);
        if (!component) return;
        updateComponent(drag.id, {
          left: clamp(Math.round(point.x - drag.dx), 0, formWidth - component.width),
          top: clamp(Math.round(point.y - drag.dy), 0, formHeight - component.height),
        });
      }
      if (resize) {
        updateComponent(resize.id, {
          width: clamp(Math.round(resize.width + (event.clientX - resize.startX) / currentZoom), 24, formWidth),
          height: clamp(Math.round(resize.height + (event.clientY - resize.startY) / currentZoom), 20, formHeight),
        });
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (selectionBox) {
        const point = getFormPoint(event.clientX, event.clientY);
        const currentX = point?.x ?? selectionBox.currentX;
        const currentY = point?.y ?? selectionBox.currentY;
        const left = Math.min(selectionBox.startX, currentX);
        const top = Math.min(selectionBox.startY, currentY);
        const right = Math.max(selectionBox.startX, currentX);
        const bottom = Math.max(selectionBox.startY, currentY);
        skipBlankClickRef.current = right - left > 3 || bottom - top > 3;
        const picked = components
          .filter((item) => item.left < right && item.left + item.width > left && item.top < bottom && item.top + item.height > top)
          .map((item) => item.id);
        setSelectedIds(picked);
        setStatus(picked.length === 0 ? "Selection cleared" : `${picked.length} selected`);
      }
      setSelectionBox(null);
      setDrag(null);
      setResize(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [components, currentZoom, drag, getFormPoint, resize, selectionBox, updateComponent]);

  const inspector = useMemo(() => {
    if (!selected) return null;
    const rows: Array<[string, string | number | boolean | undefined, "text" | "number" | "checkbox"]> = [
      ["Name", selected.name, "text"],
      ["Text", selected.text, "text"],
      ["Left", selected.left, "number"],
      ["Top", selected.top, "number"],
      ["Width", selected.width, "number"],
      ["Height", selected.height, "number"],
      ["Visible", selected.visible ?? true, "checkbox"],
    ];
    if (selected.type !== "Label" && selected.type !== "Frame") rows.push(["Enabled", selected.enabled ?? true, "checkbox"]);
    if (selected.type === "TextArea") rows.push(["ReadOnly", selected.readOnly ?? false, "checkbox"]);
    if (selected.type === "Frame") rows.push(["Form", selected.frameForm ?? "", "text"]);
    if (selected.type === "Button") rows.push(["Click", selected.events.click, "text"]);
    return rows;
  }, [selected]);

  const updateInspector = (property: string, value: string | boolean) => {
    if (!selected) return;
    if (property === "Name") {
      const name = String(value);
      if (!isIdentifier(name)) {
        setStatus("Name must be a TypeScript identifier");
        return;
      }
      if (components.some((item) => item.id !== selected.id && item.name === name)) {
        setStatus("Name already exists");
        return;
      }
      updateComponent(selected.id, { name });
      return;
    }
    if (property === "Click") {
      updateComponent(selected.id, { events: { ...selected.events, click: String(value) } });
      return;
    }
    if (property === "Form") {
      const frameForm = String(value);
      if (frameForm && !project.forms.some((form) => form.name === frameForm)) {
        setStatus(`Form not found: ${frameForm}`);
        return;
      }
      updateComponent(selected.id, { frameForm });
      return;
    }
    const key = property.charAt(0).toLowerCase() + property.slice(1);
    if (["left", "top", "width", "height"].includes(key)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        setStatus(`${property} must be numeric`);
        return;
      }
      const max = key === "left" ? formWidth - selected.width : key === "top" ? formHeight - selected.height : key === "width" ? formWidth - selected.left : formHeight - selected.top;
      updateComponent(selected.id, { [key]: clamp(Math.round(numeric), key === "width" || key === "height" ? 1 : 0, max) } as Partial<ComponentDef>);
      return;
    }
    updateComponent(selected.id, {
      [key]: value,
    } as Partial<ComponentDef>);
  };

  const renderFrameContent = (component: ComponentDef) => {
    const target = project.forms.find((form) => form.name === component.frameForm);
    if (!target) {
      return <div className="frame-empty">{component.frameForm ? `Form not found: ${component.frameForm}` : "Set Form to show another screen"}</div>;
    }

    const contentHeight = Math.max(1, component.height - 24);
    const scale = Math.min(component.width / target.width, contentHeight / target.height);
    return (
      <div className="embedded-form-shell" style={{ width: target.width * scale, height: target.height * scale }}>
        <div className="embedded-form-surface" style={{ width: target.width, height: target.height, transform: `scale(${scale})` }}>
          {target.components
            .filter((item) => item.visible ?? true)
            .map((item) => (
              <div
                className={`embedded-control embedded-${item.type.toLowerCase()}`}
                key={item.id}
                style={{
                  left: item.left,
                  top: item.top,
                  width: item.width,
                  height: item.height,
                }}
              >
                {item.type === "Button" && <button disabled>{item.text}</button>}
                {item.type === "Label" && <span>{item.text}</span>}
                {item.type === "TextArea" && <textarea readOnly value={item.text} />}
                {item.type === "Frame" && <div className="frame-empty">Frame</div>}
              </div>
            ))}
        </div>
      </div>
    );
  };

  return (
    <main className="ide-shell">
      <header className="ide-menu">
        <div>
          <p className="eyebrow">Visual TypeScript prototype</p>
          <h1>TypeScript Rapid Web Builder</h1>
        </div>
        <div className="menu-actions">
          <button onClick={newProject}>New</button>
          <button onClick={openProject}>Open</button>
          <button onClick={saveProject}>Save</button>
          <button onClick={loadSample}>Sample</button>
          <button onClick={exportProject}>Export</button>
          <button onClick={() => importRef.current?.click()}>Import</button>
          <button onClick={() => setPreviewMode((value) => !value)}>{previewMode ? "Design" : "Run"}</button>
          <button onClick={() => setStatus("Deploy is reserved for the later Docker + SSH stage")}>Deploy</button>
          <input
            ref={importRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => importProject(event.target.files?.[0] ?? null)}
          />
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="toolbox">
          <h2>Toolbox</h2>
          <button
            className={selectedTool === "Select" ? "tool active cursor-tool" : "tool cursor-tool"}
            onClick={() => setSelectedTool("Select")}
          >
            <span className="cursor-icon" />
            Cursor
          </button>
          {tools.map((tool) => (
            <button
              className={selectedTool === tool ? "tool active" : "tool"}
              draggable
              key={tool}
              onClick={() => setSelectedTool(tool)}
              onDragStart={(event) => event.dataTransfer.setData("control", tool)}
            >
              {tool}
            </button>
          ))}
          <section className="form-list-window">
            <div className="form-list-title">
              <span>Forms</span>
              <button onClick={createNewForm}>newForm</button>
            </div>
            <div className="form-list">
              {project.forms.map((form) => (
                <button
                  className={form.name === activeForm.name ? "form-list-item active" : "form-list-item"}
                  key={form.name}
                  onClick={() => switchForm(form.name)}
                >
                  {form.name}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="designer-pane">
          <div className="pane-title">
            <span>{activeForm.name}</span>
            <div className="designer-controls">
              <span>{previewMode ? "Runtime preview" : "Designer"}</span>
              <select value={zoomMode} onChange={(event) => setZoomMode(event.target.value as ZoomMode)}>
                <option value="100">100%</option>
                <option value="fit-width">Fit Width</option>
                <option value="fit-screen">Fit Screen</option>
              </select>
              <span>{Math.round(currentZoom * 100)}%</span>
            </div>
          </div>
          <div className="form-viewport" ref={designerViewportRef}>
            <div className="form-scale-shell" style={{ width: formWidth * currentZoom, height: formHeight * currentZoom }}>
              <div
                className={previewMode ? "form-surface preview" : "form-surface"}
                ref={formRef}
                onClick={handleFormClick}
                onPointerDown={handleFormPointerDown}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                style={{
                  transform: `scale(${currentZoom})`,
                }}
              >
                {components
                  .filter((component) => component.visible ?? true)
                  .map((component) => (
                    <div
                      className={selectedIds.includes(component.id) && !previewMode ? "control selected" : "control"}
                      key={component.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!previewMode) setSelectedIds([component.id]);
                      }}
                      onDoubleClick={() => handleDoubleClick(component)}
                      onPointerDown={(event) => {
                        if (previewMode) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setSelectedIds([component.id]);
                        setDrag({ id: component.id, dx: (event.clientX - rect.left) / currentZoom, dy: (event.clientY - rect.top) / currentZoom });
                      }}
                      style={{
                        left: component.left,
                        top: component.top,
                        width: component.width,
                        height: component.height,
                      }}
                    >
                      {component.type === "Button" && (
                        <button disabled={!(component.enabled ?? true)} onClick={() => previewMode && runButton(component)}>
                          {component.text}
                        </button>
                      )}
                      {component.type === "Label" && <span>{component.text}</span>}
                      {component.type === "TextArea" && <textarea readOnly={component.readOnly ?? false} disabled={!(component.enabled ?? true)} value={component.text} onChange={(event) => updateComponent(component.id, { text: event.target.value })} />}
                      {component.type === "Frame" && (
                        <div className="frame-control">
                          <div className="frame-title">{component.name}{component.frameForm ? `: ${component.frameForm}` : ""}</div>
                          <div className="frame-content">{renderFrameContent(component)}</div>
                        </div>
                      )}
                      {selectedIds.length === 1 && selectedIds[0] === component.id && !previewMode && (
                        <span
                          className="resize-handle"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setResize({ id: component.id, startX: event.clientX, startY: event.clientY, width: component.width, height: component.height });
                          }}
                        />
                      )}
                    </div>
                  ))}
                {selectionBox && !previewMode && (
                  <div
                    className="selection-marquee"
                    style={{
                      left: Math.min(selectionBox.startX, selectionBox.currentX),
                      top: Math.min(selectionBox.startY, selectionBox.currentY),
                      width: Math.abs(selectionBox.currentX - selectionBox.startX),
                      height: Math.abs(selectionBox.currentY - selectionBox.startY),
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="inspector">
          <h2>Properties</h2>
          {!selected && selectedIds.length === 0 && <p className="empty-state">Select a control on Form1.</p>}
          {!selected && selectedIds.length > 1 && <p className="empty-state">{selectedIds.length} controls selected.</p>}
          {selected && (
            <div className="property-list">
              <p className="selected-name">{selected.type}: {selected.name}</p>
              {inspector?.map(([property, value, inputType]) => (
                <label key={property}>
                  <span>{property}</span>
                  {inputType === "checkbox" ? (
                    <input type="checkbox" checked={Boolean(value)} onChange={(event) => updateInspector(property, event.target.checked)} />
                  ) : (
                    <input type={inputType} value={String(value ?? "")} onChange={(event) => updateInspector(property, event.target.value)} />
                  )}
                </label>
              ))}
            </div>
          )}
        </aside>
      </section>

      <section className="editor-pane">
        <div className="tabs">
          <button className={activeTab === "code" ? "active" : ""} onClick={() => setActiveTab("code")}>{activeForm.name}.ts</button>
          <button className={activeTab === "json" ? "active" : ""} onClick={() => setActiveTab("json")}>{activeForm.name}.json</button>
          <span>{status}</span>
        </div>
        {activeTab === "code" ? (
          <textarea
            className="code-editor"
            ref={codeEditorRef}
            spellCheck={false}
            value={activeCode}
            onChange={(event) =>
              setProject((current) => ({
                ...current,
                codeByForm: {
                  ...current.codeByForm,
                  [getActiveForm(current).name]: event.target.value,
                },
              }))
            }
          />
        ) : (
          <pre className="json-view">{serializeForm(activeForm)}</pre>
        )}
      </section>
    </main>
  );
}
