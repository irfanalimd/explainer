// WebM muxer tests: EBML encoding, structure, timestamps, cues pointing at clusters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { muxWebM, readEBML, readUint, vint, ID } from "./webm.mjs";

test("vint uses the shortest length and never the all-ones value", () => {
  assert.deepEqual([...vint(0)], [0x80]);
  assert.deepEqual([...vint(126)], [0xfe]);
  assert.deepEqual([...vint(127)], [0x40, 0x7f]);     // 0xff would mean "unknown size"
  assert.deepEqual([...vint(300)], [0x41, 0x2c]);
  assert.deepEqual([...vint(5, 8)], [0x01, 0, 0, 0, 0, 0, 0, 5]);
});

test("muxes a seekable file: header, info duration, track, clusters at keyframes, cues", () => {
  const fps = 30;
  const frames = Array.from({ length: 95 }, (_, n) => ({ data: new Uint8Array([n & 255, 1, 2, 3]), key: n % 30 === 0, timestamp: Math.round((n * 1e6) / fps) }));
  const buf = muxWebM({ width: 1280, height: 720, fps, frames, colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false } });
  const [ebml, seg] = readEBML(buf);
  assert.equal(ebml.id, ID.EBML);
  assert.equal(ebml.children.find((c) => c.id === ID.DocType).data.toString(), "webm");
  assert.equal(seg.id, ID.Segment);
  assert.equal(seg.dataStart + seg.size, buf.length);
  const kids = seg.children, find = (id) => kids.find((c) => c.id === id);
  const info = find(ID.Info);
  assert.equal(readUint(info.children.find((c) => c.id === ID.TimecodeScale).data), 1e6);
  const dur = info.children.find((c) => c.id === ID.Duration).data.readDoubleBE(0);
  assert.ok(Math.abs(dur - (Math.round((94 * 1000) / 30) + 1000 / 30)) < 1e-9);
  const video = find(ID.Tracks).children[0].children.find((c) => c.id === ID.Video);
  assert.equal(readUint(video.children.find((c) => c.id === ID.PixelWidth).data), 1280);
  assert.equal(readUint(video.children.find((c) => c.id === ID.PixelHeight).data), 720);
  const clusters = kids.filter((c) => c.id === ID.Cluster);
  assert.equal(clusters.length, 4);
  let n = 0;
  for (const c of clusters) {
    const tc = readUint(c.children[0].data);
    for (const b of c.children.slice(1)) {
      assert.equal(b.data[0], 0x81);
      assert.equal(tc + b.data.readInt16BE(1), Math.round((n * 1000) / 30));
      assert.equal(!!(b.data[3] & 0x80), n % 30 === 0);
      assert.equal(b.data[4], n & 255);
      n++;
    }
  }
  assert.equal(n, 95);
  // SeekHead and Cues positions are relative to the segment data start
  const seeks = find(ID.SeekHead).children.map((s) => ({ id: readUint(s.children[0].data), pos: readUint(s.children[1].data) }));
  for (const s of seeks) assert.equal(kids.find((c) => c.start - seg.dataStart === s.pos)?.id, s.id);
  const cues = find(ID.Cues).children;
  assert.equal(cues.length, 4);
  for (const [i, cp] of cues.entries()) {
    const pos = readUint(cp.children[1].children[1].data);
    assert.equal(clusters[i].start - seg.dataStart, pos);
  }
});
