import asyncio, base64, json
from playwright.async_api import async_playwright
JS = r"""
async (job) => {
  const A = NBQ.A, sr = 44100, dur = job.dur;
  const ctx = new OfflineAudioContext(2, sr * dur, sr);
  A.ctx = ctx; A.master = ctx.createGain(); A.master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor(); A.master.connect(comp); comp.connect(ctx.destination);
  A.noiseBuf = ctx.createBuffer(1, sr, sr); const d = A.noiseBuf.getChannelData(0); for (let i = 0; i < sr; i++) d[i] = Math.random() * 2 - 1;
  let info = {};
  if (job.kind === "clear") { const s = A.music(job.stars); info = { beat: s.beat, t0: s.t0 }; }
  else { const tr = A.BGM[job.idx], bus = ctx.createGain(); bus.gain.value = 0.42; bus.connect(A.master); const sd = 60 / tr.bpm / 4, mm = { tr, bus }, L = tr.steps || 128; for (let s = 0; s < L && 0.1 + s * sd < dur; s++) A.bgmStep(mm, s, 0.1 + s * sd, sd); info = { bpm: tr.bpm, name: tr.name, loopSec: L * sd }; }
  const buf = await ctx.startRendering(), ch = buf.getChannelData(0);
  let sum = 0, peak = 0; for (let i = 0; i < ch.length; i++) { sum += ch[i] * ch[i]; peak = Math.max(peak, Math.abs(ch[i])); }
  // energy envelope in 50ms windows, to find the big hit
  const win = sr * 0.05, env = []; for (let i = 0; i < ch.length; i += win) { let e = 0; for (let j = i; j < i + win && j < ch.length; j++) e += ch[j] * ch[j]; env.push(Math.sqrt(e / win)); }
  // 16-bit wav
  const n = ch.length, b = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, "data"); b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 32767, true);
  let bin = ""; const u8 = new Uint8Array(b.buffer); for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return { info, rms: Math.sqrt(sum / ch.length), peak, env, wav: btoa(bin) };
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(locale="ko-KR")
        await pg.goto("file:///home/claude/neon-brick/index.html"); await pg.wait_for_timeout(500)
        jobs = [("clear-1star", {"kind":"clear","stars":1,"dur":6}), ("clear-2star", {"kind":"clear","stars":2,"dur":6}), ("clear-3star", {"kind":"clear","stars":3,"dur":6}),
                ("bgm-1-neon-city", {"kind":"bgm","idx":0,"dur":20}), ("bgm-2-midnight-drive", {"kind":"bgm","idx":1,"dur":18}), ("bgm-3-arcade-loop", {"kind":"bgm","idx":2,"dur":16}), ("bgm-0-neon-lobby", {"kind":"bgm","idx":3,"dur":21}), ("bgm-4-neon-drop-edm", {"kind":"bgm","idx":4,"dur":31})]
        res = {}; ok = 0; bad = 0
        for name, job in jobs:
            r = await pg.evaluate(JS, job)
            open(f"audio/{name}.wav", "wb").write(base64.b64decode(r["wav"]))
            line = f"{name}: rms {r['rms']:.3f} peak {r['peak']:.2f} {json.dumps(r['info'])}"
            good = r["rms"] > 0.01 and r["peak"] < 1.0
            if job["kind"] == "clear":
                hit = r["info"]["t0"] + 8 * r["info"]["beat"]; env = r["env"]; i = int(hit / 0.05)
                before = sum(env[max(0, i - 6):i - 1]) / 5; after = max(env[i:i + 4])
                line += f" | final hit at {hit:.2f}s (beat 8), energy jump x{after / max(before, 1e-6):.2f}"
                good = good and after > before
            if name.startswith("bgm-4"):
                env = r["env"]; sec = lambda a, b: sum(env[int(a / 0.05):int(b / 0.05)]) / max(1, int(b / 0.05) - int(a / 0.05))
                sd = 60 / 128 / 4; bar = 16 * sd; t0 = 0.1
                intro, b1, b2, drop = sec(t0, t0 + 4 * bar), sec(t0 + 4 * bar, t0 + 6 * bar), sec(t0 + 6 * bar, t0 + 8 * bar), sec(t0 + 8 * bar, t0 + 16 * bar)
                line += f" | intro {intro:.3f} → build {b1:.3f}/{b2:.3f} → drop {drop:.3f}"
                good = good and drop > intro * 1.3 and b2 > b1
                # pump: inside each drop beat, energy just after the kick tail vs. just before the next kick
                beat = 4 * sd; dips = []
                for k in range(32, 64):
                    tb = t0 + k * beat; early = sec(tb + 0.10, tb + 0.15); late = sec(tb + beat - 0.08, tb + beat - 0.03); dips.append(late / max(early, 1e-6))
                swell = sorted(dips)[len(dips) // 2]
                line += f" | sidechain swell x{swell:.2f}"
                good = good and swell > 1.05
            res[name] = r["info"]; print(("PASS " if good else "FAIL ") + line); ok += good; bad += (not good)
        beats = sorted(set(round(res[k]["beat"], 3) for k in res if k.startswith("clear")))
        d = len(beats) == 3; print(("PASS" if d else "FAIL") + f" three clear songs have different tempos {beats}"); ok += d; bad += (not d)
        await b.close(); print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
