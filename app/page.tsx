"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ControlType = "Button" | "Label" | "TextArea" | "Frame" | "Container";
type ToolType = "Select" | ControlType;
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
  models: Record<string, string>;
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
  Container: {
    type: "Container",
    text: "",
    left: 20,
    top: 160,
    width: 260,
    height: 220,
    visible: true,
    dock: "None",
    align: "Absolute",
    padding: 10,
    gap: 8,
  },
};

const initialCode = `// Double-click a Button on the form to create its Click handler.
// Runtime controls expose Text, Enabled, Visible, ReadOnly, and Frame.show().
// Navigate with: await Navigator.go("Form2");
// Show a form inside a Frame with: await Frame1.show("Form2");
// Build responsive regions with Container Dock/Align/Padding/Gap.
`;

const initialModelCode = `const AppModel = {
  title: "TypeScript Rapid Web Builder",

  async status() {
    return await Api.get("/status");
  },
};
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
    models: {
      "models_global.ts": initialModelCode,
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

function getModels(project: ProjectDef) {
  return Object.keys(project.models ?? {}).length > 0 ? project.models : { "models_global.ts": initialModelCode };
}

function normalizeModels(raw: any) {
  return Object.keys(raw?.models ?? {}).length > 0 ? raw.models : { "models_global.ts": initialModelCode };
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
      models: normalizeModels(raw),
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
    models: normalizeModels(raw),
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

const tools: ControlType[] = ["Button", "Label", "TextArea", "Frame", "Container"];

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function getChildren(components: ComponentDef[], parentId: string | null) {
  return components.filter((item) => (item.parentId ?? null) === parentId);
}

function getContentRect(container: ComponentDef): Rect {
  const titleHeight = container.type === "Container" ? 24 : 0;
  return {
    left: 0,
    top: titleHeight,
    width: container.width,
    height: Math.max(1, container.height - titleHeight),
  };
}

function layoutChildren(parent: ComponentDef | null, children: ComponentDef[], width: number, height: number) {
  const rects = new Map<string, Rect>();
  const padding = parent?.padding ?? 0;
  const gap = parent?.gap ?? 0;
  const align = parent?.align ?? "Absolute";

  if (align === "Vertical") {
    let y = padding;
    children.forEach((child) => {
      const childHeight = child.dock === "Fill" ? Math.max(1, height - y - padding) : child.height;
      rects.set(child.id, {
        left: padding,
        top: y,
        width: Math.max(1, width - padding * 2),
        height: childHeight,
      });
      y += childHeight + gap;
    });
    return rects;
  }

  if (align === "Horizontal") {
    let x = padding;
    children.forEach((child) => {
      const childWidth = child.dock === "Fill" ? Math.max(1, width - x - padding) : child.width;
      rects.set(child.id, {
        left: x,
        top: padding,
        width: childWidth,
        height: Math.max(1, height - padding * 2),
      });
      x += childWidth + gap;
    });
    return rects;
  }

  let remaining = {
    left: padding,
    top: padding,
    width: Math.max(1, width - padding * 2),
    height: Math.max(1, height - padding * 2),
  };

  children.forEach((child) => {
    const dock = child.dock ?? "None";
    if (dock === "Top") {
      rects.set(child.id, { left: remaining.left, top: remaining.top, width: remaining.width, height: child.height });
      remaining = { ...remaining, top: remaining.top + child.height + gap, height: Math.max(1, remaining.height - child.height - gap) };
      return;
    }
    if (dock === "Bottom") {
      rects.set(child.id, { left: remaining.left, top: remaining.top + remaining.height - child.height, width: remaining.width, height: child.height });
      remaining = { ...remaining, height: Math.max(1, remaining.height - child.height - gap) };
      return;
    }
    if (dock === "Left") {
      rects.set(child.id, { left: remaining.left, top: remaining.top, width: child.width, height: remaining.height });
      remaining = { ...remaining, left: remaining.left + child.width + gap, width: Math.max(1, remaining.width - child.width - gap) };
      return;
    }
    if (dock === "Right") {
      rects.set(child.id, { left: remaining.left + remaining.width - child.width, top: remaining.top, width: child.width, height: remaining.height });
      remaining = { ...remaining, width: Math.max(1, remaining.width - child.width - gap) };
      return;
    }
    if (dock === "Fill") {
      rects.set(child.id, { ...remaining });
      remaining = { ...remaining, width: 1, height: 1 };
      return;
    }
    rects.set(child.id, { left: child.left, top: child.top, width: child.width, height: child.height });
  });

  return rects;
}

function collectDescendantIds(components: ComponentDef[], ids: string[]) {
  const remove = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    components.forEach((item) => {
      if (item.parentId && remove.has(item.parentId) && !remove.has(item.id)) {
        remove.add(item.id);
        changed = true;
      }
    });
  }
  return remove;
}

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

function createControl(type: ControlType, components: ComponentDef[], left: number, top: number, parentId?: string, parentWidth = formWidth, parentHeight = formHeight): ComponentDef {
  const base = defaults[type];
  const name = nextName(type, components);
  return {
    ...base,
    id: crypto.randomUUID(),
    name,
    text: type === "TextArea" || type === "Frame" ? "" : name,
    left: clamp(Math.round(left), 0, Math.max(0, parentWidth - base.width)),
    top: clamp(Math.round(top), 0, Math.max(0, parentHeight - base.height)),
    parentId,
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
          parentId: item.parentId,
          dock: item.dock,
          align: item.align,
          padding: item.padding,
          gap: item.gap,
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
  const [activeTab, setActiveTab] = useState<"code" | "json" | "model">("code");
  const [activeModelName, setActiveModelName] = useState("models_global.ts");
  const [activeLeftTab, setActiveLeftTab] = useState<"tools" | "forms" | "files">("tools");
  const [previewMode, setPreviewMode] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("100");
  const [fitZoom, setFitZoom] = useState(1);
  const [status, setStatus] = useState("Ready");

  const activeForm = getActiveForm(project);
  const activeCode = getActiveCode(project);
  const models = getModels(project);
  const activeModelCode = models[activeModelName] ?? models["models_global.ts"] ?? initialModelCode;
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

  const addControl = useCallback((type: ControlType, x: number, y: number, parentId?: string, parentWidth = formWidth, parentHeight = formHeight) => {
    setProject((current) => {
      const form = getActiveForm(current);
      const component = createControl(type, form.components, x, y, parentId, parentWidth, parentHeight);
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
      const modelCode = Object.values(models).join("\n\n");
      await new AsyncFunction(...Object.keys(runtime), "Api", "Command", "Navigator", `${modelCode}\n\n${body}`)(
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
    const draftModels = getModels(draft);
    setProject(draft);
    setSelectedIds([]);
    setActiveModelName(draftModels["models_global.ts"] ? "models_global.ts" : Object.keys(draftModels)[0]);
    setStatus("Project opened");
  };

  const newProject = () => {
    setProject(createInitialProject());
    setSelectedIds([]);
    setActiveTab("code");
    setActiveModelName("models_global.ts");
    setActiveLeftTab("tools");
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

  const createNewModel = () => {
    setProject((current) => {
      const currentModels = getModels(current);
      let index = 1;
      while (currentModels[`models_model${index}.ts`]) index += 1;
      const name = `models_model${index}.ts`;
      setActiveModelName(name);
      setSelectedIds([]);
      setPreviewMode(false);
      setActiveTab("model");
      setActiveLeftTab("files");
      setStatus(`${name} created`);
      return {
        ...current,
        models: {
          ...currentModels,
          [name]: `const Model${index} = {\n  async list() {\n    return await Api.get(\"/${name.replace(/^models_|\\.ts$/g, "")}\");\n  },\n};\n`,
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

  const openProjectFile = (formName: string, tab: "code" | "json") => {
    setProject((current) => ({ ...current, activeFormName: formName }));
    setSelectedIds([]);
    setPreviewMode(false);
    setActiveTab(tab);
    setStatus(`${formName}.${tab === "code" ? "ts" : "json"} opened`);
  };

  const openModelFile = (modelName: string) => {
    setActiveModelName(modelName);
    setSelectedIds([]);
    setPreviewMode(false);
    setActiveTab("model");
    setStatus(`${modelName} opened`);
  };

  const loadSample = () => {
    const container: ComponentDef = {
      ...defaults.Container,
      id: crypto.randomUUID(),
      name: "Container1",
      text: "",
      left: 0,
      top: 0,
      width: 156,
      height: formHeight,
      dock: "Left",
      align: "Vertical",
      padding: 12,
      gap: 10,
      events: {},
    };
    const button: ComponentDef = {
      ...defaults.Button,
      id: crypto.randomUUID(),
      name: "Button1",
      text: "Show Form2",
      left: 0,
      top: 0,
      width: 132,
      height: 34,
      parentId: container.id,
      events: { click: "Button1_Click" },
    };
    const label: ComponentDef = {
      ...defaults.Label,
      id: crypto.randomUUID(),
      name: "Label1",
      text: "Left menu",
      left: 0,
      top: 44,
      width: 132,
      height: 26,
      parentId: container.id,
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
      dock: "Fill",
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
  const status = await AppModel.status();
  Label1.Text = status.message;
  await Frame1.show("Form2");
}
`;
    setProject({
      name: "TypeScript Rapid Web Builder",
      activeFormName: "Form1",
      forms: [
        createForm("Form1", [container, frame, button, label]),
        createForm("Form2", [form2Label]),
      ],
      codeByForm: {
        Form1: code,
        Form2: `// Form2.ts\n// This form is shown inside Frame1.\n`,
      },
      models: {
        "models_global.ts": initialModelCode,
      },
    });
    setSelectedIds([button.id]);
    setSelectedTool("Select");
    setActiveTab("code");
    setActiveModelName("models_global.ts");
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
        models,
        files: {
          ...Object.fromEntries(Object.entries(models).map(([name, code]) => [name, code])),
          ...Object.fromEntries(Object.entries(models).map(([name, code]) => [`src/models/${name.replace(/^models_|\\.ts$/g, "")}.ts`, code])),
          ...Object.fromEntries(project.forms.map((form) => [`src/client/forms/${form.name}.ts`, project.codeByForm[form.name] ?? initialCode])),
        },
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
          parentId: item.properties?.parentId,
          dock: item.properties?.dock,
          align: item.properties?.align ?? item.properties?.layout,
          padding: item.properties?.padding,
          gap: item.properties?.gap,
          events: item.events ?? {},
        })),
      }));
      const codeByForm = Object.fromEntries(
        importedForms.map((form) => [form.name, payload.files?.[`src/client/forms/${form.name}.ts`] ?? payload.codeByForm?.[form.name] ?? payload.code ?? initialCode]),
      );
      const importedModels =
        payload.models ??
        Object.fromEntries(
          Object.entries(payload.files ?? {})
            .filter(([name]) => name.startsWith("models_") && name.endsWith(".ts"))
            .map(([name, code]) => [name, code]),
        );
      const normalizedImportedModels = Object.keys(importedModels).length > 0 ? importedModels : { "models_global.ts": initialModelCode };
      setProject({
        name: payload.projectName ?? "TypeScript Rapid Web Builder",
        activeFormName: payload.activeFormName ?? importedForms[0]?.name ?? "Form1",
        forms: importedForms.length > 0 ? importedForms : [createForm("Form1")],
        codeByForm,
        models: normalizedImportedModels,
      });
      setSelectedIds(importedForms[0]?.components[0]?.id ? [importedForms[0].components[0].id] : []);
      setActiveModelName(normalizedImportedModels["models_global.ts"] ? "models_global.ts" : Object.keys(normalizedImportedModels)[0]);
      setActiveTab("code");
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
        components: form.components.filter((item) => !collectDescendantIds(form.components, selectedIds).has(item.id)),
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
          .filter((item) => !item.parentId && item.left < right && item.left + item.width > left && item.top < bottom && item.top + item.height > top)
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
      ["Dock", selected.dock ?? "None", "text"],
    ];
    if (selected.type !== "Label" && selected.type !== "Frame") rows.push(["Enabled", selected.enabled ?? true, "checkbox"]);
    if (selected.type === "TextArea") rows.push(["ReadOnly", selected.readOnly ?? false, "checkbox"]);
    if (selected.type === "Frame") rows.push(["Form", selected.frameForm ?? "", "text"]);
    if (selected.type === "Container") {
      rows.push(["Align", selected.align ?? "Absolute", "text"]);
      rows.push(["Padding", selected.padding ?? 10, "number"]);
      rows.push(["Gap", selected.gap ?? 8, "number"]);
    }
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
    if (property === "Dock") {
      const dock = String(value) as DockMode;
      if (!["None", "Top", "Left", "Right", "Bottom", "Fill"].includes(dock)) {
        setStatus("Dock must be None, Top, Left, Right, Bottom, or Fill");
        return;
      }
      updateComponent(selected.id, { dock });
      return;
    }
    if (property === "Align") {
      const align = String(value) as AlignMode;
      if (!["Absolute", "Vertical", "Horizontal"].includes(align)) {
        setStatus("Align must be Absolute, Vertical, or Horizontal");
        return;
      }
      updateComponent(selected.id, { align });
      return;
    }
    const key = property.charAt(0).toLowerCase() + property.slice(1);
    if (["left", "top", "width", "height", "padding", "gap"].includes(key)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        setStatus(`${property} must be numeric`);
        return;
      }
      if (key === "padding" || key === "gap") {
        updateComponent(selected.id, { [key]: clamp(Math.round(numeric), 0, 64) } as Partial<ComponentDef>);
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

  const renderComponent = (component: ComponentDef, rect: Rect) => {
    const childComponents = getChildren(components, component.id).filter((item) => item.visible ?? true);
    const contentRect = getContentRect(component);
    const childRects = layoutChildren(component, childComponents, contentRect.width, contentRect.height);

    return (
      <div
        className={selectedIds.includes(component.id) && !previewMode ? "control selected" : "control"}
        key={component.id}
        onClick={(event) => {
          event.stopPropagation();
          if (!previewMode) setSelectedIds([component.id]);
        }}
        onDoubleClick={() => handleDoubleClick(component)}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (previewMode) return;
          setSelectedIds([component.id]);
          if (component.parentId || (component.dock ?? "None") !== "None") return;
          const rect = event.currentTarget.getBoundingClientRect();
          setDrag({ id: component.id, dx: (event.clientX - rect.left) / currentZoom, dy: (event.clientY - rect.top) / currentZoom });
        }}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
      >
        {component.type === "Button" && (
          <button disabled={!(component.enabled ?? true)} onClick={() => previewMode && runButton(component)}>
            {component.text}
          </button>
        )}
        {component.type === "Label" && <span>{component.text}</span>}
        {component.type === "TextArea" && (
          <textarea
            readOnly={component.readOnly ?? false}
            disabled={!(component.enabled ?? true)}
            value={component.text}
            onChange={(event) => updateComponent(component.id, { text: event.target.value })}
          />
        )}
        {component.type === "Frame" && (
          <div className="frame-control">
            <div className="frame-title">{component.name}{component.frameForm ? `: ${component.frameForm}` : ""}</div>
            <div className="frame-content">{renderFrameContent(component)}</div>
          </div>
        )}
        {component.type === "Container" && (
          <div className="container-control">
            <div className="container-title">{component.name}: {component.align ?? "Absolute"}</div>
            <div
              className="container-content"
              onClick={(event) => {
                event.stopPropagation();
                if (previewMode) return;
                if (selectedTool === "Select") {
                  setSelectedIds([component.id]);
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                addControl(
                  selectedTool,
                  (event.clientX - rect.left) / currentZoom,
                  (event.clientY - rect.top) / currentZoom,
                  component.id,
                  contentRect.width,
                  contentRect.height,
                );
              }}
            >
              {childComponents.map((child) => renderComponent(child, childRects.get(child.id) ?? { left: child.left, top: child.top, width: child.width, height: child.height }))}
            </div>
          </div>
        )}
        {selectedIds.length === 1 && selectedIds[0] === component.id && !previewMode && !component.parentId && (component.dock ?? "None") === "None" && (
          <span
            className="resize-handle"
            onPointerDown={(event) => {
              event.stopPropagation();
              setResize({ id: component.id, startX: event.clientX, startY: event.clientY, width: component.width, height: component.height });
            }}
          />
        )}
      </div>
    );
  };

  const rootComponents = getChildren(components, null).filter((component) => component.visible ?? true);
  const rootRects = layoutChildren(null, rootComponents, formWidth, formHeight);

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
          <button className={previewMode ? "mode-toggle design-mode" : "mode-toggle run-mode"} onClick={() => setPreviewMode((value) => !value)}>{previewMode ? "Design" : "Run"}</button>
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
          <div className="left-tabs">
            <button className={activeLeftTab === "tools" ? "active" : ""} onClick={() => setActiveLeftTab("tools")}>Toolbox</button>
            <button className={activeLeftTab === "forms" ? "active" : ""} onClick={() => setActiveLeftTab("forms")}>Forms</button>
            <button className={activeLeftTab === "files" ? "active" : ""} onClick={() => setActiveLeftTab("files")}>Files</button>
          </div>

          {activeLeftTab === "tools" && (
            <section className="left-tab-panel">
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
            </section>
          )}

          {activeLeftTab === "forms" && (
            <section className="left-tab-panel form-list-window">
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
          )}

          {activeLeftTab === "files" && (
            <section className="left-tab-panel file-list-window">
              <div className="file-list-title">
                <span>Files</span>
                <button onClick={createNewModel}>newModel</button>
              </div>
              <div className="file-list">
                <div className="file-group">
                  <div className="file-folder">Models</div>
                  {Object.keys(models).map((modelName) => (
                    <button
                      className={modelName === activeModelName && activeTab === "model" ? "file-list-item active" : "file-list-item"}
                      key={modelName}
                      onClick={() => openModelFile(modelName)}
                    >
                      {modelName}
                    </button>
                  ))}
                </div>
                {project.forms.map((form) => (
                  <div className="file-group" key={form.name}>
                    <div className="file-folder">{form.name}</div>
                    <button
                      className={form.name === activeForm.name && activeTab === "code" ? "file-list-item active" : "file-list-item"}
                      onClick={() => openProjectFile(form.name, "code")}
                    >
                      {form.name}.ts
                    </button>
                    <button
                      className={form.name === activeForm.name && activeTab === "json" ? "file-list-item active" : "file-list-item"}
                      onClick={() => openProjectFile(form.name, "json")}
                    >
                      {form.name}.json
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
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
                {rootComponents.map((component) =>
                  renderComponent(component, rootRects.get(component.id) ?? { left: component.left, top: component.top, width: component.width, height: component.height }),
                )}
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
          {activeTab === "model" && <button className="active" onClick={() => setActiveTab("model")}>{activeModelName}</button>}
          <span>{status}</span>
        </div>
        {activeTab === "code" || activeTab === "model" ? (
          <textarea
            className="code-editor"
            ref={codeEditorRef}
            spellCheck={false}
            value={activeTab === "model" ? activeModelCode : activeCode}
            onChange={(event) =>
              setProject((current) =>
                activeTab === "model"
                  ? {
                      ...current,
                      models: {
                        ...getModels(current),
                        [activeModelName]: event.target.value,
                      },
                    }
                  : {
                      ...current,
                      codeByForm: {
                        ...current.codeByForm,
                        [getActiveForm(current).name]: event.target.value,
                      },
                    },
              )
            }
          />
        ) : (
          <pre className="json-view">{serializeForm(activeForm)}</pre>
        )}
      </section>
    </main>
  );
}
