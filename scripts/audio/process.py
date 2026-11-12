import sys, wave, numpy as np, os
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
SR = 44100
def read(name):
    w = wave.open(os.path.join(src, name)); ch = w.getnchannels()
    d = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return d.reshape(-1, ch)
def write(name, d):
    d = np.clip(d, -1, 1)
    w = wave.open(os.path.join(out, name), "wb"); w.setnchannels(d.shape[1]); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((d * 32767).astype(np.int16).tobytes()); w.close()
    print(f"{name}: {len(d)/SR:.3f}s peak {20*np.log10(np.abs(d).max()+1e-9):.1f} dB rms {20*np.log10(np.sqrt(np.mean(d**2))):.1f} dB")
def loop(d, start, length, xfade):
    a, L, X = int(start*SR), int(length*SR), int(xfade*SR)
    seg = d[a:a+L+X].copy()
    t = np.linspace(0, np.pi/2, X)[:, None]
    body = seg[:L].copy()
    # The tail after L is blended into the head (equal power), so the end flows into the start.
    body[:X] = seg[:X] * np.sin(t) + seg[L:L+X] * np.cos(t)
    return body
def rms_to(d, db, ceil=-1):
    d = d * (10**(db/20) / np.sqrt(np.mean(d**2)))
    return d * min(1, 10**(ceil/20) / np.abs(d).max())
def peak_to(d, db): return d * (10**(db/20) / np.abs(d).max())
def trim(d, thresh_db=-50, pad=0.01):
    e = np.abs(d).max(axis=1); idx = np.where(e > 10**(thresh_db/20))[0]
    a = max(0, idx[0] - int(pad*SR)); b = min(len(d), idx[-1] + int(pad*SR)); return d[a:b]
def fade(d, fin=0.003, fout=0.03):
    d = d.copy(); i, o = int(fin*SR), int(fout*SR)
    if i: d[:i] *= np.linspace(0, 1, i)[:, None]
    if o: d[-o:] *= np.linspace(1, 0, o)[:, None]
    return d

write("ocean.wav", rms_to(loop(read("ocean_st.wav"), 60, 24, 4), -20))
write("fire.wav", rms_to(loop(read("fire.wav"), 8, 14, 3), -20))
for n in ("a1", "a3"):
    write(f"gull-{n[1]}.wav", peak_to(fade(trim(read(f"{n}.wav")), 0.005, 0.15), -3))
sand = read("sand.wav")
for i, t in enumerate([0.18, 2.02, 3.84, 5.06]):
    s = sand[int(t*SR):int((t+0.34)*SR)]
    write(f"step-sand-{i}.wav", rms_to(fade(s, 0.004, 0.12), -21, -2))
for n, o in [("bookOpen", "popup-open"), ("bookClose", "popup-close"), ("glass_002", "arrive"), ("click_002", "click")]:
    write(f"{o}.wav", peak_to(fade(trim(read(f"{n}.wav"), -60, 0.002), 0.001, 0.01 if n!="click_002" else 0.002), -3))
