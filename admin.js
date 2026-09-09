// ===========================================================
// Página admin (privada) — admin.js
//
// Não divulgada no site público. Duas funções:
// 1. "Quadros existentes" — recuperar o link de qualquer projeto.
// 2. "Catálogo de materiais" — materiais reutilizáveis entre projetos,
//    organizados por tag, pensando também num futuro dataset pra LoRA.
//
// Protegida por uma senha guardada só no banco (funções admin_list_projects
// / catalog_* no Supabase) — a senha nunca fica em nenhum arquivo deste
// repositório público.
// ===========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CATEGORIES } from "./categories.js";

const SUPABASE_URL = "https://gxgsuvsckoeyeeygyhck.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Nv8xHnvLsrkdNOeUXqNNTw_IIVHt_Lc";
const BUCKET = "material-references";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let secret = null;
let stagedFiles = [];

const el = {
  loginScreen: document.getElementById("login-screen"),
  listScreen: document.getElementById("list-screen"),
  password: document.getElementById("admin-password"),
  loginBtn: document.getElementById("admin-login"),
  projectsList: document.getElementById("projects-list"),
  newProjectName: document.getElementById("new-project-name"),
  createProjectBtn: document.getElementById("create-project-btn"),
  newProjectResult: document.getElementById("new-project-result"),
  newProjectLink: document.getElementById("new-project-link"),
  copyNewProjectLinkBtn: document.getElementById("copy-new-project-link"),
  status: document.getElementById("status-message"),

  catalogFilterCategory: document.getElementById("catalog-filter-category"),
  catalogFilterTag: document.getElementById("catalog-filter-tag"),
  catalogSearchBtn: document.getElementById("catalog-search-btn"),
  catalogNewBtn: document.getElementById("catalog-new-btn"),
  catalogList: document.getElementById("catalog-list"),
  catalogForm: document.getElementById("catalog-form"),
  catalogColor: document.getElementById("catalog-color"),
  catalogName: document.getElementById("catalog-name"),
  catalogCategory: document.getElementById("catalog-category"),
  catalogNotes: document.getElementById("catalog-notes"),
  catalogTagsInput: document.getElementById("catalog-tags-input"),
  catalogTagsDatalist: document.getElementById("catalog-tags-datalist"),
  catalogDropzone: document.getElementById("catalog-dropzone"),
  catalogFileInput: document.getElementById("catalog-file-input"),
  catalogThumbs: document.getElementById("catalog-thumbs"),
  catalogSaveBtn: document.getElementById("catalog-save-btn"),
  catalogCancelBtn: document.getElementById("catalog-cancel-btn"),
};

let statusTimer = null;
function showStatus(msg) {
  el.status.textContent = msg;
  el.status.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.status.classList.remove("visible"), 2200);
}

// ---------- login ----------

async function login() {
  const attempt = el.password.value;
  if (!attempt) {
    showStatus("Digite a senha.");
    return;
  }

  const { data, error } = await supabase.rpc("admin_list_projects", { p_secret: attempt });

  if (error) {
    showStatus("Senha incorreta.");
    return;
  }

  secret = attempt;
  el.loginScreen.hidden = true;
  el.listScreen.hidden = false;
  renderProjects(data || []);
  populateCategoryDropdowns();
  searchCatalog();
}

el.loginBtn.addEventListener("click", login);
el.password.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

// ---------- quadros existentes ----------

function renderProjects(projects) {
  el.projectsList.innerHTML = "";

  if (projects.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Nenhum projeto criado ainda.";
    el.projectsList.appendChild(p);
    return;
  }

  for (const project of projects) {
    const row = document.createElement("a");
    row.className = "catalog-entry";
    row.href = `index.html?p=${project.id}`;

    const name = document.createElement("span");
    name.className = "catalog-entry-name";
    name.textContent = project.name;

    const date = document.createElement("span");
    date.style.color = "var(--text-dim)";
    date.style.fontSize = "0.85rem";
    date.style.marginLeft = "auto";
    date.textContent = new Date(project.created_at).toLocaleDateString("pt-BR");

    row.appendChild(name);
    row.appendChild(date);
    el.projectsList.appendChild(row);
  }
}

async function refreshProjects() {
  const { data, error } = await supabase.rpc("admin_list_projects", { p_secret: secret });
  if (error) return;
  renderProjects(data || []);
}

el.createProjectBtn.addEventListener("click", async () => {
  const name = el.newProjectName.value.trim();
  if (!name) {
    showStatus("Dê um nome ao projeto.");
    return;
  }

  const { data, error } = await supabase
    .rpc("create_project", { p_secret: secret, p_name: name })
    .single();

  if (error) {
    console.error(error);
    showStatus("Não foi possível criar o projeto.");
    return;
  }

  const link = `${window.location.origin}${window.location.pathname.replace("admin.html", "")}index.html?p=${data.id}`;
  el.newProjectLink.textContent = link;
  el.newProjectResult.hidden = false;
  el.newProjectName.value = "";
  refreshProjects();
});

el.newProjectName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") el.createProjectBtn.click();
});

el.copyNewProjectLinkBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(el.newProjectLink.textContent);
  showStatus("Link copiado.");
});

// ---------- catálogo: busca e listagem ----------

function populateCategoryDropdowns() {
  for (const select of [el.catalogFilterCategory, el.catalogCategory]) {
    for (const cat of CATEGORIES) {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.label;
      select.appendChild(opt);
    }
  }
}

async function refreshTagsDatalist() {
  const { data, error } = await supabase.rpc("catalog_all_tags", { p_secret: secret });
  if (error) return;
  el.catalogTagsDatalist.innerHTML = "";
  for (const tag of data || []) {
    const opt = document.createElement("option");
    opt.value = tag.label;
    el.catalogTagsDatalist.appendChild(opt);
  }
}

async function searchCatalog() {
  const category = el.catalogFilterCategory.value || null;
  const tag = el.catalogFilterTag.value.trim() || null;

  const { data, error } = await supabase.rpc("catalog_search", {
    p_secret: secret,
    p_category: category,
    p_tag_label: tag,
  });

  if (error) {
    showStatus("Erro ao buscar catálogo.");
    return;
  }

  await renderCatalog(data || []);
  refreshTagsDatalist();
}

async function renderCatalog(entries) {
  el.catalogList.innerHTML = "";

  if (entries.length === 0) {
    const p = document.createElement("p");
    p.className = "admin-hint";
    p.textContent = "Nenhum material no catálogo ainda.";
    el.catalogList.appendChild(p);
    return;
  }

  for (const entry of entries) {
    el.catalogList.appendChild(await buildCatalogEntryCard(entry));
  }
}

async function buildCatalogEntryCard(entry) {
  const row = document.createElement("div");
  row.className = "catalog-entry";

  const swatch = document.createElement("div");
  swatch.className = "catalog-entry-swatch";
  swatch.style.background = entry.color_hex || "#cccccc";
  row.appendChild(swatch);

  const main = document.createElement("div");
  main.className = "catalog-entry-main";

  const name = document.createElement("div");
  name.className = "catalog-entry-name";
  const catLabel = CATEGORIES.find((c) => c.id === entry.category)?.label || entry.category;
  name.textContent = `${entry.name} — ${catLabel}`;
  main.appendChild(name);

  const [{ data: tags }, { data: images }] = await Promise.all([
    supabase.rpc("catalog_list_tags", { p_secret: secret, p_catalog_id: entry.id }),
    supabase.rpc("catalog_list_images", { p_secret: secret, p_catalog_id: entry.id }),
  ]);

  if (tags && tags.length > 0) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "catalog-entry-tags";
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = "catalog-entry-tag";
      chip.textContent = tag.label;
      tagsRow.appendChild(chip);
    }
    main.appendChild(tagsRow);
  }

  row.appendChild(main);

  if (images && images.length > 0) {
    const shown = images.slice(0, 4);
    const { data: signedResp } = await supabase.functions.invoke("get-signed-urls", {
      body: { paths: shown.map((img) => img.storage_path) },
    });
    const thumbsRow = document.createElement("div");
    thumbsRow.className = "catalog-entry-thumbs";
    for (const signed of signedResp?.data || []) {
      if (!signed.signedUrl) continue;
      const img = document.createElement("img");
      img.src = signed.signedUrl;
      img.alt = "";
      thumbsRow.appendChild(img);
    }
    row.appendChild(thumbsRow);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "catalog-entry-delete";
  deleteBtn.textContent = "×";
  deleteBtn.title = "Remover do catálogo";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Remover "${entry.name}" do catálogo?`)) return;
    const { error } = await supabase.rpc("catalog_delete", {
      p_secret: secret,
      p_catalog_id: entry.id,
    });
    if (error) {
      showStatus("Não foi possível remover.");
      return;
    }
    searchCatalog();
  });
  row.appendChild(deleteBtn);

  return row;
}

el.catalogSearchBtn.addEventListener("click", searchCatalog);
el.catalogFilterTag.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchCatalog();
});

// ---------- catálogo: novo material ----------

function resetCatalogForm() {
  el.catalogColor.value = "#cccccc";
  el.catalogName.value = "";
  el.catalogCategory.value = CATEGORIES[0].id;
  el.catalogNotes.value = "";
  el.catalogTagsInput.value = "";
  el.catalogThumbs.innerHTML = "";
  stagedFiles = [];
}

el.catalogNewBtn.addEventListener("click", () => {
  resetCatalogForm();
  el.catalogForm.hidden = false;
});

el.catalogCancelBtn.addEventListener("click", () => {
  el.catalogForm.hidden = true;
});

el.catalogDropzone.addEventListener("click", () => el.catalogFileInput.click());
el.catalogFileInput.addEventListener("change", () => stageFiles(el.catalogFileInput.files));
el.catalogDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  el.catalogDropzone.classList.add("drag-over");
});
el.catalogDropzone.addEventListener("dragleave", () => {
  el.catalogDropzone.classList.remove("drag-over");
});
el.catalogDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  el.catalogDropzone.classList.remove("drag-over");
  stageFiles(e.dataTransfer.files);
});

function stageFiles(fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith("image/")) continue;
    stagedFiles.push(file);

    const wrap = document.createElement("div");
    wrap.className = "thumb";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "";
    wrap.appendChild(img);
    el.catalogThumbs.appendChild(wrap);
  }
}

el.catalogSaveBtn.addEventListener("click", async () => {
  const name = el.catalogName.value.trim();
  if (!name) {
    showStatus("Dê um nome ao material.");
    return;
  }

  const { data: created, error } = await supabase
    .rpc("catalog_create", {
      p_secret: secret,
      p_name: name,
      p_category: el.catalogCategory.value,
      p_color_hex: el.catalogColor.value,
      p_notes: el.catalogNotes.value.trim() || null,
    })
    .single();

  if (error) {
    console.error(error);
    showStatus("Não foi possível salvar o material.");
    return;
  }

  const tags = el.catalogTagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  for (const tag of tags) {
    await supabase.rpc("catalog_add_tag", {
      p_secret: secret,
      p_catalog_id: created.id,
      p_tag_label: tag,
    });
  }

  for (const file of stagedFiles) {
    const path = `catalog/${created.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      console.error(uploadError);
      continue;
    }
    await supabase.rpc("catalog_add_image", {
      p_secret: secret,
      p_catalog_id: created.id,
      p_storage_path: path,
    });
  }

  el.catalogForm.hidden = true;
  showStatus("Material salvo no catálogo.");
  searchCatalog();
});
