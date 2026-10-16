// A minimal WebM (Matroska/EBML) muxer for one video track, plus a reader for tests. No dependencies.
// Output is a complete, seekable file: EBML header, Segment { SeekHead, Info (with Duration), Tracks,
// Clusters (one per keyframe) of SimpleBlocks, Cues }. Timestamps are in milliseconds (TimecodeScale 1 ms).

export const ID = {
  EBML: 0x1a45dfa3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42f7, EBMLMaxIDLength: 0x42f2, EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
  Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimecodeScale: 0x2ad7b1, Duration: 0x4489, MuxingApp: 0x4d80, WritingApp: 0x5741,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83, FlagLacing: 0x9c,
  CodecID: 0x86, CodecPrivate: 0x63a2, DefaultDuration: 0x23e383, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba,
  Colour: 0x55b0, MatrixCoefficients: 0x55b1, Range: 0x55b9, TransferCharacteristics: 0x55ba, Primaries: 0x55bb,
  Cluster: 0x1f43b675, Timecode: 0xe7, SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1,
};
const MASTER = new Set([ID.EBML, ID.Segment, ID.SeekHead, ID.Seek, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Colour, ID.Cluster, ID.Cues, ID.CuePoint, ID.CueTrackPositions]);

function idBytes(id) {
  const n = id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1;
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[n - 1 - i] = Math.floor(id / 256 ** i) & 0xff;
  return b;
}

export function vint(n, len) {
  if (!len) { len = 1; while (n >= 2 ** (7 * len) - 1) len++; }
  if (len > 8) throw new Error("EBML size too large");
  const b = Buffer.alloc(len);
  let v = n;
  for (let i = len - 1; i >= 0; i--) { b[i] = v % 256; v = Math.floor(v / 256); }
  b[0] |= 0x80 >> (len - 1);
  return b;
}

const uint = (v, len) => {
  if (!len) { len = 1; while (v >= 256 ** len) len++; }
  const b = Buffer.alloc(len);
  let x = v;
  for (let i = len - 1; i >= 0; i--) { b[i] = x % 256; x = Math.floor(x / 256); }
  return b;
};
const f64 = (v) => { const b = Buffer.alloc(8); b.writeDoubleBE(v); return b; };
const str = (s) => Buffer.from(s, "utf8");

export function el(id, payload) {
  const body = Array.isArray(payload) ? Buffer.concat(payload) : payload;
  return Buffer.concat([idBytes(id), vint(body.length), body]);
}

// WebCodecs VideoColorSpaceInit -> Matroska Colour codes
const PRIMARIES = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRANSFER = { bt709: 1, smpte170m: 6, linear: 8, "iec61966-2-1": 13, pq: 16, hlg: 18 };
const MATRIX = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, "bt2020-ncl": 9 };

/**
 * @param {{ width:number, height:number, fps:number, codec?:string, codecPrivate?:Uint8Array, colorSpace?:object,
 *           frames: { data: Uint8Array, key: boolean, timestamp: number /* microseconds *\/ }[], app?: string }} o
 * @returns {Buffer}
 */
export function muxWebM({ width, height, fps, codec = "V_VP9", codecPrivate, colorSpace, frames, app = "explainer" }) {
  if (!frames.length) throw new Error("no frames to mux");
  const frameMs = 1000 / fps;
  const ms = (us) => Math.round(us / 1000);
  const header = el(ID.EBML, [
    el(ID.EBMLVersion, uint(1)), el(ID.EBMLReadVersion, uint(1)), el(ID.EBMLMaxIDLength, uint(4)), el(ID.EBMLMaxSizeLength, uint(8)),
    el(ID.DocType, str("webm")), el(ID.DocTypeVersion, uint(4)), el(ID.DocTypeReadVersion, uint(2)),
  ]);
  const last = frames[frames.length - 1];
  const info = el(ID.Info, [
    el(ID.TimecodeScale, uint(1000000)), el(ID.Duration, f64(ms(last.timestamp) + frameMs)),
    el(ID.MuxingApp, str(app)), el(ID.WritingApp, str(app + " record.mjs")),
  ]);
  const colour = [];
  if (colorSpace) {
    if (colorSpace.matrix in MATRIX) colour.push(el(ID.MatrixCoefficients, uint(MATRIX[colorSpace.matrix])));
    if (colorSpace.fullRange != null) colour.push(el(ID.Range, uint(colorSpace.fullRange ? 2 : 1)));
    if (colorSpace.transfer in TRANSFER) colour.push(el(ID.TransferCharacteristics, uint(TRANSFER[colorSpace.transfer])));
    if (colorSpace.primaries in PRIMARIES) colour.push(el(ID.Primaries, uint(PRIMARIES[colorSpace.primaries])));
  }
  const tracks = el(ID.Tracks, el(ID.TrackEntry, [
    el(ID.TrackNumber, uint(1)), el(ID.TrackUID, uint(1)), el(ID.TrackType, uint(1)), el(ID.FlagLacing, uint(0)),
    el(ID.CodecID, str(codec)), ...(codecPrivate?.length ? [el(ID.CodecPrivate, Buffer.from(codecPrivate))] : []),
    el(ID.DefaultDuration, uint(Math.round(1e9 / fps))),
    el(ID.Video, [el(ID.PixelWidth, uint(width)), el(ID.PixelHeight, uint(height)), ...(colour.length ? [el(ID.Colour, colour)] : [])]),
  ]));
  // clusters: a new one at every keyframe (and at least every 30 s, the int16 block timecode limit)
  const clusters = [];
  let cur = null;
  for (const f of frames) {
    const t = ms(f.timestamp);
    if (!cur || f.key || t - cur.time > 30000) clusters.push((cur = { time: t, key: f.key, blocks: [] }));
    const head = Buffer.alloc(4);
    head[0] = 0x81;                          // track 1 as a 1-byte vint
    head.writeInt16BE(t - cur.time, 1);
    head[3] = f.key ? 0x80 : 0;
    cur.blocks.push(el(ID.SimpleBlock, [head, Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength)]));
  }
  const clusterBufs = clusters.map((c) => el(ID.Cluster, [el(ID.Timecode, uint(c.time)), ...c.blocks]));
  // SeekHead with fixed-width positions, so its size is known before the offsets are
  const seekHead = (pos) => el(ID.SeekHead, [[ID.Info, pos.info], [ID.Tracks, pos.tracks], [ID.Cues, pos.cues]].map(([id, p]) =>
    el(ID.Seek, [el(ID.SeekID, idBytes(id)), el(ID.SeekPosition, uint(p, 8))])));
  const shLen = seekHead({ info: 0, tracks: 0, cues: 0 }).length;
  const pos = { info: shLen, tracks: shLen + info.length };
  let at = pos.tracks + tracks.length;
  const clusterPos = clusterBufs.map((b) => { const p = at; at += b.length; return p; });
  pos.cues = at;
  const cues = el(ID.Cues, clusters.map((c, i) => c.key ? el(ID.CuePoint, [el(ID.CueTime, uint(c.time)),
    el(ID.CueTrackPositions, [el(ID.CueTrack, uint(1)), el(ID.CueClusterPosition, uint(clusterPos[i]))])]) : null).filter(Boolean));
  const body = Buffer.concat([seekHead(pos), info, tracks, ...clusterBufs, cues]);
  return Buffer.concat([header, idBytes(ID.Segment), vint(body.length, 8), body]);
}

/** Parse an EBML buffer into a tree [{ id, start, dataStart, size, children? | data }] (for tests and checks). */
export function readEBML(buf, start = 0, end = buf.length) {
  const out = [];
  let i = start;
  while (i < end) {
    const s = i;
    let len = 1; while (len <= 4 && !(buf[i] & (0x80 >> (len - 1)))) len++;
    let id = 0; for (let k = 0; k < len; k++) id = id * 256 + buf[i + k];
    i += len;
    let sl = 1; while (sl <= 8 && !(buf[i] & (0x80 >> (sl - 1)))) sl++;
    let size = buf[i] & (0xff >> sl); for (let k = 1; k < sl; k++) size = size * 256 + buf[i + k];
    i += sl;
    const node = { id, start: s, dataStart: i, size };
    if (MASTER.has(id)) node.children = readEBML(buf, i, i + size);
    else node.data = buf.subarray(i, i + size);
    out.push(node);
    i += size;
  }
  return out;
}
export const readUint = (b) => { let v = 0; for (const x of b) v = v * 256 + x; return v; };
