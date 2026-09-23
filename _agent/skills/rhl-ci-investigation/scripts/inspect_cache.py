#!/usr/bin/env python3
"""
Inspects GitHub Actions cache usage, quotas, active entries, and key version collisions.
Usage:
    python3 inspect_cache.py [--repo EmpoHealth/core] [--key <substring>] [--ref <ref>] [--details]
"""

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional

GITHUB_CACHE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024  # 10 GiB

def run_gh_api(endpoint: str, paginate: bool = False) -> Any:
    cmd = ["gh", "api"]
    if paginate:
        cmd.append("--paginate")
    cmd.append(endpoint)

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        # With --paginate, gh outputs concatenated JSON objects or arrays
        output = res.stdout.strip()
        if not output:
            return {}
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            # Handle concatenated JSON pages
            decoder = json.JSONDecoder()
            items = []
            pos = 0
            while pos < len(output):
                output_slice = output[pos:].lstrip()
                if not output_slice:
                    break
                obj, consumed = decoder.raw_decode(output_slice)
                items.append(obj)
                pos += (len(output[pos:]) - len(output_slice)) + consumed
            return items
    except subprocess.CalledProcessError as e:
        print(f"Error executing gh api: {e.stderr.strip()}", file=sys.stderr)
        sys.exit(1)

def format_bytes(bytes_val: int) -> str:
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.2f} KiB"
    elif bytes_val < 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.2f} MiB"
    else:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GiB"

def main():
    parser = argparse.ArgumentParser(description="Inspect GitHub Actions caches and usage.")
    parser.add_argument("--repo", default="EmpoHealth/core", help="Target GitHub repo (owner/repo)")
    parser.add_argument("--key", help="Filter caches matching key substring")
    parser.add_argument("--ref", help="Filter caches by ref (e.g. 'main', 'refs/pull/2724/merge')")
    parser.add_argument("--details", action="store_true", help="Print all matching individual cache entries")
    args = parser.parse_args()

    print(f"Fetching cache usage for {args.repo}...")
    usage = run_gh_api(f"repos/{args.repo}/actions/cache/usage")
    active_bytes = usage.get("active_caches_size_in_bytes", 0)
    active_count = usage.get("active_caches_count", 0)
    percent = (active_bytes / GITHUB_CACHE_QUOTA_BYTES) * 100

    print("=" * 60)
    print(f"GitHub Actions Cache Quota: {format_bytes(active_bytes)} / {format_bytes(GITHUB_CACHE_QUOTA_BYTES)} ({percent:.1f}%)")
    print(f"Active Caches Count:        {active_count}")
    if percent >= 100:
        print("⚠️  WARNING: Repository has exceeded the 10 GiB quota limit!")
        print("    GitHub Actions will actively evict caches (LRU) on new saves.")
    print("=" * 60)

    print("\nFetching cache entries...")
    raw_caches_pages = run_gh_api(f"repos/{args.repo}/actions/caches", paginate=True)
    all_caches: List[Dict[str, Any]] = []

    if isinstance(raw_caches_pages, list):
        for page in raw_caches_pages:
            if isinstance(page, dict) and "actions_caches" in page:
                all_caches.extend(page["actions_caches"])
            elif isinstance(page, list):
                all_caches.extend(page)
    elif isinstance(raw_caches_pages, dict) and "actions_caches" in raw_caches_pages:
        all_caches.extend(raw_caches_pages["actions_caches"])

    # Filtering
    filtered = all_caches
    if args.key:
        filtered = [c for c in filtered if args.key.lower() in c.get("key", "").lower()]
    if args.ref:
        filtered = [c for c in filtered if args.ref.lower() in c.get("ref", "").lower()]

    if not filtered:
        print("No cache entries matched your criteria.")
        return

    print(f"\nMatched {len(filtered)} cache entries (Total {format_bytes(sum(c.get('size_in_bytes', 0) for c in filtered))})\n")

    # Grouping by Prefix
    grouped_by_type = defaultdict(lambda: {"count": 0, "size": 0})
    # Version mismatch tracking: key -> set of versions
    key_versions = defaultdict(lambda: defaultdict(list))

    for c in filtered:
        key = c.get("key", "")
        size = c.get("size_in_bytes", 0)
        ref = c.get("ref", "")
        version = c.get("version", "")
        
        # Determine prefix
        prefix = key.split("-")[0] if "-" in key else key
        if "node-modules" in key:
            prefix = "node-modules"
        elif "playwright" in key:
            prefix = "playwright"
        elif "terraform" in key:
            prefix = "terraform"
        elif "buildkit" in key:
            prefix = "buildkit"
        elif "yarn-global" in key:
            prefix = "yarn-global"

        grouped_by_type[prefix]["count"] += 1
        grouped_by_type[prefix]["size"] += size

        if version:
            key_versions[key][version].append(ref)

    # Print summary table
    print(f"{'Category':<18} {'Count':<8} {'Total Size':<12}")
    print("-" * 40)
    for cat, data in sorted(grouped_by_type.items(), key=lambda x: x[1]["size"], reverse=True):
        print(f"{cat:<18} {data['count']:<8} {format_bytes(data['size']):<12}")

    # Detect cache version conflicts
    conflicts = {k: v for k, v in key_versions.items() if len(v) > 1}
    if conflicts:
        print("\n" + "!" * 60)
        print("⚠️  DETECTED CACHE VERSION CONFLICTS:")
        print("    The following cache key(s) exist with DIFFERENT version hashes.")
        print("    This occurs when actions/cache caches differing directory paths,")
        print("    causing cache misses across different jobs/workflows sharing the key:")
        for k, versions in conflicts.items():
            print(f"\n  Key: {k}")
            for ver, refs in versions.items():
                print(f"    Version {ver[:12]}... on refs: {', '.join(set(refs))}")
        print("!" * 60)

    # Detailed entries if requested
    if args.details:
        print("\n--- Detailed Cache Entries ---")
        for c in sorted(filtered, key=lambda x: x.get("created_at", ""), reverse=True):
            cid = c.get("id")
            ckey = c.get("key")
            cref = c.get("ref")
            csize = format_bytes(c.get("size_in_bytes", 0))
            cdate = c.get("created_at", "")[:19]
            print(f"ID: {cid:<10} | Size: {csize:<10} | Created: {cdate} | Ref: {cref}\n  Key: {ckey}\n")

if __name__ == "__main__":
    main()
