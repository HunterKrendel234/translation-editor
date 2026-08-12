import json
import os
import re
import glob as glob_mod
import shutil
import subprocess
import threading
import time
import webbrowser
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.json.sort_keys = False

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
GLOSSARY_PATH = os.path.join(os.path.dirname(__file__), "glossary.json")
if not os.path.exists(GLOSSARY_PATH):
    GLOSSARY_PATH = os.path.join(os.path.dirname(__file__), "..", "openai_localizer", "glossary.json")
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    config = json.load(f)

EN_REPO = os.path.expandvars(os.path.expanduser(config["en_repo"]))
RU_REPO = os.path.expandvars(os.path.expanduser(config["ru_repo"]))
EXCLUDED_FILES = set(config.get("excluded_files", []))

UI_GLOB_PATTERNS = config.get("ui_glob_patterns", [])
STORY_GLOB_PATTERNS = config.get("story_glob_patterns", ["local-files/resource/*.txt"])
LYRICS_GLOB_PATTERNS = config.get("lyrics_glob_patterns", ["local-files/genericTrans/lyrics/*.json"])

GLOSSARY = {}
if os.path.exists(GLOSSARY_PATH):
    with open(GLOSSARY_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
        for k, v in raw.items():
            if not k.startswith("_"):
                GLOSSARY[k] = v

CHARACTER_STYLES = {
    "Saki": "Старшеклассница. Энергичная, прямолинейная, гиперконкурентная, ненавидит проигрывать. Иногда использует местоимения от третьего лица.",
    "Temari": "Старшеклассница. На поверхности холодная, невозмутимая, саркастичная и острая на язык; внутри может быть навязчиво привязанной, хрупкой, ленивой и неловко зависимой от других.",
    "Kotone": "Старшеклассница. Жизнерадостная, милая, неформальная, ищущая одобрения и внимательно относящаяся к деньгам. В зависимости от контекста может звучать как ласково, так и расчётливо.",
    "Mao": "Старшеклассница. Староста общежития и заботливая старшая ученица. Говорит в мягкой, благородной манере, используя мужское «боку»; стремится казаться крутой, но при этом заботливая и элегантная.",
    "Lilja": "Старшеклассница. Застенчивая, скромная, нервная и искренняя. Говорит смиренно, но в важных ситуациях проявляет тихую решимость.",
    "China": "Старшеклассница. Избалованная о-дзё-сама, выросшая в защищённой среде: невинная, грациозная, вежливая и воодушевлённая. Используй утончённую манеру речи в духе «дэсю ва», а не просто «большой словарный запас».",
    "Sumika": "Старшеклассница. Яркая, дружелюбная и несерьёзная гяру. Умеренно использует непринуждённый модный сленг; в неформальной речи допустим лёгкий вайб «девушки из Калифорнии», но не превращай её в карикатуру.",
    "Hiro": "Старшеклассница. Таинственный гений. Спокойная, странная, прямолинейная и увлечённая трудностями или неудачами; может звучать отстранённо или тихо радоваться странным вещам.",
    "Rinami": "Старшеклассница. Зрелый архетип мягкой старшей сестры. Заботливая, спокойная, хозяйственная, может слегка поддразнивать или проявлять мягкое внимание к собеседнику.",
    "Ume": "Старшеклассница. Громкая, энергичная, спортивная младшая сестрёнка, обожающая Саки. Немного несмышлёная и прямолинейная.",
    "Sena": "Старшеклассница. Президент студенческого совета и элитная айдол. Гордая, уверенная, достойная и харизматичная; говорит как человек, привыкший к всеобщему восхищению.",
    "Tsubame": "Старшеклассница. Вице-президент студенческого совета. Гордая, строгая, прямолинейная, суровая и внушительная, но в глубине души ответственная и заботливая. Использует формальную и властную манеру речи.",
    "Rinha": "Старшеклассница из школы-соперницы. Холодная, строгая, резкая и ориентированная на долг и договорённости; может быть суровой, но в глубине души преданная и заботливая.",
    "Misuzu": "Старшеклассница. Спокойная, расслабленная, сонная, мягкая и снисходительная. Говорит тихо и в собственном неторопливом темпе.",
    "Shion": "Старшеклассница, соперница/антагонистка. На поверхности вежливая и невозмутимая, но холодная, злонамеренная, расчётливая и язвительная. В эмоциональном состоянии может переходить на более грубую и агрессивную речь.",
    "Gekka": "Старшеклассница, соперница/антагонистка. Первоклассная, холодная, немногословная, пренебрежительная и властная. Говорит с пугающей лаконичностью, а не многословно или вычурно.",
    "Nadeshiko": "Старшеклассница, соперница/антагонистка. Избалованный тип о-дзё-сама/капризной девчонки: высокомерная, самоуверенная, драматичная и с манерой речи в духе «дэсю ва». Скорее комичный мелкий злодей, чем по-настоящему невозмутимая аристократка.",
    "Asari": "Учительница. Дружелюбная, добрая манера речи классного руководителя. Зрелая, поддерживающая и располагающая к себе, а не строгая.",
    "Asari-sensei": "Учительница. Дружелюбная, добрая манера речи классного руководителя. Зрелая, поддерживающая и располагающая к себе, а не строгая.",
    "Kunio": "Учитель или тренер. Строгий, властный, серьёзный и дисциплинированный.",
    "Ryusei": "Учитель или тренер. Энергичный, громкий, страстный и немного дикий.",
    "{user}": "Мужской персонаж-продюсер. Игровой персонаж (Продюсер). Ученик отделения продюсеров: молодой взрослый/студенческий тон, расслабленный, но уважительный. В русском использовать мужской род.",
}

MASTERTRANS_ALLOWED_FIELDS = {"name", "title", "description", "text", "summary", "detail", "message", "flavor", "label", "displayname", "shortname", "help", "body", "produceconditiondescription", "content"}
CYRILLIC_RE = re.compile(r"[А-Яа-яЁё]")

def is_mastertrans(data):
    return isinstance(data, dict) and isinstance(data.get("data"), list)

def needs_translation(en_text, ru_text):
    if not en_text:
        return False
    if not any(c.isalpha() for c in en_text):
        return False
    if CYRILLIC_RE.search(ru_text):
        return False
    return True

PLACEHOLDER_RE = re.compile(r"\{[^{}]+\}|%\d*\$?[a-zA-Z]")
TAG_RE = re.compile(r"<[^>]+>")
DOUBLE_UNDERSCORE_RE = re.compile(r"__[^ ]+?__")
BRACKET_DU_RE = re.compile(r"\[__[^\]]+?__\]")

def extract_protected_tokens(text):
    tokens = []
    for m in TAG_RE.finditer(text):
        tokens.append(("tag", m.group(), m.start(), m.end()))
    for m in PLACEHOLDER_RE.finditer(text):
        if not any(t[2] <= m.start() < t[3] for t in tokens):
            tokens.append(("ph", m.group(), m.start(), m.end()))
    for m in DOUBLE_UNDERSCORE_RE.finditer(text):
        if not any(t[2] <= m.start() < t[3] for t in tokens):
            tokens.append(("du", m.group(), m.start(), m.end()))
    for m in BRACKET_DU_RE.finditer(text):
        if not any(t[2] <= m.start() < t[3] for t in tokens):
            tokens.append(("bdu", m.group(), m.start(), m.end()))
    tokens.sort(key=lambda x: x[2])
    return tokens

def validate_edit(original, edited):
    orig_tokens = extract_protected_tokens(original)
    edit_tokens = extract_protected_tokens(edited)
    orig_phs = sorted([t[1] for t in orig_tokens if t[0] in ("tag", "ph", "du", "bdu")])
    edit_phs = sorted([t[1] for t in edit_tokens if t[0] in ("tag", "ph", "du", "bdu")])
    if orig_phs != edit_phs:
        return False, "Несоответствие Placeholders/HTML тэгов!!!"
    def count_newlines(s):
        return s.count("\\n") + s.count("\n") + s.count("\\r") + s.count("\r")
    orig_nl = count_newlines(original)
    edit_nl = count_newlines(edited)
    if orig_nl != edit_nl:
        return True, f"OK (количество новых строк отличается: {orig_nl} vs {edit_nl})"
    return True, "OK"

def detect_empty_file(entries):
    if not entries:
        return True
    if len(entries) == 1:
        e = entries[0]
        if not e.get("en", "").strip() and not e.get("ru", "").strip():
            return True
    return False

def get_files_by_category():
    result = {"UI": [], "Story": [], "Lyrics": []}
    for pat in UI_GLOB_PATTERNS:
        full_pat = os.path.join(EN_REPO, pat.replace("/", os.sep))
        for fp in glob_mod.glob(full_pat, recursive=True):
            rel = os.path.relpath(fp, EN_REPO).replace(os.sep, "/")
            if rel in EXCLUDED_FILES:
                continue
            result["UI"].append({"path": rel, "name": os.path.basename(rel), "rel": rel})
    for pat in STORY_GLOB_PATTERNS:
        full_pat = os.path.join(EN_REPO, pat.replace("/", os.sep))
        for fp in glob_mod.glob(full_pat, recursive=True):
            rel = os.path.relpath(fp, EN_REPO).replace(os.sep, "/")
            if rel in EXCLUDED_FILES:
                continue
            result["Story"].append({"path": rel, "name": os.path.basename(rel), "rel": rel})
    for pat in LYRICS_GLOB_PATTERNS:
        full_pat = os.path.join(EN_REPO, pat.replace("/", os.sep))
        for fp in glob_mod.glob(full_pat, recursive=True):
            rel = os.path.relpath(fp, EN_REPO).replace(os.sep, "/")
            if rel in EXCLUDED_FILES:
                continue
            result["Lyrics"].append({"path": rel, "name": os.path.basename(rel), "rel": rel})
    for cat in result:
        result[cat].sort(key=lambda x: x["rel"])
    return {"UI": result["UI"], "Story": result["Story"], "Lyrics": result["Lyrics"]}

def load_json_entries(file_rel):
    en_path = os.path.join(EN_REPO, file_rel.replace("/", os.sep))
    ru_path = os.path.join(RU_REPO, file_rel.replace("/", os.sep))
    if not os.path.exists(en_path):
        return None, "EN file not found"
    with open(en_path, "r", encoding="utf-8-sig") as f:
        en_data = json.load(f)
    ru_data = {}
    if os.path.exists(ru_path):
        with open(ru_path, "r", encoding="utf-8-sig") as f:
            ru_data = json.load(f)
    entries = []
    if is_mastertrans(en_data):
        pk = (en_data.get("rules") or {}).get("primaryKeys") or ["id"]
        ru_list = ru_data.get("data", []) if isinstance(ru_data, dict) else []
        ru_by_pk = {}
        for el in ru_list:
            if isinstance(el, dict):
                ru_by_pk[tuple(str(el.get(p, "")) for p in pk)] = el
        for el in en_data.get("data", []):
            if not isinstance(el, dict):
                continue
            key_parts = tuple(str(el.get(p, "")) for p in pk)
            rid = " / ".join(key_parts)
            ru_el = ru_by_pk.get(key_parts, {})
            for field in MASTERTRANS_ALLOWED_FIELDS:
                val = el.get(field)
                if not isinstance(val, str) or not val:
                    continue
                ru_val = ru_el.get(field)
                entries.append({"key": f"{rid} :: {field}", "en": val,
                                "ru": ru_val if isinstance(ru_val, str) else "", "field": field})
    else:
        for k, v in en_data.items():
            if not isinstance(v, str) or not v:
                continue
            ru_val = ru_data.get(k) if isinstance(ru_data, dict) else None
            entries.append({"key": k, "en": v, "ru": ru_val if isinstance(ru_val, str) else "", "field": ""})
    return entries, None

def load_resource_entries(file_rel):
    en_path = os.path.join(EN_REPO, file_rel.replace("/", os.sep))
    ru_path = os.path.join(RU_REPO, file_rel.replace("/", os.sep))
    if not os.path.exists(en_path):
        return None, "EN file not found"
    with open(en_path, "r", encoding="utf-8-sig") as f:
        en_lines = f.read()
    ru_text = ""
    if os.path.exists(ru_path):
        with open(ru_path, "r", encoding="utf-8-sig") as f:
            ru_text = f.read()
    en_line_list = en_lines.split("\n")
    ru_line_list = ru_text.split("\n") if ru_text else []
    entries = []
    RESOURCE_TEXT_RE = re.compile(r"(\btext=)(.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|])")
    RESOURCE_NAME_RE = re.compile(r"\[message[^\]]*?\bname=([^\]]+?)(?:\s+\S+=|\])")
    for i, line in enumerate(en_line_list):
        ru_line = ru_line_list[i] if i < len(ru_line_list) else ""
        ru_matches = RESOURCE_TEXT_RE.findall(ru_line)
        name_match = RESOURCE_NAME_RE.search(line)
        speaker = name_match.group(1).strip() if name_match else ""
        for text_index, (_, en_text) in enumerate(RESOURCE_TEXT_RE.findall(line)):
            ru_text_val = ru_matches[text_index][1] if text_index < len(ru_matches) else ""
            key = f"line_{i}" if text_index == 0 else f"line_{i}#{text_index}"
            entries.append({"key": key, "en": en_text, "ru": ru_text_val, "speaker": speaker, "line_index": i, "text_index": text_index})
    return entries, None

def update_json_entry(file_rel, key, ru_value):
    ru_path = os.path.join(RU_REPO, file_rel.replace("/", os.sep))
    ru_dir = os.path.dirname(ru_path)
    if not os.path.exists(ru_dir):
        os.makedirs(ru_dir)

    ru_value = ru_value.replace("\\\\", "\\").replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
    ru_data = {}
    if os.path.exists(ru_path):
        with open(ru_path, "r", encoding="utf-8") as f:
            ru_data = json.load(f)
    if " :: " in key:
        rid, field = key.split(" :: ", 1)
        if not (isinstance(ru_data, dict) and isinstance(ru_data.get("data"), list)):
            en_path = os.path.join(EN_REPO, file_rel.replace("/", os.sep))
            if not os.path.exists(en_path):
                return False
            with open(en_path, "r", encoding="utf-8") as f:
                ru_data = json.load(f)
        pk = (ru_data.get("rules") or {}).get("primaryKeys") or ["id"]
        pk_vals = [p.strip() for p in rid.split(" / ")]
        for el in ru_data.get("data", []):
            if not isinstance(el, dict):
                continue
            if [str(el.get(p, "")) for p in pk] == pk_vals:
                el[field] = ru_value
                with open(ru_path, "w", encoding="utf-8") as f:
                    json.dump(ru_data, f, ensure_ascii=False, indent=2)
                return True
        return False
    tokens = key.split(".")
    if key in ru_data and isinstance(ru_data[key], str):
        ru_data[key] = ru_value
    else:
        parent = ru_data
        for tok in tokens[:-1]:
            if isinstance(parent, dict):
                if tok not in parent:
                    return False
                parent = parent[tok]
            elif isinstance(parent, list):
                try:
                    idx = int(tok)
                except:
                    return False
                if not (0 <= idx < len(parent)):
                    return False
                parent = parent[idx]
            else:
                return False
        last = tokens[-1]
        if isinstance(parent, dict):
            if last not in parent or not isinstance(parent[last], str):
                return False
            parent[last] = ru_value
        elif isinstance(parent, list):
            try:
                idx = int(last)
            except:
                return False
            if not (0 <= idx < len(parent)):
                return False
            if not isinstance(parent[idx], str):
                return False
            parent[idx] = ru_value
        else:
            return False
    with open(ru_path, "w", encoding="utf-8") as f:
        json.dump(ru_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return True

def update_resource_entry(file_rel, line_index, ru_value, text_index=0):
    ru_path = os.path.join(RU_REPO, file_rel.replace("/", os.sep))
    ru_dir = os.path.dirname(ru_path)
    if not os.path.exists(ru_dir):
        os.makedirs(ru_dir)
    if os.path.exists(ru_path):
        with open(ru_path, "r", encoding="utf-8") as f:
            ru_lines = f.read().split("\n")
    else:
        en_path = os.path.join(EN_REPO, file_rel.replace("/", os.sep))
        with open(en_path, "r", encoding="utf-8") as f:
            ru_lines = f.read().split("\n")
    RESOURCE_TEXT_RE_SAVE = re.compile(r"(\btext=)(.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|])")
    ru_value = ru_value.replace("\\\\", "\\")
    if 0 <= line_index < len(ru_lines):
        matches = list(RESOURCE_TEXT_RE_SAVE.finditer(ru_lines[line_index]))
        idx = text_index if 0 <= text_index < len(matches) else 0
        if matches:
            m = matches[idx]
            ru_lines[line_index] = ru_lines[line_index][:m.start()] + m.group(1) + ru_value + ru_lines[line_index][m.end():]
    with open(ru_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ru_lines))
    return True

SEARCH_LOCK = threading.Lock()
SEARCH_BUILD_LOCK = threading.Lock()
SEARCH_INDEX = None
SEARCH_INDEX_DIRTY = True
FILE_MATCH_CAP = 50
FILE_CAP = 100

def make_search_index_entry(e):
    return {
        "key": e.get("key", ""),
        "en": e.get("en", "") or "",
        "ru": e.get("ru", "") or "",
        "speaker": e.get("speaker", "") or "",
        "line_index": e.get("line_index"),
        "text_index": e.get("text_index", 0),
        "lkey": (e.get("key", "") or "").lower(),
        "len": (e.get("en", "") or "").lower(),
        "lru": (e.get("ru", "") or "").lower(),
        "lspeaker": (e.get("speaker", "") or "").lower(),
    }

def build_search_index():
    index = []
    files_n = 0
    entries_n = 0
    cats = get_files_by_category()
    for cat, file_list in cats.items():
        for f in file_list:
            if f["rel"].endswith(".txt"):
                entries, err = load_resource_entries(f["rel"])
            else:
                entries, err = load_json_entries(f["rel"])
            if err or not entries:
                continue
            index.append({"cat": cat, "rel": f["rel"],
                          "entries": [make_search_index_entry(e) for e in entries]})
            files_n += 1
            entries_n += len(entries)
    return index, files_n, entries_n

def mark_search_index_dirty():
    global SEARCH_INDEX_DIRTY
    SEARCH_INDEX_DIRTY = True

def get_search_index():
    global SEARCH_INDEX, SEARCH_INDEX_DIRTY
    with SEARCH_LOCK:
        if SEARCH_INDEX is not None and not SEARCH_INDEX_DIRTY:
            return SEARCH_INDEX
    with SEARCH_BUILD_LOCK:
        with SEARCH_LOCK:
            if SEARCH_INDEX is not None and not SEARCH_INDEX_DIRTY:
                return SEARCH_INDEX
        SEARCH_INDEX, _, _ = build_search_index()
        with SEARCH_LOCK:
            SEARCH_INDEX_DIRTY = False
            return SEARCH_INDEX

def update_search_index_file(file_rel):
    global SEARCH_INDEX, SEARCH_INDEX_DIRTY
    with SEARCH_LOCK:
        if SEARCH_INDEX is None or SEARCH_INDEX_DIRTY:
            return
        cats = get_files_by_category()
        cat = None
        for c, fl in cats.items():
            for f in fl:
                if f["rel"] == file_rel:
                    cat = c
                    break
            if cat:
                break
        if file_rel.endswith(".txt"):
            entries, err = load_resource_entries(file_rel)
        else:
            entries, err = load_json_entries(file_rel)
        if err or not entries:
            SEARCH_INDEX = [it for it in SEARCH_INDEX if it["rel"] != file_rel]
            return
        new_item = {"cat": cat or "UI", "rel": file_rel,
                    "entries": [make_search_index_entry(e) for e in entries]}
        replaced = False
        for i, it in enumerate(SEARCH_INDEX):
            if it["rel"] == file_rel:
                SEARCH_INDEX[i] = new_item
                replaced = True
                break
        if not replaced:
            SEARCH_INDEX.append(new_item)

GIT_TIMEOUT = 300
GIT_LOCK = threading.Lock()
GIT_BUSY = False
STARTUP_EN_RESULT = None

CONFLICT_CODES = ("UU", "AA", "DD", "AU", "UA", "DU", "UD")

def find_git_executable():
    override = config.get("git_executable")
    if override and os.path.isfile(override):
        return override
    if shutil.which("git"):
        return "git"
    candidates = []
    local = os.environ.get("LOCALAPPDATA", "")
    if local:
        candidates.extend(glob_mod.glob(os.path.join(local, "GitHubDesktop", "app-*", "resources", "app", "git", "cmd", "git.exe")))
    program_files = os.environ.get("ProgramFiles", "C:\\Program Files")
    candidates.append(os.path.join(program_files, "Git", "cmd", "git.exe"))
    pf86 = os.environ.get("ProgramFiles(x86)", "")
    if pf86:
        candidates.append(os.path.join(pf86, "Git", "cmd", "git.exe"))
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None

GIT_EXE = find_git_executable() or "git"

def run_git(repo_path, args, timeout=GIT_TIMEOUT, env_extra=None):
    if not os.path.isdir(repo_path):
        return {"ok": False, "code": -1, "output": "", "error": "not_found"}
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    try:
        proc = subprocess.run(
            [GIT_EXE] + args,
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
    except FileNotFoundError:
        return {"ok": False, "code": -1, "output": "", "error": "git_not_found"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": -1, "output": "", "error": "timeout"}
    except Exception as e:
        return {"ok": False, "code": -1, "output": str(e), "error": "unknown"}
    output = ((proc.stdout or "") + (proc.stderr or "")).strip()
    return {"ok": proc.returncode == 0, "code": proc.returncode, "output": output}

def classify_git_failure(output):
    low = (output or "").lower()
    if not output:
        return "unknown"
    if "could not read username" in low or "could not read password" in low or "terminal prompts disabled" in low:
        return "auth"
    if "authentication" in low or "permission denied" in low:
        return "auth"
    if "401" in output or "403" in output:
        return "auth"
    if ("unable to access" in low or "could not resolve host" in low
            or "temporary failure in name resolution" in low or "connection timed out" in low
            or "connection reset" in low or "network is unreachable" in low or "no route to host" in low):
        return "network"
    if "conflict" in low:
        return "conflict"
    if "rejected" in low or "fetch first" in low or "non-fast-forward" in low:
        return "rejected"
    if "please tell me who you are" in low or "user.email" in low or "user.name" in low:
        return "identity"
    if "nothing to commit" in low or "no changes added" in low or "no staged changes" in low:
        return "no_changes"
    if "not a git repository" in low or "not a git repo" in low or "fatal: not a git" in low:
        return "not_repo"
    if "would be overwritten by merge" in low or ("local changes" in low and "overwritten" in low):
        return "local_changes"
    return "other"

GIT_ERROR_MESSAGES = {
    "auth": "Не удалось подключиться к GitHub (проблема с авторизацией). Проверьте, что Git сохраняет ваш токен или логин.",
    "network": "Нет подключения к интернету или GitHub сейчас недоступен. Проверьте соединение и попробуйте ещё раз.",
    "identity": "Git не знает ваше имя и почту для подписи коммитов. Выполните в терминале:\n  git config --global user.name \"Ваше Имя\"\n  git config --global user.email \"ваша_почта@example.com\"",
    "no_changes": "Нет изменений для сохранения.",
    "not_repo": "Папка не является корректным Git-репозиторием. Проверьте, что репозиторий на месте.",
    "timeout": "Операция Git заняла слишком много времени и была остановлена. Проверьте соединение и попробуйте ещё раз.",
    "git_not_found": "Не удалось найти Git. Установите Git (например, вместе с GitHub Desktop) и попробуйте ещё раз.",
    "not_found": "Не найдена локальная копия репозитория. Проверьте пути в config.json.",
    "local_changes": "В репозитории есть локальные изменения, которые мешают обновлению. Сохраните их через «Сохранить изменения» или откатите вручную.",
}

def rebase_in_progress(repo):
    for name in ("rebase-merge", "rebase-apply"):
        p = run_git(repo, ["rev-parse", "--git-path", name])
        if p["ok"] and p["output"].strip():
            git_path = p["output"].strip()
            abs_path = git_path if os.path.isabs(git_path) else os.path.join(repo, git_path)
            if os.path.exists(abs_path):
                return True
    return False

def conflict_file_list(repo):
    r = run_git(repo, ["status", "--short"])
    files = []
    if r["ok"]:
        for line in r["output"].splitlines():
            if line[:2] in CONFLICT_CODES:
                files.append(line[3:].strip())
    return files

def has_unpushed_commits(repo):
    if not run_git(repo, ["rev-parse", "--verify", "origin/main"])["ok"]:
        return True
    r = run_git(repo, ["rev-list", "--count", "origin/main..main"])
    if not r["ok"]:
        return True
    try:
        return int(r["output"].strip()) > 0
    except ValueError:
        return True

def repo_check(repo):
    return run_git(repo, ["rev-parse", "--is-inside-work-tree"])

def git_update_en():
    mark_search_index_dirty()
    result = run_git(EN_REPO, ["pull"])
    if result["ok"]:
        return {"ok": True, "message": "EN-репозиторий успешно обновлён.", "details": result["output"]}
    err_type = result.get("error") or classify_git_failure(result.get("output", ""))
    return {
        "ok": False,
        "message": GIT_ERROR_MESSAGES.get(err_type, "Не удалось обновить EN-репозиторий. Подробности ниже."),
        "details": result.get("output", "") or (f"Код ошибки: {result.get('error')}" if result.get("error") else ""),
        "error_type": err_type,
    }

def git_update_ru():
    mark_search_index_dirty()
    check = repo_check(RU_REPO)
    if not check["ok"]:
        return {"ok": False, "message": GIT_ERROR_MESSAGES["not_repo"], "details": check.get("output", ""), "error_type": "not_repo"}
    branch_r = run_git(RU_REPO, ["rev-parse", "--abbrev-ref", "HEAD"])
    branch = branch_r["output"].strip() if branch_r["ok"] else "?"
    if branch != "main":
        return {"ok": False, "message": f"Вы сейчас на ветке «{branch}», а работать нужно в ветке «main». Переключитесь на main и попробуйте снова.", "details": f"Текущая ветка: {branch}", "error_type": "branch"}
    status_r = run_git(RU_REPO, ["status", "--short"])
    if status_r["output"].strip():
        return {"ok": False, "message": "У вас есть несохранённые изменения. Сначала сохраните их с помощью «Сохранить изменения».", "details": status_r["output"], "error_type": "dirty"}
    result = run_git(RU_REPO, ["pull", "--rebase", "origin", "main"])
    if result["ok"]:
        return {"ok": True, "message": "RU-репозиторий успешно обновлён.", "details": result["output"]}
    err_type = result.get("error") or classify_git_failure(result.get("output", ""))
    return {
        "ok": False,
        "message": GIT_ERROR_MESSAGES.get(err_type, "Не удалось обновить RU-репозиторий. Подробности ниже."),
        "details": result.get("output", "") or (f"Код ошибки: {result.get('error')}" if result.get("error") else ""),
        "error_type": err_type,
    }

def git_save_ru(message):
    mark_search_index_dirty()
    check = repo_check(RU_REPO)
    if not check["ok"]:
        return {"ok": False, "message": GIT_ERROR_MESSAGES["not_repo"], "details": check.get("output", ""), "error_type": "not_repo"}
    branch_r = run_git(RU_REPO, ["rev-parse", "--abbrev-ref", "HEAD"])
    branch = branch_r["output"].strip() if branch_r["ok"] else "?"
    if branch != "main":
        return {"ok": False, "message": f"Вы сейчас на ветке «{branch}», а сохранять нужно в ветку «main». Переключитесь на main и попробуйте снова.", "details": f"Текущая ветка: {branch}", "error_type": "branch"}

    commit_message = (message or "").strip() or "Manual translation"

    if rebase_in_progress(RU_REPO):
        conflicts = conflict_file_list(RU_REPO)
        if conflicts:
            return {
                "ok": False,
                "error_type": "conflict",
                "message": "Конфликт всё ещё не разрешён. Отредактируйте указанные файлы, уберите пометки конфликта и нажмите «Сохранить изменения» ещё раз.",
                "details": "Неразрешённые конфликты:\n" + "\n".join(conflicts),
                "conflict_files": conflicts,
            }
        r_add = run_git(RU_REPO, ["add", "."])
        if not r_add["ok"]:
            return {"ok": False, "message": "Не удалось завершить перенос изменений (add).", "details": r_add["output"]}
        r_cont = run_git(RU_REPO, ["rebase", "--continue"], env_extra={"GIT_EDITOR": "true"})
        if not r_cont["ok"]:
            return {"ok": False, "message": "Не удалось завершить перенос изменений (rebase --continue).", "details": r_cont["output"]}
    else:
        r_add = run_git(RU_REPO, ["add", "."])
        if not r_add["ok"]:
            return {"ok": False, "message": "Не удалось добавить изменения.", "details": r_add["output"]}
        r_commit = run_git(RU_REPO, ["commit", "-m", commit_message])
        if not r_commit["ok"]:
            err_type = classify_git_failure(r_commit["output"])
            if err_type == "no_changes":
                if not has_unpushed_commits(RU_REPO):
                    return {"ok": False, "message": "Нет изменений для сохранения.", "error_type": "no_changes", "details": r_commit["output"]}
            else:
                return {
                    "ok": False,
                    "message": GIT_ERROR_MESSAGES.get(err_type, "Не удалось создать коммит. Подробности ниже."),
                    "details": r_commit["output"],
                    "error_type": err_type,
                }
        r_pull = run_git(RU_REPO, ["pull", "--rebase", "origin", "main"])
        if not r_pull["ok"]:
            err_type = classify_git_failure(r_pull["output"])
            if err_type == "conflict":
                conflicts = conflict_file_list(RU_REPO)
                return {
                    "ok": False,
                    "error_type": "conflict",
                    "message": "Конфликт при сохранении. Другой переводчик изменил те же строки, что и вы.\n\nВаши изменения пока сохранены локально, но отправить их автоматически нельзя.\nРазрешите конфликт в указанных файлах, затем нажмите «Сохранить изменения» ещё раз.",
                    "details": r_pull["output"],
                    "conflict_files": conflicts,
                }
            return {
                "ok": False,
                "message": GIT_ERROR_MESSAGES.get(err_type, "Не удалось синхронизироваться с main. Ваши изменения сохранены локально. Попробуйте ещё раз."),
                "details": r_pull["output"],
                "error_type": err_type,
            }

    r_push = run_git(RU_REPO, ["push", "origin", "main"])
    if not r_push["ok"]:
        err_type = classify_git_failure(r_push["output"])
        if err_type == "rejected":
            return {
                "ok": False,
                "error_type": "rejected",
                "message": "Не удалось сохранить изменения.\n\nДругой переводчик уже обновил репозиторий.\nВаши изменения пока сохранены локально.\n\nПопробуйте снова выполнить «Сохранить изменения».",
                "details": r_push["output"],
            }
        return {
            "ok": False,
            "message": GIT_ERROR_MESSAGES.get(err_type, "Не удалось отправить изменения на GitHub. Ваши изменения сохранены локально. Попробуйте ещё раз."),
            "details": r_push["output"],
            "error_type": err_type,
        }
    return {"ok": True, "message": "Изменения успешно сохранены в main.", "details": r_push["output"]}

DIFF_HEADER_RE = re.compile(r"^diff --git a/(.*) b/(.*)$")

def parse_git_diff(output):
    files = []
    current = None
    in_hunk = False
    removed = []
    added = []
    def flush_hunk():
        nonlocal removed, added
        if current is not None and (removed or added):
            current["hunks"].append({"removed": removed, "added": added})
        removed, added = [], []
    for line in (output or "").splitlines():
        m = DIFF_HEADER_RE.match(line)
        if m:
            flush_hunk()
            current = {"path": m.group(2), "hunks": []}
            files.append(current)
            in_hunk = False
            continue
        if current is None:
            continue
        if line.startswith("@@"):
            flush_hunk()
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("-"):
            removed.append(line[1:])
        elif line.startswith("+"):
            added.append(line[1:])
        else:
            flush_hunk()
    flush_hunk()
    return files

JSON_LINE_RE = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)",?\s*$')
COMMIT_LINES_PER_FILE = 16

def _format_change(r, a):
    def parse_json_line(line):
        m = JSON_LINE_RE.match(line)
        if m:
            return True, m.group(1), m.group(2)
        return False, None, (line or "").strip()
    r_is_json, _, rv = parse_json_line(r) if r is not None else (False, None, None)
    a_is_json, _, av = parse_json_line(a) if a is not None else (False, None, None)
    if r is not None and a is not None:
        if r_is_json and a_is_json:
            return f'"{rv}" -> "{av}"'
        return f"{rv} -> {av}"
    if a is not None:
        return f'+ "{av}"' if a_is_json else f'+ {av}'
    return f'- "{rv}"' if r_is_json else f'- {rv}'

def suggest_commit_message():
    diff_res = run_git(RU_REPO, ["diff"])
    cached_res = run_git(RU_REPO, ["diff", "--cached"])
    combined = ((diff_res.get("output") or "") + "\n" + (cached_res.get("output") or "")).strip()
    files = parse_git_diff(combined)
    parts = []
    changed = 0
    for f in files:
        changes = []
        for h in f["hunks"]:
            rem = h.get("removed") or []
            add = h.get("added") or []
            n = max(len(rem), len(add))
            for i in range(n):
                r = rem[i] if i < len(rem) else None
                a = add[i] if i < len(add) else None
                if r is None and a is None:
                    continue
                if r is not None and a is not None and r == a:
                    continue
                changes.append((r, a))
        if not changes:
            continue
        changed += len(changes)
        lines = [f["path"] + ":"]
        for r, a in changes[:COMMIT_LINES_PER_FILE]:
            lines.append(_format_change(r, a))
        if len(changes) > COMMIT_LINES_PER_FILE:
            lines.append(f"И еще {len(changes) - COMMIT_LINES_PER_FILE} строк.")
        parts.append("\n".join(lines))
    status_res = run_git(RU_REPO, ["status", "--short"])
    if status_res.get("ok"):
        for line in status_res["output"].splitlines():
            if line.startswith("??") and line[3:].strip().lower().endswith((".json", ".txt")):
                parts.append("Новый файл: " + line[3:].strip())
                changed += 1
    return parts, changed

def git_route_wrapper(func):
    global GIT_BUSY
    with GIT_LOCK:
        if GIT_BUSY:
            return jsonify({"ok": False, "message": "Другая Git-операция уже выполняется. Дождитесь её завершения.", "error_type": "busy"})
        GIT_BUSY = True
    try:
        return jsonify(func())
    except Exception as e:
        return jsonify({"ok": False, "message": "Внутренняя ошибка: " + str(e), "details": "", "error_type": "internal"})
    finally:
        with GIT_LOCK:
            GIT_BUSY = False

def startup_git_pull_en():
    global STARTUP_EN_RESULT
    STARTUP_EN_RESULT = git_update_en()

TRANSLATION_LOCK = threading.Lock()
TRANSLATION_STATE = {
    "running": False,
    "stop_requested": False,
    "status": "idle",
    "error": "",
    "total": 0,
    "done": 0,
    "translated": 0,
    "skipped": 0,
    "current_category": "",
    "current_file": "",
    "current_file_total": 0,
    "current_file_done": 0,
}

_translator = None

def get_translator():
    global _translator
    if _translator is None:
        from deep_translator import GoogleTranslator
        _translator = GoogleTranslator(source="auto", target="ru")
    return _translator

TRANSLATION_MASK_RE = re.compile(
    r"<[^>]+>|\{[^{}]+\}|%\d*\$?[a-zA-Z]|__[^ ]+?__|\[__[^\]]+?__\]|\\n|\n|\\r|\r"
)

def translate_text_safe(text):
    if not text or not text.strip():
        return text
    tokens = []
    def _mask(m):
        tokens.append(m.group(0))
        return "[[%d]]" % (len(tokens) - 1)
    masked = TRANSLATION_MASK_RE.sub(_mask, text)
    out = None
    for attempt in range(3):
        try:
            out = get_translator().translate(masked)
            break
        except Exception:
            if attempt < 2:
                time.sleep(1 + attempt)
    if not out:
        return text
    for i, tok in enumerate(tokens):
        out = out.replace("[[%d]]" % i, tok)
    return out

def process_translation_file(file_rel):
    if file_rel.endswith(".txt"):
        entries, err = load_resource_entries(file_rel)
        is_txt = True
    else:
        entries, err = load_json_entries(file_rel)
        is_txt = False
    if err or not entries:
        return
    with TRANSLATION_LOCK:
        TRANSLATION_STATE["current_file_total"] = len(entries)
        TRANSLATION_STATE["current_file_done"] = 0
    for e in entries:
        with TRANSLATION_LOCK:
            if TRANSLATION_STATE["stop_requested"]:
                return
        try:
            en = e.get("en", "") or ""
            ru = e.get("ru", "") or ""
            if not needs_translation(en, ru):
                with TRANSLATION_LOCK:
                    TRANSLATION_STATE["skipped"] += 1
                continue
            new_ru = translate_text_safe(en)
            if not new_ru or new_ru == en:
                with TRANSLATION_LOCK:
                    TRANSLATION_STATE["skipped"] += 1
                continue
            if is_txt:
                new_ru = new_ru.replace("\n", "\\n")
                update_resource_entry(file_rel, e.get("line_index"), new_ru, e.get("text_index") or 0)
            else:
                update_json_entry(file_rel, e.get("key"), new_ru)
            with TRANSLATION_LOCK:
                TRANSLATION_STATE["translated"] += 1
        finally:
            with TRANSLATION_LOCK:
                TRANSLATION_STATE["current_file_done"] += 1

def run_translation_thread(categories):
    with TRANSLATION_LOCK:
        TRANSLATION_STATE.update({
            "running": True,
            "stop_requested": False,
            "status": "running",
            "error": "",
            "total": 0,
            "done": 0,
            "translated": 0,
            "skipped": 0,
            "current_category": "",
            "current_file": "",
            "current_file_total": 0,
            "current_file_done": 0,
        })
    try:
        files_by_cat = get_files_by_category()
        plan = []
        for cat in categories:
            for f in files_by_cat.get(cat, []):
                plan.append((cat, f["rel"]))
        with TRANSLATION_LOCK:
            TRANSLATION_STATE["total"] = len(plan)
        for cat, file_rel in plan:
            with TRANSLATION_LOCK:
                if TRANSLATION_STATE["stop_requested"]:
                    break
                TRANSLATION_STATE["current_category"] = cat
                TRANSLATION_STATE["current_file"] = file_rel
            process_translation_file(file_rel)
            with TRANSLATION_LOCK:
                TRANSLATION_STATE["done"] += 1
        with TRANSLATION_LOCK:
            if TRANSLATION_STATE["stop_requested"]:
                TRANSLATION_STATE["status"] = "stopped"
            else:
                TRANSLATION_STATE["status"] = "done"
    except Exception as e:
        with TRANSLATION_LOCK:
            TRANSLATION_STATE["status"] = "error"
            TRANSLATION_STATE["error"] = str(e)
    finally:
        with TRANSLATION_LOCK:
            TRANSLATION_STATE["running"] = False
        mark_search_index_dirty()

@app.route("/")
def index():
    return send_from_directory("templates", "index.html")

@app.route("/api/config", methods=["GET"])
def api_get_config():
    return jsonify(config)

@app.route("/api/config", methods=["POST"])
def api_set_config():
    data = request.get_json()
    for k in ("theme", "red_highlight_enabled"):
        if k in data:
            config[k] = data[k]
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=4)
    return jsonify({"ok": True})

@app.route("/api/files")
def api_files():
    cats = get_files_by_category()
    return jsonify({"categories": cats})

@app.route("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    q_low = q.lower()
    if len(q) < 2:
        return jsonify({"ready": True, "results": [], "total": 0, "truncated": False})
    try:
        index = get_search_index()
    except Exception as e:
        return jsonify({"ready": False, "error": str(e), "results": [], "total": 0, "truncated": False})
    results = []
    total = 0
    truncated = False
    for item in index:
        matches = []
        for e in item["entries"]:
            hit = (q_low in e["lkey"] or q_low in e["len"] or q_low in e["lru"]
                   or (e["lspeaker"] and q_low in e["lspeaker"]))
            if hit:
                matches.append({"key": e["key"], "en": e["en"], "ru": e["ru"],
                                "speaker": e["speaker"], "line_index": e["line_index"],
                                "text_index": e["text_index"]})
        if matches:
            total += len(matches)
            results.append({"cat": item["cat"], "rel": item["rel"],
                            "match_count": len(matches),
                            "matches": matches[:FILE_MATCH_CAP]})
            if len(results) >= FILE_CAP:
                truncated = True
                break
    return jsonify({"ready": True, "results": results, "total": total, "truncated": truncated})

@app.route("/api/entries")
def api_entries():
    file_path = request.args.get("path", "")
    cat = request.args.get("cat", "UI")
    if file_path.endswith(".txt"):
        entries, err = load_resource_entries(file_path)
    else:
        entries, err = load_json_entries(file_path)
    if err:
        return jsonify({"error": err}), 404
    is_empty = detect_empty_file(entries)
    return jsonify({"entries": entries, "category": cat, "glossary": GLOSSARY, "is_empty": is_empty})

@app.route("/api/glossary")
def api_glossary():
    return jsonify(GLOSSARY)

@app.route("/api/characters")
def api_characters():
    return jsonify(CHARACTER_STYLES)

@app.route("/api/save", methods=["POST"])
def api_save():
    data = request.get_json()
    file_path = data.get("path", "")
    key = data.get("key")
    ru_value = data.get("ru", "")
    line_index = data.get("line_index")
    if file_path.endswith(".txt"):
        if line_index is None:
            return jsonify({"ok": False, "error": "line_index required"})
        ru_value = ru_value.replace("\n", "\\n")
        ok = update_resource_entry(file_path, line_index, ru_value, data.get("text_index") or 0)
    else:
        if not key:
            return jsonify({"ok": False, "error": "key required"})
        ok = update_json_entry(file_path, key, ru_value)
    if ok:
        try:
            update_search_index_file(file_path)
        except Exception:
            mark_search_index_dirty()
    return jsonify({"ok": ok})

@app.route("/api/exclude", methods=["POST"])
def api_exclude():
    data = request.get_json()
    file_path = data.get("path", "")
    if "excluded_files" not in config:
        config["excluded_files"] = []
    if file_path not in config["excluded_files"]:
        config["excluded_files"].append(file_path)
    EXCLUDED_FILES.add(file_path)
    mark_search_index_dirty()
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=4)
    return jsonify({"ok": True})

@app.route("/api/git/update-en", methods=["POST"])
def api_git_update_en():
    return git_route_wrapper(git_update_en)

@app.route("/api/git/update-ru", methods=["POST"])
def api_git_update_ru():
    return git_route_wrapper(git_update_ru)

@app.route("/api/git/save", methods=["POST"])
def api_git_save():
    data = request.get_json() or {}
    return git_route_wrapper(lambda: git_save_ru(data.get("message", "")))

@app.route("/api/git/suggest-message", methods=["GET"])
def api_git_suggest_message():
    try:
        parts, changed = suggest_commit_message()
        if not parts:
            return jsonify({"ok": True, "message": "", "changed": 0})
        message = f"Перевод: изменено строк — {changed}\n\n" + "\n\n".join(parts)
        return jsonify({"ok": True, "message": message, "changed": changed})
    except Exception as e:
        return jsonify({"ok": False, "message": "", "error": str(e)})

@app.route("/api/git/startup-status", methods=["GET"])
def api_git_startup_status():
    return jsonify({"done": STARTUP_EN_RESULT is not None, "result": STARTUP_EN_RESULT})

@app.route("/api/validate", methods=["POST"])
def api_validate():
    data = request.get_json()
    original = data.get("original", "")
    edited = data.get("edited", "")
    ok, msg = validate_edit(original, edited)
    return jsonify({"ok": ok, "message": msg})

@app.route("/api/translate/start", methods=["POST"])
def api_translate_start():
    with TRANSLATION_LOCK:
        if TRANSLATION_STATE["running"]:
            return jsonify({"ok": False, "error": "already running"})
    data = request.get_json() or {}
    categories = data.get("categories", [])
    valid = [c for c in categories if c in ("UI", "Story", "Lyrics")]
    if not valid:
        return jsonify({"ok": False, "error": "no categories selected"})
    thread = threading.Thread(target=run_translation_thread, args=(valid,), daemon=True)
    thread.start()
    return jsonify({"ok": True})

@app.route("/api/translate/status")
def api_translate_status():
    with TRANSLATION_LOCK:
        return jsonify(dict(TRANSLATION_STATE))

@app.route("/api/translate/stop", methods=["POST"])
def api_translate_stop():
    with TRANSLATION_LOCK:
        TRANSLATION_STATE["stop_requested"] = True
    return jsonify({"ok": True})

@app.route("/api/translate/text", methods=["POST"])
def api_translate_text():
    data = request.get_json() or {}
    text = data.get("text", "")
    if not text or not text.strip():
        return jsonify({"ok": False, "error": "empty text"})
    try:
        result = translate_text_safe(text)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})
    return jsonify({"ok": True, "text": result})

if __name__ == "__main__":
    if not os.environ.get("WERKZEUG_RUN_MAIN"):
        threading.Thread(target=startup_git_pull_en, daemon=True).start()
        threading.Thread(target=get_search_index, daemon=True).start()
        webbrowser.open("http://127.0.0.1:5000")
    app.run(debug=True, port=5000, use_reloader=False)
