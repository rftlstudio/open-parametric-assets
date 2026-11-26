from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import demo

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

    def test_selected_model_download_and_cache(self):
        fixture = demo.HERE / "models/physical"
        model = demo.mj.MjModel.from_xml_path(str(fixture / "model.xml"))
        record = demo.metadata(model)
        prefix = f"mjcf/{record['id']}/"
        record["mjcf_path"] = prefix + "model.xml"
        manifest = [{"tasks": [{"id": "unrelated"}]}, record]
        paths = ["model.xml", *(m.attrib["file"] for m in ET.parse(fixture / "model.xml").findall("asset/mesh"))]
        responses = {url_for(prefix + path): (fixture / path).read_bytes() for path in paths}
        responses[url_for("data.jsonl")] = "\n".join(map(json.dumps, manifest)).encode()
        with TemporaryDirectory() as tmp, patch.object(demo, "CACHE", Path(tmp)), patch.object(
            demo, "urlopen", side_effect=lambda url, timeout: BytesIO(responses[url])
        ) as download:
            for _ in range(2):
                [(path, task)] = demo.model_paths([demo.START[0]], online=True)
                self.assertEqual(task, demo.START[0])
                self.assertEqual(demo.metadata(demo.mj.MjModel.from_xml_path(str(path)))["id"], record["id"])
            self.assertEqual([call.args[0] for call in download.call_args_list],
                             [url_for("data.jsonl"), *(url_for(prefix + p) for p in paths)])
