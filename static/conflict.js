/* Окно разрешения конфликтов */
/* Используется и в основном редакторе, и в тестовой программе.
   Работу с сервером можно переопределить через window.CONFLICT_CONFIG. */

(function () {
  const MODAL_HTML = `
<div id="conflict-modal" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-content conflict-modal-content">
    <h3 class="git-modal-title">Разрешение конфликта</h3>
    <div class="conflict-explain">
      <p><strong>Что произошло?</strong></p>
      <p>Другой переводчик сохранил изменения в те же строки, что и вы, чуть раньше. Поэтому программа не может сама выбрать, какой вариант правильный, и спрашивает вас.</p>
      <p>Не переживайте: ваши изменения никуда не пропали. Обе версии строки показаны ниже — просто отметьте, какая из них должна остаться, и нажмите «Сохранить решения».</p>
    </div>
    <div id="conflict-files-bar" class="conflict-files-bar"></div>
    <div id="conflict-blocks" class="conflict-blocks"></div>
    <div id="conflict-status" class="conflict-status"></div>
    <div class="modal-actions">
      <button id="conflict-btn-close" class="btn btn-red">Отмена</button>
      <button id="conflict-btn-resolve" class="btn btn-green">Сохранить решения</button>
      <button id="conflict-btn-finish" class="btn btn-green hidden">Завершить сохранение</button>
    </div>
  </div>
</div>`;

  window.CONFLICT_CONFIG = window.CONFLICT_CONFIG || {};

  function conflictFetchData() {
    if (CONFLICT_CONFIG.fetchData) return CONFLICT_CONFIG.fetchData();
    return fetch("/api/git/conflicts").then(function (r) { return r.json(); });
  }

  function conflictResolve(payload) {
    if (CONFLICT_CONFIG.resolve) return CONFLICT_CONFIG.resolve(payload);
    return fetch("/api/git/conflicts/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); });
  }

  function conflictFinish() {
    if (CONFLICT_CONFIG.finish) return CONFLICT_CONFIG.finish();
    closeConflictModal();
    return runGitOp("Сохранить изменения", "/api/git/save", { message: "" })
      .then(function (res) {
        if (res && res.ok && typeof reloadAfterGit === "function") {
          return reloadAfterGit().catch(function () {});
        }
        return res;
      });
  }

  let conflictFiles = [];
  let conflictCurrent = 0;
  let conflictResolutions = {};

  function injectConflictModal() {
    if (document.getElementById("conflict-modal")) return;
    const holder = document.createElement("div");
    holder.innerHTML = MODAL_HTML;
    document.body.appendChild(holder.firstElementChild);
    document.getElementById("conflict-btn-close").addEventListener("click", closeConflictModal);
    document.getElementById("conflict-btn-resolve").addEventListener("click", submitConflictResolutions);
    document.getElementById("conflict-btn-finish").addEventListener("click", onConflictFinish);
    document.getElementById("conflict-modal").querySelector(".modal-backdrop")
      .addEventListener("click", closeConflictModal);
    const blocks = document.getElementById("conflict-blocks");
    blocks.addEventListener("click", onConflictBlocksClick);
    blocks.addEventListener("change", onConflictBlocksChange);
    blocks.addEventListener("input", onConflictBlocksInput);
  }

  function openConflictModal(data) {
    injectConflictModal();
    const modal = document.getElementById("conflict-modal");
    modal.classList.remove("hidden");
    document.getElementById("conflict-status").textContent = "";
    document.getElementById("conflict-status").className = "conflict-status";
    document.getElementById("conflict-btn-resolve").classList.remove("hidden");
    document.getElementById("conflict-btn-resolve").disabled = false;
    document.getElementById("conflict-btn-finish").classList.add("hidden");
    const show = function (res) {
      conflictFiles = (res && res.files) || [];
      conflictCurrent = 0;
      conflictResolutions = {};
      if (conflictFiles.length === 0) {
        document.getElementById("conflict-blocks").innerHTML =
          '<div class="conflict-empty">Конфликтов сейчас нет. Можно продолжать работать.</div>';
        document.getElementById("conflict-files-bar").innerHTML = "";
        return;
      }
      renderConflictFilesBar();
      renderConflictBlocks();
    };
    if (data) {
      show(data);
    } else {
      document.getElementById("conflict-blocks").innerHTML =
        '<div class="conflict-empty">Загрузка…</div>';
      conflictFetchData().then(show).catch(function (e) {
        document.getElementById("conflict-blocks").innerHTML =
          '<div class="conflict-empty">Не удалось загрузить конфликты: ' + escapeHtml(String(e)) + "</div>";
      });
    }
  }

  function closeConflictModal() {
    const modal = document.getElementById("conflict-modal");
    if (modal) modal.classList.add("hidden");
    conflictFiles = [];
    conflictCurrent = 0;
    conflictResolutions = {};
  }

  function renderConflictFilesBar() {
    const bar = document.getElementById("conflict-files-bar");
    bar.innerHTML = "";
    conflictFiles.forEach(function (file, idx) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "conflict-file-chip" + (idx === conflictCurrent ? " active" : "");
      const n = file.blocks ? file.blocks.length : 0;
      chip.textContent = (idx + 1) + ". " + file.rel + " (" + n + ")";
      chip.title = file.rel;
      chip.addEventListener("click", function () {
        conflictCurrent = idx;
        renderConflictFilesBar();
        renderConflictBlocks();
      });
      bar.appendChild(chip);
    });
  }

  function renderConflictBlocks() {
    const file = conflictFiles[conflictCurrent];
    const box = document.getElementById("conflict-blocks");
    box.innerHTML = "";
    if (!file) return;
    const fileRes = conflictResolutions[file.rel] || {};
    if (!file.blocks || file.blocks.length === 0) {
      box.innerHTML = '<div class="conflict-empty">В этом файле нет конфликтов.</div>';
      return;
    }
    for (let bi = 0; bi < file.blocks.length; bi++) {
      const block = file.blocks[bi];
      const res = fileRes[block.id] || {};
      const choice = res.choice || "mine";
      const wrap = document.createElement("div");
      wrap.className = "conflict-block";
      wrap.dataset.blockId = block.id;
      const title = document.createElement("div");
      title.className = "conflict-block-title";
      title.textContent = "Конфликт " + (bi + 1);
      wrap.appendChild(title);
      const sides = [
        { val: "mine", badge: "Ваш вариант", text: block.mine },
        { val: "remote", badge: "Версия на GitHub (другой переводчик)", text: block.remote },
      ];
      for (const s of sides) {
        const opt = document.createElement("div");
        opt.className = "conflict-option" + (choice === s.val ? " selected" : "");
        opt.dataset.choice = s.val;
        const head = document.createElement("label");
        head.className = "conflict-option-head";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "cb-" + conflictCurrent + "-" + block.id;
        radio.value = s.val;
        radio.checked = choice === s.val;
        const badge = document.createElement("span");
        badge.className = "conflict-option-badge";
        badge.textContent = s.badge;
        head.appendChild(radio);
        head.appendChild(badge);
        const pre = document.createElement("pre");
        pre.className = "conflict-option-text";
        pre.textContent = (s.text && s.text.length) ? s.text.join("\n") : "(пусто)";
        opt.appendChild(head);
        opt.appendChild(pre);
        wrap.appendChild(opt);
      }
      const custom = document.createElement("div");
      custom.className = "conflict-option conflict-option-custom" + (choice === "custom" ? " selected" : "");
      custom.dataset.choice = "custom";
      const headC = document.createElement("label");
      headC.className = "conflict-option-head";
      const radioC = document.createElement("input");
      radioC.type = "radio";
      radioC.name = "cb-" + conflictCurrent + "-" + block.id;
      radioC.value = "custom";
      radioC.checked = choice === "custom";
      const badgeC = document.createElement("span");
      badgeC.className = "conflict-option-badge";
      badgeC.textContent = "Свой вариант";
      headC.appendChild(radioC);
      headC.appendChild(badgeC);
      const ta = document.createElement("textarea");
      ta.className = "conflict-option-textarea";
      ta.rows = 3;
      ta.placeholder = "Введите свой вариант перевода…";
      ta.value = res.text != null ? res.text : (block.mine.length ? block.mine.join("\n") : "");
      custom.appendChild(headC);
      custom.appendChild(ta);
      wrap.appendChild(custom);
      box.appendChild(wrap);
    }
  }

  function currentFileRel() {
    const file = conflictFiles[conflictCurrent];
    return file ? file.rel : "";
  }

  function onConflictBlocksClick(e) {
    const opt = e.target.closest(".conflict-option");
    if (!opt) return;
    if (e.target.closest("textarea")) return;
    const radio = opt.querySelector('input[type="radio"]');
    if (radio) {
      radio.checked = true;
      updateConflictSelection(opt);
    }
  }

  function onConflictBlocksChange(e) {
    if (e.target.type !== "radio") return;
    const opt = e.target.closest(".conflict-option");
    if (opt) updateConflictSelection(opt);
  }

  function onConflictBlocksInput(e) {
    if (!e.target.classList.contains("conflict-option-textarea")) return;
    const opt = e.target.closest(".conflict-option");
    if (!opt) return;
    const radio = opt.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    opt.closest(".conflict-block").querySelectorAll(".conflict-option").forEach(function (o) {
      o.classList.toggle("selected", o === opt);
    });
    const rel = currentFileRel();
    const blockId = parseInt(opt.closest(".conflict-block").dataset.blockId, 10);
    storeConflictResolution(rel, blockId, "custom", e.target.value);
  }

  function updateConflictSelection(opt) {
    opt.closest(".conflict-block").querySelectorAll(".conflict-option").forEach(function (o) {
      o.classList.toggle("selected", o === opt);
    });
    const rel = currentFileRel();
    const blockId = parseInt(opt.closest(".conflict-block").dataset.blockId, 10);
    const radio = opt.querySelector('input[type="radio"]');
    const choice = radio.value;
    let text;
    if (choice === "custom") {
      const ta = opt.querySelector(".conflict-option-textarea");
      const prev = conflictResolutions[rel] && conflictResolutions[rel][blockId];
      if (!ta.value.trim() && prev && prev.text) ta.value = prev.text;
      text = ta.value;
    } else if (choice === "remote") {
      const block = opt.closest(".conflict-block");
      text = block.querySelector(".conflict-option[data-choice='remote'] .conflict-option-text").textContent;
    } else {
      const block = opt.closest(".conflict-block");
      text = block.querySelector(".conflict-option[data-choice='mine'] .conflict-option-text").textContent;
    }
    storeConflictResolution(rel, blockId, choice, text);
  }

  function storeConflictResolution(rel, blockId, choice, text) {
    if (!conflictResolutions[rel]) conflictResolutions[rel] = {};
    conflictResolutions[rel][blockId] = { choice: choice, text: text };
  }

  function collectResolutions() {
    const files = [];
    conflictFiles.forEach(function (file) {
      const fileRes = conflictResolutions[file.rel] || {};
      const blocks = {};
      (file.blocks || []).forEach(function (b) {
        blocks[b.id] = fileRes[b.id] || { choice: "mine", text: b.mine.join("\n") };
      });
      files.push({ rel: file.rel, blocks: blocks });
    });
    return { files: files };
  }

  function submitConflictResolutions() {
    const status = document.getElementById("conflict-status");
    const btn = document.getElementById("conflict-btn-resolve");
    btn.disabled = true;
    status.textContent = "Сохранение решений…";
    status.className = "conflict-status conflict-status-info";
    conflictResolve(collectResolutions()).then(function (res) {
      btn.disabled = false;
      if (res && res.ok) {
        status.textContent = "Конфликты разрешены! Теперь нажмите «Завершить сохранение», чтобы отправить изменения на GitHub.";
        status.className = "conflict-status conflict-status-ok";
        btn.classList.add("hidden");
        document.getElementById("conflict-btn-finish").classList.remove("hidden");
      } else {
        status.textContent = (res && res.message) || "Не удалось сохранить решения. Попробуйте ещё раз.";
        status.className = "conflict-status conflict-status-error";
      }
    }).catch(function (e) {
      btn.disabled = false;
      status.textContent = "Ошибка: " + e;
      status.className = "conflict-status conflict-status-error";
    });
  }

  function onConflictFinish() {
    document.getElementById("conflict-status").textContent = "Завершение…";
    document.getElementById("conflict-status").className = "conflict-status conflict-status-info";
    conflictFinish();
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  window.initConflictModal = function () {
    injectConflictModal();
  };
  window.openConflictModal = openConflictModal;
  window.closeConflictModal = closeConflictModal;

  injectConflictModal();
})();
