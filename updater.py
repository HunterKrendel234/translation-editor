import json
import os
import platform
import shutil
import sys
import urllib.request
import zipfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "upd_temp")
ZIP_URL = "https://github.com/HunterKrendel234/translation-editor/archive/refs/heads/main.zip"
CONFIG_NAME = "config.json"


def merge_configs(old, new):
    if not isinstance(old, dict) or not isinstance(new, dict):
        return old
    merged = dict(old)
    for key, new_val in new.items():
        if key not in merged:
            merged[key] = new_val
        elif isinstance(merged[key], dict) and isinstance(new_val, dict):
            merged[key] = merge_configs(merged[key], new_val)
    return merged


def cleanup():
    if os.path.exists(TEMP_DIR):
        try:
            shutil.rmtree(TEMP_DIR)
        except Exception:
            pass


def main():
    print("=== Обновление Translation Editor ===")
    print()

    system = platform.system()
    print(f"Операционная система: {system}")

    if os.path.exists(TEMP_DIR):
        print("Очищаю временную папку...")
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR, exist_ok=True)
    print("Создана папка upd_temp")

    print("Скачиваю архив с GitHub...")
    zip_path = os.path.join(TEMP_DIR, "archive.zip")
    try:
        urllib.request.urlretrieve(ZIP_URL, zip_path)
    except Exception as e:
        print(f"Ошибка скачивания: {e}")
        cleanup()
        input("Нажмите Enter для выхода...")
        sys.exit(1)
    print("Архив скачан")

    print("Распаковываю архив...")
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(TEMP_DIR)
    except Exception as e:
        print(f"Ошибка распаковки: {e}")
        cleanup()
        input("Нажмите Enter для выхода...")
        sys.exit(1)
    print("Архив распакован")

    extracted_dir = os.path.join(TEMP_DIR, "translation-editor-main")
    if not os.path.isdir(extracted_dir):
        print("Не найдена папка translation-editor-main в архиве")
        cleanup()
        input("Нажмите Enter для выхода...")
        sys.exit(1)
    print("Найдена папка с обновлением")

    old_config_path = os.path.join(BASE_DIR, CONFIG_NAME)
    new_config_path = os.path.join(extracted_dir, CONFIG_NAME)

    print("Обновляю файлы...")
    for root, dirs, files in os.walk(extracted_dir):
        rel_root = os.path.relpath(root, extracted_dir)
        if rel_root == ".":
            rel_root = ""

        for f in files:
            src = os.path.join(root, f)
            dst_rel = os.path.join(rel_root, f) if rel_root else f
            dst = os.path.join(BASE_DIR, dst_rel)

            if dst_rel == CONFIG_NAME:
                print("  Аккуратно обновляю config.json...")
                try:
                    with open(old_config_path, "r", encoding="utf-8") as fh:
                        old_cfg = json.load(fh)
                    with open(new_config_path, "r", encoding="utf-8") as fh:
                        new_cfg = json.load(fh)
                    merged = merge_configs(old_cfg, new_cfg)
                    with open(old_config_path, "w", encoding="utf-8") as fh:
                        json.dump(merged, fh, ensure_ascii=False, indent=4)
                    print("  config.json обновлён (новые строки добавлены)")
                except Exception as e:
                    print(f"  Ошибка обновления config.json: {e}")
                continue

            if dst_rel == "updater.py":
                continue

            dst_dir = os.path.dirname(dst)
            if dst_dir:
                os.makedirs(dst_dir, exist_ok=True)
            shutil.copy2(src, dst)
            print(f"  Заменён: {dst_rel}")

    print()
    print("Очищаю временную папку...")
    cleanup()
    print()
    print("Обновление завершено!")
    print("Можете закрыть это окно и запустить программу заново.")
    print()
    input("Нажмите Enter для выхода...")


if __name__ == "__main__":
    main()
