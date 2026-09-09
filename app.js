// ===========================================================
// Mapa de Referências — app.js
//
// Antes de usar, preencha SUPABASE_URL e SUPABASE_ANON_KEY
// abaixo (Project Settings > API no painel do Supabase).
// Veja README.md para o passo a passo completo de setup.
// ===========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://gxgsuvsckoeyeeygyhck.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Nv8xHnvLsrkdNOeUXqNNTw_IIVHt_Lc";
const BUCKET = "material-references";

// Mesma taxonomia usada no override de Material ID no 3ds Max.
const CATEGORIES = [
  { id: "piso", label: "Piso" },
  { id: "parede", label: "Parede" },
  { id: "teto", label: "Teto" },
  { id: "esquadria", label: "Esquadria" },
  { id: "vidro", label: "Vidro" },
  { id: "marcenaria", label: "Marcenaria" },
  { id: "pedra", label: "Pedra" },
  { id: "metais", label: "Metais" },
  { id: "estofado", label: "Estofado" },
  { id: "madeira_mobiliario", label: "Madeira — mobiliário" },
  { id: "metal_mobiliario", label: "Metal — mobiliário" },
  { id: "cortina", label: "Cortina" },
  { id: "tapete", label: "Tapete" },
  { id: "decoracao", label: "Decoração" },
  { id: "paisagismo", label: "Paisagismo" },
];

const SIGNED_URL_TTL = 60 * 10; // 10 minutos

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const el = {
  title: document.getElementById("project-title"),
  shareControls: document.getElementById("share-controls"),
  copyLinkBtn: document.getElementById("copy-link"),
  newProjectScreen: document.getElementById("new-project-screen"),
  categoriesScreen: document.getElementById("categories-screen"),
  errorScreen: document.getElementById("error-screen"),
  categoriesList: document.getElementById("categories-list"),
  newProjectName: document.getElementById("new-project-name"),
  createProjectBtn: document.getElementById("create-project"),
  status: document.getElementById("status-message"),
  categoryTpl: document.getElementById("category-template"),
  pairTpl: document.getElementById("pair-template"),
};

let statusTimer = null;
function showStatus(msg) {
  el.status.textContent = msg;
  el.status.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.status.classList.remove("visible"), 2200);
}

function getProjectIdFromUrl() {
  return new URLSearchParams(window.location.search).get("p");
}

function setProjectIdInUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("p", id);
  window.history.replaceState({}, "", url);
}

// ---------- boot ----------

async function init() {
  const projectId = getProjectIdFromUrl();
  if (!projectId) {
    el.newProjectScreen.hidden = false;
    return;
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !project) {
    el.errorScreen.hidden = false;
    return;
  }

  await openProject(project);
}

el.createProjectBtn.addEventListener("click", async () => {
  const name = el.newProjectName.value.trim();
  if (!name) {
    showStatus("Dê um nome ao projeto antes de criar.");
    return;
  }
  const { data, error } = await supabase
    .from("projects")
    .insert({ name })
    .select("id, name")
    .single();

  if (error) {
    console.error(error);
    showStatus("Não foi possível criar o projeto.");
    return;
  }

  setProjectIdInUrl(data.id);
  el.newProjectScreen.hidden = true;
  await openProject(data);
});

el.newProjectName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") el.createProjectBtn.click();
});

// ---------- project screen ----------

async function openProject(project) {
  el.title.textContent = project.name;
  el.shareControls.hidden = false;
  el.categoriesScreen.hidden = false;

  el.copyLinkBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href);
    showStatus("Link copiado.");
  });

  const { data: pairs, error } = await supabase
    .from("material_pairs")
    .select("id, category, color_hex, label")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    showStatus("Erro ao carregar o projeto.");
    return;
  }

  renderCategories(project.id, pairs || []);
}

function renderCategories(projectId, pairs) {
  el.categoriesList.innerHTML = "";
  const byCategory = new Map(CATEGORIES.map((c) => [c.id, []]));
  for (const p of pairs) {
    if (byCategory.has(p.category)) byCategory.get(p.category).push(p);
  }

  for (const cat of CATEGORIES) {
    const node = el.categoryTpl.content.cloneNode(true);
    const article = node.querySelector(".category");
    article.dataset.category = cat.id;
    node.querySelector(".category-name").textContent = cat.label;

    const pairsRow = node.querySelector(".pairs-row");
    for (const pair of byCategory.get(cat.id)) {
      pairsRow.appendChild(buildPairCard(pair));
    }

    node.querySelector(".btn-add-pair").addEventListener("click", async () => {
      const { data, error } = await supabase
        .from("material_pairs")
        .insert({ project_id: projectId, category: cat.id })
        .select("id, category, color_hex, label")
        .single();
      if (error) {
        console.error(error);
        showStatus("Não foi possível adicionar a variação.");
        return;
      }
      pairsRow.appendChild(buildPairCard(data));
    });

    el.categoriesList.appendChild(node);
  }
}

function buildPairCard(pair) {
  const node = el.pairTpl.content.cloneNode(true);
  const root = node.querySelector(".pair");
  root.dataset.pairId = pair.id;

  const colorInput = node.querySelector(".pair-color");
  colorInput.value = pair.color_hex || "#cccccc";
  colorInput.addEventListener("change", async () => {
    const { error } = await supabase
      .from("material_pairs")
      .update({ color_hex: colorInput.value })
      .eq("id", pair.id);
    if (error) showStatus("Não foi possível salvar a cor.");
  });

  const labelInput = node.querySelector(".pair-label");
  labelInput.value = pair.label || "";
  labelInput.addEventListener("blur", async () => {
    const { error } = await supabase
      .from("material_pairs")
      .update({ label: labelInput.value.trim() })
      .eq("id", pair.id);
    if (error) showStatus("Não foi possível salvar o nome.");
  });

  node.querySelector(".pair-delete").addEventListener("click", async () => {
    if (!confirm("Remover esta variação e suas imagens?")) return;
    const { error } = await supabase.from("material_pairs").delete().eq("id", pair.id);
    if (error) {
      showStatus("Não foi possível remover.");
      return;
    }
    root.remove();
  });

  const dropzone = node.querySelector(".dropzone");
  const fileInput = node.querySelector(".file-input");
  const thumbs = node.querySelector(".thumbs");

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleFiles(pair.id, fileInput.files, thumbs));

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    handleFiles(pair.id, e.dataTransfer.files, thumbs);
  });

  loadExistingImages(pair.id, thumbs);

  return node;
}

async function loadExistingImages(pairId, thumbsEl) {
  const { data: images, error } = await supabase
    .from("reference_images")
    .select("id, storage_path")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }
  for (const img of images || []) {
    await appendThumb(img, thumbsEl);
  }
}

async function handleFiles(pairId, fileList, thumbsEl) {
  for (const file of fileList) {
    if (!file.type.startsWith("image/")) continue;

    const path = `${pairId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      console.error(uploadError);
      showStatus("Falha ao enviar imagem.");
      continue;
    }

    const { data: row, error: insertError } = await supabase
      .from("reference_images")
      .insert({ pair_id: pairId, storage_path: path })
      .select("id, storage_path")
      .single();
    if (insertError) {
      console.error(insertError);
      continue;
    }
    await appendThumb(row, thumbsEl);
  }
  showStatus("Imagens salvas.");
}

async function appendThumb(image, thumbsEl) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(image.storage_path, SIGNED_URL_TTL);

  const wrap = document.createElement("div");
  wrap.className = "thumb";

  const img = document.createElement("img");
  img.src = error ? "" : data.signedUrl;
  img.alt = "";
  wrap.appendChild(img);

  const removeBtn = document.createElement("button");
  removeBtn.className = "thumb-remove";
  removeBtn.textContent = "×";
  removeBtn.title = "Remover imagem";
  removeBtn.addEventListener("click", async () => {
    await supabase.storage.from(BUCKET).remove([image.storage_path]);
    await supabase.from("reference_images").delete().eq("id", image.id);
    wrap.remove();
  });
  wrap.appendChild(removeBtn);

  thumbsEl.appendChild(wrap);
}

init();
