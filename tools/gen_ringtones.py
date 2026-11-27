"""生成经典铃声 WAV（纯标准库，无第三方依赖）。

生成 4 段内置铃声到 sounds/：
  classic.wav  老式电话双音（经典 ringing）
  default.wav  系统三音提示（tri-tone）
  radar.wav    雷达声呐扫频
  alarm.wav    急促闹铃
运行：python tools/gen_ringtones.py
"""
import math
import os
import struct
import wave

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'sounds'))
os.makedirs(OUT, exist_ok=True)


def env(t, dur, attack=0.01, release=0.03):
    if t < attack:
        return t / attack
    if t > dur - release:
        return max(0.0, (dur - t) / release)
    return 1.0


def write(name, samples):
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b''.join(
            struct.pack('<h', int(max(-1.0, min(1.0, s)) * 32767))
            for s in samples
        )
        w.writeframes(frames)
    print('%-14s %4.1fs %6.0fKB' % (name, len(samples) / SR, len(frames) / 1024))


def classic():
    """老式电话双音 440+480Hz，响-停-响-停-响。"""
    dur = 4.2
    ranges = [(0.0, 1.3), (1.7, 3.0), (3.4, 4.2)]
    out = []
    for i in range(int(SR * dur)):
        t = i / SR
        v = 0.0
        for a, b in ranges:
            if a <= t < b:
                e = env(t - a, b - a, 0.02, 0.05)
                v = e * (math.sin(2 * math.pi * 440 * t)
                         + math.sin(2 * math.pi * 480 * t)) * 0.42
                v += e * math.sin(2 * math.pi * 880 * t) * 0.07
                break
        out.append(v)
    return out


def tri_tone():
    """系统三音：C6-E6-G6，重复三轮。"""
    notes = [1046.5, 1318.5, 1568.0]
    seq = []
    for _ in range(3):
        for f in notes:
            seq.append((f, 0.20))
        seq.append((0.0, 0.32))
    out = []
    for f, d in seq:
        for i in range(int(SR * d)):
            t = i / SR
            if f == 0:
                out.append(0.0)
            else:
                e = env(t, d, 0.008, 0.045)
                out.append(e * (math.sin(2 * math.pi * f * t)
                                + 0.22 * math.sin(4 * math.pi * f * t)) * 0.40)
    return out


def radar():
    """雷达声呐：指数扫频 1400->500Hz，带回声。"""
    sweep, gap = 0.45, 0.32
    f0, f1 = 1400.0, 500.0
    r = f1 / f0
    dry = []
    for _ in range(4):
        for i in range(int(SR * sweep)):
            t = i / SR
            phase = 2 * math.pi * f0 * (r ** (t / sweep) - 1) / (math.log(r) / sweep)
            e = env(t, sweep, 0.005, 0.09)
            dry.append(e * math.sin(phase) * 0.42)
        dry.extend([0.0] * int(SR * gap))
    delay = int(SR * 0.09)
    out = list(dry)
    for i, v in enumerate(dry):
        if i + delay < len(out):
            out[i + delay] += v * 0.28
    return out


def alarm():
    """急促闹铃：880/660Hz 交替短促 beep。"""
    dur, beep = 3.0, 0.13
    out = []
    for i in range(int(SR * dur)):
        t = i / SR
        idx = int(t / beep)
        local = t % beep
        f = 880.0 if idx % 2 == 0 else 660.0
        e = env(local, beep, 0.004, 0.025)
        out.append(e * (math.sin(2 * math.pi * f * local)
                        + 0.28 * math.sin(4 * math.pi * f * local)) * 0.38)
    return out


if __name__ == '__main__':
    write('classic.wav', classic())
    write('default.wav', tri_tone())
    write('radar.wav', radar())
    write('alarm.wav', alarm())
