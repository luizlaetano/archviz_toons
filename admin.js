// ===========================================================
// Quadros existentes — admin.js
//
// Página privada (não divulgada no site) para recuperar o link de
// qualquer projeto. Protegida por uma senha guardada só no banco
// (função admin_list_projects no Supabase) — nunca neste arquivo,
// que fica em um repositório público.
// ===========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://gxgsuvsckoeyeeygyhck.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Nv8xHnvLsrkdNOeUXqNNTw_IIVHt_Lc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const el = {
  loginScreen: document.getElementById("login-screen"),
  listScreen: document.getElementById("list-screen"),
  password: document.getElementById("admin-password"),
  loginBtn: document.getElementById("admin-login"),
  projectsList: document.getElementById("projects-list"),
  status: document.getElementById("status-message"),
};

let statusTimer = null;
function showStatus(msg) {
  el.status.textContent = msg;
  el.status.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.status.classList.remove("visible"), 2200);
}

async function loadProjects() {
  const secret = el.password.value;
  if (!secret) {
    showStatus("Digite a senha.");
    return;
  }

  const { data, error } = await supabase.rpc("admin_list_projects", { p_secret: secret });

  if (error) {
    showStatus("Senha incorreta.");
    return;
  }

  el.loginScreen.hidden = true;
  el.listScreen.hidden = false;
  renderProjects(data || []);
}

function renderProjects(projects) {
  el.projectsList.innerHTML = "";

  if (projects.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Nenhum projeto criado ainda.";
    el.projectsList.appendChild(p);
    return;
  }

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "10px";

  for (const project of projects) {
    const row = document.createElement("a");
    row.href = `index.html?p=${project.id}`;
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.gap = "16px";
    row.style.padding = "14px";
    row.style.background = "var(--panel)";
    row.style.border = "1px solid var(--line)";
    row.style.borderRadius = "4px";
    row.style.color = "var(--text)";
    row.style.textDecoration = "none";

    const name = document.createElement("span");
    name.textContent = project.name;
    name.style.fontFamily = "var(--serif)";

    const date = document.createElement("span");
    date.style.color = "var(--text-dim)";
    date.style.fontSize = "0.85rem";
    date.textContent = new Date(project.created_at).toLocaleDateString("pt-BR");

    row.appendChild(name);
    row.appendChild(date);
    list.appendChild(row);
  }

  el.projectsList.appendChild(list);
}

el.loginBtn.addEventListener("click", loadProjects);
el.password.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadProjects();
});
