// ===========================================================
// Página admin (privada) — admin.js
//
// Não divulgada no site público. Duas funções:
// 1. "Quadros existentes" — recuperar o link de qualquer projeto.
// 2. "Catálogo de materiais" — materiais reutilizáveis entre projetos
//    (nome, notas, tags, imagens). Cor e categoria ficam por variação,
//    dentro de cada projeto — não aqui, porque o mesmo material muda de
//    cor de Material ID entre projetos e pode ser usado em categorias
//    diferentes (mármore em piso, bancada, parede...).
//
// Protegida por uma senha guardada só no banco (funções admin_list_projects
// / catalog_* no Supabase) — a senha nunca fica em nenhum arquivo deste
// repositório público.
// ===========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://gxgsuvsckoeyeeygyhck.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Nv8xHnvLsrkdNOeUXqNNTw_IIVHt_Lc";
const BUCKET = "material-references";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let secret = null;
let stagedFiles = [];
let openEditPanel = null;

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

  catalogFilterQuery: document.getElementById("catalog-filter-query"),
  catalogFilterTag: document.getElementById("catalog-filter-tag"),
  catalogSearchBtn: document.getElementById("catalog-search-btn"),
  catalogNewBtn: document.getElementById("catalog-new-btn"),
  catalogList: document.getElementById("catalog-list"),
  catalogForm: document.getElementById("catalog-form"),
  catalogName: document.getElementById("catalog-name"),
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
  const query = el.catalogFilterQuery.value.trim() || null;
  const tag = el.catalogFilterTag.value.trim() || null;

  const { data, error } = await supabase.rpc("catalog_search", {
    p_secret: secret,
    p_query: query,
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
  openEditPanel = null;

  if (entries.length === 0) {
    const p = document.createElement("p");
    p.className = "admin-hint";
    p.textContent = "Nenhum material no catálogo ainda.";
    el.catalogList.appendChild(p);
    return;
  }

  const cards = await Promise.all(entries.map(buildCatalogEntryCard));
  for (const card of cards) el.catalogList.appendChild(card);
}

async function fetchTagsAndImages(catalogId) {
  const [{ data: tags }, { data: images }] = await Promise.all([
    supabase.rpc("catalog_list_tags", { p_secret: secret, p_catalog_id: catalogId }),
    supabase.rpc("catalog_list_images", { p_secret: secret, p_catalog_id: catalogId }),
  ]);
  return { tags: tags || [], images: images || [] };
}

async function buildCatalogEntryCard(entry) {
  const row = document.createElement("div");
  row.className = "catalog-entry";
  row.style.cursor = "pointer";

  const main = document.createElement("div");
  main.className = "catalog-entry-main";

  const name = document.createElement("div");
  name.className = "catalog-entry-name";
  name.textContent = entry.name;
  main.appendChild(name);

  const { tags, images } = await fetchTagsAndImages(entry.id);

  if (tags.length > 0) {
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

  if (images.length > 0) {
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
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
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

  row.addEventListener("click", () => toggleEditPanel(entry, row, tags, images));

  return row;
}

// ---------- catálogo: editar material existente ----------

function toggleEditPanel(entry, row, tags, images) {
  if (openEditPanel) {
    const wasSameEntry = openEditPanel.dataset.catalogId === entry.id;
    openEditPanel.remove();
    openEditPanel = null;
    if (wasSameEntry) return;
  }

  const panel = buildEditPanel(entry, tags, images);
  panel.dataset.catalogId = entry.id;
  row.after(panel);
  openEditPanel = panel;
}

function buildEditPanel(entry, tags, images) {
  const panel = document.createElement("div");
  panel.className = "catalog-form";
  panel.style.marginBottom = "10px";
  panel.addEventListener("click", (e) => e.stopPropagation());

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = entry.name;

  const notesInput = document.createElement("input");
  notesInput.type = "text";
  notesInput.placeholder = "notas (opcional)";
  notesInput.value = entry.notes || "";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "catalog-entry-tags";
  function renderTagChip(tag) {
    const chip = document.createElement("span");
    chip.className = "catalog-entry-tag";
    chip.textContent = tag.label + " ×";
    chip.style.cursor = "pointer";
    chip.title = "Remover tag";
    chip.addEventListener("click", async () => {
      await supabase.rpc("catalog_remove_tag", {
        p_secret: secret,
        p_catalog_id: entry.id,
        p_tag_id: tag.id,
      });
      chip.remove();
    });
    tagsWrap.appendChild(chip);
  }
  for (const tag of tags) renderTagChip(tag);

  const newTagInput = document.createElement("input");
  newTagInput.type = "text";
  newTagInput.placeholder = "adicionar tag e apertar Enter";
  newTagInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || !newTagInput.value.trim()) return;
    const { data } = await supabase
      .rpc("catalog_add_tag", {
        p_secret: secret,
        p_catalog_id: entry.id,
        p_tag_label: newTagInput.value.trim(),
      })
      .single();
    if (data) renderTagChip(data);
    newTagInput.value = "";
  });

  const thumbsWrap = document.createElement("div");
  thumbsWrap.className = "thumbs";
  async function renderExistingThumb(image) {
    const { data: signedResp } = await supabase.functions.invoke("get-signed-urls", {
      body: { paths: [image.storage_path] },
    });
    const wrap = document.createElement("div");
    wrap.className = "thumb";
    const img = document.createElement("img");
    img.src = signedResp?.data?.[0]?.signedUrl || "";
    img.alt = "";
    wrap.appendChild(img);
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.title = "Remover imagem";
    removeBtn.style.position = "absolute";
    removeBtn.style.top = "0";
    removeBtn.style.right = "0";
    removeBtn.style.background = "rgba(20,17,12,0.75)";
    removeBtn.style.color = "var(--text)";
    removeBtn.style.border = "none";
    removeBtn.style.width = "18px";
    removeBtn.style.height = "18px";
    removeBtn.style.fontSize = "0.7rem";
    removeBtn.style.lineHeight = "1";
    removeBtn.style.padding = "0";
    removeBtn.addEventListener("click", async () => {
      await supabase.functions.invoke("delete-storage-objects", {
        body: { paths: [image.storage_path] },
      });
      await supabase.rpc("catalog_remove_image", { p_secret: secret, p_image_id: image.id });
      wrap.remove();
    });
    wrap.appendChild(removeBtn);
    thumbsWrap.appendChild(wrap);
  }
  for (const image of images) renderExistingThumb(image);

  const dropzone = document.createElement("div");
  dropzone.className = "dropzone";
  const hint = document.createElement("p");
  hint.className = "dropzone-hint";
  hint.textContent = "arraste imagens aqui, ou clique";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.hidden = true;
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  dropzone.appendChild(hint);
  dropzone.appendChild(fileInput);
  dropzone.appendChild(thumbsWrap);

  async function uploadNewImages(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith("image/")) continue;
      const path = `catalog/${entry.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) continue;
      const { data: row } = await supabase
        .rpc("catalog_add_image", { p_secret: secret, p_catalog_id: entry.id, p_storage_path: path })
        .single();
      if (row) renderExistingThumb(row);
    }
  }
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => uploadNewImages(fileInput.files));
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    uploadNewImages(e.dataTransfer.files);
  });

  const actions = document.createElement("div");
  actions.className = "catalog-form-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn-solid";
  saveBtn.textContent = "salvar";
  saveBtn.addEventListener("click", async () => {
    const { error } = await supabase.rpc("catalog_update", {
      p_secret: secret,
      p_catalog_id: entry.id,
      p_name: nameInput.value.trim(),
      p_notes: notesInput.value.trim() || null,
    });
    if (error) {
      showStatus("Não foi possível salvar.");
      return;
    }
    showStatus("Material atualizado.");
    panel.remove();
    openEditPanel = null;
    searchCatalog();
  });
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-ghost";
  closeBtn.textContent = "fechar";
  closeBtn.addEventListener("click", () => {
    panel.remove();
    openEditPanel = null;
  });
  actions.appendChild(saveBtn);
  actions.appendChild(closeBtn);

  panel.appendChild(nameInput);
  panel.appendChild(notesInput);
  panel.appendChild(tagsWrap);
  panel.appendChild(newTagInput);
  panel.appendChild(dropzone);
  panel.appendChild(actions);

  return panel;
}

el.catalogSearchBtn.addEventListener("click", searchCatalog);
el.catalogFilterTag.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchCatalog();
});
el.catalogFilterQuery.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchCatalog();
});

// ---------- catálogo: novo material ----------

function resetCatalogForm() {
  el.catalogName.value = "";
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
