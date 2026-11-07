# Probe: the inverse of the Race Equivalence ladder (Riegel 1.06) for a 20:00 5k athlete.
import math
A={'1500m':1500,'3k':3000,'5k':5000,'10k':10000,'hm':21097,'marathon':42195}
src_d,src_t=5000,1200
def anchor_pace(d): return src_t*(d/src_d)**1.06/(d/1000)
P={k:anchor_pace(d) for k,d in A.items()}
fmt=lambda s:(lambda r:f"{r//60}:{r%60:02d}")(round(s))
print("anchor paces:",{k:fmt(v) for k,v in P.items()})
def inverse(p):
    if p < P['1500m']*(1-1e-9): return 'faster than 1500 m pace: no race position'
    if P['marathon']/p < 0.85: return 'slower than 85 % marathon pace: zone'
    k=min(P,key=lambda k:abs(math.log(P[k]/p)))
    pct=round(100*P[k]/p); back=P[k]/(pct/100)
    return f"{pct} % {k} (round trip {fmt(back)}/km)"
for s in [240,255,250,260,210,330,300,225]:
    print(fmt(s),'->',inverse(s))
