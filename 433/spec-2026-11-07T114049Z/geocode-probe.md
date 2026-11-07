# Geocoding probe (spec run, 2026-11-07)

## Kartverket Stedsnavn API: sok=Lillehammer
```
HTTP/1.1 200 Connection Established

HTTP/1.1 200 OK
Server: nginx
Date: Sat, 07 Nov 2026 11:38:45 GMT
Content-Type: application/json
Content-Length: 1339
Connection: keep-alive
access-control-allow-origin: *
x-envoy-upstream-service-time: 61
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=63072000
Permissions-Policy: battery=(), camera=(), microphone=(), midi=(), payment=()

{"metadata":{"side":1,"sokeStreng":"sok=Lillehammer&fuzzy=true&utkoordsys=4258&treffPerSide=3&side=1","totaltAntallTreff":700,"treffPerSide":3,"viserFra":1,"viserTil":3},"navn":[{"fylker":[{"fylkesnavn":"Innlandet","fylkesnummer":"34"}],"kommuner":[{"kommunenavn":"Lillehammer","kommunenummer":"3405"}],"navneobjekttype":"By","navnestatus":"hovednavn","representasjonspunkt":{"nord":61.11514,"\u00f8st":10.46628},"skrivem\u00e5te":"Lillehammer","skrivem\u00e5testatus":"godkjent og prioritert","spr\u00e5k":"Norsk","stedsnummer":311824,"stedstatus":"aktiv"},{"fylker":[{"fylkesnavn":"Innlandet","fylkesnummer":"34"}],"kommuner":[{"kommunenavn":"Lillehammer","kommunenummer":"3405"}],"navneobjekttype":"Bru","navnestatus":"hovednavn","representasjonspunkt":{"nord":61.10925,"\u00f8st":10.44239},"skrivem\u00e5te":"Lillehammer bru","skrivem\u00e5testatus":"godkjent og prioritert","spr\u00e5k":"Norsk","stedsnummer":167346,"stedstatus":"aktiv"},{"fylker":[{"fylkesnavn":"\u00d8stfold","fylkesnummer":"31"}],"kommuner":[{"kommunenavn":"Marker","kommunenummer":"3122"}],"navneobjekttype":"Annen kulturdetalj","navnestatus":"hovednavn","representasjonspunkt":{"nord":59.60456,"\u00f8st":11.58673},"skrivem\u00e5te":"Lillehammer","skrivem\u00e5testatus":"godkjent og prioritert","spr\u00e5k":"Norsk","stedsnummer":355893,"stedstatus":"aktiv"}]}

```

## Kartverket Stedsnavn API: sok=Chamonix (outside Norway)
```
{"metadata":{"side":1,"sokeStreng":"sok=Chamonix&utkoordsys=4258&treffPerSide=3&side=1","totaltAntallTreff":1,"treffPerSide":3,"viserFra":1,"viserTil":3},"navn":[{"fylker":[{"fylkesnavn":"Tr\u00f8ndelag - Tr\u00f6\u00f6ndelage","fylkesnummer":"50"}],"kommuner":[{"kommunenavn":"Trondheim","kommunenummer":"5001"}],"navneobjekttype":"Skog","navnestatus":"hovednavn","representasjonspunkt":{"nord":63.42382,"\u00f8st":10.50833},"skrivem\u00e5te":"Chamonix","skrivem\u00e5testatus":"vedtatt","spr\u00e5k":"Norsk","stedsnummer":1073514,"stedstatus":"aktiv"}]}

```

## Nominatim: q=Chamonix
```
HTTP/1.1 200 Connection Established

HTTP/2 200 
content-type: application/json; charset=utf-8
server: gunicorn/asgi
x-nominatim-server: vhagar.openstreetmap.org
accept-ranges: bytes
age: 0
date: Sat, 07 Nov 2026 11:38:46 GMT
via: 1.1 varnish
x-served-by: cache-chi-kmdw8640034-CHI
x-cache: MISS
x-cache-hits: 0
x-timer: S1794051526.206559,VS0,VE341
vary: accept-language, Accept-Encoding
strict-transport-security: max-age=300
alt-svc: h3=":443";ma=86400,h3-29=":443";ma=86400,h3-27=":443";ma=86400
content-length: 516

[{"place_id":88982896,"licence":"Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright","osm_type":"relation","osm_id":104836,"lat":"45.9230969","lon":"6.8700009","category":"boundary","type":"administrative","place_rank":16,"importance":0.6024060990860501,"addresstype":"town","name":"Chamonix-Mont-Blanc","display_name":"Chamonix-Mont-Blanc, Bonneville, Haute-Savoie, Auvergne-Rhône-Alpes, France métropolitaine, 74400, France","boundingbox":["45.8284379","46.0311495","6.8137453","7.0444709"]}]
```
