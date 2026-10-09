"""Regression checks for WEB status and publication gates, without TTS models."""
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

import web_narration as w


class WebNarrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.out = Path(self.temp.name)
        self.repo = self.out / 'repo'
        self.registry = self.repo / 'data/narration-web-louise.json'
        self.verse = {'id': 'JHN.11.35', 'book': 'JHN', 'chapter': 11, 'verse': 35,
                      'text': 'Jesus wept.', 'reference': 'John 11:35'}
        w.write_json(self.out / 'settings.json', {'config': {'voice': 'louise'}, 'configId': 'a' * 16})
        w.write_json(self.out / 'take-sources.json', {self.verse['id']: {
            'textSha256': w.digest(self.verse['text'].encode()), 'configId': 'a' * 16,
            'synthesisTextSha256': w.digest(self.verse['text'].encode()), 'preprocessing': 'web-display-markup/1'}})
        self.wav = self.out / 'takes/jhn-11-35.wav'
        self.wav.parent.mkdir()
        self.patches = [patch.object(w, 'ROOT', self.repo), patch.object(w, 'REGISTRY', self.registry),
                        patch.object(w, 'verses', return_value=[self.verse])]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()

    def audio(self, frequency=440):
        with wave.open(str(self.wav), 'wb') as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(32000)
            stream.writeframes(b''.join(struct.pack('<h', int(4000 * math.sin(i * frequency / 32000 * 2 * math.pi))) for i in range(32000)))

    def row(self):
        return w.collect(self.out)['verses'][0]

    def checked(self, issues=None):
        row = self.row()
        w.write_json(self.out / 'checks.json', {row['id']: {
            **{k: row[k] for k in ('wavSha256', 'textSha256', 'configId')}, 'issues': issues or []}})

    def test_added_verses_are_missing_and_changed_source_is_stale(self):
        self.audio()
        added = {**self.verse, 'id': 'JHN.11.36', 'verse': 36, 'text': 'See how he loved him!'}
        with patch.object(w, 'verses', return_value=[self.verse, added]):
            self.assertEqual([r['status'] for r in w.collect(self.out)['verses']], ['generated', 'missing'])
        with patch.object(w, 'verses', return_value=[{**self.verse, 'text': 'Jesus cried.'}]):
            self.assertEqual(self.row()['status'], 'stale')

    def test_a_retake_invalidates_check_and_owner_approval(self):
        self.audio()
        self.checked()
        w.review(self.out, self.verse['id'], 'Owner audition approved')
        self.assertEqual(self.row()['status'], 'reviewed')
        self.audio(220)
        self.assertEqual(self.row()['status'], 'generated')
        self.assertNotIn('humanReview', self.row())

    def test_new_english_audio_does_not_inherit_the_chinese_approval(self):
        self.audio()
        self.checked()
        self.assertEqual(self.row()['status'], 'checked')
        self.assertNotIn('humanReview', self.row())
        self.assertFalse(self.row()['published'])

    def test_silent_corrupt_or_wrong_config_audio_is_not_ready(self):
        self.audio(0)
        self.assertEqual(self.row()['status'], 'invalid')
        self.wav.write_bytes(b'not audio')
        self.assertEqual(self.row()['status'], 'invalid')
        self.audio()
        w.write_json(self.out / 'settings.json', {'config': {'voice': 'louise'}, 'configId': 'b' * 16})
        self.assertEqual(self.row()['status'], 'stale')

    def test_known_older_reference_configuration_is_retained_per_take(self):
        self.audio()
        w.write_json(self.out / 'settings.json', {'config': {'voice': 'louise'}, 'configId': 'b' * 16,
            'configs': {'a' * 16: {'voice': 'louise'}, 'b' * 16: {'voice': 'louise', 'shortReference': True}}})
        self.assertEqual(self.row()['status'], 'generated')
        self.assertEqual(self.row()['configId'], 'a' * 16)

    def test_unchecked_or_suspect_takes_are_excluded_from_the_public_catalog(self):
        self.audio()
        w.package(self.out)
        self.assertEqual(w.read_json(self.out / 'manifest.json')['clips'], [])
        self.checked(['missing word'])
        w.package(self.out)
        self.assertEqual(w.read_json(self.out / 'manifest.json')['clips'], [])
        self.assertEqual(self.row()['status'], 'needs_review')

    def test_package_contains_checked_audio_and_does_not_claim_publication(self):
        self.audio()
        self.checked()
        w.package(self.out)
        release = w.read_json(self.repo / 'data/narration-web-louise-release.json')
        self.assertTrue(release['enabled'])
        self.assertTrue(release['clips'][0]['url'].startswith('/audio/web-louise/'))
        for item in w.read_json(self.out / 'static-release.json')['objects']:
            self.assertEqual(w.file_digest(Path(item['source'])), item['sha256'])
        self.assertEqual(self.row()['status'], 'checked')
        self.assertFalse(self.row()['published'])
        self.assertEqual(w.read_json(self.out / 'manifest.json')['license'], 'Public Domain')

    def test_stale_publication_cannot_override_a_current_content_warning(self):
        self.audio()
        self.checked()
        w.package(self.out)
        row = self.row()
        row.update(status='published', published=True)
        w.write_json(self.registry, {'verses': [row]})
        self.assertEqual(self.row()['status'], 'published')
        self.checked(['missing word'])
        self.assertEqual(self.row()['status'], 'needs_review')
        self.assertFalse(self.row()['published'])

    def test_owner_review_requires_valid_known_takes(self):
        with self.assertRaises(ValueError): w.review(self.out, 'JHN.11.36', 'Confirmed')
        with self.assertRaises(ValueError): w.review(self.out, self.verse['id'], 'Confirmed')

    def test_apostrophe_typography_is_accepted_without_hiding_word_changes(self):
        result = {'heard': "God's people", 'extra': [], 'odd': [], 'gap': 0}
        self.assertTrue(w.audit_words(result, 'God’s people')['wordExact'])
        self.assertFalse(w.audit_words(result, 'God’s beloved people')['wordExact'])
        self.assertFalse(w.audit_words(result, 'Gods people')['wordExact'])

    def test_known_compound_spacing_is_accepted_but_a_missing_prefix_is_not(self):
        result = {'heard': 'the bond servant of sin', 'extra': [], 'odd': [], 'gap': 0}
        self.assertTrue(w.audit_words(result, 'the bondservant of sin')['wordExact'])
        self.assertFalse(w.audit_words({**result, 'heard': 'the servant of sin'}, 'the bondservant of sin')['wordExact'])

    def test_clause_pacing_preserves_all_source_words(self):
        text = 'in which you once walked, according to the course of this world,.'
        chunks = w.synthesis_chunks(text, True)
        self.assertEqual(chunks, ['In which you once walked.', 'According to the course of this world.'])
        result = {'heard': ' '.join(chunks), 'extra': [], 'odd': [], 'gap': 0}
        self.assertTrue(w.audit_words(result, text)['wordExact'])

    def test_word_emphasis_changes_case_without_changing_words_or_word_boundaries(self):
        text = 'whom God sent to be an atoning sacrifice through faith, for a demonstration.'
        chunks = w.synthesis_chunks(text, emphasize='whom,to,an,through,a')
        self.assertEqual(chunks, ['WHOM God sent TO be AN atoning sacrifice THROUGH faith, for A demonstration.'])
        result = {'heard': ' '.join(chunks), 'extra': [], 'odd': [], 'gap': 0}
        self.assertTrue(w.audit_words(result, text)['wordExact'])


if __name__ == '__main__': unittest.main()
