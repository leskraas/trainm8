# Probe: Riegel conversions behind the #465 spec's examples.
def riegel(t1, d1, d2, b): return t1 * (d2 / d1) ** b
def fmt(s):
    s = round(s); h, r = divmod(s, 3600); m, s = divmod(r, 60)
    return f"{h}:{m:02}:{s:02}" if h else f"{m}:{s:02}"
def pace(t, d): return fmt(t / (d / 1000)) + "/km"
print("20:00 5k ->")
for d, n in [(10000, "10k"), (21097, "HM"), (42195, "M")]:
    lo, hi = riegel(1200, 5000, d, 1.06), riegel(1200, 5000, d, 1.15)
    print(f"  {n}: b1.06 {fmt(lo)} ({pace(lo,d)})  b1.15 {fmt(hi)} ({pace(hi,d)})  ratio {d/5000:.2f}")
tp = 256  # threshold pace 4:16/km, the same runner's Daniels T / CS (research s2.3)
for minutes in (60, 35):
    d = minutes * 60 / (tp / 1000)
    t5 = riegel(minutes * 60, d, 5000, 1.06)
    print(f"threshold 4:16/km read as {minutes}-min result ({d/1000:.2f} km): 5k {fmt(t5)} ({pace(t5,5000)})")
