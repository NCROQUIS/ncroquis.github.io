# 스테이션 제로 기억 전송 워프 효과음 합성 (art.js drawWarp 8.5초 타임라인에 맞춤). 사용: python3 tools/audio/warp_sfx.py out.wav → ffmpeg -i out.wav -b:a 128k assets/audio/warp.mp3
import numpy as np, sys
from scipy.signal import butter, sosfilt, sosfiltfilt
from scipy.io import wavfile

SR = 48000; DUR = 8.5; N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def ss(a, b, x):
    x = np.clip((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x)
def env_ad(x, at, a, d):  # attack/decay envelope at time `at`
    y = np.where(x < at, np.clip(1 - (at - x) / a, 0, 1) ** 2, np.exp(-(x - at) / d)); return y
def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)
def sweep_filter(x, fc, q=4.0, block=256):
    """시간에 따라 중심 주파수가 바뀌는 밴드패스 (블록 단위 상태 유지 SVF)"""
    y = np.zeros_like(x); low = band = 0.0
    for i in range(0, len(x), block):
        f = fc[min(i, len(fc) - 1)]
        g = 2 * np.sin(np.pi * min(f, SR / 6) / SR); damp = 1 / q
        for n in range(i, min(i + block, len(x))):
            hi = x[n] - low - damp * band
            band += g * hi; low += g * band
            y[n] = band
    return y
def phase(freq): return 2 * np.pi * np.cumsum(freq) / SR
def pan(sig, p):  # p: -1..1 (array or scalar)
    p = np.broadcast_to(p, sig.shape)
    return sig * np.cos((p + 1) * np.pi / 4), sig * np.sin((p + 1) * np.pi / 4)
def add(l, r, g=1.0):
    global L, R; L += l * g; R += r * g

# 영상과 같은 속도 곡선
speed = (0.2 + (9 - 0.2) * ss(0.7, 1.6, t)) * (1 - 0.75 * ss(4.6, 6.2, t))
sp = speed / 9

# ── 1) 코어 붕괴 (0~1초): 경보 펄스 + 전기 지직 + 상승 라이저
alarm_f = 520 + 140 * (np.sin(2 * np.pi * 3.2 * t) > 0)
alarm = np.sign(np.sin(phase(alarm_f))) * 0.5 + np.sin(phase(alarm_f * 2)) * 0.3
alarm = lp(alarm, 2500) * (ss(0.0, 0.15, t) * (1 - ss(0.85, 1.0, t))) * (0.6 + 0.4 * np.sin(2 * np.pi * 10 * t))
add(*pan(alarm, -0.15), 0.13); add(*pan(alarm, 0.15), 0.13)
crack = np.zeros(N)
for k in range(46):  # 금 가는 소리: 짧은 전기 크랙
    at = rng.uniform(0.08, 0.98) ** 0.7
    i0 = int(at * SR); ln = int(rng.uniform(0.006, 0.03) * SR)
    seg = rng.standard_normal(ln) * np.exp(-np.linspace(0, 6, ln)) * rng.uniform(0.3, 1.0) * (0.4 + at)
    crack[i0:i0 + ln] += seg[:max(0, min(ln, N - i0))]
crack = hp(crack, 1800)
add(*pan(crack, rng.uniform(-0.6, 0.6)), 0.35)
riser_f = 90 * 2 ** (ss(0.05, 1.0, t) * 3.2)
riser = (np.sin(phase(riser_f)) + 0.5 * np.sin(phase(riser_f * 1.505))) * ss(0.05, 0.98, t) * (t < 1.0)
riser += sweep_filter(rng.standard_normal(N) * (t < 1.05), 200 + 5000 * ss(0.05, 1.0, t), q=3) * 0.8 * ss(0.1, 1.0, t) * (t < 1.0)
add(*pan(riser, 0), 0.22)

# ── 2) 섬광 임팩트 (1.0초): 서브 드롭 + 노이즈 폭발 + 반짝임
def impact(at, gain, bright):
    x = t - at; m = x >= 0
    sub = np.sin(phase(np.where(m, 38 + 120 * np.exp(-np.maximum(x, 0) / 0.05), 0))) * np.exp(-np.maximum(x, 0) / 0.6) * m
    burst = lp(rng.standard_normal(N), 6000) * np.exp(-np.maximum(x, 0) / 0.18) * m
    sh = hp(rng.standard_normal(N), 7000) * np.exp(-np.maximum(x, 0) / 0.5) * m * bright
    add(sub, sub, 0.9 * gain); add(*pan(burst, -0.3), 0.35 * gain); add(*pan(burst[::-1][::-1], 0.3), 0.0)
    l2 = np.roll(burst, 400); add(*pan(l2, 0.35), 0.3 * gain)
    add(*pan(sh, -0.5), 0.12 * gain); add(*pan(np.roll(sh, 700), 0.5), 0.12 * gain)
impact(1.0, 1.0, 1.0)

# ── 3) 워프 질주 (1~5초): 저음 엔진 드론 + 바람 노이즈 + 지나가는 조명 '휙'
tunnel = ss(0.75, 1.2, t) * (1 - ss(4.8, 5.8, t))
drone_f = 42 + 26 * sp
drone = np.sin(phase(drone_f)) + 0.5 * np.sin(phase(drone_f * 2.01)) + 0.25 * np.sin(phase(drone_f * 3.02))
drone = lp(np.tanh(drone * 1.6), 400) * (0.35 + 0.65 * tunnel) * ss(0.7, 1.3, t) * (1 - ss(6.0, 6.8, t))
add(drone, drone, 0.12)
wind_fc = 300 + 2600 * sp
wind = sweep_filter(rng.standard_normal(N), wind_fc, q=1.6)
wind2 = sweep_filter(rng.standard_normal(N), wind_fc * 1.7, q=2.5)
w_env = tunnel * (0.5 + 0.5 * sp)
add(wind * w_env * 0.45, wind2 * w_env * 0.45, 0.36)
# 조명 띠가 지나갈 때 (영상 번쩍임 타이밍: 0.169+0.676k, 0.139+1.532k)
passes = [0.169 + 0.6756 * k for k in range(13)] + [0.139 + 1.532 * k for k in range(5)]
for i, at in enumerate(sorted(passes)):
    if not (1.15 < at < 5.2): continue
    x = t - at; strong = (i % 3 == 0)
    e = np.exp(-(x / 0.13) ** 2) * (1.0 if strong else 0.6)
    fc = np.clip(2400 - 1700 * np.tanh(x / 0.08), 300, 6000)  # 도플러: 높게 왔다가 낮게 사라짐
    w = sweep_filter(rng.standard_normal(N) * (np.abs(x) < 0.5), fc, q=5) * e
    p = np.tanh(x / 0.1) * (1 if i % 2 else -1)
    add(*pan(w, p), 0.30 * float(tunnel[int(at * SR)]))
# 고음 반짝임 (속도선): 무작위 미세 틱
spark = np.zeros(N)
for k in range(220):
    at = rng.uniform(1.1, 5.6); i0 = int(at * SR); ln = int(0.012 * SR)
    f = rng.uniform(3000, 9000); s = np.sin(2 * np.pi * f * np.arange(ln) / SR) * np.exp(-np.linspace(0, 5, ln))
    spark[i0:i0 + ln] += s * rng.uniform(0.2, 1)
sl, sr_ = pan(spark, 0.0); add(np.roll(spark, 0) * 0.5, np.roll(spark, 900) * 0.5, 0.10)

# ── 4) 감속 + 빛 리본 (4.6~7초): 하강 톤 + 반짝이는 패드(오음계)
fall = np.sin(phase(600 * 2 ** (-2.2 * ss(4.5, 6.3, t)))) * ss(4.4, 4.9, t) * (1 - ss(5.9, 6.4, t))
add(*pan(lp(fall, 1500), 0), 0.08)
ribbon = ss(4.5, 5.4, t) * (1 - ss(6.6, 7.2, t))
notes = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99]  # G 오음계
pad_l = np.zeros(N); pad_r = np.zeros(N)
for j, f in enumerate(notes):
    lfo = 1 + 0.004 * np.sin(2 * np.pi * (0.3 + j * 0.07) * t + j)
    trem = 0.5 + 0.5 * np.sin(2 * np.pi * (2.4 + j * 0.31) * t + j * 1.7)
    v = (np.sin(phase(f * lfo)) + 0.3 * np.sin(phase(f * 2 * lfo))) * trem
    pad_l += v * (0.6 if j % 2 else 1.0); pad_r += v * (1.0 if j % 2 else 0.6)
add(pad_l * ribbon, pad_r * ribbon, 0.10)
# 수렴 리버스 스웰 (6.2 → 7.05)
sw = ss(6.2, 7.04, t) ** 2 * (t < 7.05)
rev = sweep_filter(rng.standard_normal(N) * (t > 6.0) * (t < 7.1), 400 + 7000 * ss(6.2, 7.05, t), q=2.5) * sw
rev += np.sin(phase(220 * 2 ** (2 * ss(6.2, 7.05, t)))) * sw * 0.4
add(*pan(rev, 0), 0.35)

# ── 5) 새 코어 점화 (7.05초): 부드러운 임팩트 + 맑은 차임 + 잔향 꼬리
impact(7.05, 0.55, 0.6)
x = t - 7.05; m = x >= 0
chime_l = np.zeros(N); chime_r = np.zeros(N)
for j, (f, dl) in enumerate([(783.99, 0), (1174.66, 0.06), (1567.98, 0.12), (2349.3, 0.18), (523.25, 0)]):
    xx = x - dl; mm = xx >= 0
    v = (np.sin(2 * np.pi * f * xx) + 0.25 * np.sin(2 * np.pi * f * 2.76 * xx)) * np.exp(-np.maximum(xx, 0) / (0.9 + 0.2 * j)) * mm
    chime_l += v * (1.0 if j % 2 else 0.7); chime_r += v * (0.7 if j % 2 else 1.0)
add(chime_l, chime_r, 0.17)
hum = np.sin(phase(np.full(N, 110.0))) * 0.6 + np.sin(phase(np.full(N, 165.0))) * 0.3
add(hum * ss(7.0, 7.4, t) * np.exp(-np.maximum(x, 0) / 1.4) * m, hum * ss(7.0, 7.4, t) * np.exp(-np.maximum(x, 0) / 1.4) * m, 0.12)

# ── 잔향 (간단한 다중 딜레이) + 마스터
def verb(x, seed):
    r = np.random.default_rng(seed); y = np.zeros_like(x)
    for k in range(14):
        d = int(r.uniform(0.02, 0.22) * SR); g = 0.55 * np.exp(-k / 5)
        y[d:] += x[:-d] * g * r.choice([-1, 1])
    return lp(y, 5000)
L2 = L + verb(L, 1) * 0.25; R2 = R + verb(R, 2) * 0.25
mix = np.stack([L2, R2], 1)
mix = hp(mix.T, 28).T
mix *= ((1 - ss(8.1, 8.5, t))[:, None])
mix = mix / np.max(np.abs(mix)) * 1.3
mix = np.tanh(mix) / np.tanh(1.3) * 0.89
wavfile.write(sys.argv[1], SR, (mix * 32767).astype(np.int16))
print('ok', mix.shape)
