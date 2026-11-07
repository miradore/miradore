// Minimal WAV reader and writer (pure node, no dependencies).
// Reads PCM 8/16/24/32-bit integer and 32/64-bit float, mono or stereo,
// including WAVE_FORMAT_EXTENSIBLE containers. Writes 24-bit PCM stereo.

import { readFileSync, writeFileSync } from 'node:fs';

export function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a RIFF/WAVE file: ${path}`);
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    let size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (body + size > buf.length) size = buf.length - body; // tolerate truncated files
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const sampleRate = buf.readUInt32LE(body + 4);
      const blockAlign = buf.readUInt16LE(body + 12);
      const bits = buf.readUInt16LE(body + 14);
      if (format === 0xfffe && size >= 26) {
        // Extensible: the real format tag is the first two bytes of the sub format GUID
        format = buf.readUInt16LE(body + 24);
      }
      fmt = { format, channels, sampleRate, blockAlign, bits };
    } else if (id === 'data') {
      data = { start: body, size };
    }
    pos = body + size + (size & 1);
    if (fmt && data) break;
  }
  if (!fmt || !data) throw new Error(`Missing fmt or data chunk: ${path}`);
  const { format, channels, sampleRate, bits } = fmt;
  const bytes = bits >> 3;
  const frames = Math.floor(data.size / (bytes * channels));
  const out = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(frames));
  let p = data.start;
  if (format === 1) {
    if (bits === 16) {
      for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { out[c][i] = buf.readInt16LE(p) / 32768; p += 2; }
    } else if (bits === 24) {
      for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
        const v = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
        out[c][i] = (v & 0x800000 ? v - 0x1000000 : v) / 8388608; p += 3;
      }
    } else if (bits === 32) {
      for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { out[c][i] = buf.readInt32LE(p) / 2147483648; p += 4; }
    } else if (bits === 8) {
      for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { out[c][i] = (buf[p] - 128) / 128; p += 1; }
    } else throw new Error(`Unsupported PCM bit depth ${bits}: ${path}`);
  } else if (format === 3) {
    if (bits === 32) {
      for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { out[c][i] = buf.readFloatLE(p); p += 4; }
    } else if (bits === 64) {
      for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { out[c][i] = buf.readDoubleLE(p); p += 8; }
    } else throw new Error(`Unsupported float bit depth ${bits}: ${path}`);
  } else {
    throw new Error(`Unsupported WAV format tag ${format}: ${path}`);
  }
  return { sampleRate, channels: out, frames };
}

// Write a 24-bit PCM stereo WAV. Inputs are Float64Array or Float32Array in [-1, 1].
export function writeWav24(path, left, right, sampleRate) {
  const frames = left.length;
  const dataBytes = frames * 2 * 3;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(2, 22);          // stereo
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 6, 28);
  buf.writeUInt16LE(6, 32);
  buf.writeUInt16LE(24, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  let p = 44;
  const put = (v) => {
    let s = Math.round(Math.max(-1, Math.min(1, v)) * 8388607);
    if (s < 0) s += 0x1000000;
    buf[p++] = s & 0xff; buf[p++] = (s >> 8) & 0xff; buf[p++] = (s >> 16) & 0xff;
  };
  for (let i = 0; i < frames; i++) { put(left[i]); put(right[i]); }
  writeFileSync(path, buf);
}
