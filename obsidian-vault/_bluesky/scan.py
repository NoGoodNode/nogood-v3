#!/usr/bin/env python3
"""
scan.py — finds new Obsidian notes not yet in the queue and prints draft posts.
Pass --notify to send Telegram previews for new items.
"""

import os
import sys
import json
import hashlib
import argparse
import re
import urllib.request
import urllib.error
from pathlib import Path
import yaml

VAULT_DIR = Path(__file__).parent.parent
QUEUE_FILE = Path(__file__).parent / "queue.json"
MAX_POST_LENGTH = 295


def load_queue():
    if QUEUE_FILE.exists():
        with open(QUEUE_FILE) as f:
            return json.load(f)
    return {}


def save_queue(queue):
    with open(QUEUE_FILE, "w") as f:
        json.dump(queue, f, indent=2)


def make_id(filename):
    return hashlib.md5(filename.encode()).hexdigest()[:8]


def escape_html(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def parse_note(filepath):
    text = Path(filepath).read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n?(.*)", text, re.DOTALL)
    if not match:
        return None
    try:
        frontmatter = yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        return None
    body = match.group(2).strip()
    title = frontmatter.get("title", "").strip()
    url = frontmatter.get("url", "").strip()
    date = str(frontmatter.get("date", "")).strip()
    if not title or not url:
        return None
    return {"title": title, "url": url, "date": date, "body": body}


def build_draft(note):
    title = note["title"]
    url = note["url"]
    body = note.get("body", "")
    if body:
        candidate = f"{body}\n\n{url}"
        if len(candidate) <= MAX_POST_LENGTH:
            return candidate
        overhead = len(url) + 4
        available = MAX_POST_LENGTH - overhead
        if available > 20:
            return f"{body[:available]}…\n\n{url}"
        return url
    else:
        return f"{title}\n\n{url}"


def send_telegram_preview(token, chat_id, entry_id, title, draft):
    char_count = len(draft)
    text = (
        f"📎 <b>New clipping queued</b>\n\n"
        f"<i>{escape_html(title)}</i>\n\n"
        f"{escape_html(draft)}\n\n"
        f"<code>{char_count} / 300 chars</code>"
    )
    keyboard = [[
        {"text": "✅ Post", "callback_data": f"post:{entry_id}"},
        {"text": "⏭️ Skip", "callback_data": f"skip:{entry_id}"},
    ]]
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {"inline_keyboard": keyboard},
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--notify", action="store_true", help="Send Telegram previews for new items")
    args = parser.parse_args()

    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if args.notify and (not token or not chat_id):
        print("ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set for --notify")
        sys.exit(1)

    queue = load_queue()
    md_files = sorted(VAULT_DIR.glob("*.md"))
    new_drafts = []

    for filepath in md_files:
        key = filepath.name
        if key in queue:
            continue
        note = parse_note(filepath)
        if not note:
            continue
        draft = build_draft(note)
        new_drafts.append({
            "file": key,
            "title": note["title"],
            "url": note["url"],
            "draft": draft,
            "status": "pending",
        })

    if not new_drafts:
        print("NO_NEW_NOTES")
        return

    for item in new_drafts:
        entry_id = make_id(item["file"])
        entry = {
            "id": entry_id,
            "title": item["title"],
            "url": item["url"],
            "draft": item["draft"],
            "status": "pending",
        }
        if args.notify:
            resp = send_telegram_preview(token, chat_id, entry_id, item["title"], item["draft"])
            entry["tg_message_id"] = resp["result"]["message_id"]
        queue[item["file"]] = entry

    save_queue(queue)

    print(f"FOUND:{len(new_drafts)}")
    for item in new_drafts:
        print("---DRAFT---")
        print(f"FILE:{item['file']}")
        print(item["draft"])


if __name__ == "__main__":
    main()
