# Independent WCAG contrast check from oklch tokens (alpha composited in sRGB).
import math
def oklch(L,C,h):
    a=C*math.cos(math.radians(h)); b=C*math.sin(math.radians(h))
    l_=L+0.3963377774*a+0.2158037573*b; m_=L-0.1055613458*a-0.0638541728*b; s_=L-0.0894841775*a-1.2914855480*b
    l,m,s=l_**3,m_**3,s_**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    enc=lambda x: 12.92*x if x<=0.0031308 else 1.055*x**(1/2.4)-0.055
    return [min(1,max(0,enc(v))) for v in (r,g,bb)]
def mix(fg,bg,a): return [f*a+b*(1-a) for f,b in zip(fg,bg)]
def lum(c):
    lin=lambda v: v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
    r,g,b=map(lin,c); return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    x,y=sorted([lum(a),lum(b)],reverse=True); return (x+0.05)/(y+0.05)
D=dict(card=oklch(0.205,0.007,223.9),muted=oklch(0.255,0.01,216.9),fd=oklch(0.6372,0.2071,21.89),de=oklch(0.704,0.191,22.216))
L=dict(card=oklch(1,0,0),muted=oklch(0.948,0.004,197),fd=oklch(0.5146,0.1979,16.57),z3=oklch(0.65,0.13,95))
dw=mix(D['muted'],D['card'],0.5); lw=mix(L['muted'],L['card'],0.5)
print('dark foreground-destructive on muted/50 over card: %.2f'%cr(D['fd'],dw))
print('dark destructive on muted/50 over card: %.2f'%cr(D['de'],dw))
print('light foreground-destructive on muted/50 over card: %.2f'%cr(L['fd'],lw))
print('light zone-3 on muted/50 over card: %.3f'%cr(L['z3'],lw))
print('light zone-3 on card: %.3f'%cr(L['z3'],L['card']))
