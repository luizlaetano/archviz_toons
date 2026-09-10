// ===========================================================
// Mapa de Referências — app.js
//
// Antes de usar, preencha SUPABASE_URL e SUPABASE_ANON_KEY
// abaixo (Project Settings > API no painel do Supabase).
// Veja README.md para o passo a passo completo de setup.
// ===========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CATEGORIES } from "./categories.js";

const SUPABASE_URL = "https://gxgsuvsckoeyeeygyhck.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Nv8xHnvLsrkdNOeUXqNNTw_IIVHt_Lc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// A busca no catálogo é compartilhada entre projetos (e pode conter
// materiais associados a outros clientes), então pedimos a senha de
// admin uma vez por sessão de página antes de liberar a busca — igual
// à página admin.html, só que aqui embutido no próprio quadro.
let catalogSecret = null;

const el = {
  header: document.getElementById("app-header"),
  title: document.getElementById("project-title"),
  shareControls: document.getElementById("share-controls"),
  copyLinkBtn: document.getElementById("copy-link"),
  newProjectScreen: document.getElementById("new-project-screen"),
  categoriesScreen: document.getElementById("categories-screen"),
  errorScreen: document.getElementById("error-screen"),
  categoriesList: document.getElementById("categories-list"),
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

async function getSignedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.functions.invoke("get-signed-urls", {
    body: { paths: [path] },
  });
  if (error) return null;
  return data?.data?.[0]?.signedUrl || null;
}

// ---------- boot ----------

async function init() {
  const projectId = getProjectIdFromUrl();
  if (!projectId) {
    el.header.hidden = true;
    el.newProjectScreen.hidden = false;
    return;
  }

  const { data: project, error } = await supabase
    .rpc("get_project", { p_id: projectId })
    .maybeSingle();

  if (error || !project) {
    el.header.hidden = false;
    el.newProjectScreen.hidden = true;
    el.errorScreen.hidden = false;
    return;
  }

  await openProject(project);
}

// ---------- project screen ----------

async function openProject(project) {
  el.header.hidden = false;
  el.title.textContent = project.name;
  el.newProjectScreen.hidden = true;
  el.shareControls.hidden = false;
  el.categoriesScreen.hidden = false;

  el.copyLinkBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href);
    showStatus("Link copiado.");
  });

  const { data: pairs, error } = await supabase.rpc("get_material_pairs", {
    p_project_id: project.id,
  });

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

    if (cat.pass) {
      const badge = document.createElement("span");
      badge.className = "category-pass-badge";
      if (cat.pass === "materialID") badge.classList.add("category-pass-badge-default");
      badge.textContent = cat.pass;
      node.querySelector(".category-header").insertBefore(
        badge,
        node.querySelector(".btn-add-pair")
      );
    }

    const pairsRow = node.querySelector(".pairs-row");
    for (const pair of byCategory.get(cat.id)) {
      pairsRow.appendChild(buildPairCard(pair));
    }

    node.querySelector(".btn-add-pair").addEventListener("click", async () => {
      const { data, error } = await supabase
        .rpc("create_material_pair", { p_project_id: projectId, p_category: cat.id })
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

// ---------- variação: cor + material do catálogo ----------

async function ensureCatalogSecret() {
  if (catalogSecret) return catalogSecret;

  const attempt = window.prompt("Senha de administrador (necessária pra usar o catálogo):");
  if (!attempt) return null;

  const { error } = await supabase.rpc("search_catalog_materials", {
    p_secret: attempt,
    p_query: "",
  });
  if (error) {
    showStatus("Senha incorreta.");
    return null;
  }

  catalogSecret = attempt;
  return catalogSecret;
}

function buildPairCard(pair) {
  const node = el.pairTpl.content.cloneNode(true);
  const root = node.querySelector(".pair");
  root.dataset.pairId = pair.id;

  const colorInput = node.querySelector(".pair-color");
  colorInput.value = pair.color_hex || "#cccccc";
  colorInput.addEventListener("change", async () => {
    const { error } = await supabase.rpc("update_material_pair_color", {
      p_id: pair.id,
      p_color_hex: colorInput.value,
    });
    if (error) showStatus("Não foi possível salvar a cor.");
  });

  node.querySelector(".pair-delete").addEventListener("click", async () => {
    if (!confirm("Remover esta variação?")) return;
    const { error } = await supabase.rpc("delete_material_pair", { p_id: pair.id });
    if (error) {
      showStatus("Não foi possível remover.");
      return;
    }
    root.remove();
  });

  setupCatalogPicker(node, pair);

  return node;
}

function setupCatalogPicker(node, pair) {
  const searchWrap = node.querySelector(".pair-catalog-search-wrap");
  const searchInput = node.querySelector(".pair-catalog-search");
  const resultsEl = node.querySelector(".pair-catalog-results");
  const linkedEl = node.querySelector(".pair-catalog-linked");
  const linkedThumb = node.querySelector(".pair-catalog-thumb");
  const linkedName = node.querySelector(".pair-catalog-name");
  const changeBtn = node.querySelector(".pair-catalog-change");

  async function showLinked(catalogId, name, imagePath) {
    pair.catalog_id = catalogId;
    linkedName.textContent = name;
    linkedThumb.src = (await getSignedUrl(imagePath)) || "";
    linkedThumb.hidden = !imagePath;
    searchWrap.hidden = true;
    linkedEl.hidden = false;
  }

  function showSearch() {
    searchWrap.hidden = false;
    linkedEl.hidden = true;
    resultsEl.innerHTML = "";
    searchInput.value = "";
    searchInput.focus();
  }

  if (pair.catalog_id) {
    showLinked(pair.catalog_id, pair.catalog_name, pair.catalog_image);
  }

  changeBtn.addEventListener("click", showSearch);

  let searchTimer = null;
  searchInput.addEventListener("focus", async () => {
    if (!(await ensureCatalogSecret())) searchInput.blur();
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    searchTimer = setTimeout(() => runSearch(query), 250);
  });

  async function runSearch(query) {
    if (!catalogSecret) return;

    const { data, error } = await supabase.rpc("search_catalog_materials", {
      p_secret: catalogSecret,
      p_query: query,
    });

    resultsEl.innerHTML = "";
    if (error) return;

    for (const result of data || []) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "pair-catalog-result";
      item.textContent = result.name;
      item.addEventListener("click", () => selectCatalogMaterial(result.id, result.name, result.image_path));
      resultsEl.appendChild(item);
    }

    if (query) {
      const createItem = document.createElement("button");
      createItem.type = "button";
      createItem.className = "pair-catalog-result pair-catalog-result-create";
      createItem.textContent = `+ criar material "${query}"`;
      createItem.addEventListener("click", () => createCatalogMaterial(query));
      resultsEl.appendChild(createItem);
    }
  }

  async function selectCatalogMaterial(catalogId, name, imagePath) {
    const { error } = await supabase.rpc("link_material_pair_catalog", {
      p_id: pair.id,
      p_catalog_id: catalogId,
    });
    if (error) {
      showStatus("Não foi possível vincular o material.");
      return;
    }
    await showLinked(catalogId, name, imagePath);
  }

  async function createCatalogMaterial(name) {
    const { data, error } = await supabase
      .rpc("quick_create_catalog_material", { p_secret: catalogSecret, p_name: name })
      .single();
    if (error) {
      showStatus("Não foi possível criar o material.");
      return;
    }
    await selectCatalogMaterial(data.id, data.name, null);
    showStatus("Material criado — edite imagens e tags no admin.");
  }
}

init();
