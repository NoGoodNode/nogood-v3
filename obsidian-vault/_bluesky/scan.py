#!/usr/bin/env python3
"""
scan.py — finds new Obsidian notes not yet in the queue and prints draft posts.
Run by the Cowork scheduled task.
"""

import os
import json
import glob
import re
from pathlib import Path
import yaml

VAULT_DIR = Path(__file__).parent.parent
QUEUE_FILE = Path(__file__).parent / "queue.json"
MAX_POST_LENGTH = 295  # leave a few chars of buffer under Bluesky's 300


def load_queue():
    if QUEUE_FILE.exists():
        with open(QUEUE_FILE) as f:
            return json.load(f)
    return {}


def save_queue(queue):
    with open(QUEUE_FILE, "w") as f:
        json.dump(queue, f, indent=2)


def parse_note(filepath):
    """Parse frontmatter + body from an Obsidian markdown note."""
    text = Path(filepath).read_text(encoding="utf-8")

    # Split frontmatter
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
    """Compose a Bluesky post from a note. Stays under MAX_POST_LENGTH chars."""
    title = note["title"]
    url = note["url"]
    body = note.get("body", "")

    if body:
        # Has note text: body + url (no title)
        candidate = f"{body}\n\n{url}"
        if len(candidate) <= MAX_POST_LENGTH:
            return candidate

        # Truncate body to fit
        overhead = len(url) + 4  # \n\n + …
        available = MAX_POST_LENGTH - overhead
        if available > 20:
            return f"{body[:available]}…\n\n{url}"

        # Body too long even truncated — fall back to url only
        return url
    else:
        # No note text: title + url
        return f"{title}\n\n{url}"


def main():
    queue = load_queue()
    md_files = sorted(VAULT_DIR.glob("*.md"))

    new_drafts = []

    for filepath in md_files:
        key = filepath.name
        if key in queue:
            continue  # already processed

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

    # Add to queue
    for item in new_drafts:
        queue[item["file"]] = {
            "title": item["title"],
            "url": item["url"],
            "draft": item["draft"],
            "status": "pending",
        }
    save_queue(queue)

    # Output drafts for Cowork to surface in chat
    print(f"FOUND:{len(new_drafts)}")
    for item in new_drafts:
        print("---DRAFT---")
        print(f"FILE:{item['file']}")
        print(item["draft"])


if __name__ == "__main__":
    main()
