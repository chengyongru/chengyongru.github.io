#!/usr/bin/env python3
"""Build a private-by-default Hugo content tree from the Obsidian vault.

The source submodule is never modified. Only notes that pass publish-policy.yml
are copied into .hugo-content, and only media referenced by those notes are
copied into .hugo-static.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote, unquote, urlsplit

import yaml


FRONTMATTER_RE = re.compile(
    r"\A---[ \t]*\r?\n(?P<yaml>.*?)\r?\n---[ \t]*(?:\r?\n|\Z)",
    re.DOTALL,
)
MARKDOWN_IMAGE_RE = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<target>[^)]+)\)")
OBSIDIAN_EMBED_RE = re.compile(r"!\[\[(?P<target>[^\]]+)\]\]")
WIKILINK_RE = re.compile(r"(?<!!)\[\[(?P<target>[^\]]+)\]\]")
HTML_MEDIA_RE = re.compile(
    r"(?P<prefix>\b(?:src|href)\s*=\s*[\"'])(?P<target>[^\"']+)(?P<suffix>[\"'])",
    re.IGNORECASE,
)
MEDIA_SUFFIXES = {
    ".avif",
    ".gif",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".svg",
    ".webp",
}


@dataclass(frozen=True)
class Policy:
    require_publish_flag: bool
    require_tags: bool
    blocked_tags: frozenset[str]
    always_publish_slugs: frozenset[str]
    blocked_dirs: frozenset[str]
    blocked_files: frozenset[str]


@dataclass
class PageRecord:
    source: Path
    relative: Path
    slug: str
    data: dict[str, Any]
    body: str
    published: bool
    reason: str
    url: str = ""
    output: Path | None = None
    assets: list[str] = field(default_factory=list)


def normalize_tag(value: Any) -> str:
    return str(value).strip().lstrip("#").lower()


def normalize_slug(value: str) -> str:
    value = value.replace("\\", "/").strip("/")
    if value.lower().endswith(".md"):
        value = value[:-3]
    return value.lower()


def load_policy(path: Path) -> Policy:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"Publication policy must be a mapping: {path}")

    def normalized_set(key: str) -> frozenset[str]:
        value = raw.get(key, [])
        if not isinstance(value, list):
            raise ValueError(f"Policy field {key!r} must be a list")
        return frozenset(normalize_tag(item) for item in value if normalize_tag(item))

    return Policy(
        require_publish_flag=raw.get("requirePublishFlag") is True,
        require_tags=raw.get("requireTags") is True,
        blocked_tags=normalized_set("blockedTags"),
        always_publish_slugs=frozenset(
            normalize_slug(item) for item in raw.get("alwaysPublishSlugs", [])
        ),
        blocked_dirs=normalized_set("blockedDirs"),
        blocked_files=normalized_set("blockedFiles"),
    )


def split_frontmatter(path: Path) -> tuple[dict[str, Any], str, str | None]:
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as exc:
        return {}, "", f"invalid-encoding: {exc}"

    match = FRONTMATTER_RE.match(raw)
    if not match:
        return {}, raw, "missing-frontmatter"

    try:
        data = yaml.safe_load(match.group("yaml")) or {}
    except yaml.YAMLError as exc:
        return {}, raw[match.end() :], f"invalid-frontmatter: {exc}"

    if not isinstance(data, dict):
        return {}, raw[match.end() :], "invalid-frontmatter: expected a mapping"
    return data, raw[match.end() :], None


def path_is_blocked(slug: str, policy: Policy) -> bool:
    parts = [part for part in PurePosixPath(slug).parts if part]
    if not parts:
        return False
    lowered = [part.lower() for part in parts]
    if any(part.startswith(".") for part in lowered):
        return True
    if any(part in policy.blocked_dirs for part in lowered):
        return True
    return lowered[-1] in policy.blocked_files


def publication_reason(
    slug: str,
    data: dict[str, Any],
    policy: Policy,
    parse_error: str | None = None,
) -> str:
    if parse_error:
        return parse_error
    if path_is_blocked(slug, policy):
        return "blocked-path"
    if data.get("draft") is True:
        return "draft"
    if policy.require_publish_flag and data.get("publish") is not True:
        return "publish-flag-required"

    tags_value = data.get("tags", [])
    tags = [normalize_tag(tag) for tag in tags_value] if isinstance(tags_value, list) else []
    tags = [tag for tag in tags if tag]
    if slug not in policy.always_publish_slugs:
        if policy.require_tags and not tags:
            return "tags-required"
        if policy.blocked_tags.intersection(tags):
            return "blocked-tag"
    return "published"


def scan_vault(source_dir: Path, policy: Policy) -> list[PageRecord]:
    records: list[PageRecord] = []
    for path in sorted(source_dir.rglob("*.md"), key=lambda item: item.as_posix().lower()):
        relative = path.relative_to(source_dir)
        slug = normalize_slug(relative.as_posix())
        data, body, error = split_frontmatter(path)
        reason = publication_reason(slug, data, policy, error)
        records.append(
            PageRecord(
                source=path,
                relative=relative,
                slug=slug,
                data=data,
                body=body,
                published=reason == "published",
                reason=reason,
                url=f"/blog/{slug}/",
            )
        )
    return records


class ContentTransformer:
    def __init__(
        self,
        source_dir: Path,
        static_output: Path,
        published: list[PageRecord],
    ) -> None:
        self.source_dir = source_dir.resolve()
        self.static_output = static_output.resolve()
        self.image_root = (self.source_dir / "img").resolve()
        self.by_slug = {record.slug: record for record in published}
        self.by_stem: dict[str, list[PageRecord]] = {}
        for record in published:
            self.by_stem.setdefault(Path(record.slug).name.lower(), []).append(record)
        self.asset_lookup: dict[str, list[Path]] = {}
        if self.image_root.is_dir():
            for item in self.image_root.rglob("*"):
                if item.is_file():
                    self.asset_lookup.setdefault(item.name.lower(), []).append(item.resolve())

    def resolve_wikilink(self, raw_target: str) -> tuple[PageRecord | None, str, str]:
        target_and_anchor, separator, label = raw_target.partition("|")
        target, anchor_separator, anchor = target_and_anchor.partition("#")
        normalized = normalize_slug(target.strip())
        record = self.by_slug.get(normalized)
        if record is None and normalized:
            candidates = self.by_stem.get(Path(normalized).name.lower(), [])
            if len(candidates) == 1:
                record = candidates[0]
        display = label.strip() if separator else (Path(target).stem or target).strip()
        fragment = f"#{quote(anchor.strip())}" if anchor_separator and anchor.strip() else ""
        return record, display, fragment

    def resolve_asset(self, raw_target: str, source_file: Path) -> tuple[Path, Path] | None:
        target = raw_target.strip().strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or target.startswith(("/", "#", "data:")):
            return None

        decoded = unquote(parsed.path).replace("\\", "/")
        if not decoded or Path(decoded).suffix.lower() not in MEDIA_SUFFIXES:
            return None

        candidates = [
            (source_file.parent / decoded).resolve(),
            (self.source_dir / decoded).resolve(),
        ]
        if decoded.lower().startswith("img/"):
            candidates.append((self.image_root / decoded[4:]).resolve())
        candidates.extend(self.asset_lookup.get(Path(decoded).name.lower(), []))

        seen: set[Path] = set()
        for candidate in candidates:
            if candidate in seen:
                continue
            seen.add(candidate)
            try:
                candidate.relative_to(self.source_dir)
            except ValueError:
                continue
            if not candidate.is_file():
                continue
            try:
                relative = candidate.relative_to(self.image_root)
            except ValueError:
                relative = Path("attachments") / candidate.relative_to(self.source_dir)
            return candidate, relative
        raise FileNotFoundError(f"Referenced media not found: {raw_target!r} in {source_file}")

    def copy_asset(self, raw_target: str, source_file: Path, record: PageRecord) -> str | None:
        resolved = self.resolve_asset(raw_target, source_file)
        if resolved is None:
            return None
        source, relative = resolved
        destination = self.static_output / "media" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        public_path = f"/media/{quote(relative.as_posix(), safe='/')}"
        record.assets.append(public_path)
        return public_path

    def transform(self, record: PageRecord) -> str:
        body = record.body

        def replace_embed(match: re.Match[str]) -> str:
            target = match.group("target")
            path_part, separator, label = target.partition("|")
            if Path(path_part).suffix.lower() in MEDIA_SUFFIXES:
                public_path = self.copy_asset(path_part, record.source, record)
                if public_path:
                    alt = label.strip() if separator else Path(path_part).stem
                    return f"![{alt}]({public_path})"
            linked, display, fragment = self.resolve_wikilink(target)
            if linked:
                return f"[{display}]({linked.url}{fragment})"
            return display

        body = OBSIDIAN_EMBED_RE.sub(replace_embed, body)

        def replace_markdown_image(match: re.Match[str]) -> str:
            target = match.group("target").strip()
            destination = target
            title = ""
            if target.startswith("<") and ">" in target:
                end = target.index(">")
                destination, title = target[1:end], target[end + 1 :]
            elif " \"" in target:
                destination, title = target.split(" \"", 1)
                title = f' "{title}'
            public_path = self.copy_asset(destination, record.source, record)
            if not public_path:
                return match.group(0)
            return f"![{match.group('alt')}]({public_path}{title})"

        body = MARKDOWN_IMAGE_RE.sub(replace_markdown_image, body)

        def replace_html_media(match: re.Match[str]) -> str:
            public_path = self.copy_asset(match.group("target"), record.source, record)
            if not public_path:
                return match.group(0)
            return f"{match.group('prefix')}{public_path}{match.group('suffix')}"

        body = HTML_MEDIA_RE.sub(replace_html_media, body)

        def replace_wikilink(match: re.Match[str]) -> str:
            linked, display, fragment = self.resolve_wikilink(match.group("target"))
            if linked:
                return f"[{display}]({linked.url}{fragment})"
            return display

        return WIKILINK_RE.sub(replace_wikilink, body)


def json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_value(item) for item in value]
    return value


def safe_generated_dir(root: Path, path: Path, expected_name: str) -> Path:
    resolved_root = root.resolve()
    resolved = path.resolve()
    if resolved.parent != resolved_root or resolved.name != expected_name:
        raise ValueError(f"Refusing generated directory outside {resolved_root}: {resolved}")
    return resolved


def reset_generated_dir(root: Path, path: Path, expected_name: str) -> Path:
    resolved = safe_generated_dir(root, path, expected_name)
    if resolved.exists():
        if not resolved.is_dir():
            raise ValueError(f"Refusing generated path that is not a directory: {resolved}")
        # Keep the watched directory itself alive. Replacing it breaks Hugo's
        # filesystem watcher on some platforms, especially Windows.
        for child in resolved.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
    else:
        resolved.mkdir(parents=True)
    return resolved


def render_page(record: PageRecord, body: str) -> str:
    data = dict(record.data)
    data["draft"] = False
    data["url"] = record.url
    data["sourcePath"] = record.relative.as_posix()
    if "modify_date" in data and "lastmod" not in data:
        data["lastmod"] = data["modify_date"]
    data["math"] = bool(re.search(r"\$\$|\\\(|\\\[|(?<!\\)\$[^\r\n$]+(?<!\\)\$", body))
    data["mermaid"] = bool(re.search(r"(?m)^```mermaid\s*$", body))
    dumped = yaml.safe_dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        width=1000,
        default_flow_style=False,
    ).rstrip()
    return f"---\n{dumped}\n---\n\n{body.lstrip()}"


def build_site(
    root: Path,
    source_dir: Path,
    output_dir: Path,
    static_output: Path,
    skeleton_dir: Path,
    manifest_path: Path,
    policy: Policy,
) -> list[PageRecord]:
    records = scan_vault(source_dir, policy)
    published = [record for record in records if record.published]
    output_dir = reset_generated_dir(root, output_dir, ".hugo-content")
    static_output = reset_generated_dir(root, static_output, ".hugo-static")
    if skeleton_dir.is_dir():
        shutil.copytree(skeleton_dir, output_dir, dirs_exist_ok=True)

    transformer = ContentTransformer(source_dir, static_output, published)
    for record in published:
        relative = record.relative
        if record.slug == "index":
            relative = Path("index-note.md")
        destination = output_dir / "blog" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        transformed = transformer.transform(record)
        destination.write_text(render_page(record, transformed), encoding="utf-8", newline="\n")
        record.output = destination.relative_to(root)

    reason_counts = Counter(record.reason for record in records if not record.published)
    manifest = {
        "publishedCount": len(published),
        "skippedCount": len(records) - len(published),
        "skippedByReason": dict(sorted(reason_counts.items())),
        "published": [
            {
                "source": record.relative.as_posix(),
                "output": record.output.as_posix() if record.output else None,
                "url": record.url,
                "title": str(record.data.get("title") or record.slug),
                "tags": json_value(record.data.get("tags", [])),
                "assets": sorted(set(record.assets)),
            }
            for record in published
        ],
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return records


def print_audit(records: list[PageRecord]) -> None:
    published = [record for record in records if record.published]
    skipped = [record for record in records if not record.published]
    print(f"Publishable notes: {len(published)}")
    for record in published:
        print(f"  PUBLISH  {record.relative.as_posix()}")
    print(f"Skipped notes: {len(skipped)}")
    for reason, count in sorted(Counter(record.reason for record in skipped).items()):
        print(f"  {reason}: {count}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Audit without writing generated files")
    parser.add_argument("--root", type=Path, help="Repository root (used by tests and tooling)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    root = (args.root or Path(__file__).resolve().parents[1]).resolve()
    source_dir = root / "content"
    policy = load_policy(root / "publish-policy.yml")
    if not source_dir.is_dir():
        raise FileNotFoundError(
            f"Content submodule is missing at {source_dir}. Run git submodule update --init --recursive."
        )

    if args.check:
        records = scan_vault(source_dir, policy)
    else:
        records = build_site(
            root=root,
            source_dir=source_dir,
            output_dir=root / ".hugo-content",
            static_output=root / ".hugo-static",
            skeleton_dir=root / "site-content",
            manifest_path=root / ".hugo-publication.json",
            policy=policy,
        )
    print_audit(records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
