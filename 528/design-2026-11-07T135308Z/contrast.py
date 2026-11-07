# WCAG 2 contrast for hex and oklch colours; used to choose zone light/dark values.
import math, sys, re
def oklch_to_srgb(L,C,h):
    a=C*math.cos(math.radians(h)); b=C*math.sin(math.radians(h))
    l_=L+0.3963377774*a+0.2158037573*b; m_=L-0.1055613458*a-0.0638541728*b; s_=L-0.0894841775*a-1.2914855480*b
    l,m,s=l_**3,m_**3,s_**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return r,g,bb  # linear
def parse(c):
    c=c.strip()
    if c.startswith('#'):
        v=[int(c[i:i+2],16)/255 for i in (1,3,5)]
        lin=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in v]
        return lin, True
    m=re.match(r'oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\)',c)
    L=float(m.group(1)); L=L/100 if '%' in c.split()[0] else L
    lin=oklch_to_srgb(L,float(m.group(2)),float(m.group(3)))
    ok=all(-0.0005<=x<=1.0005 for x in lin)
    return [min(1,max(0,x)) for x in lin], ok
def lum(c):
    lin,_=parse(c); return 0.2126*lin[0]+0.7152*lin[1]+0.0722*lin[2]
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def hexof(c):
    lin,_=parse(c); v=[12.92*x if x<=0.0031308 else 1.055*x**(1/2.4)-0.055 for x in lin]
    return '#'+''.join(f'{round(min(1,max(0,x))*255):02x}' for x in v)
CARD_L='oklch(1 0 0)'; BG_L='oklch(0.975 0.003 197)'; CARD_D='oklch(0.205 0.007 223.9)'; BG_D='oklch(0.148 0.004 228.8)'
if __name__=='__main__':
    sets={'today light':['#5f9fe0','#3fae7d','#d9b13b','#e08a3c','#d95757']}
    for name,vals in sets.items():
        for i,v in enumerate(vals,1):
            print(name,i,v,'card L %.2f'%cr(v,CARD_L),'card D %.2f'%cr(v,CARD_D))
