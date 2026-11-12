# Packs every one-shot WAV in a folder into one sprite WAV, with 0.15s of
# silence between clips, and prints a TS map of name -> [start, duration].
import sys, wave, numpy as np, os, json
src, out_wav = sys.argv[1], sys.argv[2]
names = [n[:-4] for n in sorted(os.listdir(src)) if n.endswith(".wav") and n not in ("ocean.wav", "fire.wav")]
SR = 44100; gap = np.zeros(int(0.15*SR), dtype=np.int16)
parts, cursor, table = [gap], len(gap), {}
for n in names:
    w = wave.open(os.path.join(src, n + ".wav")); assert w.getnchannels() == 1 and w.getframerate() == SR
    d = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    table[n] = [round(cursor/SR, 4), round(len(d)/SR, 4)]
    parts += [d, gap]; cursor += len(d) + len(gap)
w = wave.open(out_wav, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(np.concatenate(parts).tobytes()); w.close()
print(json.dumps(table, indent=2))
