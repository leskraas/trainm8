# Probe: choose zone-1..5 light and dark values. Each must be >= 3:1 on card as a mark (WCAG 1.4.11),
# keep the hue ladder of today's hex values, and stay inside sRGB.
import sys; sys.path.insert(0, '.')
from contrast import cr, parse, hexof, CARD_L, BG_L, CARD_D, BG_D
import math
today = ['#5f9fe0','#3fae7d','#d9b13b','#e08a3c','#d95757']
# today's hues in OKLCH (approx) for reference
def to_oklch(hexv):
    v=[int(hexv[i:i+2],16)/255 for i in (1,3,5)]
    lin=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in v]
    r,g,b=lin
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b; m=0.2119034982*r+0.6806995451*g+0.1073969566*b; s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=[x**(1/3) for x in (l,m,s)]
    L=0.2104542553*l+0.7936177850*m-0.0040720468*s; A=1.9779984951*l-2.4285922050*m+0.4505937099*s; B=0.0259040371*l+0.7827717662*m-0.8086757660*s
    return L, math.hypot(A,B), math.degrees(math.atan2(B,A))%360
for h in today:
    L,C,H=to_oklch(h); print(h,'oklch(%.3f %.3f %.1f)'%(L,C,H),'cardL %.2f cardD %.2f'%(cr(h,CARD_L),cr(h,CARD_D)))
cands = {
 'light': ['oklch(0.58 0.13 252)','oklch(0.58 0.12 160)','oklch(0.6 0.12 88)','oklch(0.6 0.15 55)','oklch(0.56 0.17 25)'],
 'dark':  ['oklch(0.7 0.11 252)','oklch(0.7 0.12 160)','oklch(0.78 0.12 88)','oklch(0.72 0.13 55)','oklch(0.68 0.14 25)'],
}
for th,vals in cands.items():
    card = CARD_L if th=='light' else CARD_D; bg = BG_L if th=='light' else BG_D
    for i,v in enumerate(vals,1):
        _,ok = parse(v)
        print(th,i,v,hexof(v),'card %.2f bg %.2f'%(cr(v,card),cr(v,bg)),'in-gamut' if ok else 'OUT OF GAMUT')
