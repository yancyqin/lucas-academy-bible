"""Regression checks for incremental narration status; no model or cloud calls."""
import json
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

import fangfang_narration as f


class NarrationStatusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.out = Path(self.temp.name)
        (self.out / "takes").mkdir()
        self.verse = {"id": "JHN.11.35", "book": "JHN", "chapter": 11, "verse": 35, "text": "耶稣哭了。"}
        self.settings = {"config": {"voice": "fangfang"}, "configId": "test-voice"}
        f.write_json(self.out / "settings.json", self.settings)
        f.write_json(self.out / "take-sources.json", {
            self.verse["id"]: {"textSha256": f.digest(self.verse["text"].encode()), "configId": "test-voice"}})
        self.wav = self.out / "takes/jhn-11-35.wav"
        self.registry_patch = patch.object(f, "REGISTRY", self.out / "registry.json")
        self.registry_patch.start()

    def tearDown(self):
        self.registry_patch.stop()
        self.temp.cleanup()

    def audio(self, frequency=440):
        with wave.open(str(self.wav), "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(24000)
            stream.writeframes(b"".join(struct.pack("<h", int(4000 * math.sin(i * frequency / 24000 * 2 * math.pi))) for i in range(12000)))

    def state(self, rows=None):
        with patch.object(f, "verses", return_value=rows or [self.verse]):
            return f.collect(self.out)["verses"]

    def test_newly_added_verse_is_missing_without_touching_existing_audio(self):
        self.audio()
        added = {**self.verse, "id": "JHN.11.36", "verse": 36, "text": "新的经文。"}
        states = self.state([self.verse, added])
        self.assertEqual([r["status"] for r in states], ["generated", "missing"])

    def test_changed_script_requires_regeneration(self):
        self.audio()
        self.assertEqual(self.state([{**self.verse, "text": "耶稣流泪了。"}])[0]["status"], "stale")

    def test_retains_the_exact_known_config_for_an_existing_take(self):
        self.audio()
        f.write_json(self.out / "settings.json", {
            "config": {"voice": "fangfang", "newReference": True}, "configId": "new-reference",
            "configs": {"test-voice": self.settings["config"], "new-reference": {"voice": "fangfang", "newReference": True}}})
        row = self.state()[0]
        self.assertEqual(row["status"], "generated")
        self.assertEqual(row["configId"], "test-voice")

    def test_unknown_voice_config_cannot_be_reused(self):
        self.audio()
        f.write_json(self.out / "take-sources.json", {
            self.verse["id"]: {"textSha256": f.digest(self.verse["text"].encode()), "configId": "unknown"}})
        self.assertEqual(self.state()[0]["status"], "stale")

    def test_audio_change_invalidates_the_old_asr_check(self):
        self.audio()
        row = self.state()[0]
        f.write_json(self.out / "checks.json", {row["id"]: {
            "wavSha256": row["wavSha256"], "textSha256": row["textSha256"], "issues": []}})
        self.assertEqual(self.state()[0]["status"], "checked")
        self.audio(220)
        self.assertEqual(self.state()[0]["status"], "generated")

    def test_corrupt_or_silent_files_are_not_completed_takes(self):
        self.wav.write_bytes(b"not audio")
        self.assertEqual(self.state()[0]["status"], "invalid")
        self.audio(0)
        self.assertEqual(self.state()[0]["status"], "invalid")

    def test_a_content_warning_keeps_the_clip_out_of_ready_status(self):
        self.audio()
        row = self.state()[0]
        f.write_json(self.out / "checks.json", {row["id"]: {
            "wavSha256": row["wavSha256"], "textSha256": row["textSha256"], "issues": ["missing word"]}})
        self.assertEqual(self.state()[0]["status"], "needs_review")
        self.assertFalse(self.state()[0]["published"])

    def test_owner_review_accepts_the_exact_take_and_preserves_asr_findings(self):
        self.audio()
        row = self.state()[0]
        check = {"wavSha256": row["wavSha256"], "textSha256": row["textSha256"], "issues": ["ASR spelling doubt"]}
        f.write_json(self.out / "checks.json", {row["id"]: check})
        with patch.object(f, "verses", return_value=[self.verse]):
            f.review(self.out, row["id"], "Owner confirmed the audio")
        reviewed = self.state()[0]
        self.assertEqual(reviewed["status"], "reviewed")
        self.assertEqual(reviewed["check"], check)
        self.assertEqual(reviewed["humanReview"]["reviewer"], "owner")
        self.assertFalse(reviewed["published"])
        self.audio(220)
        changed = self.state()[0]
        self.assertEqual(changed["status"], "generated")
        self.assertNotIn("humanReview", changed)
        self.assertEqual(self.state([{**self.verse, "text": "耶稣流泪了。"}])[0]["status"], "stale")

    def test_owner_review_cannot_approve_unknown_or_missing_recordings(self):
        with patch.object(f, "verses", return_value=[self.verse]):
            with self.assertRaises(ValueError):
                f.review(self.out, "JHN.11.36", "Owner confirmed")
            with self.assertRaises(ValueError):
                f.review(self.out, self.verse["id"], "Owner confirmed")
        self.assertFalse((self.out / "owner-reviews.json").exists())

    def test_slow_reading_notes_do_not_hide_a_content_warning(self):
        self.audio()
        with wave.open(str(self.wav), "rb") as stream:
            spoken = stream.readframes(stream.getnframes())
        with wave.open(str(self.wav), "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(24000)
            stream.writeframes(spoken + bytes(40800 * 2) + spoken)
        row = self.state()[0]
        check = {"wavSha256": row["wavSha256"], "textSha256": row["textSha256"],
                 "issues": ["1.7 s pause inside the line"], "syllableExact": True,
                 "extra": [], "odd": [], "gap": 1.7, "pace": 0.3}
        f.write_json(self.out / "checks.json", {row["id"]: check})
        self.assertEqual(self.state()[0]["status"], "checked")
        self.assertEqual(self.state()[0]["reviewNotes"], check["issues"])
        check["issues"].append("missing word")
        f.write_json(self.out / "checks.json", {row["id"]: check})
        self.assertEqual(self.state()[0]["status"], "needs_review")

    def test_packages_only_checked_audio_with_a_matching_static_index(self):
        self.audio()
        row = self.state()[0]
        f.write_json(self.out / "checks.json", {row["id"]: {
            "wavSha256": row["wavSha256"], "textSha256": row["textSha256"], "issues": []}})
        fake_repo = self.out / "repository"
        live = fake_repo / "data/narration-cuv-fangfang-release.json"
        missing = {**self.verse, "id": "JHN.11.36", "verse": 36, "text": "未配音经文。"}
        with patch.object(f, "verses", return_value=[self.verse, missing]), patch.object(f, "ROOT", fake_repo):
            f.package(self.out)
            self.assertEqual(f.collect(self.out)["verses"][0]["key"],
                             f.read_json(self.out / "manifest.json")["clips"][0]["key"])
        inventory = f.read_json(self.out / "static-release.json")
        self.assertEqual(len(inventory["objects"]), 3)
        self.assertEqual(inventory["objects"][0]["contentType"], "audio/mpeg")
        index = f.read_json(live)
        self.assertTrue(index["enabled"])
        self.assertEqual(len(index["clips"]), 1)
        self.assertTrue(index["clips"][0]["url"].startswith('/audio/cuv-fangfang/'))
        self.assertFalse(inventory["published"])
        for obj in inventory["objects"]:
            self.assertEqual(Path(obj["source"]), fake_repo / 'public' / obj["path"].lstrip('/'))
            self.assertEqual(f.file_digest(Path(obj["source"])), obj["sha256"])
        self.assertIn('max-age=300', inventory['objects'][-1]['cacheControl'])

    def test_owner_approved_asr_doubt_is_packaged_without_publishing_the_branch(self):
        self.audio()
        row = self.state()[0]
        f.write_json(self.out / "checks.json", {row["id"]: {
            "wavSha256": row["wavSha256"], "textSha256": row["textSha256"], "issues": ["ASR doubt"]}})
        fake_repo = self.out / "repository"
        with patch.object(f, "verses", return_value=[self.verse]), patch.object(f, "ROOT", fake_repo):
            f.review(self.out, row["id"], "Owner audition approved")
            f.package(self.out)
            self.assertEqual(self.state()[0]["status"], "reviewed")
            self.assertFalse(self.state()[0]["published"])
        clip = f.read_json(self.out / 'manifest.json')['clips'][0]
        self.assertEqual(clip['humanReview']['note'], 'Owner audition approved')


if __name__ == "__main__":
    unittest.main()
