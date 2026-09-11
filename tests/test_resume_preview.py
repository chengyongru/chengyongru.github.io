from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_resume
import serve_hugo


class ResumePreviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in serve_hugo.RESUME_SOURCES:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("PRIVATE RESUME", encoding="utf-8")

    def write(self, relative, text="fixture"):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_resume_sources_and_style_inputs_are_watched(self):
        before = serve_hugo.snapshot_resume_sources(self.root)
        self.assertEqual(set(before), set(serve_hugo.RESUME_SOURCES))
        for name in ("assets/css/extended/resume.css", "layouts/resume/single.html",
                     "hugo.yml", "scripts/staticrypt-resume-template.html"):
            self.write(name)
            current = serve_hugo.snapshot_resume_sources(self.root)
            self.assertIn(name, current)
            self.assertNotEqual(before, current)
            before = current
        self.write(serve_hugo.RESUME_SOURCES[0], "updated private resume")
        self.assertNotEqual(before, serve_hugo.snapshot_resume_sources(self.root))

    def test_generated_outputs_do_not_trigger_resume_builds(self):
        before = serve_hugo.snapshot_resume_sources(self.root)
        for name in ("static/resume/index.html", "static/resume-assets/stylesheet.css",
                     "static/.hugo-preview-version", ".hugo-content/resume.md",
                     "resources/_gen/result", "themes/PaperMod/.git/index"):
            self.write(name)
        self.assertEqual(before, serve_hugo.snapshot_resume_sources(self.root))

    def test_password_is_read_once_from_selected_environment(self):
        args = serve_hugo.parse_args(["--resume-password-env", "TEST_RESUME_SECRET"])
        with patch.dict(os.environ, {"TEST_RESUME_SECRET": "test-only"}), \
             patch.object(serve_hugo.getpass, "getpass") as prompt:
            self.assertEqual(serve_hugo.resume_password(self.root, args), "test-only")
            prompt.assert_not_called()

    def test_missing_password_does_not_prompt_without_terminal(self):
        args = serve_hugo.parse_args([])
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(serve_hugo, "interactive_stdin", return_value=False), \
             patch.object(serve_hugo.getpass, "getpass") as prompt, \
             redirect_stdout(StringIO()) as output:
            self.assertIsNone(serve_hugo.resume_password(self.root, args))
            prompt.assert_not_called()
        self.assertIn("keeping existing encrypted pages", output.getvalue())

    def test_empty_interactive_password_skips_resume_updates(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(serve_hugo, "interactive_stdin", return_value=True), \
             patch.object(serve_hugo.getpass, "getpass", return_value="") as prompt, \
             redirect_stdout(StringIO()):
            self.assertIsNone(serve_hugo.resume_password(self.root, serve_hugo.parse_args([])))
            prompt.assert_called_once()

    def test_no_resume_option_preserves_hugo_arguments(self):
        args = serve_hugo.parse_args(["--no-resume", "--", "--port", "1410"])
        self.assertEqual(args.hugo_args, ["--port", "1410"])
        with patch.object(serve_hugo.getpass, "getpass") as prompt:
            self.assertIsNone(serve_hugo.resume_password(self.root, args))
            prompt.assert_not_called()

    def test_password_is_not_passed_on_command_line(self):
        with patch.object(serve_hugo.subprocess, "run") as run, redirect_stdout(StringIO()) as output:
            run.return_value.returncode = 0
            self.assertTrue(serve_hugo.prepare_resumes(self.root, "test-only-secret"))
        self.assertNotIn("test-only-secret", str(run.call_args.args))
        self.assertNotIn("test-only-secret", output.getvalue())
        self.assertEqual(run.call_args.kwargs["env"]["RESUME_PASSWORD"], "test-only-secret")
        self.assertIn("--preview", run.call_args.args[0])

    def fake_hugo(self, command, *, cwd, env):
        content_dir = Path(command[command.index("--contentDir") + 1])
        self.assertFalse(content_dir.is_relative_to(self.root))
        self.assertEqual(len(list(content_dir.glob("*.md"))), 2)
        self.assertNotIn("--gc", command)
        self.assertIn("--noBuildLock", command)
        self.assertEqual((self.root / ".hugo-content/sentinel.md").read_text(), "untouched")
        rendered = Path(command[command.index("--destination") + 1])
        assets = ["assets/css/stylesheet.abc.css", "assets/js/search.abc.js", "js/quartz-graph.min.abc.js"]
        for asset in assets:
            path = rendered / asset
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("new asset", encoding="utf-8")
        for variant in build_resume.RESUME_VARIANTS.values():
            path = rendered / variant["rendered"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('<html><head></head><body>PRIVATE RESUME ' + " ".join("/" + x for x in assets) + '</body></html>', encoding="utf-8")

    def fake_encrypt(self, root, rendered, encrypted, template, password):
        self.assertEqual((root / "static/resume/index.html").read_text(), "old encrypted")
        self.assertEqual((root / "static/resume-assets/stylesheet.css").read_text(), "old asset")
        encrypted.mkdir(parents=True)
        result = encrypted / "index.html"
        result.write_text("<html><head></head><body>ciphertext</body></html>", encoding="utf-8")
        return result

    def prepare_build(self):
        self.write(".hugo-content/sentinel.md", "untouched")
        self.write("static/resume/index.html", "old encrypted")
        self.write("static/resume-assets/stylesheet.css", "old asset")
        self.write("scripts/resume-preview.js", "/* test preview */")
        return {lang: self.root / f"content/.resume/resume-{lang}.html" for lang in ("en", "zh")}

    def test_build_isolates_plaintext_and_publishes_after_both_encryptions(self):
        sources = self.prepare_build()
        with patch.object(build_resume, "run", side_effect=self.fake_hugo), \
             patch.object(build_resume, "encrypt_resume", side_effect=self.fake_encrypt):
            destinations = build_resume.build_resumes(self.root, sources, "test-only", preview=True)
        for path in destinations:
            self.assertIn("ciphertext", path.read_text())
            self.assertIn("resume-preview-version", path.read_text())
            self.assertNotIn("PRIVATE RESUME", path.read_text())
        self.assertEqual(list((self.root / ".hugo-content").iterdir()), [self.root / ".hugo-content/sentinel.md"])

    def test_failed_second_encryption_keeps_all_existing_outputs(self):
        sources = self.prepare_build()
        self.write("static/resume/en/index.html", "old English")
        def fail_second(*args):
            if args[2].name == "zh":
                raise RuntimeError("encryption failed")
            return self.fake_encrypt(*args)
        with patch.object(build_resume, "run", side_effect=self.fake_hugo), \
             patch.object(build_resume, "encrypt_resume", side_effect=fail_second):
            with self.assertRaisesRegex(RuntimeError, "encryption failed"):
                build_resume.build_resumes(self.root, sources, "test-only")
        self.assertEqual((self.root / "static/resume/index.html").read_text(), "old encrypted")
        self.assertEqual((self.root / "static/resume/en/index.html").read_text(), "old English")
        self.assertEqual((self.root / "static/resume-assets/stylesheet.css").read_text(), "old asset")


if __name__ == "__main__":
    unittest.main()
