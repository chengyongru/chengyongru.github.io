#!/usr/bin/env python3
"""Build and encrypt the private English and Chinese resumes."""

from __future__ import annotations

import argparse
import getpass
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


STATICRYPT_VERSION = "3.5.4"
RESUME_SALT = "9b3c805db46d1ae1a7c9eea5b3d3156b"


RESUME_VARIANTS = {
    "en": {
        "staged": Path("resume.md"),
        "rendered": Path("resume/en/index.html"),
        "destination": Path("static/resume/en/index.html"),
    },
    "zh": {
        "staged": Path("resume-zh.md"),
        "rendered": Path("resume/index.html"),
        "destination": Path("static/resume/index.html"),
    },
}


RESUME_ASSETS = (
    (
        re.compile(r"/assets/css/stylesheet\.[0-9a-f]+\.css"),
        "/resume-assets/stylesheet.css",
    ),
    (
        re.compile(r"/assets/js/search\.[0-9a-f]+\.js"),
        "/resume-assets/search.js",
    ),
    (
        re.compile(r"/js/quartz-graph\.min\.[0-9a-f]+\.js"),
        "/resume-assets/quartz-graph.js",
    ),
)

SUBRESOURCE_INTEGRITY = re.compile(r'\s+integrity="sha(?:256|384|512)-[^"]+"')


def run(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=cwd, env=env, check=True)


def resolve_npx() -> str:
    executable = "npx.cmd" if os.name == "nt" else "npx"
    resolved = shutil.which(executable)
    if not resolved:
        raise FileNotFoundError("npx is required to run StatiCrypt")
    return resolved


def read_password(environment_name: str) -> str:
    password = os.environ.get(environment_name)
    if password is None:
        password = getpass.getpass("Resume password: ")
    if not password:
        raise ValueError("Resume password cannot be empty")
    return password


def stage_resumes(root: Path, sources: dict[str, Path]) -> list[Path]:
    run([sys.executable, "scripts/prepare_hugo_content.py"], cwd=root)
    staged_files: list[Path] = []
    for language, source in sources.items():
        staged = root / ".hugo-content" / RESUME_VARIANTS[language]["staged"]
        staged.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, staged)
        staged_files.append(staged)
    return staged_files


def stabilize_resume_assets(
    root: Path, rendered_site: Path, rendered_resume: Path
) -> None:
    """Ship the rendered resume's fingerprinted assets at stable public URLs."""
    html = rendered_resume.read_text(encoding="utf-8")

    for pattern, stable_url in RESUME_ASSETS:
        match = pattern.search(html)
        if match is None:
            raise ValueError(
                f"Rendered resume does not reference expected asset: {pattern.pattern}"
            )

        fingerprinted_url = match.group(0)
        source = rendered_site / fingerprinted_url.lstrip("/")
        if not source.is_file():
            raise FileNotFoundError(f"Rendered resume asset not found: {source}")

        destination = root / "static" / stable_url.lstrip("/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        asset_version = hashlib.sha256(source.read_bytes()).hexdigest()[:12]
        html = html.replace(fingerprinted_url, f"{stable_url}?v={asset_version}")

    # The stable copies are normalized by Git on checkout, so their bytes may
    # differ across platforms even though their CSS or JavaScript is equivalent.
    html = SUBRESOURCE_INTEGRITY.sub("", html)
    rendered_resume.write_text(html, encoding="utf-8", newline="\n")


def encrypt_resume(
    root: Path,
    rendered_resume: Path,
    encrypted_directory: Path,
    template: Path,
    password: str,
) -> Path:
    environment = os.environ.copy()
    environment["STATICRYPT_PASSWORD"] = password
    run(
        [
            resolve_npx(),
            "--yes",
            f"staticrypt@{STATICRYPT_VERSION}",
            str(rendered_resume),
            "--directory",
            str(encrypted_directory),
            "--template",
            str(template),
            "--remember",
            "0",
            "--salt",
            RESUME_SALT,
            "--config",
            "false",
            "--short",
            "--template-title",
            "Resume",
            "--template-instructions",
            "Enter the password to continue.",
            "--template-placeholder",
            "Password",
            "--template-button",
            "Unlock",
            "--template-error",
            "Incorrect password. Try again.",
        ],
        cwd=root,
        env=environment,
    )
    encrypted_resume = encrypted_directory / "index.html"
    if not encrypted_resume.is_file():
        raise FileNotFoundError(f"StatiCrypt did not create {encrypted_resume}")
    return encrypted_resume


def build_resumes(
    root: Path, sources: dict[str, Path], password: str
) -> list[Path]:
    template = root / "scripts" / "staticrypt-resume-template.html"
    staged_files = stage_resumes(root, sources)
    destinations: list[Path] = []

    try:
        with tempfile.TemporaryDirectory(prefix="chengyongru-resume-") as temporary:
            temporary_root = Path(temporary)
            rendered_site = temporary_root / "site"
            encrypted = temporary_root / "encrypted"
            hugo_environment = os.environ.copy()
            hugo_environment["HUGO_MINIFY_MINIFYOUTPUT"] = "false"

            run(
                [
                    "hugo",
                    "--gc",
                    "--baseURL",
                    "/",
                    "--destination",
                    str(rendered_site),
                ],
                cwd=root,
                env=hugo_environment,
            )

            for language, variant in RESUME_VARIANTS.items():
                rendered_resume = rendered_site / variant["rendered"]
                if not rendered_resume.is_file():
                    raise FileNotFoundError(f"Hugo did not render {rendered_resume}")

                stabilize_resume_assets(root, rendered_site, rendered_resume)

                encrypted_resume = encrypt_resume(
                    root,
                    rendered_resume,
                    encrypted / language,
                    template,
                    password,
                )
                destination = root / variant["destination"]
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(encrypted_resume, destination)
                destinations.append(destination)
    finally:
        for staged in staged_files:
            staged.unlink(missing_ok=True)

    return destinations


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-en",
        type=Path,
        default=Path("content/.resume/resume-en.html"),
        help="Private English HTML source",
    )
    parser.add_argument(
        "--source-zh",
        type=Path,
        default=Path("content/.resume/resume-zh.html"),
        help="Private Chinese HTML source",
    )
    parser.add_argument(
        "--password-env",
        default="RESUME_PASSWORD",
        help="Environment variable containing the password; prompts when unset",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]
    sources = {
        "en": args.source_en if args.source_en.is_absolute() else root / args.source_en,
        "zh": args.source_zh if args.source_zh.is_absolute() else root / args.source_zh,
    }
    for source in sources.values():
        if not source.is_file():
            raise FileNotFoundError(f"Private resume source not found: {source}")

    destinations = build_resumes(root, sources, read_password(args.password_env))
    for destination in destinations:
        print(f"Encrypted resume: {destination.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
