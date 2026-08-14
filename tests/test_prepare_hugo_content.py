from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from prepare_hugo_content import (  # noqa: E402
    Policy,
    build_site,
    publication_reason,
)


STRICT_POLICY = Policy(
    require_publish_flag=True,
    require_tags=True,
    blocked_tags=frozenset({"todo", "english"}),
    always_publish_slugs=frozenset({"index"}),
    blocked_dirs=frozenset({"clippings", ".obsidian", "img", "src"}),
    blocked_files=frozenset({"claude"}),
)


class PublicationPolicyTests(unittest.TestCase):
    def test_requires_boolean_publish_true(self):
        self.assertEqual(
            publication_reason("notes/public", {"publish": True, "tags": ["ml"]}, STRICT_POLICY),
            "published",
        )
        self.assertEqual(
            publication_reason("notes/missing", {"tags": ["ml"]}, STRICT_POLICY),
            "publish-flag-required",
        )
        self.assertEqual(
            publication_reason("notes/string", {"publish": "true", "tags": ["ml"]}, STRICT_POLICY),
            "publish-flag-required",
        )

    def test_draft_path_and_blocked_tag_override_publication(self):
        self.assertEqual(
            publication_reason("notes/draft", {"publish": True, "draft": True, "tags": ["ml"]}, STRICT_POLICY),
            "draft",
        )
        self.assertEqual(
            publication_reason("clippings/public", {"publish": True, "tags": ["ml"]}, STRICT_POLICY),
            "blocked-path",
        )
        self.assertEqual(
            publication_reason("notes/todo", {"publish": True, "tags": ["TODO"]}, STRICT_POLICY),
            "blocked-tag",
        )

    def test_always_publish_only_bypasses_tag_rules(self):
        self.assertEqual(
            publication_reason("index", {"publish": True, "tags": []}, STRICT_POLICY),
            "published",
        )
        self.assertEqual(
            publication_reason("index", {"tags": []}, STRICT_POLICY),
            "publish-flag-required",
        )


class BuildIsolationTests(unittest.TestCase):
    def write_note(self, path: Path, data: dict, body: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        frontmatter = yaml.safe_dump(data, allow_unicode=True, sort_keys=False).rstrip()
        path.write_text(f"---\n{frontmatter}\n---\n\n{body}\n", encoding="utf-8")

    def test_build_copies_only_published_pages_and_their_assets(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "content"
            images = source / "img"
            images.mkdir(parents=True)
            (images / "public.png").write_bytes(b"public")
            (images / "private.png").write_bytes(b"private")

            self.write_note(
                source / "notebook" / "public.md",
                {"title": "Public", "publish": True, "tags": ["ml"]},
                "![public](img/public.png)",
            )
            self.write_note(
                source / "notebook" / "private.md",
                {"title": "Private", "tags": ["ml"]},
                "![private](img/private.png)",
            )
            skeleton = root / "site-content"
            skeleton.mkdir()
            (skeleton / "_index.md").write_text("---\ntitle: Home\n---\n", encoding="utf-8")

            records = build_site(
                root=root,
                source_dir=source,
                output_dir=root / ".hugo-content",
                static_output=root / ".hugo-static",
                skeleton_dir=skeleton,
                manifest_path=root / ".hugo-publication.json",
                policy=STRICT_POLICY,
            )

            self.assertEqual(sum(record.published for record in records), 1)
            generated = root / ".hugo-content" / "blog" / "notebook" / "public.md"
            self.assertTrue(generated.is_file())
            self.assertFalse((root / ".hugo-content" / "blog" / "notebook" / "private.md").exists())
            self.assertIn("/media/public.png", generated.read_text(encoding="utf-8"))
            self.assertTrue((root / ".hugo-static" / "media" / "public.png").is_file())
            self.assertFalse((root / ".hugo-static" / "media" / "private.png").exists())


if __name__ == "__main__":
    unittest.main()
