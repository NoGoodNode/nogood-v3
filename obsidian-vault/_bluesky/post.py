#!/usr/bin/env python3
"""
post.py — posts an approved draft to Bluesky via the AT Protocol HTTP API.
No third-party libraries required beyond python-dotenv.

Usage:
    python post.py "<filename.md>"
    python post.py "<filename.md>" --text "Custom post text"
    python post.py --list   (show pending drafts)
    python post.py --skip "<filename.md>"   (mark as skipped/won't post)
"""

import sys
import json
import argparse
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).parent / ".env")

QUEUE_FILE = Path(__file__).parent / "queue.json"
BSKY_API = "https://bsky.social/xrpc"


def load_queue():
    if not QUEUE_FILE.exists():
        print("ERROR: queue.json not found. Run scan.py first.")
        sys.exit(1)
    with open(QUEUE_FILE) as f:
        return json.load(f)


def save_queue(queue):
    with open(QUEUE_FILE, "w") as f:
        json.dump(queue, f, indent=2)


def api_post(path, payload, token=None):
    url = f"{BSKY_API}/{path}"
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERROR {e.code}: {body}")
        sys.exit(1)


def login(handle, password):
    resp = api_post("com.atproto.server.createSession", {
        "identifier": handle,
        "password": password,
    })
    return resp["accessJwt"], resp["did"]


def find_urls(text):
    pattern = r'https?://\S+'
    return [(m.start(), m.end(), m.group()) for m in re.finditer(pattern, text)]


def build_facets(text):
    facets = []
    for start, end, url in find_urls(text):
        byte_start = len(text[:start].encode("utf-8"))
        byte_end = len(text[:end].encode("utf-8"))
        facets.append({
            "$type": "app.bsky.richtext.facet",
            "index": {"byteStart": byte_start, "byteEnd": byte_end},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
        })
    return facets


def post_to_bluesky(text):
    handle = os.getenv("BLUESKY_HANDLE", "").strip()
    password = os.getenv("BLUESKY_APP_PASSWORD", "").strip()

    if not handle or not password or "xxxx" in password:
        print("ERROR: Fill in BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in _bluesky/.env")
        sys.exit(1)

    token, did = login(handle, password)

    record = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    facets = build_facets(text)
    if facets:
        record["facets"] = facets

    resp = api_post("com.atproto.repo.createRecord", {
        "repo": did,
        "collection": "app.bsky.feed.post",
        "record": record,
    }, token=token)

    return resp.get("uri", "")


def list_pending(queue):
    pending = {k: v for k, v in queue.items() if v["status"] == "pending"}
    if not pending:
        print("No pending drafts.")
        return
    for key, entry in pending.items():
        print(f"\n{'─'*60}")
        print(f"FILE: {key}")
        print(f"\n{entry['draft']}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", nargs="?", help="Note filename (key in queue.json)")
    parser.add_argument("--text", help="Override post text")
    parser.add_argument("--list", action="store_true", help="List pending drafts")
    parser.add_argument("--skip", metavar="FILE", help="Mark a draft as skipped")
    args = parser.parse_args()

    queue = load_queue()

    if args.list:
        list_pending(queue)
        return

    if args.skip:
        if args.skip not in queue:
            print(f"ERROR: '{args.skip}' not in queue")
            sys.exit(1)
        queue[args.skip]["status"] = "skipped"
        save_queue(queue)
        print(f"Marked as skipped: {args.skip}")
        return

    if not args.file:
        parser.print_help()
        sys.exit(1)

    if args.file not in queue:
        print(f"ERROR: '{args.file}' not found in queue.json")
        sys.exit(1)

    entry = queue[args.file]

    if entry["status"] == "posted":
        print(f"Already posted: {entry.get('post_uri', '')}")
        sys.exit(0)

    text = args.text if args.text else entry["draft"]

    char_count = len(text)
    if char_count > 300:
        print(f"ERROR: Post is {char_count} chars — exceeds Bluesky's 300-char limit.")
        sys.exit(1)

    print(f"Posting ({char_count} chars):\n\n{text}\n")
    uri = post_to_bluesky(text)

    queue[args.file]["status"] = "posted"
    queue[args.file]["post_uri"] = uri
    save_queue(queue)
    print(f"✓ Posted: {uri}")


if __name__ == "__main__":
    main()
