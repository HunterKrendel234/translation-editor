let currentStep = 0;
let os = "windows";
let gitOk = false;
let enCloned = false;
let ruCloned = false;
let sshKeyGenerated = false;
let sshVerified = false;

function log(text, cls) {
  const body = document.getElementById("setup-log-body");
  const div = document.createElement("div");
  div.className = "log-entry " + (cls || "log-info");
  const now = new Date();
  const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, "0")).join(":");
  div.innerHTML = '<span class="log-time">' + ts + "</span>" + escHtml(text);
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function logSep() {
  const body = document.getElementById("setup-log-body");
  const div = document.createElement("div");
  div.className = "log-sep";
  body.appendChild(div);
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showStatus(id, text, cls) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "check-status visible " + cls;
}

function hideStatus(id) {
  const el = document.getElementById(id);
  el.className = "check-status";
}

function goToStep(n) {
  document.querySelectorAll(".setup-panel").forEach(p => p.classList.add("hidden"));
  document.querySelector('.setup-panel[data-step="' + n + '"]').classList.remove("hidden");
  document.querySelectorAll(".setup-step").forEach(s => {
    s.classList.remove("active");
    const idx = parseInt(s.dataset.step);
    if (idx === n) s.classList.add("active");
  });
  currentStep = n;
  if (n === 0) checkGit();
  if (n === 1) {
    document.getElementById("repos-select").classList.remove("hidden");
    document.getElementById("repos-actions").classList.remove("hidden");
    checkRepos();
  }
}

function markStepDone(n) {
  document.querySelector('.setup-step[data-step="' + n + '"]').classList.add("done");
}

function setNextEnabled(step, enabled) {
  const btn = document.getElementById("btn-next-" + step);
  if (btn) btn.disabled = !enabled;
}

function logCmds(data) {
  if (!data || !data.commands) return;
  data.commands.forEach(function(c) {
    log("$ " + c.cmd, "log-cmd");
    if (c.output && c.output !== "done" && c.output !== "copied") {
      log(c.output, c.ok ? "log-info" : "log-err");
    }
  });
}

function apiGet(url) {
  return fetch(url).then(r => r.json());
}

function apiPost(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

function checkGit() {
  showStatus("git-check-status", "Проверяю Git...", "loading");
  logSep();
  log("Проверка наличия Git...");
  apiGet("/api/setup/check-git").then(data => {
    logCmds(data);
    if (data.found) {
      gitOk = true;
      var ver = data.version || "";
      showStatus("git-check-status", "Git найден" + (ver ? ": " + ver : ""), "ok");
      document.getElementById("git-instructions").classList.add("hidden");
      markStepDone(0);
      setNextEnabled(0, true);
      log("Git найден" + (ver ? " - " + ver : ""), "log-ok");
    } else {
      gitOk = false;
      showStatus("git-check-status", "Git не найден", "error");
      document.getElementById("git-instructions").classList.remove("hidden");
      showOsBlock("git");
      setNextEnabled(0, false);
      log("Git не найден - установите его", "log-err");
    }
  }).catch(e => {
    showStatus("git-check-status", "Ошибка проверки: " + e, "error");
    log("Ошибка: " + e, "log-err");
  });
}

function checkRepos() {
  logSep();
  log("Проверка репозиториев...");
  showStatus("repos-check-status", "Проверяю...", "loading");
  apiGet("/api/setup/check-repos").then(data => {
    logCmds(data);
    applyReposData(data);
    document.getElementById("repos-check-status").classList.add("hidden");
    document.getElementById("repos-select").classList.remove("hidden");
    document.getElementById("repos-actions").classList.remove("hidden");
    updateReposNext();
  }).catch(e => {
    showStatus("repos-check-status", "Ошибка: " + e, "error");
    log("Ошибка: " + e, "log-err");
  });
}

function applyReposData(data) {
  var enPath = data.en_path || "";
  var baseDir = enPath.replace(/[\\\/]Gakumas-Translation-Data-EN$/, "");
  if (baseDir) {
    document.getElementById("workspace-path").setAttribute("data-home", baseDir);
    document.getElementById("workspace-path").value = baseDir;
  }
  if (data.en_exists) {
    enCloned = true;
    document.getElementById("repo-en-detail").textContent = data.en_path;
    document.getElementById("repo-en-check").classList.remove("hidden");
    document.getElementById("btn-clone-en").classList.add("hidden");
    log("EN репозиторий найден", "log-ok");
  } else {
    enCloned = false;
    document.getElementById("repo-en-detail").textContent = "Не найден";
    document.getElementById("repo-en-check").classList.add("hidden");
    document.getElementById("btn-clone-en").classList.remove("hidden");
    log("EN репозиторий не найден - нужно скачать", "log-warn");
  }
  if (data.ru_exists) {
    ruCloned = true;
    document.getElementById("repo-ru-detail").textContent = data.ru_path;
    document.getElementById("repo-ru-check").classList.remove("hidden");
    document.getElementById("btn-clone-ru").classList.add("hidden");
    log("RU репозиторий найден", "log-ok");
  } else {
    ruCloned = false;
    document.getElementById("repo-ru-detail").textContent = "Не найден";
    document.getElementById("repo-ru-check").classList.add("hidden");
    document.getElementById("btn-clone-ru").classList.remove("hidden");
    log("RU репозиторий не найден - нужно скачать", "log-warn");
  }
  document.getElementById("repos-select").classList.remove("hidden");
  document.getElementById("repos-actions").classList.remove("hidden");
}

function updateReposNext() {
  if (enCloned && ruCloned) {
    markStepDone(1);
    setNextEnabled(1, true);
  } else {
    setNextEnabled(1, false);
  }
}

function cloneRepo(repo) {
  var workspace = document.getElementById("workspace-path").value.trim();
  var btnId = "btn-clone-" + repo;
  var btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.textContent = "Клонирую...";
  logSep();
  log("Скачивание " + repo.toUpperCase() + " репозитория...");
  apiPost("/api/setup/clone", { repo: repo, workspace: workspace }).then(data => {
    logCmds(data);
    if (data.ok) {
      var pathEl = document.getElementById("repo-" + repo + "-detail");
      pathEl.textContent = data.path;
      document.getElementById("repo-" + repo + "-check").classList.remove("hidden");
      btn.classList.add("hidden");
      if (repo === "en") enCloned = true;
      else ruCloned = true;
      log(repo.toUpperCase() + " скачан: " + data.path, "log-ok");
      if (data.already_exists) log("(уже был скачан ранее)", "log-info");
    } else {
      btn.disabled = false;
      btn.textContent = "Скачать " + repo.toUpperCase();
      log("Ошибка скачивания " + repo.toUpperCase() + ": " + (data.error || ""), "log-err");
    }
    updateReposNext();
  }).catch(e => {
    btn.disabled = false;
    btn.textContent = "Скачать " + repo.toUpperCase();
    log("Ошибка: " + e, "log-err");
    updateReposNext();
  });
}

function genKey() {
  var email = document.getElementById("ssh-email").value.trim();
  if (!email || email.indexOf("@") < 1) {
    alert("Введите корректный email");
    return;
  }
  var btn = document.getElementById("btn-gen-key");
  btn.disabled = true;
  btn.textContent = "Создаю...";
  logSep();
  log("Создание SSH-ключа...");
  apiPost("/api/setup/genkey", { email: email }).then(data => {
    logCmds(data);
    btn.disabled = false;
    btn.textContent = "Создать ключ";
    if (data.ok) {
      sshKeyGenerated = true;
      var msgEl = document.getElementById("ssh-key-message");
      if (data.already_existed) {
        msgEl.textContent = "SSH-ключ уже существовал. Публичный ключ скопирован в буфер обмена.";
        log("SSH-ключ уже был создан ранее", "log-info");
      } else {
        msgEl.textContent = "SSH-ключ создан успешно!";
        log("SSH-ключ создан", "log-ok");
      }
      if (data.copied_to_clipboard) {
        msgEl.textContent += " Публичный ключ скопирован в буфер обмена.";
        log("Публичный ключ скопирован в буфер обмена", "log-ok");
      } else {
        msgEl.textContent += " Скопируйте ключ вручную нажав кнопку рядом.";
        log("Не удалось скопировать в буфер, скопируйте вручную", "log-warn");
      }
      document.getElementById("ssh-pubkey-text").textContent = data.public_key;
      document.getElementById("ssh-key-result").classList.remove("hidden");
      document.getElementById("ssh-pubkey-section").classList.remove("hidden");
      document.getElementById("ssh-test-section").classList.remove("hidden");
    } else {
      log("Ошибка создания ключа: " + (data.error || ""), "log-err");
      alert("Ошибка: " + (data.error || "Неизвестная ошибка"));
    }
  }).catch(e => {
    btn.disabled = false;
    btn.textContent = "Создать ключ";
    log("Ошибка: " + e, "log-err");
  });
}

function testSsh() {
  showStatus("ssh-test-result", "Проверяю подключение к GitHub...", "loading");
  logSep();
  log("Проверка подключения к GitHub...");
  apiGet("/api/setup/test-ssh").then(data => {
    logCmds(data);
    if (data.ok) {
      sshVerified = true;
      showStatus("ssh-test-result", "Подключение успешно! " + (data.message || ""), "ok");
      markStepDone(2);
      setNextEnabled(2, true);
      log("Подключение к GitHub работает", "log-ok");
    } else {
      sshVerified = false;
      var msg = data.error || data.message || "Не удалось подключиться";
      showStatus("ssh-test-result", msg, "error");
      log("Ошибка подключения: " + msg, "log-err");
      if (!data.needs_confirm) {
        setNextEnabled(2, true);
        log("Можно продолжить без проверки", "log-warn");
      }
    }
  }).catch(e => {
    showStatus("ssh-test-result", "Ошибка: " + e, "error");
    log("Ошибка: " + e, "log-err");
    setNextEnabled(2, true);
  });
}

function showOsBlock(prefix) {
  var elW = document.getElementById(prefix + "-install-windows");
  var elM = document.getElementById(prefix + "-install-macos");
  if (os === "windows") {
    if (elW) elW.classList.remove("hidden");
    if (elM) elM.classList.add("hidden");
  } else {
    if (elW) elW.classList.add("hidden");
    if (elM) elM.classList.remove("hidden");
  }
}

function copyCode(btn) {
  var code = btn.parentElement.querySelector("code").textContent;
  navigator.clipboard.writeText(code).then(function() {
    btn.textContent = "Скопировано!";
    setTimeout(function() { btn.textContent = "Копировать"; }, 1500);
  });
}

function copyPubKey() {
  var text = document.getElementById("ssh-pubkey-text").textContent;
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.querySelector(".pubkey-block .btn-copy");
    btn.textContent = "Скопировано!";
    setTimeout(function() { btn.textContent = "Копировать"; }, 1500);
  });
}

document.addEventListener("DOMContentLoaded", function() {
  log("Инициализация мастера настройки...");
  apiGet("/api/setup/status").then(data => {
    os = data.os || "windows";
    log("Операционная система: " + (os === "windows" ? "Windows" : "macOS"));
    goToStep(0);
  });

  document.getElementById("btn-check-git").addEventListener("click", checkGit);

  document.getElementById("btn-clone-en").addEventListener("click", function() { cloneRepo("en"); });
  document.getElementById("btn-clone-ru").addEventListener("click", function() { cloneRepo("ru"); });

  document.getElementById("btn-gen-key").addEventListener("click", genKey);
  document.getElementById("btn-test-ssh").addEventListener("click", testSsh);

  document.getElementById("btn-clear-log").addEventListener("click", function() {
    document.getElementById("setup-log-body").innerHTML = "";
  });

  document.getElementById("btn-go-editor").addEventListener("click", function() {
    var btn = document.getElementById("btn-go-editor");
    btn.disabled = true;
    btn.textContent = "Завершаю настройку...";
    logSep();
    log("Завершение настройки...");
    apiPost("/api/setup/finalize", {}).then(function(data) {
      if (data.ok) {
        log("Настройка завершена!", "log-ok");
        log("Переход в редактор...");
        setTimeout(function() { window.location.href = "/"; }, 600);
      } else {
        log("Ошибка завершения", "log-err");
        btn.disabled = false;
        btn.textContent = "Перейти в редактор";
      }
    }).catch(function(e) {
      log("Ошибка: " + e, "log-err");
      btn.disabled = false;
      btn.textContent = "Перейти в редактор";
    });
  });

  document.querySelectorAll(".btn-next").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var step = parseInt(btn.id.replace("btn-next-", ""));
      goToStep(step + 1);
    });
  });

  document.querySelectorAll(".btn-back").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var step = parseInt(btn.id.replace("btn-back-", ""));
      goToStep(step - 1);
    });
  });

  var pathInput = document.getElementById("workspace-path");
  var modal = document.getElementById("dir-picker-modal");
  var modalPath = document.getElementById("dir-picker-current");
  var modalList = document.getElementById("dir-picker-list");
  var btnUp = document.getElementById("dir-picker-up");
  var btnSelect = document.getElementById("dir-picker-select");
  var btnClose = document.getElementById("dir-picker-close");
  var currentBrowsePath = "";

  function openDirPicker(startPath) {
    modal.classList.remove("hidden");
    mkdirInput.value = "";
    mkdirInput.classList.add("hidden");
    mkdirOk.classList.add("hidden");
    loadDirs(startPath || "");
  }

  function closeDirPicker() {
    modal.classList.add("hidden");
  }

  function loadDirs(path) {
    var url = "/api/setup/browse-dir" + (path ? "?path=" + encodeURIComponent(path) : "");
    modalList.innerHTML = '<div class="dir-empty">Загрузка...</div>';
    apiGet(url).then(function(data) {
      currentBrowsePath = data.path;
      modalPath.textContent = data.path;
      btnUp.disabled = !data.parent;
      btnUp.onclick = function() { loadDirs(data.parent); };
      modalList.innerHTML = "";
      if (data.dirs.length === 0) {
        modalList.innerHTML = '<div class="dir-empty">Нет подпапок</div>';
        return;
      }
      data.dirs.forEach(function(name) {
        var item = document.createElement("div");
        item.className = "dir-item";
        item.innerHTML = '<span class="dir-item-icon">&#128193;</span><span class="dir-item-name">' + escHtml(name) + '</span>';
        item.addEventListener("click", function() {
          loadDirs(data.path + "/" + name);
        });
        modalList.appendChild(item);
      });
    }).catch(function(e) {
      modalList.innerHTML = '<div class="dir-empty">Ошибка: ' + escHtml(String(e)) + '</div>';
    });
  }

  document.getElementById("btn-browse-workspace").addEventListener("click", function() {
    var current = pathInput.getAttribute("data-home") || pathInput.value || "";
    openDirPicker(current);
  });

  document.getElementById("btn-confirm-workspace").addEventListener("click", function() {
    var picked = pathInput.value.trim();
    if (!picked) return;
    logSep();
    log("Путь введён вручную: " + picked, "log-info");
    log("Сохранение пути в конфиг...");
    apiPost("/api/setup/set-workspace", { workspace: picked }).then(function(data) {
      if (data.ok) {
        log("Путь сохранён: " + picked, "log-ok");
        log("EN: " + data.en_repo, "log-info");
        log("RU: " + data.ru_repo, "log-info");
      } else {
        log("Ошибка сохранения: " + (data.error || ""), "log-err");
      }
      checkRepos();
    }).catch(function(e) {
      log("Ошибка: " + e, "log-err");
      checkRepos();
    });
  });

  pathInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      document.getElementById("btn-confirm-workspace").click();
    }
  });

  var mkdirRow = document.getElementById("create-folder-row");
  var mkdirInput = document.getElementById("dir-picker-mkdir-name");
  var mkdirOk = document.getElementById("dir-picker-mkdir-ok");

  document.getElementById("dir-picker-mkdir").addEventListener("click", function() {
    mkdirInput.classList.toggle("hidden");
    mkdirOk.classList.toggle("hidden");
    if (!mkdirInput.classList.contains("hidden")) {
      mkdirInput.focus();
    }
  });

  mkdirOk.addEventListener("click", function() {
    var folderName = mkdirInput.value.trim();
    if (!folderName) return;
    var parent = currentBrowsePath || "";
    mkdirOk.disabled = true;
    apiPost("/api/setup/mkdir", { parent: parent, name: folderName }).then(function(data) {
      mkdirOk.disabled = false;
      if (data.ok) {
        log("Папка создана: " + data.path, "log-ok");
        mkdirInput.value = "";
        mkdirInput.classList.add("hidden");
        mkdirOk.classList.add("hidden");
        loadDirs(data.path);
      } else {
        log("Ошибка создания папки: " + (data.error || ""), "log-err");
      }
    }).catch(function(e) {
      mkdirOk.disabled = false;
      log("Ошибка: " + e, "log-err");
    });
  });

  mkdirInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") mkdirOk.click();
  });

  btnClose.addEventListener("click", closeDirPicker);
  modal.addEventListener("click", function(e) {
    if (e.target === modal) closeDirPicker();
  });

  btnSelect.addEventListener("click", function() {
    var picked = currentBrowsePath;
    closeDirPicker();
    if (!picked) return;

    pathInput.value = picked;
    logSep();
    log("Папка выбрана: " + picked, "log-info");
    log("Сохранение пути в конфиг...");

    apiPost("/api/setup/set-workspace", { workspace: picked }).then(function(data) {
      if (data.ok) {
        log("Путь сохранён: " + picked, "log-ok");
        log("EN: " + data.en_repo, "log-info");
        log("RU: " + data.ru_repo, "log-info");
      } else {
        log("Ошибка сохранения: " + (data.error || ""), "log-err");
      }
      checkRepos();
    }).catch(function(e) {
      log("Ошибка: " + e, "log-err");
      checkRepos();
    });
  });

  document.getElementById("ssh-email").addEventListener("keydown", function(e) {
    if (e.key === "Enter") genKey();
  });

  document.querySelectorAll(".setup-step").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var target = parseInt(btn.dataset.step);
      if (target <= currentStep || btn.classList.contains("done")) {
        goToStep(target);
      }
    });
  });
});
