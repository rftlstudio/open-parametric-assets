import unittest

from demo import url_for


class PinnedDownloads(unittest.TestCase):
    def test_revision_and_paths(self):
        root = "https://huggingface.co/datasets/rftlstudio/open-parametric-assets/resolve/v0.4.0/"
        for path in ("data.jsonl", "mjcf/id/model.xml", "mjcf/id/meshes/door_mark.obj"):
            self.assertEqual(url_for(path), root + path)

    def test_invalid_paths(self):
        for path in ("../outside", "/root", "https://example.org/file", "dir\\file", "x/%2e%2e/y"):
            with self.assertRaises(ValueError):
                url_for(path)
