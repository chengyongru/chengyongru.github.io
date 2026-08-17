#!/usr/bin/env python3
"""Run Hugo with automatic publication preprocessing for local development.

Hugo reads .hugo-content, which is generated from the private source vault by
prepare_hugo_content.py. This wrapper keeps that generated tree synchronized
while hugo server is running, so changing publish flags takes effect without
manually restarting the preprocessing step.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


IGNORED_DIRS = {".git", ".obsidian", ".trash", ".claude"}
CONTENT_EXTENSIONS = {
    ".avif",
    ".gif",
    ".jpeg",
    ".jpg",
    ".md",
    ".pdf",
    ".png",
    ".svg",
    ".webp",
}


def snapshot_sources(root: Path) -> dict[str, tuple[int, int]]:
    """Return a lightweight snapshot of files that can affect preprocessing."""

    snapshot: dict[str, tuple[int, int]] = {}
    watched_roots = (root / "content", root / "site-content")

    for watched_root in watched_roots:
        if not watched_root.is_dir():
            continue
        for path in watched_root.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(root)
            if any(part.lower() in IGNORED_DIRS for part in relative.parts):
                continue
            if relative.parts[0].lower() == "content" and path.suffix.lower() not in CONTENT_EXTENSIONS:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            snapshot[relative.as_posix()] = (stat.st_mtime_ns, stat.st_size)

    policy = root / "publish-policy.yml"
    if policy.is_file():
        stat = policy.stat()
        snapshot[policy.name] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def prepare_content(root: Path) -> bool:
    command = [sys.executable, str(root / "scripts" / "prepare_hugo_content.py")]
    print("[serve] Preparing publishable content...", flush=True)
    result = subprocess.run(command, cwd=root)
    if result.returncode != 0:
        print(
            "[serve] Content preparation failed; keeping the previous preview content.",
            file=sys.stderr,
            flush=True,
        )
        return False
    return True


def snapshot_generated_tree(root: Path) -> frozenset[str]:
    """Return generated files whose addition/removal changes Hugo routes or assets."""

    generated: set[str] = set()
    for name in (".hugo-content", ".hugo-static"):
        directory = root / name
        if not directory.is_dir():
            continue
        for path in directory.rglob("*"):
            if path.is_file():
                generated.add(f"{name}/{path.relative_to(directory).as_posix()}")
    return frozenset(generated)


def write_preview_version(root: Path, version: str) -> None:
    marker = root / "static" / ".hugo-preview-version"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(f"{version}\n", encoding="utf-8", newline="\n")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Hugo with automatic publish filtering for local development."
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=0.5,
        help="Seconds between source snapshots (default: 0.5).",
    )
    parser.add_argument(
        "--debounce",
        type=float,
        default=0.75,
        help="Seconds to wait after the last edit before rebuilding (default: 0.75).",
    )
    args, hugo_args = parser.parse_known_args(argv)
    if "--" in hugo_args:
        hugo_args.remove("--")
    args.hugo_args = hugo_args
    if args.poll_interval <= 0 or args.debounce < 0:
        parser.error("--poll-interval must be > 0 and --debounce must be >= 0")
    return args


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def start_hugo(
    root: Path,
    hugo_binary: str,
    hugo_args: list[str],
) -> subprocess.Popen[bytes] | None:
    command = [hugo_binary, "server"]
    if not any(
        argument == "--poll" or argument.startswith("--poll=")
        for argument in hugo_args
    ):
        command.extend(["--poll", "500ms"])
    if "--disableFastRender" not in hugo_args:
        command.append("--disableFastRender")
    command.extend(hugo_args)
    print(f"[serve] Starting: {' '.join(command)}", flush=True)
    try:
        return subprocess.Popen(command, cwd=root)
    except OSError as exc:
        print(f"[serve] Could not start Hugo: {exc}", file=sys.stderr)
        return None


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    root = Path(__file__).resolve().parents[1]

    if not prepare_content(root):
        return 1

    hugo_binary = os.environ.get("HUGO_BIN", "hugo")
    if shutil.which(hugo_binary) is None and not Path(hugo_binary).is_file():
        print(
            f"[serve] Hugo executable not found: {hugo_binary}. "
            "Set HUGO_BIN to its path.",
            file=sys.stderr,
        )
        return 1

    generated_snapshot = snapshot_generated_tree(root)
    preview_version = str(time.time_ns())
    write_preview_version(root, preview_version)
    hugo = start_hugo(root, hugo_binary, args.hugo_args)
    if hugo is None:
        return 1

    previous_snapshot = snapshot_sources(root)
    pending_since: float | None = None
    print(
        "[serve] Watching content and publish-policy.yml; press Ctrl+C to stop.",
        flush=True,
    )

    try:
        while hugo.poll() is None:
            current_snapshot = snapshot_sources(root)
            now = time.monotonic()
            if current_snapshot != previous_snapshot:
                previous_snapshot = current_snapshot
                pending_since = now
            elif pending_since is not None and now - pending_since >= args.debounce:
                snapshot_before_prepare = previous_snapshot
                prepared = prepare_content(root)
                snapshot_after_prepare = snapshot_sources(root)
                previous_snapshot = snapshot_after_prepare
                if prepared:
                    new_generated_snapshot = snapshot_generated_tree(root)
                    if new_generated_snapshot != generated_snapshot:
                        print(
                            "[serve] Generated routes/assets changed; restarting Hugo.",
                            flush=True,
                        )
                        stop_process(hugo)
                        preview_version = str(time.time_ns())
                        write_preview_version(root, preview_version)
                        hugo = start_hugo(root, hugo_binary, args.hugo_args)
                        if hugo is None:
                            return 1
                    generated_snapshot = new_generated_snapshot
                if snapshot_after_prepare != snapshot_before_prepare:
                    print(
                        "[serve] Source changed while preparing; scheduling another sync.",
                        flush=True,
                    )
                    pending_since = time.monotonic()
                else:
                    pending_since = None
            time.sleep(args.poll_interval)
    except KeyboardInterrupt:
        print("\n[serve] Stopping Hugo...", flush=True)
    finally:
        stop_process(hugo)

    return hugo.returncode or 0


if __name__ == "__main__":
    raise SystemExit(main())
