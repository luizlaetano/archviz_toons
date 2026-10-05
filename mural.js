// ===========================================================
// Mural — mural.js
//
// Canvas simples (Konva) para validação de imagens com clientes.
// Mesmo projeto Supabase do Mapa de Referências. Acesso por link:
//   mural.html?m=<token>   (token de visualização OU de edição)
// Toda leitura/escrita passa pelas funções SQL mural_ler,
// mural_salvar_item e mural_remover_item (RLS sem acesso direto).
// ===========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://gxgsuvsckoeyeeygyhck.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Nv8xHnvLsrkdNOeUXqNNTw_IIVHt_Lc";
const BUCKET = "material-references";
const POLL_MS = 6000;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const C = {
  bg: "#1E1C19", panel: "#262218", line: "#423B30", text: "#EDE6D8",
  dim: "#A89C88", brass: "#C79A3E", brassSoft: "#8C6F30",
};
const FONT_SANS = '"IBM Plex Sans", sans-serif';
const FONT_SERIF = '"Fraunces", serif';

// sem isto o Konva não dispara touchmove durante um arrasto, e a pinça nunca roda
Konva.hitOnDragEnabled = true;

const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get("m");

// ---------- estado ----------
let stage, layer, tr;
let mural = null;
let canEdit = false;
let tool = "select";
let drawing = null;
let editing = false;
let fitted = false;
let keepSelectionUntil = 0;
let saveTimer = null;
let statusTimer = null;

const store = new Map();      // id -> { item, node }
const dirty = new Map();      // id -> item aguardando salvar
const deleting = new Set();   // ids removidos localmente, ainda não confirmados
const signedCache = new Map();// storage_path -> url
const imgCache = new Map();   // storage_path -> HTMLImageElement já carregado

// ---------- util ----------
function setStatus(msg, isError = false) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("error", isError);
  clearTimeout(statusTimer);
  if (!isError && msg === "salvo") statusTimer = setTimeout(() => (s.textContent = ""), 1800);
}

function fail(msg) {
  const f = $("fail");
  f.textContent = msg;
  f.hidden = false;
}

function readable(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return C.text;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? C.bg : C.text;
}

function worldPointer() {
  const p = stage.getPointerPosition();
  if (!p) return { x: 0, y: 0 };
  return stage.getAbsoluteTransform().copy().invert().point(p);
}

function viewCenter() {
  return stage.getAbsoluteTransform().copy().invert().point({ x: stage.width() / 2, y: stage.height() / 2 });
}

// ---------- URLs assinadas (mesma edge function do Mapa de Referências) ----------
async function ensureSigned(paths) {
  const need = [...new Set(paths)].filter((p) => p && !signedCache.has(p));
  if (!need.length) return;
  const { data, error } = await supabase.functions.invoke("get-signed-urls", { body: { paths: need } });
  if (error) return;
  (data?.data || []).forEach((r, i) => {
    if (r?.signedUrl) signedCache.set(r.path || need[i], r.signedUrl);
  });
}

// ---------- construção dos nós ----------
function buildNode(item) {
  const g = new Konva.Group({
    id: item.id, name: "item",
    x: item.x, y: item.y, rotation: item.rotacao || 0,
    draggable: canEdit && tool === "select",
  });
  fillGroup(g, item);
  g.on("dragstart transformstart", () => {
    const rec = store.get(g.id());
    if (rec) rec.before = snap(rec.item);
  });
  g.on("dragend", () => onMoved(g));
  g.on("transformend", () => onTransformed(g));
  return g;
}

function fillGroup(g, item) {
  g.destroyChildren();
  const d = item.dados || {};
  const w = item.w || 0;
  const h = item.h || 0;

  switch (item.tipo) {
    case "frame":
      // só a borda e a faixa do título "pegam" o mouse: o miolo deixa
      // arrastar/selecionar o que está dentro da moldura
      g.add(new Konva.Rect({
        width: w, height: h, cornerRadius: 6, fill: "rgba(199,154,62,0.04)", listening: false,
      }));
      g.add(new Konva.Rect({
        name: "body", width: w, height: h, cornerRadius: 6, fillEnabled: false,
        stroke: C.line, strokeWidth: 2, dash: [10, 8], hitStrokeWidth: 24,
      }));
      g.add(new Konva.Rect({ width: w, height: Math.min(h, 48), fill: "rgba(0,0,0,0.001)" }));
      g.add(new Konva.Text({
        name: "label", x: 14, y: 10, text: d.titulo || "",
        fontFamily: FONT_SERIF, fontSize: d.tamanho || 20, fill: C.brass, listening: false,
      }));
      break;

    case "nota": {
      const fill = d.cor || C.brassSoft;
      g.add(new Konva.Rect({ name: "body", width: w, height: h, fill, cornerRadius: 6 }));
      g.add(new Konva.Text({
        name: "label", x: 14, y: 12, width: Math.max(10, w - 28), height: Math.max(10, h - 24),
        text: d.texto || "", fontFamily: FONT_SANS, fontSize: d.tamanho || 17,
        lineHeight: 1.3, fill: readable(fill), ellipsis: true, listening: false,
      }));
      break;
    }

    case "texto":
      g.add(new Konva.Text({
        name: "body", width: w || undefined, text: d.texto || "",
        fontFamily: FONT_SANS, fontSize: d.tamanho || 20,
        fontStyle: d.peso >= 600 ? "bold" : "normal",
        fill: d.cor || C.text, lineHeight: 1.35,
      }));
      break;

    case "imagem":
      g.add(new Konva.Rect({ name: "body", width: w, height: h, fill: C.panel, stroke: C.line, strokeWidth: 1 }));
      loadImageInto(g, item);
      break;

    case "traco":
      g.add(new Konva.Line({
        name: "body", points: d.pontos || [], stroke: d.cor || C.brass,
        strokeWidth: d.largura || 4, lineCap: "round", lineJoin: "round",
        tension: 0.35, hitStrokeWidth: 16,
      }));
      break;
  }
}

async function loadImageInto(g, item, retried = false) {
  const path = item.dados?.storage_path;
  if (!path) return;
  const put = (img) => {
    const rec = store.get(item.id);
    if (rec && rec.node !== g) return; // nó foi substituído/removido
    const cur = rec?.item || item;
    const body = g.findOne(".body");
    if (body) body.destroy();
    g.add(new Konva.Image({ name: "body", image: img, width: cur.w, height: cur.h }));
    layer.batchDraw();
  };
  if (imgCache.has(path)) return put(imgCache.get(path));
  await ensureSigned([path]);
  const url = signedCache.get(path);
  if (!url) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { imgCache.set(path, img); if (store.get(item.id)?.node === g) put(img); };
  img.onerror = () => {
    if (retried) return;
    signedCache.delete(path); // URL expirada: pede outra uma vez
    loadImageInto(g, item, true);
  };
  img.src = url;
}

// ---------- itens ----------
function addItem(item) {
  const node = buildNode(item);
  store.set(item.id, { item, node });
  layer.add(node);
  tr.moveToTop();
  layer.batchDraw();
  return node;
}

function updateItem(rec, remote) {
  rec.item = remote;
  const g = rec.node;
  g.position({ x: remote.x, y: remote.y });
  g.rotation(remote.rotacao || 0);
  fillGroup(g, remote);
  tr.forceUpdate();
  layer.batchDraw();
}

function removeLocal(id) {
  const rec = store.get(id);
  if (!rec) return;
  if (tr.nodes().includes(rec.node)) tr.nodes([]);
  rec.node.destroy();
  store.delete(id);
  layer.batchDraw();
}

function newItem(tipo, x, y, w, h, dados) {
  const z = Math.max(0, ...[...store.values()].map((r) => r.item.z || 0)) + 1;
  const item = {
    id: crypto.randomUUID(), tipo, x, y, w, h, rotacao: 0, z, dados,
    updated_at: new Date(0).toISOString(),
  };
  const node = addItem(item);
  queueSave(item);
  pushHistory([{ k: "add", s: snap(item) }]);
  return { item, node };
}

// ---------- desfazer / refazer ----------
// Cada entrada do histórico é uma lista de operações: add (item criado),
// del (item removido) ou upd (antes/depois). Desfazer aplica o inverso.
const undoStack = [];
const redoStack = [];
const HISTORY_MAX = 100;

const snap = (it) => JSON.parse(JSON.stringify({
  id: it.id, tipo: it.tipo, x: it.x, y: it.y, w: it.w ?? null, h: it.h ?? null,
  rotacao: it.rotacao || 0, z: it.z || 0, dados: it.dados || {},
}));

function pushHistory(ops) {
  if (!ops.length) return;
  undoStack.push(ops);
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  redoStack.length = 0;
  syncHistoryButtons();
}

function syncHistoryButtons() {
  const u = $("btn-undo"), r = $("btn-redo");
  if (u) u.disabled = !undoStack.length;
  if (r) r.disabled = !redoStack.length;
}

function restoreItem(st) {
  if (store.has(st.id)) return;
  addItem({ ...JSON.parse(JSON.stringify(st)), updated_at: new Date(0).toISOString() });
  queueSave(store.get(st.id).item);
}

function setItemState(st) {
  const rec = store.get(st.id);
  if (!rec) return;
  Object.assign(rec.item, JSON.parse(JSON.stringify(st)));
  rec.node.position({ x: st.x, y: st.y });
  rec.node.rotation(st.rotacao || 0);
  fillGroup(rec.node, rec.item);
  tr.forceUpdate();
  layer.batchDraw();
  queueSave(rec.item);
}

async function removeItem(id) {
  deleting.add(id);
  removeLocal(id);
  dirty.delete(id);
  const { error } = await supabase.rpc("mural_remover_item", { p_edit_token: token, p_item_id: id });
  if (error) setStatus("erro ao excluir: " + error.message, true);
  deleting.delete(id);
}

function applyOp(op, undo) {
  const adding = (op.k === "add") !== undo; // add refeito ou del desfeito
  if (op.k === "upd") setItemState(undo ? op.before : op.after);
  else if (adding) restoreItem(op.s);
  else removeItem(op.s.id);
}

function stepHistory(from, to, undo) {
  const ops = from.pop();
  if (!ops) return;
  tr.nodes([]);
  (undo ? [...ops].reverse() : ops).forEach((op) => applyOp(op, undo));
  to.push(ops);
  syncHistoryButtons();
}
const undo = () => stepHistory(undoStack, redoStack, true);
const redo = () => stepHistory(redoStack, undoStack, false);

// ---------- salvar ----------
function queueSave(item) {
  item._v = (item._v || 0) + 1;
  dirty.set(item.id, item);
  setStatus("salvando…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}

async function flush() {
  for (const item of [...dirty.values()]) {
    const v = item._v;
    const payload = {
      id: item.id, tipo: item.tipo, x: item.x, y: item.y,
      w: item.w ?? null, h: item.h ?? null,
      rotacao: item.rotacao || 0, z: item.z || 0, dados: item.dados || {},
    };
    const { data, error } = await supabase.rpc("mural_salvar_item", { p_edit_token: token, p_item: payload });
    if (error) { setStatus("erro ao salvar: " + error.message, true); return; }
    if (dirty.get(item.id) === item && item._v === v) dirty.delete(item.id);
    if (data?.updated_at) item.updated_at = data.updated_at;
  }
  if (!dirty.size) setStatus("salvo");
}

function onMoved(g) {
  const rec = store.get(g.id());
  if (!rec) return;
  rec.item.x = g.x();
  rec.item.y = g.y();
  queueSave(rec.item);
  if (rec.before) pushHistory([{ k: "upd", before: rec.before, after: snap(rec.item) }]);
}

function onTransformed(g) {
  const rec = store.get(g.id());
  if (!rec) return;
  const it = rec.item;
  const sx = Math.abs(g.scaleX());
  const sy = Math.abs(g.scaleY());
  g.scale({ x: 1, y: 1 });

  if (it.tipo === "traco") {
    it.dados.pontos = (it.dados.pontos || []).map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
  } else {
    const baseW = it.w ?? g.findOne(".body")?.width() ?? 100;
    it.w = Math.max(20, baseW * sx);
    if (it.tipo !== "texto") it.h = Math.max(20, (it.h || 0) * sy);
  }
  it.x = g.x();
  it.y = g.y();
  it.rotacao = g.rotation();
  fillGroup(g, it);
  tr.forceUpdate();
  layer.batchDraw();
  queueSave(it);
  if (rec.before) pushHistory([{ k: "upd", before: rec.before, after: snap(it) }]);
}

async function deleteSelected() {
  const nodes = tr.nodes().slice();
  if (!nodes.length) return;
  tr.nodes([]);
  const ops = nodes.map((g) => ({ k: "del", s: snap(store.get(g.id()).item) }));
  pushHistory(ops);
  for (const op of ops) await removeItem(op.s.id);
}

// ---------- imagens ----------
function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
    img.src = url;
  });
}

const DISPLAY_MAX = 2000;
async function makeDisplayBlob(url, w, h) {
  if (Math.max(w, h) <= DISPLAY_MAX) return null;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const k = DISPLAY_MAX / Math.max(w, h);
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/webp", 0.9));
}

async function addImageFiles(files, at) {
  let off = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    setStatus("enviando imagem…");
    try {
      const dim = await imageSize(f);
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const base = `murais/${mural.id}/${crypto.randomUUID()}`;
      const origPath = `${base}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(origPath, f, { contentType: f.type, upsert: false });
      if (error) throw error;
      // versão leve para exibição (renders 4K pesam no canvas); o original fica guardado
      let path = origPath;
      const thumb = await makeDisplayBlob(dim.url, dim.w, dim.h);
      if (thumb) {
        const tPath = `${base}_d.webp`;
        const { error: e2 } = await supabase.storage.from(BUCKET).upload(tPath, thumb, { contentType: "image/webp", upsert: false });
        if (!e2) { path = tPath; signedCache.set(tPath, URL.createObjectURL(thumb)); }
      }
      if (path === origPath) signedCache.set(path, dim.url); // exibe já, sem esperar a URL assinada
      const w = Math.min(520, dim.w);
      const h = (w * dim.h) / dim.w;
      newItem("imagem", at.x + off, at.y + off, w, h, { storage_path: path, original_path: origPath, nome: f.name });
      off += 30;
    } catch (e) {
      setStatus("erro no upload: " + (e.message || e), true);
    }
  }
}

// ---------- edição de texto ----------
function openEditor(g) {
  const rec = store.get(g.id());
  if (!rec || !["texto", "nota", "frame"].includes(rec.item.tipo)) return;
  const it = rec.item;
  const key = it.tipo === "frame" ? "titulo" : "texto";
  const before = snap(it);
  const scale = stage.scaleX();
  const r = g.getClientRect({ skipShadow: true });
  const ta = $("editor");

  editing = true;
  ta.hidden = false;
  ta.value = it.dados[key] || "";
  ta.style.left = r.x + "px";
  ta.style.top = r.y + "px";
  ta.style.width = Math.max(160, it.tipo === "frame" ? 420 * scale : r.width) + "px";
  ta.style.height = Math.max(40, it.tipo === "frame" ? 48 * scale : r.height) + "px";
  ta.style.fontSize = Math.max(11, (it.dados.tamanho || (it.tipo === "frame" ? 20 : 17)) * scale) + "px";
  ta.focus();
  ta.select();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    ta.hidden = true;
    editing = false;
    ta.onblur = ta.onkeydown = null;
    if (save && ta.value !== (it.dados[key] || "")) {
      it.dados[key] = ta.value;
      fillGroup(g, it);
      tr.forceUpdate();
      layer.batchDraw();
      queueSave(it);
      pushHistory([{ k: "upd", before, after: snap(it) }]);
    }
  };
  ta.onblur = () => finish(true);
  ta.onkeydown = (e) => {
    if (e.key === "Escape") finish(false);
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) finish(true);
    e.stopPropagation();
  };
}

// ---------- ferramentas ----------
// em tela de toque o padrão é a "Mão" (só navegar), para não editar sem querer
const defaultTool = () => (canEdit && !matchMedia("(pointer: coarse)").matches ? "select" : "pan");

// "Selecionar" liga/desliga; desligado = modo navegar (só pan e zoom)
function toggleSelect() {
  setTool(tool === "select" ? "pan" : "select");
}

function showPenPanel(show) {
  const p = $("pen-panel");
  if (p) p.hidden = !show;
}

function setTool(t) {
  if (t === "pen" && tool !== "pen") showPenPanel(true);
  else if (t !== "pen") showPenPanel(false);
  tool = t;
  document.querySelectorAll("#toolbar .tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
  const wrap = $("stage-wrap");
  wrap.className = "tool-" + t;
  stage.draggable(t === "select" || t === "pan");
  for (const { node } of store.values()) node.draggable(canEdit && t === "select");
  if (t !== "select") tr.nodes([]);
}

// borracha: apaga os traços de caneta por onde o ponteiro passa
let erasing = null;
function eraseAtPointer() {
  const p = stage.getPointerPosition();
  if (!p) return;
  const g = stage.getIntersection(p)?.findAncestor(".item", true);
  const rec = g && store.get(g.id());
  if (!rec || rec.item.tipo !== "traco") return;
  erasing.push({ k: "del", s: snap(rec.item) });
  removeItem(rec.item.id);
}

function onPointerDown(e) {
  if (!canEdit || editing) return;

  if (tool === "eraser") {
    erasing = [];
    eraseAtPointer();
    return;
  }

  if (tool === "pen") {
    showPenPanel(false);
    const p = worldPointer();
    const line = new Konva.Line({
      points: [p.x, p.y], stroke: $("pen-color").value, strokeWidth: Number($("pen-width").value),
      lineCap: "round", lineJoin: "round", tension: 0.35, listening: false,
    });
    layer.add(line);
    drawing = { pts: [p.x, p.y], line };
    return;
  }

  if (tool === "text") {
    const p = worldPointer();
    const { item, node } = newItem("texto", p.x, p.y, 320, null, { texto: "Texto", tamanho: 22 });
    setTool("select");
    tr.nodes([node]);
    keepSelectionUntil = Date.now() + 400; // o "click" que vem após o mouseup não pode limpar a seleção
    setTimeout(() => openEditor(node), 0);
  }
}

function onPointerMove() {
  if (erasing) { eraseAtPointer(); return; }
  if (!drawing) return;
  const p = worldPointer();
  const n = drawing.pts.length;
  const dx = p.x - drawing.pts[n - 2];
  const dy = p.y - drawing.pts[n - 1];
  if (dx * dx + dy * dy < 4 / stage.scaleX()) return; // ignora micro-movimentos
  drawing.pts.push(p.x, p.y);
  drawing.line.points(drawing.pts);
  layer.batchDraw();
}

function onPointerUp() {
  if (erasing) { pushHistory(erasing); erasing = null; return; }
  if (!drawing) return;
  const { pts, line } = drawing;
  drawing = null;
  line.destroy();
  if (pts.length >= 4) {
    newItem("traco", 0, 0, null, null, {
      pontos: pts, cor: $("pen-color").value, largura: Number($("pen-width").value),
    });
  }
  layer.batchDraw();
}

function onWheel(e) {
  e.evt.preventDefault();
  const old = stage.scaleX();
  const p = stage.getPointerPosition();
  const mp = { x: (p.x - stage.x()) / old, y: (p.y - stage.y()) / old };
  const next = Math.min(4, Math.max(0.05, e.evt.deltaY < 0 ? old * 1.08 : old / 1.08));
  stage.scale({ x: next, y: next });
  stage.position({ x: p.x - mp.x * next, y: p.y - mp.y * next });
}

// pinça (dois dedos): zoom + pan, no padrão do Konva
let pinch = null;
function onPinchMove(e) {
  const t = e.evt.touches;
  if (!t || t.length !== 2) return;
  e.evt.preventDefault();
  if (drawing) { drawing.line.destroy(); drawing = null; }
  if (stage.isDragging()) stage.stopDrag();
  const rect = stage.container().getBoundingClientRect();
  const p1 = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
  const p2 = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
  const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!pinch) { pinch = { center, dist }; return; }
  const old = stage.scaleX();
  const next = Math.min(4, Math.max(0.05, old * (dist / pinch.dist)));
  const wp = { x: (pinch.center.x - stage.x()) / old, y: (pinch.center.y - stage.y()) / old };
  stage.scale({ x: next, y: next });
  stage.position({ x: center.x - wp.x * next, y: center.y - wp.y * next });
  pinch = { center, dist };
}

function fitToContent() {
  if (!store.size || stage.width() < 200 || stage.height() < 200) return;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const { node } of store.values()) {
    const r = node.getClientRect({ relativeTo: layer });
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width); y2 = Math.max(y2, r.y + r.height);
  }
  const pad = 60;
  const s = Math.max(0.05, Math.min(
    (stage.width() - pad * 2) / (x2 - x1),
    (stage.height() - pad * 2) / (y2 - y1),
    1.5
  ));
  fitted = true;
  stage.scale({ x: s, y: s });
  stage.position({
    x: (stage.width() - (x2 - x1) * s) / 2 - x1 * s,
    y: (stage.height() - (y2 - y1) * s) / 2 - y1 * s,
  });
}

// ---------- sincronização (polling) ----------
async function poll() {
  if (document.hidden || drawing || editing) return;
  const { data } = await supabase.rpc("mural_ler", { p_token: token });
  if (!data) return;
  const remote = new Map(data.itens.map((i) => [i.id, i]));

  await ensureSigned(data.itens.map((i) => i.dados?.storage_path));

  for (const [id, r] of remote) {
    if (deleting.has(id) || dirty.has(id)) continue;
    const rec = store.get(id);
    if (!rec) addItem(r);
    else if (new Date(r.updated_at) > new Date(rec.item.updated_at)) updateItem(rec, r);
  }
  for (const [id, rec] of [...store]) {
    if (!remote.has(id) && !dirty.has(id) && new Date(rec.item.updated_at).getTime() > 0) removeLocal(id);
  }
}

// ---------- boot ----------
function initStage() {
  const wrap = $("stage");
  stage = new Konva.Stage({ container: "stage", width: wrap.clientWidth, height: wrap.clientHeight, draggable: true });
  layer = new Konva.Layer();
  stage.add(layer);

  tr = new Konva.Transformer({
    rotateEnabled: true, keepRatio: false,
    borderStroke: C.brass, anchorStroke: C.brass, anchorFill: C.bg, anchorSize: 9,
    boundBoxFunc: (o, n) => (n.width < 20 || n.height < 20 ? o : n),
  });
  layer.add(tr);

  new ResizeObserver(() => {
    if (!wrap.clientWidth || !wrap.clientHeight) return;
    stage.size({ width: wrap.clientWidth, height: wrap.clientHeight });
    if (!fitted) fitToContent();
  }).observe(wrap);

  stage.on("wheel", onWheel);
  stage.on("mousedown touchstart", onPointerDown);
  stage.on("mousemove touchmove", onPointerMove);
  stage.on("mouseup touchend", onPointerUp);
  stage.on("touchmove", onPinchMove);
  stage.on("touchend", () => { pinch = null; });

  stage.on("click tap", (e) => {
    if (!canEdit || tool !== "select") return;
    if (Date.now() < keepSelectionUntil) return;
    if (e.target === stage) { tr.nodes([]); return; }
    const g = e.target.findAncestor(".item", true);
    if (g) tr.nodes([g]);
  });

  stage.on("dblclick dbltap", (e) => {
    if (!canEdit || tool !== "select") return;
    const g = e.target.findAncestor(".item", true);
    if (g) openEditor(g);
  });

  // arrastar arquivos de imagem para o canvas
  const sw = $("stage-wrap");
  sw.addEventListener("dragover", (e) => { if (canEdit) { e.preventDefault(); sw.classList.add("drop-over"); } });
  sw.addEventListener("dragleave", () => sw.classList.remove("drop-over"));
  sw.addEventListener("drop", (e) => {
    sw.classList.remove("drop-over");
    if (!canEdit || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    stage.setPointersPositions(e);
    addImageFiles([...e.dataTransfer.files], worldPointer());
  });
}

function initToolbar() {
  $("toolbar").hidden = false;
  document.querySelectorAll("#toolbar .tool").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.tool === "select") toggleSelect();
    else if (b.dataset.tool === "pen" && tool === "pen") showPenPanel($("pen-panel").hidden);
    else setTool(b.dataset.tool);
  }));
  document.querySelectorAll("#pen-panel .w").forEach((b) => b.addEventListener("click", () => {
    $("pen-width").value = b.dataset.w;
    document.querySelectorAll("#pen-panel .w").forEach((x) => x.classList.toggle("active", x === b));
  }));
  document.body.classList.add("has-toolbar");
  const wrap = $("stage"); // a barra inferior (celular) encolhe o quadro
  stage.size({ width: wrap.clientWidth, height: wrap.clientHeight });
  $("btn-delete").addEventListener("click", deleteSelected);
  $("btn-undo").addEventListener("click", undo);
  $("btn-redo").addEventListener("click", redo);
  syncHistoryButtons();
  $("btn-image").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", (e) => {
    const c = viewCenter();
    addImageFiles([...e.target.files], { x: c.x - 200, y: c.y - 150 });
    e.target.value = "";
  });

  document.addEventListener("paste", (e) => {
    if (editing) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const c = viewCenter();
    addImageFiles(files, { x: c.x - 200, y: c.y - 150 });
  });

  document.addEventListener("keydown", (e) => {
    if (editing || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === "e") setTool("eraser");

    else if (k === "v") toggleSelect();
    else if (k === "p") setTool("pen");
    else if (k === "t") setTool("text");
    else if (k === "i") $("file-input").click();
    else if (k === "delete" || k === "backspace") { e.preventDefault(); deleteSelected(); }
    else if (k === "escape") { setTool(defaultTool()); tr.nodes([]); }
  });
}

async function boot() {
  if (!token) return fail("Link inválido: falta o código do mural.");

  const { data, error } = await supabase.rpc("mural_ler", { p_token: token });
  if (error || !data) return fail("Mural não encontrado. Confira o link.");

  mural = data.mural;
  canEdit = mural.can_edit;
  document.title = `${mural.name} · Controle Novo`;
  $("mural-title").textContent = mural.name;

  initStage();

  const itens = data.itens.slice().sort((a, b) => (a.z - b.z) || (a.created_at < b.created_at ? -1 : 1));
  await ensureSigned(itens.map((i) => i.dados?.storage_path));
  itens.forEach(addItem);
  fitToContent();

  if (canEdit) initToolbar();
  else { document.body.classList.add("view-only"); $("badge-view").hidden = false; }
  setTool(defaultTool());

  $("btn-fit").addEventListener("click", fitToContent);
  $("btn-copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
    setStatus("link copiado");
  });

  setInterval(poll, POLL_MS);
}

boot();
