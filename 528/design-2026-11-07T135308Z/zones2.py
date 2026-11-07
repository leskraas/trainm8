# Probe 2: the proposed zone ladder. Mark contrast on card and page, the score chip tint
# (zone mixed into card, as score-stanza.tsx does) with foreground text on it, neighbour distance in OKLab,
# and how even the ladder's luminance is (the "glowing / washed-out" check).
import sys, math, json; sys.path.insert(0, '.')
from contrast import cr, parse, hexof, lum, CARD_L, BG_L, CARD_D, BG_D
FG_L='oklch(0.148 0.004 228.8)'; FG_D='oklch(0.987 0.002 197.1)'
TODAY=['#5f9fe0','#3fae7d','#d9b13b','#e08a3c','#d95757']
PROPOSED={
 'light':['oklch(0.6 0.12 250)','oklch(0.59 0.12 160)','oklch(0.65 0.13 95)','oklch(0.61 0.14 58)','oklch(0.55 0.19 22)'],
 'dark': ['oklch(0.72 0.11 250)','oklch(0.72 0.12 160)','oklch(0.76 0.12 95)','oklch(0.74 0.14 58)','oklch(0.67 0.16 22)'],
}
MIX=[22,22,26,24,22]
def lin(c): return parse(c)[0]
def mix(a,b,p):  # color-mix in srgb (gamma-encoded) p% of a
    enc=lambda l:[12.92*x if x<=0.0031308 else 1.055*x**(1/2.4)-0.055 for x in l]
    ea,eb=enc(lin(a)),enc(lin(b)); m=[p/100*x+(1-p/100)*y for x,y in zip(ea,eb)]
    return '#'+''.join(f'{round(x*255):02x}' for x in m)
def oklab(c):
    r,g,b=lin(c)
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b; m=0.2119034982*r+0.6806995451*g+0.1073969566*b; s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=[x**(1/3) for x in (l,m,s)]
    return (0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s, 0.0259040371*l+0.7827717662*m-0.8086757660*s)
def dist(a,b): return math.dist(oklab(a),oklab(b))
out={}
for label,sets in (('today',{'light':TODAY,'dark':TODAY}),('proposed',PROPOSED)):
    for th,vals in sets.items():
        card,bg,fg=(CARD_L,BG_L,FG_L) if th=='light' else (CARD_D,BG_D,FG_D)
        rows=[]
        for i,v in enumerate(vals,1):
            tint=mix(v,card,MIX[i-1])
            rows.append(dict(zone=i,value=v,hex=hexof(v),gamut=parse(v)[1],card=round(cr(v,card),2),page=round(cr(v,bg),2),chip_text=round(cr(fg,tint),2),
                             next=round(dist(v,vals[i]),3) if i<5 else None))
        lums=[cr(r['value'],card) for r in rows]
        out[f'{label} {th}']=dict(rows=rows,spread=round(max(lums)/min(lums),2))
for k,v in out.items():
    print(k,'spread(max/min contrast on card)=',v['spread'])
    for r in v['rows']: print('  ',r)
json.dump(out,open('zones.json','w'),indent=1)
