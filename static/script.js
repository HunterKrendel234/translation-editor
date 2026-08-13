let currentFile = null;
let currentCategory = null;
let currentEntries = [];
let glossary = {};
let characters = {};
let editingEntry = null;
let currentEditingKey = null;
let rowElements = new Map();
let currentTheme = "dark";

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function nlToText(text) {
  return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function highlightTags(text) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  const hl = escaped
    .replace(/(\\r)/g, '<span class="highlight-cr">$1</span>')
    .replace(/(\\n)/g, '<span class="highlight-nl">$1</span>')
    .replace(/(\{[^}]+\})/g, '<span class="highlight-tag">$1</span>')
    .replace(/(&lt;\/?[^&]+&gt;)/g, '<span class="highlight-tag">$1</span>')
    .replace(/(\[__[^\]]+?__\])/g, '<span class="highlight-tag">$1</span>')
    .replace(/(__[^ ]+?__)/g, '<span class="highlight-tag">$1</span>')
    .replace(/(%\d*\$?[a-zA-Z])/g, '<span class="highlight-tag">$1</span>');
  return hl;
}

function showProgress() {
  const bar = document.getElementById("progress-bar");
  bar.classList.remove("hidden");
  const fill = bar.querySelector(".progress-fill");
  fill.style.width = "0%";
  setTimeout(() => { fill.style.width = "60%"; }, 50);
}

function hideProgress() {
  const bar = document.getElementById("progress-bar");
  const fill = bar.querySelector(".progress-fill");
  fill.style.width = "100%";
  setTimeout(() => { bar.classList.add("hidden"); fill.style.width = "0%"; }, 400);
}

async function apiGet(url) {
  showProgress();
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data;
  } finally {
    hideProgress();
  }
}

async function apiPost(url, body) {
  showProgress();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } finally {
    hideProgress();
  }
}

let config = {};

async function loadConfig() {
  config = await apiGet("/api/config");
  currentTheme = config.theme || "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  document.getElementById("theme-switch").checked = currentTheme === "light";
}

async function loadFiles() {
  const data = await apiGet("/api/files");
  glossary = await apiGet("/api/glossary");
  characters = await apiGet("/api/characters");
  renderFileTree(data.categories || data);
}

function renderFileTree(data) {
  const tree = document.getElementById("file-tree");
  tree.innerHTML = "";
  const catMeta = {
    UI: { label: "UI", dotClass: "dot-ui" },
    Story: { label: "Story", dotClass: "dot-story" },
    Lyrics: { label: "Lyrics", dotClass: "dot-lyrics" },
  };
  for (const [cat, fileList] of Object.entries(data)) {
    const group = document.createElement("div");
    group.className = "category-group";
    const header = document.createElement("div");
    header.className = "category-header";
    const dot = document.createElement("span");
    dot.className = `file-dot ${catMeta[cat].dotClass}`;
    header.appendChild(dot);
    header.appendChild(document.createTextNode(catMeta[cat].label + ` (${fileList.length})`));
    const container = document.createElement("div");
    container.className = "category-files open";
    const folders = {};
    const fileIndex = {};
    for (let i = 0; i < fileList.length; i++) {
      fileIndex[fileList[i].rel] = i + 1;
    }
    for (const file of fileList) {
      const parts = file.rel.split("/");
      const fileName = parts.pop();
      const folderPath = parts.join("/") || "(root)";
      if (!folders[folderPath]) {
        folders[folderPath] = [];
      }
      folders[folderPath].push(file);
    }
    const sortedFolders = Object.keys(folders).sort((a, b) => {
      if (a === "(root)") return -1;
      if (b === "(root)") return 1;
      return a.localeCompare(b);
    });
    for (const folderPath of sortedFolders) {
      if (folderPath === "(root)") {
        for (const file of folders[folderPath]) {
          const item = createFileItem(file, cat, fileIndex[file.rel]);
          container.appendChild(item);
        }
      } else {
        const subGroup = document.createElement("div");
        subGroup.className = "subfolder-group";
        const subHeader = document.createElement("div");
        subHeader.className = "subfolder-header";
        const arrow = document.createElement("span");
        arrow.textContent = "▾";
        arrow.style.fontSize = "10px";
        subHeader.appendChild(arrow);
        const shortPath = folderPath.replace("local-files/", "").replace("genericTrans/", "").replace("masterTrans/", "");
        subHeader.appendChild(document.createTextNode(shortPath || folderPath));
        const subContainer = document.createElement("div");
        subContainer.className = "subfolder-files open";
        for (const file of folders[folderPath]) {
          const item = createFileItem(file, cat, fileIndex[file.rel]);
          subContainer.appendChild(item);
        }
        subHeader.addEventListener("click", (e) => {
          e.stopPropagation();
          subContainer.classList.toggle("open");
          arrow.textContent = subContainer.classList.contains("open") ? "▾" : "▸";
        });
        subGroup.appendChild(subHeader);
        subGroup.appendChild(subContainer);
        container.appendChild(subGroup);
      }
    }
    header.addEventListener("click", () => {
      container.classList.toggle("open");
    });
    group.appendChild(header);
    group.appendChild(container);
    tree.appendChild(group);
  }
}

function createFileItem(file, cat, index) {
  const item = document.createElement("div");
  item.className = "file-item";
  item.dataset.path = file.rel;
  item.dataset.cat = cat;
  const fdot = document.createElement("span");
  const dotMap = { UI: "dot-ui", Story: "dot-story", Lyrics: "dot-lyrics" };
  fdot.className = `file-dot ${dotMap[cat]}`;
  if (index) {
    const numSpan = document.createElement("span");
    numSpan.className = "file-index";
    numSpan.textContent = index;
    item.appendChild(numSpan);
  }
  item.appendChild(fdot);
  const nameSpan = document.createElement("span");
  nameSpan.textContent = file.name;
  item.appendChild(nameSpan);
  item.addEventListener("click", () => selectFile(file.rel, cat));
  return item;
}

function highlightActiveFile(path) {
  if (!path) return;
  document.querySelectorAll(".file-item").forEach((el) => el.classList.remove("active"));
  const activeItem = document.querySelector(`.file-item[data-path="${path}"]`);
  if (activeItem) {
    activeItem.classList.add("active");
    let node = activeItem.parentElement;
    while (node && node !== document.getElementById("file-tree")) {
      if (node.classList.contains("subfolder-files") && !node.classList.contains("open")) {
        node.classList.add("open");
        const header = node.previousElementSibling;
        const arrow = header && header.querySelector("span:first-child");
        if (arrow && arrow.textContent === "▸") arrow.textContent = "▾";
      } else if (node.classList.contains("category-files") && !node.classList.contains("open")) {
        node.classList.add("open");
      }
      node = node.parentElement;
    }
    activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

async function selectFile(path, cat) {
  const sameFile = path === currentFile;
  highlightActiveFile(path);
  currentFile = path;
  currentCategory = cat;
  document.getElementById("file-path").textContent = path;
  const data = await apiGet(`/api/entries?path=${encodeURIComponent(path)}&cat=${encodeURIComponent(cat)}`);
  if (data.error) {
    document.getElementById("entries-body").innerHTML = `<tr><td colspan="4">Error: ${data.error}</td></tr>`;
    return;
  }
  currentEntries = data.entries;
  document.getElementById("entry-search").value = "";
  document.getElementById("entry-search-counter").textContent = "";
  entrySearchResults = [];
  entrySearchIndex = -1;
  renderEntries(currentEntries, cat, data.is_empty || false);
  if (!sameFile) {
    const wrapper = document.getElementById("entries-table-wrapper");
    wrapper.scrollTop = 0;
    wrapper.scrollLeft = 0;
  }
}

function renderEntries(entries, cat, is_empty) {
  const tbody = document.getElementById("entries-body");
  const thSpeaker = document.getElementById("th-speaker");
  const isEmpty = entries.length === 0;
  document.getElementById("empty-state").classList.toggle("hidden", !isEmpty);
  document.getElementById("entries-table-wrapper").classList.toggle("hidden", isEmpty);
  const emptyBanner = document.getElementById("empty-file-banner");
  if (is_empty && currentFile) {
    emptyBanner.classList.remove("hidden");
    emptyBanner.querySelector(".banner-path").textContent = currentFile;
  } else {
    emptyBanner.classList.add("hidden");
  }
  if (isEmpty) {
    tbody.innerHTML = "";
    return;
  }
  const isStory = cat === "Story";
  thSpeaker.classList.toggle("hidden", !isStory);
  tbody.innerHTML = "";
  rowElements.clear();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tr = document.createElement("tr");
    const rowKey = e.line_index !== undefined ? e.key + ":" + e.line_index : e.key;
    tr.dataset.rowKey = rowKey;
    rowElements.set(rowKey, tr);
    if (currentEditingKey === rowKey) tr.classList.add("row-editing");
    if (isStory) {
      const tdSp = document.createElement("td");
      if (e.speaker) {
        tdSp.textContent = e.speaker;
        tdSp.style.color = "var(--speaker-col)";
        tdSp.style.fontWeight = "500";
      }
      tr.appendChild(tdSp);
    }
    const tdKey = document.createElement("td");
    tdKey.textContent = e.key;
    tdKey.style.fontFamily = "Consolas, monospace";
    tdKey.style.fontSize = "12px";
    tdKey.style.color = "var(--fg2)";
    tr.appendChild(tdKey);
    if (redHighlightEnabled && e.ru && e.en && e.ru.replace(/\\n/g, "\n").trim() === e.en.replace(/\\n/g, "\n").trim()) {
      tr.classList.add("row-unchanged");
    }
    const tdEn = document.createElement("td");
    tdEn.innerHTML = highlightTags(e.en);
    tr.appendChild(tdEn);
    const tdRu = document.createElement("td");
    tdRu.innerHTML = highlightTags(e.ru || "");
    const curEntry = e;
    tdRu.addEventListener("dblclick", () => openEditor(curEntry, cat));
    tr.appendChild(tdRu);
    tr.addEventListener("dblclick", () => openEditor(curEntry, cat));
    tbody.appendChild(tr);
  }
  if (entrySearchResults.length > 0) highlightCurrentSearchResult();
}

function getRelevantGlossary(text) {
  const result = {};
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(glossary)) {
    if (lower.includes(key.toLowerCase())) {
      result[key] = val;
    }
  }
  return result;
}

function getEntryRowKey(entry) {
  return entry.line_index !== undefined ? entry.key + ":" + entry.line_index : entry.key;
}

function openEditor(entry, cat) {
  document.querySelectorAll(".row-editing").forEach((el) => el.classList.remove("row-editing"));
  editingEntry = entry;
  currentEditingKey = getEntryRowKey(entry);
  const row = rowElements.get(currentEditingKey);
  if (row) row.classList.add("row-editing");
  const modal = document.getElementById("edit-modal");
  modal.classList.remove("hidden");
  document.getElementById("modal-en-text").innerHTML = highlightTags(entry.en);
  document.getElementById("modal-ru-input").value = nlToText(entry.ru || "");
  document.getElementById("modal-validation").classList.add("hidden");
  const glossList = document.getElementById("modal-glossary-list");
  const relevant = getRelevantGlossary(entry.en);
  glossList.innerHTML = "";
  if (Object.keys(relevant).length === 0) {
    glossList.innerHTML = '<div style="font-size:12px;color:var(--fg2)">No glossary terms found</div>';
  } else {
    for (const [k, v] of Object.entries(relevant)) {
      const item = document.createElement("div");
      item.className = "modal-glossary-item";
      item.innerHTML = `<span class="glossary-en">${escapeHtml(k)}</span> → ${escapeHtml(v)}`;
      glossList.appendChild(item);
    }
  }
  const charSection = document.getElementById("modal-characters");
  const charList = document.getElementById("modal-characters-list");
  if (cat === "Story" && entry.speaker) {
    charSection.classList.remove("hidden");
    charList.innerHTML = "";
    const speaker = entry.speaker;
    let found = false;
    for (const [name, desc] of Object.entries(characters)) {
      if (speaker.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(speaker.toLowerCase())) {
        const p = document.createElement("p");
        p.innerHTML = `<strong>${escapeHtml(name)}</strong>: ${escapeHtml(desc)}`;
        charList.appendChild(p);
        found = true;
      }
    }
    if (!found) {
      charList.innerHTML = '<div style="font-size:12px;color:var(--fg2)">No character info available</div>';
    }
  } else {
    charSection.classList.add("hidden");
  }
}

async function saveEdit() {
  const input = document.getElementById("modal-ru-input");
  const newValue = input.value;
  const original = editingEntry.en;
  const validationMsg = document.getElementById("modal-validation");
  const result = await apiPost("/api/validate", { original: nlToText(original), edited: newValue });
  if (!result.ok) {
    validationMsg.textContent = result.message;
    validationMsg.className = "error";
    validationMsg.classList.remove("hidden");
    return;
  }
  editingEntry.ru = newValue;
  const saveResult = await apiPost("/api/save", {
    path: currentFile,
    key: editingEntry.key,
    ru: newValue,
    line_index: editingEntry.line_index,
    text_index: editingEntry.text_index,
  });
  if (saveResult.ok) {
    renderEntries(currentEntries, currentCategory);
    closeEditor();
    clearEntrySearchHighlights();
    entrySearchResults = [];
    entrySearchIndex = -1;
    document.getElementById("entry-search-counter").textContent = "";
  }
}

function restoreOriginal() {
  if (editingEntry) {
    document.getElementById("modal-ru-input").value = nlToText(editingEntry.en);
  }
  document.getElementById("modal-validation").classList.add("hidden");
}

let fileSearchTimer = null;

function initFileSearch() {
  document.getElementById("file-search").addEventListener("input", () => {
    clearTimeout(fileSearchTimer);
    fileSearchTimer = setTimeout(doFileSearch, 150);
  });
}

function doFileSearch() {
  const q = document.getElementById("file-search").value.trim().toLowerCase();
  document.querySelectorAll(".file-item").forEach((el) => {
    const name = el.textContent.trim().toLowerCase();
    el.classList.toggle("hidden-by-search", q !== "" && !name.includes(q));
  });
  document.querySelectorAll(".subfolder-group").forEach((g) => {
    const visible = g.querySelectorAll(".file-item:not(.hidden-by-search)").length > 0;
    g.classList.toggle("hidden-by-search", !visible);
  });
}

let entrySearchResults = [];
let entrySearchIndex = -1;

function initEntrySearch() {
  const input = document.getElementById("entry-search");
  input.addEventListener("input", doEntrySearch);
  document.getElementById("search-prev").addEventListener("click", () => navigateEntrySearch(-1));
  document.getElementById("search-next").addEventListener("click", () => navigateEntrySearch(1));
}

function doEntrySearch() {
  const q = document.getElementById("entry-search").value.trim().toLowerCase();
  const counter = document.getElementById("entry-search-counter");
  if (!q) {
    clearEntrySearchHighlights();
    entrySearchResults = [];
    entrySearchIndex = -1;
    counter.textContent = "";
    return;
  }
  showProgress();
  setTimeout(() => {
    const isStory = currentCategory === "Story";
    entrySearchResults = [];
    currentEntries.forEach((e, i) => {
      const fields = [e.key, e.en, e.ru || ""];
      if (isStory && e.speaker) fields.push(e.speaker);
      const match = fields.some((f) => f.toLowerCase().includes(q));
      if (match) entrySearchResults.push(i);
    });
    clearEntrySearchHighlights();
    if (entrySearchResults.length > 0) {
      entrySearchIndex = 0;
      highlightCurrentSearchResult();
    } else {
      entrySearchIndex = -1;
    }
    updateEntrySearchCounter();
    hideProgress();
  }, 10);
}

function clearEntrySearchHighlights() {
  document.querySelectorAll("#entries-body tr.search-highlight").forEach((el) => {
    el.classList.remove("search-highlight", "search-current");
  });
}

function highlightCurrentSearchResult() {
  clearEntrySearchHighlights();
  if (entrySearchIndex < 0 || entrySearchIndex >= entrySearchResults.length) return;
  const rows = document.querySelectorAll("#entries-body tr");
  entrySearchResults.forEach((idx) => {
    const row = rows[idx];
    if (row) row.classList.add("search-highlight");
  });
  const currentRow = rows[entrySearchResults[entrySearchIndex]];
  if (currentRow) {
    currentRow.classList.add("search-current");
    currentRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  updateEntrySearchCounter();
}

function navigateEntrySearch(dir) {
  if (entrySearchResults.length === 0) return;
  entrySearchIndex = (entrySearchIndex + dir + entrySearchResults.length) % entrySearchResults.length;
  highlightCurrentSearchResult();
}

function updateEntrySearchCounter() {
  const counter = document.getElementById("entry-search-counter");
  if (entrySearchResults.length === 0) {
    counter.textContent = "0/0";
  } else {
    counter.textContent = `${entrySearchIndex + 1}/${entrySearchResults.length}`;
  }
}

let globalSearchTimer = null;
let globalSearchSeq = 0;

function initGlobalSearch() {
  document.getElementById("btn-search").addEventListener("click", openSearchModal);
  document.getElementById("search-modal-close").addEventListener("click", closeSearchModal);
  document.getElementById("search-modal").querySelector(".modal-backdrop").addEventListener("click", closeSearchModal);
  const input = document.getElementById("search-input");
  input.addEventListener("input", () => {
    clearTimeout(globalSearchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      globalSearchSeq++;
      document.getElementById("search-modal-status").textContent = "Введите минимум 2 символа";
      document.getElementById("search-results").innerHTML = "";
      return;
    }
    const seq = ++globalSearchSeq;
    globalSearchTimer = setTimeout(async () => {
      document.getElementById("search-modal-status").textContent = "Поиск…";
      let res;
      try {
        res = await apiGet("/api/search?q=" + encodeURIComponent(q));
      } catch (e) {
        res = { ready: false };
      }
      if (seq !== globalSearchSeq) return;
      renderSearchResults(res);
    }, 300);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearchModal();
  });
}

function openSearchModal() {
  document.getElementById("search-modal").classList.remove("hidden");
  document.getElementById("search-input").value = "";
  document.getElementById("search-modal-status").textContent = "Введите минимум 2 символа";
  document.getElementById("search-results").innerHTML = "";
  globalSearchSeq++;
  setTimeout(() => document.getElementById("search-input").focus(), 50);
}

function closeSearchModal() {
  document.getElementById("search-modal").classList.add("hidden");
  globalSearchSeq++;
}

function renderSearchResults(res) {
  const box = document.getElementById("search-results");
  const status = document.getElementById("search-modal-status");
  if (!res || !res.ready) {
    status.textContent = "Поиск недоступен";
    box.innerHTML = "";
    return;
  }
  box.innerHTML = "";
  if (!res.total) {
    status.textContent = "Ничего не найдено";
    box.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
    return;
  }
  const dotMap = { UI: "dot-ui", Story: "dot-story", Lyrics: "dot-lyrics" };
  let extra = "";
  if (res.truncated) extra = " · показаны файлы";
  status.textContent = `Найдено строк: ${res.total} в ${res.results.length} файлах${extra}`;
  for (const file of res.results) {
    const grp = document.createElement("div");
    grp.className = "search-file-group";
    const head = document.createElement("div");
    head.className = "search-file-header";
    const dot = document.createElement("span");
    dot.className = "file-dot " + (dotMap[file.cat] || "dot-ui");
    head.appendChild(dot);
    const pathSpan = document.createElement("span");
    pathSpan.textContent = file.rel;
    head.appendChild(pathSpan);
    const cnt = document.createElement("span");
    cnt.className = "search-file-count";
    const extraCount = file.match_count - file.matches.length;
    cnt.textContent = file.match_count + (extraCount > 0 ? "+" + extraCount : "");
    head.appendChild(cnt);
    grp.appendChild(head);
    for (const m of file.matches) {
      const item = document.createElement("div");
      item.className = "search-result-item";
      item.addEventListener("click", () => goToSearchResult(file.cat, file.rel, m));
      const keyRow = document.createElement("div");
      keyRow.className = "search-result-key";
      if (m.speaker) {
        const sp = document.createElement("span");
        sp.className = "search-result-speaker";
        sp.textContent = m.speaker;
        keyRow.appendChild(sp);
      }
      const key = document.createElement("span");
      key.textContent = m.key;
      keyRow.appendChild(key);
      item.appendChild(keyRow);
      const en = document.createElement("div");
      en.className = "search-result-text";
      en.textContent = m.en;
      item.appendChild(en);
      if (m.ru) {
        const ru = document.createElement("div");
        ru.className = "search-result-text search-result-ru";
        ru.textContent = m.ru;
        item.appendChild(ru);
      }
      grp.appendChild(item);
    }
    box.appendChild(grp);
  }
}

async function goToSearchResult(cat, rel, match) {
  closeSearchModal();
  const fileSearch = document.getElementById("file-search");
  fileSearch.value = "";
  doFileSearch();
  const rowKey = match.line_index != null ? match.key + ":" + match.line_index : match.key;
  await selectFile(rel, cat);
  const row = rowElements.get(rowKey);
  if (row) {
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("row-jump");
  }
}

function collapseAll() {
  document.querySelectorAll(".category-files.open, .subfolder-files.open").forEach((el) => {
    el.classList.remove("open");
  });
  document.querySelectorAll(".subfolder-header span:first-child").forEach((el) => {
    if (el.textContent === "▾") el.textContent = "▸";
  });
}

async function excludeCurrentFile() {
  if (!currentFile) return;
  await apiPost("/api/exclude", { path: currentFile });
  document.getElementById("empty-file-banner").classList.add("hidden");
  await loadFiles();
}

function closeEditor() {
  document.querySelectorAll(".row-editing").forEach((el) => el.classList.remove("row-editing"));
  document.getElementById("edit-modal").classList.add("hidden");
  editingEntry = null;
  currentEditingKey = null;
}

let redHighlightEnabled = false;

function openGitModal(title) {
  const modal = document.getElementById("git-modal");
  modal.classList.remove("hidden");
  document.getElementById("git-modal-title").textContent = title;
  document.getElementById("git-modal-message").textContent = "";
  document.getElementById("git-modal-message").className = "";
  document.getElementById("git-modal-conflicts").classList.add("hidden");
  document.getElementById("git-modal-conflicts").innerHTML = "";
  document.getElementById("git-modal-toggle-details").classList.add("hidden");
  document.getElementById("git-modal-details").classList.add("hidden");
  document.getElementById("git-modal-details").textContent = "";
}

function closeGitModal() {
  document.getElementById("git-modal").classList.add("hidden");
}

function toggleGitDetails() {
  const details = document.getElementById("git-modal-details");
  const btn = document.getElementById("git-modal-toggle-details");
  const show = details.classList.contains("hidden");
  details.classList.toggle("hidden", !show);
  btn.textContent = show ? "Скрыть технические детали" : "Показать технические детали";
}

function showGitResult(res) {
  const msgEl = document.getElementById("git-modal-message");
  msgEl.textContent = res.message || (res.ok ? "Готово." : "Ошибка.");
  msgEl.className = res.ok ? "git-result-ok" : "git-result-error";
  const conflictsEl = document.getElementById("git-modal-conflicts");
  if (res.conflict_files && res.conflict_files.length > 0) {
    const list = res.conflict_files.map(f => `<li>${escapeHtml(f)}</li>`).join("");
    conflictsEl.innerHTML = `<strong>Файлы с конфликтами:</strong><ul>${list}</ul>`;
    conflictsEl.classList.remove("hidden");
  }
  const detailsBtn = document.getElementById("git-modal-toggle-details");
  if (res.details && String(res.details).trim()) {
    document.getElementById("git-modal-details").textContent = res.details;
    detailsBtn.classList.remove("hidden");
  }
  document.getElementById("git-modal-close").textContent = res.ok ? "OK" : "Понятно";
  const resolveBtn = document.getElementById("git-modal-resolve-conflicts");
  const hasConflict = res.error_type === "conflict" ||
    (res.conflict_files && res.conflict_files.length > 0);
  if (hasConflict && typeof openConflictModal === "function") {
    resolveBtn.classList.remove("hidden");
    resolveBtn.onclick = () => {
      closeGitModal();
      openConflictModal();
    };
  } else {
    resolveBtn.classList.add("hidden");
    resolveBtn.onclick = null;
  }
}

function setGitButtonsDisabled(disabled) {
  ["btn-git-update-en", "btn-git-update-ru", "btn-git-save"].forEach(id => {
    document.getElementById(id).disabled = disabled;
  });
}

async function runGitOp(title, url, body) {
  setGitButtonsDisabled(true);
  openGitModal(title);
  document.getElementById("git-modal-message").textContent = "Выполняется…";
  document.getElementById("git-modal-message").className = "git-result-running";
  document.getElementById("git-modal-close").disabled = true;
  let result;
  try {
    result = await apiPost(url, body);
  } catch (e) {
    result = { ok: false, message: "Не удалось выполнить операцию.", details: String(e) };
  } finally {
    document.getElementById("git-modal-close").disabled = false;
    setGitButtonsDisabled(false);
  }
  showGitResult(result);
  return result;
}

async function reloadAfterGit() {
  await loadFiles();
  const editOpen = !document.getElementById("edit-modal").classList.contains("hidden");
  if (currentFile && !editOpen) {
    const eData = await apiGet(`/api/entries?path=${encodeURIComponent(currentFile)}&cat=${encodeURIComponent(currentCategory)}`);
    if (!eData.error) {
      currentEntries = eData.entries;
      renderEntries(currentEntries, currentCategory);
      clearEntrySearchHighlights();
      entrySearchResults = [];
      entrySearchIndex = -1;
      document.getElementById("entry-search-counter").textContent = "";
    }
  }
}

async function updateEn() {
  const res = await runGitOp("Обновить EN", "/api/git/update-en", {});
  if (res && res.ok) await reloadAfterGit();
}

async function updateRu() {
  const res = await runGitOp("Обновить RU", "/api/git/update-ru", {});
  if (res && res.ok) await reloadAfterGit();
}

function openCommitModal() {
  document.getElementById("commit-message").value = "Manual translation";
  document.getElementById("commit-modal").classList.remove("hidden");
  const ta = document.getElementById("commit-message");
  const confirmBtn = document.getElementById("commit-btn-confirm");
  ta.disabled = true;
  confirmBtn.disabled = true;
  apiGet("/api/git/suggest-message").then((res) => {
    ta.disabled = false;
    confirmBtn.disabled = false;
    if (res && res.ok && res.message) {
      ta.value = res.message;
      ta.focus();
      ta.setSelectionRange(0, 0);
    } else {
      ta.focus();
      ta.select();
    }
  }).catch(() => {
    ta.disabled = false;
    confirmBtn.disabled = false;
    ta.focus();
    ta.select();
  });
}

function closeCommitModal() {
  document.getElementById("commit-modal").classList.add("hidden");
}

async function doSave() {
  const msg = document.getElementById("commit-message").value.trim();
  closeCommitModal();
  const res = await runGitOp("Сохранить изменения", "/api/git/save", { message: msg });
  if (res && res.ok) await reloadAfterGit();
}

function initGitBar() {
  document.getElementById("btn-git-update-en").addEventListener("click", updateEn);
  document.getElementById("btn-git-update-ru").addEventListener("click", updateRu);
  document.getElementById("btn-git-save").addEventListener("click", openCommitModal);
  document.getElementById("commit-btn-confirm").addEventListener("click", doSave);
  document.getElementById("commit-btn-cancel").addEventListener("click", closeCommitModal);
  document.getElementById("commit-modal").querySelector(".modal-backdrop").addEventListener("click", closeCommitModal);
  document.getElementById("git-modal-close").addEventListener("click", closeGitModal);
  document.getElementById("git-modal-toggle-details").addEventListener("click", toggleGitDetails);
  document.getElementById("startup-banner-close").addEventListener("click", () => {
    document.getElementById("startup-banner").classList.add("hidden");
  });
}

async function checkStartupEnStatus() {
  let attempts = 0;
  const poll = async () => {
    try {
      const res = await fetch("/api/git/startup-status");
      const data = await res.json();
      if (data.done) {
        if (data.result && !data.result.ok) {
          const banner = document.getElementById("startup-banner");
          document.getElementById("startup-banner-text").textContent =
            "Не удалось обновить EN-репозиторий при запуске: " + (data.result.message || "неизвестная ошибка");
          banner.classList.remove("hidden");
        }
        return;
      }
    } catch (e) {}
    attempts++;
    if (attempts < 15) setTimeout(poll, 1500);
  };
  poll();
}

let translatePollTimer = null;

function initTranslateDialog() {
  document.getElementById("btn-translate").addEventListener("click", openTranslateDialog);
  document.getElementById("translate-btn-cancel").addEventListener("click", cancelTranslate);
  document.getElementById("translate-btn-start").addEventListener("click", startTranslate);
  document.querySelectorAll("#translate-modal .modal-backdrop").forEach(el => el.addEventListener("click", cancelTranslate));
}

async function openTranslateDialog() {
  const modal = document.getElementById("translate-modal");
  modal.classList.remove("hidden");
  document.getElementById("tr-ui").checked = true;
  document.getElementById("tr-story").checked = false;
  document.getElementById("tr-lyrics").checked = false;
  document.getElementById("translate-progress").style.display = "none";
  document.getElementById("translate-status").textContent = "";
  const startBtn = document.getElementById("translate-btn-start");
  startBtn.disabled = false;
  startBtn.textContent = "Начать";
  document.getElementById("translate-btn-cancel").textContent = "Отмена";
  const st = await apiGet("/api/translate/status");
  if (st.running) {
    showTranslateRunning();
    updateTranslateBar(st);
    document.getElementById("translate-status").textContent = translateInfoText(st);
    startTranslatePolling();
  }
}

async function startTranslate() {
  const categories = [];
  if (document.getElementById("tr-ui").checked) categories.push("UI");
  if (document.getElementById("tr-story").checked) categories.push("Story");
  if (document.getElementById("tr-lyrics").checked) categories.push("Lyrics");
  if (categories.length === 0) {
    document.getElementById("translate-status").textContent = "Выберите хотя бы одну категорию";
    return;
  }
  const res = await apiPost("/api/translate/start", { categories });
  if (!res.ok) {
    document.getElementById("translate-status").textContent = res.error || "Не удалось запустить";
    return;
  }
  showTranslateRunning();
  startTranslatePolling();
}

function showTranslateRunning() {
  document.getElementById("translate-progress").style.display = "block";
  const startBtn = document.getElementById("translate-btn-start");
  startBtn.disabled = true;
  startBtn.textContent = "Процесс запущен...";
  document.getElementById("translate-btn-cancel").textContent = "Стоп";
}

function updateTranslateBar(st) {
  const fill = document.getElementById("translate-progress-fill");
  let pct = 0;
  if (st.total > 0) {
    const lineFrac = (st.current_file_total || 0) > 0 ? (st.current_file_done || 0) / st.current_file_total : 0;
    pct = Math.min(100, Math.round(((st.done + lineFrac) / st.total) * 100));
  }
  fill.style.width = pct + "%";
}

function translateInfoText(st) {
  if (st.total <= 0) return "";
  let info = `Файл ${st.done}/${st.total}`;
  if ((st.current_file_total || 0) > 0) info += ` · Строки ${st.current_file_done}/${st.current_file_total}`;
  if (st.current_file) info += ` — ${st.current_file}`;
  return info;
}

function startTranslatePolling() {
  clearInterval(translatePollTimer);
  translatePollTimer = setInterval(async () => {
    let st;
    try {
      const res = await fetch("/api/translate/status");
      st = await res.json();
    } catch (e) { return; }
    if (st.running) {
      updateTranslateBar(st);
      document.getElementById("translate-status").textContent = translateInfoText(st);
    } else {
      clearInterval(translatePollTimer);
      const startBtn = document.getElementById("translate-btn-start");
      startBtn.disabled = false;
      startBtn.textContent = "Начать";
      document.getElementById("translate-btn-cancel").textContent = "Отмена";
      let msg;
      if (st.status === "done") msg = `Выполнено. Переведенно ${st.translated}, пропущенно ${st.skipped}.`;
      else if (st.status === "stopped") msg = `Остановлено. Переведенно ${st.translated}, пропущенно ${st.skipped}.`;
      else msg = `Ошибка: ${st.error || st.status}`;
      updateTranslateBar(st);
      document.getElementById("translate-status").textContent = msg;
      await reloadAfterTranslate();
    }
  }, 600);
}

async function cancelTranslate() {
  const startBtn = document.getElementById("translate-btn-start");
  if (startBtn.disabled) {
    await apiPost("/api/translate/stop", {});
    document.getElementById("translate-status").textContent = "Остановка...";
    return;
  }
  closeTranslateDialog();
}

function closeTranslateDialog() {
  clearInterval(translatePollTimer);
  document.getElementById("translate-modal").classList.add("hidden");
}

async function reloadAfterTranslate() {
  await loadFiles();
  highlightActiveFile(currentFile);
  if (currentFile) {
    const eData = await apiGet(`/api/entries?path=${encodeURIComponent(currentFile)}&cat=${encodeURIComponent(currentCategory)}`);
    if (!eData.error) {
      currentEntries = eData.entries;
      renderEntries(currentEntries, currentCategory);
    }
  }
}

async function translateCurrentEntry() {
  if (!editingEntry) return;
  const btn = document.getElementById("btn-modal-translate");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "Перевод...";
  try {
    const res = await apiPost("/api/translate/text", { text: editingEntry.en });
    const validationMsg = document.getElementById("modal-validation");
    if (res.ok && res.text) {
      document.getElementById("modal-ru-input").value = nlToText(res.text);
      validationMsg.classList.add("hidden");
    } else {
      validationMsg.textContent = res.error || "Не удалось выполнить перевод";
      validationMsg.className = "error";
      validationMsg.classList.remove("hidden");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function initRedToggle() {
  const btn = document.getElementById("btn-red-toggle");
  btn.addEventListener("click", () => {
    redHighlightEnabled = !redHighlightEnabled;
    btn.style.opacity = redHighlightEnabled ? "1" : "0.4";
    apiPost("/api/config", { red_highlight_enabled: redHighlightEnabled });
    if (currentEntries.length > 0) renderEntries(currentEntries, currentCategory);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();
  if (config.red_highlight_enabled) {
    redHighlightEnabled = true;
    document.getElementById("btn-red-toggle").style.opacity = "1";
  } else {
    document.getElementById("btn-red-toggle").style.opacity = "0.4";
  }
  await loadFiles();
  initFileSearch();
  initEntrySearch();
  initGlobalSearch();
  initGitBar();
  initTranslateDialog();
  initRedToggle();
  checkStartupEnStatus();
  document.getElementById("theme-switch").addEventListener("change", async (e) => {
    const theme = e.target.checked ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    await apiPost("/api/config", { theme });
  });
  document.getElementById("btn-cancel").addEventListener("click", closeEditor);
  document.getElementById("btn-restore").addEventListener("click", restoreOriginal);
  document.getElementById("btn-collapse").addEventListener("click", collapseAll);
  document.getElementById("btn-exclude").addEventListener("click", excludeCurrentFile);
  document.getElementById("btn-save").addEventListener("click", saveEdit);
  document.getElementById("btn-modal-translate").addEventListener("click", translateCurrentEntry);
  document.querySelector("#edit-modal .modal-backdrop").addEventListener("click", closeEditor);
  document.getElementById("modal-ru-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      saveEdit();
    }
  });
});
