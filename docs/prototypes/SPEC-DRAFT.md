## Problem Statement

The athlete opens trainm8 and the app asks them to do the coaching. The owner, who uses it every day, finds it overloaded. They want the app to do as much as possible for them. This spec, **Levende start**, answers that.

- **The first run asks a coach's questions.** It asks for a sport, hours a week and days. Then it proposes one of five philosophies with a reason, and the athlete must understand what _Klassisk 3:1_ or _Terskelfokus_ means to switch it. The athlete never sees two real weeks side by side, so they cannot pick a way of training by what it would feel like.
- **The app only plans run, bike and swim.** An athlete who also climbs, does cross-country skiing, goes hiking or does yoga cannot say so. Those hours do not exist for the plan, so the plan asks for hours the athlete has already spent elsewhere.
- **The plan stops moving unless the athlete answers.** On Sunday evening the Week Replan (_Ukeskiftet_) proposes changes and waits for _Ok_ / _Nei takk_. Anything that adds load always waits for a yes, so an athlete who does well and never opens the card never gets their next step. The athlete who wants the app to run the plan has to review it every week.
- **I dag shows everything at once.** It shows a season strip, an endless calendar of every week back to the start of history, a writing line, popovers on every row, and a Ukeskiftet card. What the athlete needs on a normal day is today's session, a way to say "done", and how the week is going. Those are buried.
- **Sesong is an expert's page.** Philosophy, week targets, phases, Training Tracks, Week Pattern and the season chart all sit on one page. Every one of them is useful, and none of them is what an athlete wants to see first.
- **Small honest-looking mistakes.** An audit of the shipped surfaces found I dag starting 26 empty weeks back, _Marker som ikke gjort_ as the main action on a session that has not happened yet, completed sessions with no workout opening a 404, and _Timer i uka_ pre-filled as `0.1` with a decimal point.

## Solution

**Levende start** (named after the chosen prototype variant E, _Levende_) is a start that takes under a minute, a plan the athlete picks by looking at real weeks, an app that lays out every following week by itself, and an I dag that shows today and this week. Everything advanced stays and works exactly as before. It moves behind _Avansert_ and _Se hele sesongen_.

- **A simple start: four questions on three screens.** (1) _Hvor er du nå?_: a **Training Level** (_Nybegynner_, _Mosjonist_, _Erfaren_, _Konkurranse_), and on the same screen (2) _Omtrent hvor mye tid i uka?_. The level sets default hours a week, which the athlete can change, and history fills them in when an account is connected. (3) _Hva liker du å trene?_: activities (_løping_, _sykling_, _langrenn_, _svømming_, _fjelltur_, _styrke_, _klatring_, _yoga og bevegelighet_) and the days the athlete can train. The first endurance sport they choose is their main sport. Picking _styrke_ asks one more tap: _1_, _2_ or _3_ strength sessions a week. (4) _Hva slags økter liker du?_: **Session Preferences** (_lange rolige_, _korte harde intervaller_, _jevnt hardt_, _korte økter_, _overrask meg_).
- **_Uka di_ fills in as the athlete answers.** A live week of seven days sits on every question screen. It gains its sessions as the athlete answers, from the same draft the plan will be made from.
- **Three ways to train, not three words** (UI: _tre måter å trene på_). The app shows up to three **Start Options**. Each is a real first week, day by day, laid by the real engine. Each follows a different Periodization Preset family: _Polarisert 80/20_, _Terskelfokus_ and _Klassisk 3:1_. For a _Nybegynner_, _Stor base_ replaces _Terskelfokus_. Each option leads with a plain name (_Mest rolig, litt veldig hardt_; _Jevnt og kontrollert hardt_; _Variert og bygger seg opp_; _Bygg grunnform først_) and shows the family's name small. The options are ordered by how well they fit the athlete's preferences. The first one carries _Passer deg best_. Each card's button says _Velg denne_. _Stor base_'s first block becomes all easy, so it is genuinely different from _Klassisk 3:1_. As a safety net, the athlete is never shown two identical weeks: options that would lay the same week are merged and only the distinct ones are shown.
- **Picking one builds the plan under the hood.** It creates an open-ended Plan Outline in the chosen family, its Training Tracks, a Week Pattern on the athlete's days and the first weeks of sessions. The plan begins on the first week not yet begun, and the start says so (_Planen starter mandag 19. oktober_). Then _Planen er klar_ shows the plain name, the start date, a 12-week curve of hours and a closed _Under panseret_ disclosure with everything that was made.
- **Simple activities (_enkel aktivitet_).** Climbing, cross-country skiing, hiking and yoga are planned with a time and an effort word (_rolig_ / _middels_ / _hard_) and nothing else. They count in the week's hours. Zones, Planned TSS and Training Load show as not measured. Imports are not mapped to them yet. The app never pretends to measure what it cannot measure.
- **Autopilot, on for everyone.** Each Sunday evening the app lays out the week ahead from the plan and from what the athlete actually did. It applies the changes, including the next round of an open-ended plan, without waiting for a yes. This is on for every athlete, including those with a plan today. Every autopilot write says what it did in a notice on I dag, and each change can be undone. It never changes a session the athlete wrote or took over. A switch in _Meg_ (_Spør meg først_) brings back "propose, and wait for a yes".
- **A calm I dag.** On top is today's session card with _Gjort_ and the _Juster_ chips: _For sliten i dag_, _Lite tid_, _Bytt dag_ and _Avansert_, each change with _Angre_. _Bytt økt_ lets the athlete swap today's session for one from _Bibliotek_. Below the card is this week, day by day. The season strip, the calendar Stream and the editing tools stay, behind _Se hele sesongen_.
- **Three tabs: _I dag_, _Plan_, _Meg_.** _Plan_ shows the season as one curve and the philosophy in plain words, and holds _Bibliotek_ as a section. _Avansert_ on _Plan_ opens today's Sesong editors unchanged: philosophy, week targets, phases, tracks and the Week Pattern. Old addresses keep working.
- **Motion that explains (prototype variant E, _Levende_, built on variant A).** _Uka di_ morphs into the option cards. The chosen card morphs into the plan curve, and the curve into the I dag week. The first _Gjort_ on a session gets a small earned celebration. Reduced motion keeps gentler cross-fades. It never removes motion entirely.

## User Stories

### The simple start: level and hours

1. As a new athlete, I want to start by choosing one of four plain levels (_Nybegynner_, _Mosjonist_, _Erfaren_, _Konkurranse_), each with one sentence describing it, so that I can describe myself without knowing training theory.
2. As a new athlete, I want my hours a week filled in from the level I picked, so that I have a sensible number without thinking about it.
3. As a new athlete, I want to adjust the hours in half-hour steps with large − and + buttons, so that I can say what I really have with one thumb.
4. As an athlete, I want the hours shown with a decimal comma and the word _time_ / _timer_ (`4,5 timer`), never as `0.1` or with a decimal point, so that the number reads as Norwegian and is never a typo.
5. As an athlete, I want the hours bounded (at least 1 and at most 20) with a sentence saying why at each end, so that I cannot ask for a plan the app cannot make.
6. As an athlete, I want the hours I give to be what my first week adds up to, with the plan climbing from there and the start saying so, so that my number means "what I train now" and I can see where it goes.
7. As an athlete with intervals.icu connected, I want the hours and days pre-filled from my last four weeks rather than from my level, with a short line saying where the numbers came from, so that the plan starts from what I really do.
8. As an athlete with history, I want to open the arithmetic behind the pre-filled hours (`43 km/uke à 5:35 ≈ 4 t`), so that I can trust or correct it.
9. As an athlete whose history is still importing, I want the start to say so and use my level's default meanwhile, so that I am never stuck waiting.
10. As an athlete without a connection, I want a quiet way to connect from the first screen and never a required step, so that I can start in under a minute.
11. As an athlete, I want the level to shape the plan in ways I can see (a beginner gets at most four sessions a week and more rest between hard days), so that the level is not a decoration.
12. As an athlete, I want to change my level later in _Meg_, so that I am not stuck with a choice I made on day one.

### The simple start: activities and days

13. As an athlete, I want to pick every activity I do from one list of chips (_løping_, _sykling_, _langrenn_, _svømming_, _fjelltur_, _styrke_, _klatring_, _yoga og bevegelighet_), so that the plan knows about all my training.
14. As an athlete, I want the first endurance sport I pick to become my main sport, with a line saying _Hovedidrett: Løping_, so that I know which sport the plan is built around.
15. As an athlete, I want to change my main sport by unpicking and repicking, or by tapping the line, so that the order I tapped in is not a trap.
16. As an athlete who picks no modelled endurance sport (only climbing and yoga, say), I want the app to say plainly that I will get one simple week with the sessions spread out rather than three ways to train, so that I understand why there is no choice.
17. As an athlete, I want to pick the days I can train from seven day buttons, so that the plan never puts a session on a day I cannot train.
18. As an athlete, I want a sentence under the days saying how many I picked and that the app never lays more than I have time for, so that I trust the days are a limit.
19. As a beginner who picks more than four days, I want the app to say it will use at most four and pick the ones with the most rest between them, so that I understand why a day stays empty.
20. As an athlete who picks seven days, I want the plan to keep one day _fri_ and say so, so that I am never given a week without rest.
21. As an athlete, I want every day I picked kept as my training availability even when the plan uses fewer, so that I can add sessions on those days later.

### The simple start: session preferences

22. As an athlete, I want to say what kinds of sessions I like (_Lange, rolige turer_; _Korte, harde intervaller_; _Jevnt hardt_; _Korte økter_; _Overrask meg_), so that the app shows me first the way of training I will enjoy.
23. As an athlete, I want to skip the preferences with one tap (_Hopp over_), so that the question never blocks me.
24. As an athlete who picks both _Korte økter_ and _Lange, rolige turer_, I want the app to say how it resolves them (short weekday sessions, and a long session that may be long), so that I am not surprised by a long session.
25. As an athlete who picks _Korte økter_, I want weekday sessions kept to at most 45 minutes, and the week to say plainly when that means it falls short of my hours, so that my preference is honoured and the shortfall is visible.

### _Uka di_: the live week

26. As an athlete answering the questions, I want a small week of seven days on each screen that fills in as I answer, so that I see my answers turning into training.
27. As an athlete, I want _Uka di_ to show the number of sessions and the week's total time, updating as I answer, so that I see what each answer costs.
28. As an athlete, I want _Uka di_ to come from the same draft that the options and the plan come from, so that the live week never shows something the plan will not do.
29. As an athlete using a screen reader, I want _Uka di_ read as a list of days with activity and duration, or as _Uka di er tom ennå_, so that the live week is not only a picture.
30. As an athlete with reduced motion, I want _Uka di_ to update with gentle fades instead of blocks rising, so that it is calm and still alive.

### _Tre måter å trene på_: the Start Options

31. As an athlete, I want to see up to three ways to train, each a real first week laid day by day (session name, activity, duration and effort word per day, and _fri_ on empty days), so that I choose by what my week would be like.
32. As an athlete, I want each way to follow a different training principle, so that the choice is real and not three versions of the same week.
33. As an athlete, I want each way led by a plain name (_Mest rolig, litt veldig hardt_; _Jevnt og kontrollert hardt_; _Variert og bygger seg opp_; _Bygg grunnform først_) with a one-sentence why, so that I understand it without the jargon.
34. As an athlete who knows training, I want the family's name shown small on each card (_Fagnavn: Polarisert 80/20_), so that I can recognise the method.
35. As a beginner, I want _Bygg grunnform først_ (_Stor base_) offered instead of _Terskelfokus_, with a first block of only easy sessions, so that I am not offered hard sessions on day one and the card is clearly different from _Variert og bygger seg opp_.
36. As an athlete, I want the ways ordered by how well they fit my preferences, with _Passer deg best_ on the first, so that the app's recommendation is clear and the choice is still mine.
37. As an athlete who skipped the preferences, I want no _Passer deg best_ badge pretending to know my taste. A beginner's first card may instead say _Anbefalt for nivået ditt_. That way a badge always has a reason.
38. As an athlete, I want each card to show a bar of easy, middling and hard time, the week's total and the number of hard sessions, so that I can compare them at a glance.
39. As an athlete, I want never to be shown two identical weeks: ways that would lay the same week for my answers are merged into one card and only the distinct ones shown, with a sentence saying why there are fewer, so that every choice I see is a real choice.
40. As an athlete, I want every card's week to add up to the hours I gave, or to say plainly why not (`Øktene blir ikke lengre enn det som gir mening, så uka blir 3 t 40 min, ikke 5 timer.`), so that the app never silently changes my number.
41. As an athlete who picked an activity that did not fit the week, I want each card to say _Fikk ikke plass denne uka: klatring_ with what would make room, so that nothing I chose disappears without a word.
42. As an athlete, I want to swipe between the cards with pager dots and also move with the arrow keys, so that the choice works with a thumb and a keyboard.
43. As an athlete, I want each card's button to say _Velg denne_, with the card's plain name as part of its accessible name, so that I and my screen reader know exactly what I am picking.
44. As an athlete, I want the cards to say when the plan begins (_Planen starter mandag 19. oktober_), so that I know which week I am choosing.
45. As an athlete, I want to go back to any question and see the cards recomputed, so that I can explore the choice freely.

### _Planen er klar_

46. As an athlete who just picked a way to train, I want a screen saying _Planen er klar_ with its plain name and the day the plan begins, so that I know the plan is made and when it starts.
47. As an athlete, I want a 12-week curve of hours a week showing the climb from my hours and the easy weeks, so that I see where the plan is taking me.
48. As an athlete with an open-ended plan, I want the curve to say which weeks are the plan as laid and which are how the autopilot would continue if I train as planned, so that the picture never promises more than the plan holds.
49. As an athlete, I want one sentence saying the app lays out each next week on Sunday evening from what I actually did, tells me what it did and lets me undo it, and that I can ask it to check with me first in _Meg_, so that I know how the plan moves.
50. As a curious athlete, I want a closed _Under panseret_ disclosure showing the family, that the plan is open-ended, the rhythm, the Training Tracks with their starting volume, the Week Pattern, my level, my strength frequency and my preferences, so that nothing made on my behalf is hidden.
51. As an athlete, I want _Til I dag_ to take me to I dag, so that I can see my first session straight away.
52. As an athlete, I want the plan to be open-ended by default with no race, and _Legg til et løp_ available later on _Plan_, so that I do not need a goal date to begin.
53. As an athlete who picks on a Wednesday, I want the plan to begin next Monday, with nothing laid on the days of this week and nothing marked done or _ikke gjort_, so that my first week starts honestly.
54. As an athlete whose plan begins next Monday, I want I dag to say when the plan starts and show my first session, and still let me add a session today, so that the days before the start are not a dead end.
55. As an athlete, I want the plan that is made to be exactly the plan I was shown, day for day and minute for minute, so that the choice I made is the choice I get.
56. As an athlete who already has a plan, I want the simple start to send me to _I dag_ instead of making a second plan, so that I cannot end up with two plans by accident.
57. As an athlete who prefers to set up a season themselves, I want a quiet way out of the start into today's plan-authoring (_Jeg vil heller sette opp sesongen selv_), so that the expert path still exists.

### Simple activities (_enkel aktivitet_)

58. As a climber, I want climbing in my week with a duration and an effort word (_rolig_, _middels_, _hard_), so that the plan respects the days I am on the wall.
59. As a cross-country skier, I want _langrenn_ planned as a simple activity with time and effort, so that my winter training counts in the plan even before the app can read skiing data.
60. As a hiker, I want _fjelltur_ planned as a long session in hours, so that a weekend in the mountains counts toward my week.
61. As an athlete who does yoga, I want short _rolig_ yoga sessions placed where there is room, so that mobility work has a place without crowding out training.
62. As an athlete, I want simple activities counted in my weekly hours, so that the plan does not ask me for hours I already spent on them.
63. As an athlete, I want a simple activity to show zones, pace, power, TSS and Training Load as not measured (_ikke målt_) with the reason, never as a number, so that the app never invents one.
64. As an athlete, I want a simple activity to keep my word for how hard it was (_rolig_ / _middels_ / _hard_) and never to turn it into a Training Zone, so that a hard climbing session is not mistaken for a zone-5 run.
65. As an athlete, I want to mark a simple activity _Gjort_ by hand, so that it counts as done without an import.
66. As an athlete, I want an imported activity the app cannot match (a climb, a hike) to stay in _Annet_ as today, and not be auto-linked to a planned simple activity yet, so that no guess is presented as a match.
67. As an athlete, I want to link such an import to a planned simple activity by hand, so that I can count it myself.
68. As an athlete, I want the autopilot to carry my simple activities week to week like any other session, so that they do not vanish after week one.

### Strength in the start

69. As an athlete who picks _styrke_, I want to say with one tap how many strength sessions a week I want (_1_, _2_ or _3_), pre-set for my level, so that the frequency is my own choice and never a hidden guess.
70. As an athlete with lifting history, I want that tap pre-set from my history with a line saying so, as Sesong's strength offer does today, so that the start and Sesong agree.
71. As an athlete, I want strength sessions on days away from my hard endurance sessions, so that lifting fits around running.
72. As an athlete, I want the number of strength sessions shown on each card, in _Under panseret_ as my choice, and editable later, so that I can see and change it.
73. As an athlete, I want a strength session to show its lifts rather than invented minutes, and the week's hours to say how strength is counted (_+1 styrkeøkt_ beside the hours), so that the hours promise is honest.

### Autopilot

74. As an athlete, I want the app to lay out the coming week by itself every Sunday evening, so that I never have to plan a week.
75. As an athlete, I want the coming week to be adjusted to what I actually did (lighter after a week I could not finish, the same after a week with missed sessions, a step up after a round done to plan), so that the plan follows me.
76. As an athlete with an open-ended plan, I want the next round appended by itself at its proposed volume without a yes, so that my plan keeps moving even if I never open the app on a Sunday.
77. As an athlete who already had a plan before this change, I want autopilot switched on for me too, with a one-time line in the first notice saying the app now lays out my weeks and where to switch back, so that I get the new behaviour and know how to leave it.
78. As an athlete, I want a notice on _I dag_ (_Neste uke er lagt ut_) saying what changed and why in one line each, every time the autopilot writes, so that I always know what the app did.
79. As an athlete, I want to undo each change from the notice, and all of them at once, so that I stay in charge without having to approve everything.
80. As an athlete, I want an undo to put the week back exactly as it was before the change, so that undo is not a second guess.
81. As an athlete, I want to be able to undo a change until the week it changed has begun or one of its sessions has been trained, and to be told when that window has closed, so that the window is clear and never a surprise.
82. As an athlete, I want the autopilot never to change a session I wrote myself or took over, and to say so in the notice when that session was left alone (_Lørdagens langtur er din, den står._), so that my own plans are fixed points.
83. As an athlete who missed a session, I want it to stay on its day as _ikke gjort_, with nothing moved or copied by itself, and the notice to say it was let go, so that the record is true.
84. As an athlete, I want the autopilot never to increase load by more than the plan's ramp guard allows in one step, so that the app cannot push me too hard while I am not looking.
85. As an athlete, I want a step up after a round done to plan to be at most the presets' 5 %, and stated with before → after in my hours (_Toppuka: 4 → 4,2 t_), so that I can see and reverse it.
86. As a cautious athlete, I want a switch in _Meg_ (_Spør meg først_) that makes the app propose and wait for my yes, exactly as _Ukeskiftet_ does today, and a way to switch autopilot back on, so that I choose how much the app does by itself.
87. As an athlete, I want the notice to go away once I have seen it and the week has begun, and to stay findable from _Se hele sesongen_, so that I dag stays calm.
88. As an athlete, I want a week the autopilot could not lay (no pattern, past the plan's end, an error) to say so in the notice rather than appear empty, so that silence never means broken.
89. As an athlete, I want _Gjør uka lettere −15 %_ to stay available for the coming week, so that I can still ask for an easier week myself.

### I dag

90. As an athlete, I want I dag to open on today's session as a card on top (name, activity, duration, effort word, one plain sentence of what to do), so that I see what to do today without scrolling.
91. As an athlete, I want one large _Gjort_ button on today's session, so that marking it done is one tap.
92. As an athlete, I want _Gjort_ undone from its toast and from the card for as long as ADR 0088 says, so that a mistap is free.
93. As an athlete, I want a small earned celebration the first time I mark a session done (a few sparks from the check, once per session, never on undo), so that finishing feels good without being noisy.
94. As an athlete with reduced motion, I want the celebration replaced by a calm check fade, so that it respects my setting.
95. As an athlete on a free day, I want the card to say _Fri i dag_ and name the next session and its day, so that a free day is clearly a plan, not a gap.
96. As an athlete whose session today is done, I want the card to say so and name the next session, so that I know I am finished for the day.
97. As an athlete, I want this week below the card as seven rows (weekday, session, duration and effort word, a done mark, _ikke gjort_ on a past missed day, _fri_ on a free day), with _n av m økter gjort_ in its heading, so that I see how my week is going.
98. As an athlete, I want a session that is still ahead of me never to offer _Marker som ikke gjort_ as its main action, so that I cannot mark the future as missed by accident.
99. As an athlete, I want _Gjort_ only on today's session and on past sessions not yet done, never on a future one, so that I cannot mark training done before it happens.
100. As an athlete, I want to tap any session in the week to open its details, and a completed session with no workout to open a readable detail and never a 404, so that every row leads somewhere.
101. As an athlete, I want to tap a free day in the week to add a session (the same composer and undo as today), so that adding something stays one tap away.
102. As an athlete, I want a link _Se hele sesongen_ under the week that opens today's full Home Timeline (Week Strip, Stream, Writing Line, Ukeskiftet and autopilot history), so that nothing I could do before is lost.
103. As an athlete, I want the full view to land on today and never on an empty week months back, so that it opens where I am.
104. As an athlete on a large screen, I want I dag to show today and the week side by side and _Se hele sesongen_ to open the three-pane view, so that the large screen is calm too.
105. As an athlete with no plan, I want I dag to invite me to the simple start rather than show an empty calendar, so that the next step is obvious.

### _Juster_

106. As an athlete who is tired today, I want one chip, _For sliten i dag_, that turns today's session into a short easy one, so that I can still train without thinking about how.
107. As an athlete short on time, I want one chip, _Lite tid_, that shortens today's session to a fixed shorter length and keeps its purpose where it can, so that I can still do something.
108. As an athlete whose day changed, I want one chip, _Bytt dag_, that moves today's session to the next free day this week, or swaps it with the next session when no day is free, so that the week still holds together.
109. As an athlete, I want each chip to say what it did in a toast with _Angre_, so that every adjustment can be taken back.
110. As an athlete, I want a chip that cannot do anything (no free day left, nothing left today) to say why instead of doing nothing, so that I am never left wondering.
111. As an athlete, I want a _Juster_ change to touch only today's session, never my week target and never later weeks, so that one bad day does not rewrite the plan.
112. As an athlete, I want the session to keep a short note saying it was adjusted and why, so that I can see later what happened.
113. As an athlete who uses _For sliten i dag_ or _Lite tid_ on the app's session, I want it to stay the app's session (not become mine), so that the autopilot can keep laying my later weeks normally.
114. As an athlete, I want _Bytt økt_ to let me pick another session for today from _Bibliotek_, with _Angre_, so that I can do something different without leaving I dag.
115. As an experienced athlete, I want _Avansert_ among the chips to open everything that exists today (editing the session, the Writing Line, the _Plan_ editors), so that power tools stay one tap further away, not gone.
116. As an athlete, I want the chips sized for a thumb and placed right above _Gjort_, so that adjusting is as easy as finishing.

### _Plan_

117. As an athlete, I want the _Plan_ tab to show my plan's plain name, its family small, the season as one curve with this week marked, and the next easy week, so that I understand my plan in one glance.
118. As an athlete, I want to switch to another way of training from _Plan_ by seeing the three ways again (as real weeks), so that changing method feels like the start did.
119. As an athlete, I want _Legg til et løp_ on _Plan_, so that I can turn my open-ended plan into a plan toward a race (ADR 0079 §4).
120. As an athlete who uses the Catalogue, programs and exercises, I want _Bibliotek_ as a section of _Plan_, so that the library has a home without its own tab.
121. As an experienced athlete, I want a closed _Avansert_ section on _Plan_ with today's Sesong editors (philosophy, week targets, phases, tracks, Week Pattern, the season chart), working exactly as they do today, so that nothing I rely on is lost.
122. As an athlete, I want old Sesong and Bibliotek links and bookmarks to keep working and to land in _Plan_, so that nothing breaks.

### Tabs and _Meg_

123. As an athlete, I want three tabs, _I dag_, _Plan_ and _Meg_, so that the app has fewer places to look.
124. As an athlete, I want my level, my activities, my strength frequency, my session preferences and the autopilot switch in _Meg_, so that I can change what the start asked me.

### Motion and feel

125. As an athlete, I want _Uka di_ to morph into the cards when the three ways appear, so that I see my week became the choices.
126. As an athlete, I want the chosen card to morph into the plan curve, and the curve into the I dag week, so that the plan I picked visibly becomes my week.
127. As an athlete, I want every motion under 300 ms, exits faster than entries, and motion only on transform, opacity and clip-path, so that the app feels quick and never sluggish.
128. As an athlete with reduced motion, I want every morph replaced by a gentle cross-fade, never by a jump with no motion, so that changes are still understandable.
129. As an athlete, I want back navigation to reverse the motion and quick taps to land at once, so that motion never gets in my way.
130. As an athlete on a phone, I want every control at least 44 px tall, buttons in the bottom thumb zone and no page zoom on input, so that the start works one-handed.

### Honesty

131. As an athlete, I want the app never to mark anything done that I did not do or that no recording says I did, including when a plan is made, so that my history is true.
132. As an athlete, I want every promise the start makes (hours, days, sessions, start date) to be checked against what is made, so that the start never shows a better plan than I get.
133. As an athlete, I want every Norwegian word on these surfaces to come from one place and read the same everywhere, so that the app speaks one language.

## Implementation Decisions

### Owner decisions (2026-10-17)

These were open conflicts with ADRs or the glossary. The owner has decided them. Each is recorded in the ADRs listed in Further Notes.

1. **Autopilot is on for every athlete, including existing plans.** The Week Change applies its Week Replan instead of proposing it. A switch in _Meg_ (_Spør meg først_) goes back to "proposes and needs a yes". A new ADR supersedes ADR 0080 §2–3 and amends ADR 0079 §3: with autopilot on, the next round may be applied without a yes. Every autopilot write shows a notice and is undoable.
2. **Three tabs: _I dag_, _Plan_, _Meg_.** _Bibliotek_ moves inside _Plan_ (a section there) and is also reachable from _Bytt økt_ on I dag. A new ADR amends ADR 0083, and old URLs keep working. The today card's return reverses ADR 0086 §1 ("no hero"). The Stream and Week Strip move behind _Se hele sesongen_, which amends ADR 0082 §5 and ADR 0087 for the default view. Both are accepted, and the ADR records them.
3. **Start Options must differ.** _Stor base_'s first block becomes all easy (an empty Quality Session Mix, no hard sessions), so it is genuinely different from _Klassisk 3:1_. This amends ADR 0048 and changes the preset for every plan made from it. As a safety net, the athlete is never shown two identical weeks: identical options are merged and only the distinct ones are shown.
4. **Hours mean week 1.** Week 1 equals the chosen hours, and the plan climbs from there (ADR 0091 §3). "Honour the hours" means week 1, not a ceiling.
5. **Start week follows ADR 0079**: the first week not yet begun. The start screen says when it begins.
6. **Strength frequency without history is asked**, in the activities step, as a one-tap 1 / 2 / 3 per week defaulted by level. It is stored as the athlete's own choice, so nothing is invented.
7. **Simple activities live on Discipline `other` with a named Activity Kind.** This amends ADR 0015 and the **Annet** definition. They carry time and hardness only. Every other metric is shown as an **Unavailable Metric**.
8. **_Juster_ is an explicit, documented exception to Session Adoption** for _For sliten i dag_ and _Lite tid_ only (see _Juster_ below).
9. **Words.** The three start choices are not called _forslag_, which belongs to _Ukeskiftet_. The domain term is **Start Option**. The UI says _tre måter å trene på_, and each card's button says _Velg denne_. Free days say _fri_, per the glossary's Every-Day Grid rule, never _hvile_.
10. **Prototypes E and F pre-mark past sessions as done when an option is chosen. That is a prototype bug.** Making a plan never marks anything done or _ikke gjort_.

### Domain and glossary

- **New terms** (to record in the glossary through `/domain-modeling` in the first slice):
  - **Training Level**: _Nybegynner_ / _Mosjonist_ / _Erfaren_ / _Konkurranse_. Stored on the Athlete Profile. It sets defaults (hours, session cap, which three families are offered, shortest and longest sessions, default strength frequency) and is never a measured quantity.
  - **Session Preference**: the multi-select of session kinds the athlete likes. Stored on the Athlete Profile. It only orders the Start Options and shapes session lengths within the family's rules. It never changes a family's Quality Session Mix.
  - **Start Option**: one family's first week laid for the athlete's answers, shown as a card. It is a reading, never stored. UI words: _tre måter å trene på_ for the set, _Velg denne_ for the pick. _Avoid_: forslag, suggestion, proposal. Those words belong to the Week Replan Proposal.
  - **Week Sketch** (UI word _Uka di_): the live seven-day reading of the draft on the question screens. It is distinct from the **Week Strip**, which is the season-level navigating axis, and from the **Pattern Preview**, which reads a stored pattern.
  - **Simple Activity** (UI word _enkel aktivitet_): a Workout Session on Discipline `other` with an **Activity Kind** (_langrenn_, _fjelltur_, _klatring_, _yoga og bevegelighet_, open for more) and an **Effort Word** (_rolig_ / _middels_ / _hard_), which is never a Training Zone.
  - **Autopilot**: the per-athlete mode in which the Week Change applies its Week Replan instead of proposing it. On by default. Its opposite is _Spør meg først_.
  - **Autopilot Notice** (UI _Neste uke er lagt ut_): the statement of what the autopilot wrote, with _Angre_ per line and _Angre alt_.
  - **Juster**: one of the one-tap changes to today's session (_For sliten i dag_, _Lite tid_, _Bytt dag_).
- **Update existing glossary terms**:
  - **First Run**: the three question screens, Start Options, _Planen er klar_.
  - **Week Replan** / **Week Replan Proposal** / **Week Change Card**: applied by autopilot by default, and proposed under _Spør meg først_.
  - **Tab Bar**: three tabs.
  - **Home Timeline**: the today card and week, with the Stream behind _Se hele sesongen_.
  - **Discipline** and **Annet**: Simple Activities on `other`.
  - **Periodization Preset**: _Stor base_'s first block is all easy.
  - **Session Adoption** / **Session Ownership**: the _Juster_ exception.
  - Strength frequency: "from history or from the athlete's own answer, never invented".
- Every athlete-facing word goes through the labels module, which has a completeness test (ADR 0081 §2). Dates use the Norwegian formatters. Hours always use a decimal comma.

### The start draft: one pure module

- The first run's draft is widened rather than replaced. Today it takes a family, goal, start week, discipline, hours and days, and returns phases, outline rows, Week Pattern and the first two weeks through the stamp's own planner. It gains the new answers: level, activities in the order they were picked, days, strength frequency and preferences. It returns the **ranked, distinct Start Options**. Each option holds its family, its outline rows (one round of the family through the existing open-ended round reader), its starter Week Pattern and its first week as the stamp lays it. Each also holds its notes (hours shortfall, days used, _Fikk ikke plass_) and its fit score. The result also carries the Plan Start Week and how many options were merged. The **Week Sketch** is the top option's first week. It is the same draft, not a second generator.
- The start week is the **first week not yet begun**, exactly as today's first run computes it (ADR 0079, as built in #505 S14). On a Wednesday the plan opens next Monday. Nothing is laid on days behind the athlete or on the rest of the current week.
- **The prototype's week-building rules are a sketch only.** The real engine decides the week:
  - the family's open-ended round: rhythm, ramp and **Quality Session Mix**;
  - the starter Week Pattern on the chosen days, with the long day last;
  - the stamp laying the mix on bare share days, never on the long day (ADR 0091 §1);
  - the existing cuts: no session under half an hour, at most six days, and the mix cut to the days less the long day.

  The level adds two rules to the existing cuts: a session cap (_Nybegynner_ 4) and per-kind shortest and longest sessions.
- **Which families**: _Polarisert 80/20_, _Terskelfokus_ and _Klassisk 3:1_. For _Nybegynner_ it is _Stor base_, _Polarisert 80/20_ and _Klassisk 3:1_. _Masters 2:1_ is not offered in the start. It stays reachable through _Plan_ → _Avansert_. The existing age rule that picks Masters is retired from the start.
- **_Stor base_ preset change (amends ADR 0048).** _Stor base_'s first block, and so its open-ended round, has an empty Quality Session Mix: all easy, no hard sessions. This is a change to the preset itself, so it applies to every plan made from _Stor base_ after the change, anchored or open-ended. Training Tracks already written keep their stored mix until the athlete re-applies a philosophy.
- **Ranking**, from the prototype (variant A, trimmed):

  ```js
  // prototype A — principlesFor()
  const keys = level === 'ny' ? ['base', 'polarized', 'classic'] : ['polarized', 'threshold', 'classic']
  score(k) =
    (prefs.intervals && k === 'polarized' ? 2 : 0) +
    (prefs.threshold && k === 'threshold' ? 2 : 0) +
    (prefs.long && (k === 'polarized' || k === 'base') ? 1 : 0) +
    (prefs.surprise && k === 'classic' ? 2 : 0) +
    (prefs.short && k === 'threshold' ? 1 : 0)
  // stable sort by score desc; badge 'Passer deg best' only when the top score > 0,
  // else 'Anbefalt for nivået ditt' when the top option is Stor base, else none
  ```

- **Never two identical weeks (safety net).** Two options are identical when their first weeks match day for day: same weekday, activity, effort and minutes. Identical options are merged, keeping the higher-ranked one, and only the distinct options are returned. The screen says that some ways were identical for these answers. With _Stor base_ all easy, beginners normally see three. Few days still merge real presets: a two-day week cuts every mix to one hard session, and a one-day week has none, so all three merge into one.
- **Level defaults**, from the prototype:

  | Level         | Hours | Days                         | Session cap | Strength default |
  | ------------- | ----- | ---------------------------- | ----------- | ---------------- |
  | _Nybegynner_  | 3     | man, ons, fre                | 4           | 1                |
  | _Mosjonist_   | 5     | man, ons, fre, lør           | 6           | 1                |
  | _Erfaren_     | 7     | man, tir, tor, fre, søn      | 6           | 2                |
  | _Konkurranse_ | 10    | man, tir, ons, tor, lør, søn | 6           | 2                |

  The hours range is 1–20 in half-hour steps. History replaces the default hours and days when the findings reader has them. The findings reader is today's _Dette fant vi_ reader, reused without its screen. Its arithmetic stays available behind a disclosure.
- **Honouring the hours = week 1.** Week 1 of every option adds up to the hours given, across every hours-counted track: the main sport, other endurance sports and Simple Activities. Where it cannot, the option says so in one plain sentence with the reason: sessions capped by preference, too few days, or a session that would be too short. The family's climb then starts from the hours given (ADR 0091 §3), and the 12-week curve shows it. The hours are never a ceiling. The **Weekly Capacity** stored is the plan's heaviest week, as today.
- **Several endurance sports.** The main sport's track carries the family's Quality Session Mix. Each other modelled endurance sport the athlete picked (run, bike or swim) gets its own hours track with an empty mix: easy sessions only, on the days left. This keeps one Training Track per Discipline (ADR 0044). _Langrenn_ is a Simple Activity, not a modelled endurance sport. If the athlete picks no modelled endurance sport, the draft returns one option, laid from the Simple Activities alone.
- **Answers travel in the URL** until the plan is made, as the first run's do today. The same field schemas read the form and the URL.

### Creating the plan

- _Velg denne_ calls the existing first-run plan writer, extended to take an option. It writes all of the following:
  - the open-ended Plan Outline from the Plan Start Week, with the family recorded;
  - every track;
  - the Week Pattern: share days, fixed Simple Activity days and fixed strength days;
  - the athlete's **Training Availability** and **Weekly Capacity**;
  - the **Training Level**, the **Session Preferences** and the strength frequency as the athlete's answer.

  It does all of this in one transaction that first checks the athlete has no plan. It then lays the first weeks through the horizon fill as `generated` sessions.
- Making a plan never writes a completion or a _ikke gjort_ on any session. Days before the Plan Start Week hold nothing from the plan. This forbids the prototype bug.
- Until the Plan Start Week begins, the I dag card says when the plan starts and names the first session. The athlete can still add a session today through the composer.
- **The 12-week curve** reads the plan's own derivation for the laid round. It shows the next two rounds as the autopilot's rule would append them if every week were done to plan (+5 % per round, ADR 0079 as built in #505 S6). Those rounds are drawn dashed and labelled as _hvis du trener som planlagt_. It is the Season Pane's curve primitive, not a new chart.
- _Under panseret_ is a read-only view of what was written. It uses the Sesong readers, not prose.

### Simple activities (amends ADR 0015 and **Annet**)

- **The Discipline set is not widened** for each activity. A Simple Activity is a Workout Session whose Discipline is the existing `other`, made plannable. It carries a named **Activity Kind** and an **Effort Word**. Its structure is one step of duration with no Intensity Target. This amends ADR 0015 ("Workouts and planned Steps cannot use `other`"). The alternative was a Discipline per activity. It was rejected because every switch on Discipline (zones, thresholds, TSS, PRs, structure detection, import mapping) would need an honest "not available" branch for each new value. _Langrenn_ is a Simple Activity for now.
- **Time and hardness only.** Planned TSS, Training Load contribution, zones, pace and power are **Unavailable Metrics** with a reason, shown as _ikke målt_.
- **Volume.** Planned Volume and Actual Volume count Simple Activities in hours. Planned volume is the planned minutes. Actual volume comes from _Gjort_ by hand, which records the planned minutes, or from a linked import's duration.
- **One hours track for all Simple Activities**: one Training Track on `other`, currency hours. It has no Quality Session Mix and no zones. The Effort Word is decided per Week Pattern day, not by a mix. This keeps one track per Discipline. A climbing day is a **fixed** pattern day with its Activity Kind, Effort Word and a share of the hours.
- **Imports.** An import of `other` still lands in **Annet** and is not auto-promoted (ADR 0015). Linking it by hand to a planned Simple Activity is allowed.
- The **Annet** rule changes in one place: a planned Simple Activity is on its track, not in _Annet_.

### Strength in the start

- Picking _styrke_ shows a one-tap 1 / 2 / 3 sessions a week in the activities step. It is pre-set by level (see the table), or from lifting history through the existing strength offer when there is history, with a line saying so. Whatever is selected is stored as the athlete's answer and shown as theirs on the option and in _Under panseret_. Nothing is invented. The glossary's strength-frequency sentence is amended to say this.
- Strength gets a strength track and fixed lifting days, placed away from hard endurance days. With no recent strength session to copy, the lifting day uses a **Stock Workout** full-body session from the Catalogue.
- Strength sessions are shown with their lifts. They do not count in the week's hours. The option says _+n styrkeøkt(er)_ beside the hours, as Planned Volume counts unmeasured sessions apart.

### Autopilot (new ADR: supersedes ADR 0080 §2–3, amends ADR 0079 §3)

- **On for every athlete.** A per-athlete setting defaults to autopilot. A data migration sets it on for every existing athlete, including those with a plan today. The first notice an existing athlete gets carries one line saying the app now lays out the weeks, and where _Spør meg først_ is.
- **The Week Change** keeps its clock and its once-only claims. It still closes the week Sunday 20:00 local, writes one Week Replan per closed week and moves the Planning Horizon. What changes is the apply step. With autopilot on, every proposal at the close whose target is the machine's (or the plan, for a next round) is **applied immediately**, without a yes. That includes proposals that add load and the next round of an open-ended plan. The 06:00 silence step becomes a no-op for autopilot athletes.
- **Guards replace the yes.**
  - A step up is at most the presets' 5 % per round and never past the ramp guard's 8 % week-on-week rise.
  - A make-up copy (which adds load) is not placed automatically. The missed session stays _ikke gjort_, and the notice says it was let go.
  - The athlete's own sessions (`authored`, adopted, not released) are never changed. A proposal aimed at one is recorded as left alone and said in the notice.
- **Every autopilot write shows a notice and is undoable.**
  - Each applied proposal keeps the prescription and placement it replaced (a before-image on the proposal), so undo restores exactly.
  - Undoing a next round re-lays it at factor 1 rather than removing it, so the plan never ends.
  - Undo is idempotent. It is refused once the week it changed has begun or a session it changed has been trained (ADR 0088's rule: refuse rather than trample), with a sentence saying so.
- **The notice** replaces the Week Change Card's questions with statements of what changed (_Neste uke er lagt ut_). Each line has its reason (the stored Norwegian reason) and _Angre_, plus _Angre alt_. It sits on I dag above the week until it has been seen and the week has begun. The full history stays in _Se hele sesongen_. A week the autopilot could not lay says so in the notice.
- **_Spør meg først_** (in _Meg_) keeps today's propose-and-answer behaviour unchanged, including ADR 0080 §2–3 and ADR 0079 §3's yes for added load and the next round. Switching back on applies from the next close. It never retroactively applies open proposals.
- The **proposal author** is unchanged. Only the apply rules change, which is what ADR 0080 §6 anticipated.

### I dag (new ADR: amends ADR 0086 §1, ADR 0082 §5 and ADR 0087 for the default view)

- **The default view** is, in order:
  - a top line: the date and the plan name;
  - the **today card**, with _Gjort_, the _Juster_ chips and _Bytt økt_;
  - the Autopilot Notice when there is one;
  - this week's seven rows;
  - _Se hele sesongen_.

  It reads the same ledger and week model the Home Timeline reads, so the week's numbers cannot disagree with the full view.
- **The today card returns** a "today first" block, which ADR 0086 §1 removed with the hero. It is one card, not a pager. The coach line can live on it. This is accepted and recorded in the ADR.
- **The full Home Timeline** (Week Strip, Stream, Writing Line, composer, Season Pane, Day Pane) is kept unchanged as the _Se hele sesongen_ view, which is the move ADR 0082 §5 and ADR 0087 are amended for. Its landing position is today (ADR 0086 §4). The "26 empty weeks back" start must not be the first thing it shows. On a large screen, the default view puts the card and the week side by side, and _Se hele sesongen_ opens the three panes.
- **Week rows say _fri_ on a free day, never _hvile_**, except where the plan prescribes recovery (Every-Day Grid rule). The prototype's _hvile_ is not carried over.
- **Actions by time**: _Gjort_ on today's session and on past sessions not yet done. No done or missed action on a future session. _Marker som ikke gjort_ is never a primary action.
- Every session row opens its detail. A completed session with no Workout opens a detail that says what is known, never a 404.

### Juster

- **Three intents on one resource route**: _For sliten i dag_, _Lite tid_ and _Bytt dag_. Each is a conform form on one zod union. Each replies with what changed, the toast text and an undo token (ADR 0088 §1 and its _Gjort_ amendment).
  - **For sliten i dag**: an endurance session becomes easy (intent easy, no quality), at 60 % of its duration with a 20-minute floor. A strength session or Simple Activity keeps its kind, gets the Effort Word _rolig_ and a shortened duration.
  - **Lite tid**: the duration is cut to 30 minutes, or 20 minutes if it was 30 or less. The intent is kept.
  - **Bytt dag**: the session moves to the next free day this week. If no day is free, it swaps with the next session. If no later day exists, it is refused with a reason.
- **Session Adoption exception (explicit and documented).**
  - _For sliten i dag_ and _Lite tid_ change the prescription: duration, blocks and, for _For sliten_, the intent. Under Session Adoption that would adopt the session. On the machine's session they **do not adopt**. They are a machine write at the athlete's request, like the Session Nudge's ease. The session stays the machine's, so the autopilot keeps laying later weeks normally.
  - On the athlete's own session they change it, and it stays the athlete's.
  - _Bytt dag_ is a reschedule, so it does not adopt under the existing rule. It is not an exception.
  - This exception is recorded in the autopilot ADR and in the glossary's Session Adoption entry.
- **Every Juster write** leaves a **Replan Note** and never moves the Week Target. It touches today's session only (and, for a _Bytt dag_ swap, the one session it swaps with). Undo restores the before-image. It is idempotent and refused after the session is trained.
- **_Bytt økt_** opens _Bibliotek_ in a picker. The chosen session replaces today's prescription, with _Angre_. That is the athlete's choice of session, so it **adopts** under the normal rule. It is not part of the exception.
- **_Avansert_** is the fourth chip. It links to the session detail, the composer and _Plan_ → _Avansert_.
- Prototype F's _Ta neste økt i dag_ (pull the next session forward on a free day) is out of scope for v1.

### Plan tab and tabs (new ADR: amends ADR 0083 §1 and ADR 0090 §2's order)

- **_Plan_** is the Sesong route renamed in the UI. It leads with:
  - the plain name and the family small;
  - the I dag season curve (ADR 0090 §1);
  - _Legg til et løp_;
  - _Bytt treningsform_, which opens the Start Options again for the plan's tracks and days. Applying one is today's philosophy switch, behind its preview (ADR 0079 S7).

  Below come a _Bibliotek_ section (Catalogue, programs, exercises, unchanged inside) and a closed _Avansert_ section holding everything else on today's Sesong page, unchanged.
- **Three tabs**: _I dag_, _Plan_, _Meg_. _Bibliotek_ has no tab. It is reached from _Plan_ and from _Bytt økt_ on I dag. Every old Sesong and Bibliotek URL keeps working and lands in _Plan_, or in the Bibliotek section, with the _Plan_ tab active. The tab registry is the one place the tabs change.
- **_Meg_** gains level, activities, strength frequency, session preferences and the autopilot switch.

### Motion (ADR 0085's scale and Emil Kowalski's skills)

- From prototype E (_Levende_, built on A), as decisions:
  - Shared-element morphs (container clip-path + FLIP) take 280 ms on `--ease-in-out`.
  - _Uka di_ blocks enter with a 30 ms stagger and leave in 160 ms. Exits are faster than entries.
  - The celebration is 8 sparks over 300 ms from the check. It is compositor-only, once per session and never on undo.
  - Only transform, opacity and clip-path animate.
  - Reduced motion uses a 200 ms cross-fade for every morph and no sparks (ADR 0077's rule: gentler, never zero).
- View Transitions where available, with an instant fallback. Rapid taps skip the running transition.
- From prototype F, only the one-tap _Juster_ chips, and only as specified above.
- Run `review-animations`, the `mobile-native` checklist and `break-ui` with worst-case data before each UI slice is done. Each PR says what still needs a real phone.

## Testing Decisions

- A good test drives external behaviour: the answers in, the options, plan and sessions out. It never asserts on internal helpers, intermediate arrays or DOM structure. Names use glossary words.
- **Main seam: the pure first-run draft, widened to return ranked Start Options.** Answers in, ranked distinct Start Options and the Plan Start Week out. Most of the start is tested here:
  - options differ, and _Stor base_ is all easy in its first block;
  - identical options merge, so no two returned weeks are equal, for every level and day count;
  - the ranking and the badge, and the beginner families;
  - week 1 equals the hours, or the shortfall is said;
  - _Fikk ikke plass_, level caps and several endurance sports;
  - Simple Activity days and strength days at the chosen frequency;
  - the start week is the first week not yet begun;
  - the Week Sketch equals the top option.

  Prior art: the existing first-run draft tests, which run over every preset family.
- **The plan writer: "what is made is what was shown".** It runs the draft and the writer against a real test database and compares sessions minute for minute. It also checks that no session gets a completion or _ikke gjort_ when a plan is made. Prior art: the existing first-run plan server tests (same days, same minutes, capacity equal to the heaviest week, refusal when a plan exists).
- **Autopilot through the weekly week-change step for one athlete, with an injected clock.** It covers:
  - apply at close, for new and migrated athletes;
  - added load and the next round applied within the guards;
  - the athlete's own sessions untouched and said in the notice;
  - make-up not placed;
  - undo restoring exactly, undo refused after the week begins, and next-round undo re-laying at factor 1;
  - _Spør meg først_ keeping today's behaviour exactly.

  Prior art: the existing week-change server tests ("from Monday 06:00 silence applies…", "a second run writes nothing").
- **Route tests** through loaders and actions for the start screens, _Juster_ (each intent, refusals, undo, no adoption for _For sliten_ / _Lite tid_, adoption for _Bytt økt_) and I dag's default view (actions by time, no 404, before the Plan Start Week). Prior art: the first-run route tests and the home index tests (day stamp, composer).
- **E2E only for motion**: the morphs and their reduced-motion fades, and the celebration. Prior art: the first-run and home-timeline e2e tests. The home-timeline test's declared-motion audit gets the new list.

## Out of Scope

- Import mapping for Simple Activities (auto-linking an imported climb or ski session), and any zone, pace, power or TSS for them.
- Widening the Discipline set (ski, hike and climb as Disciplines).
- AI as the proposal author.
- Changing the presets' shapes beyond _Stor base_'s all-easy first block.
- Rewriting Training Tracks already stored from _Stor base_.
- _Ta neste økt i dag_ and other Juster actions beyond _For sliten i dag_, _Lite tid_, _Bytt dag_, _Bytt økt_ and _Avansert_.
- Starting a plan in the current week (the plan starts on the first week not yet begun).
- Re-titling sessions laid before this spec.
- A Bibliotek redesign (it moves, its inside is unchanged).
- Multi-step undo history.

## Further Notes

**Context pointer.** The prototypes live on branch `prototype/enkel-start`: variant A (fixed: the questions, the swipe cards, I dag, the copy and the level defaults), variant E _Levende_ (the motion, built on A) and variant F _En tommel_ (the one-tap _Juster_ chips). Use them for decisions, not for their week-building code. Their pre-marking of past sessions as done is a bug (decision 10).

**ADRs to write or amend** (slice S1, through `/domain-modeling`):

- **New: Autopilot.** Supersedes ADR 0080 §2–3, amends ADR 0079 §3 (with autopilot on, the next round may be applied without a yes). It records the default for every athlete and the migration, _Spør meg først_, the guards, before-images and undo, the notice, and the _Juster_ exception to Session Adoption.
- **New: Three tabs and a calm I dag.** Amends ADR 0083 §1 (three tabs, _Bibliotek_ inside _Plan_ and behind _Bytt økt_, old URLs kept) and ADR 0090 §2's order. It records the accepted return of a today card against ADR 0086 §1, and the Stream and Week Strip moving behind _Se hele sesongen_ against ADR 0082 §5 and ADR 0087.
- **New: Start Options.** Amends ADR 0048: _Stor base_'s first block is all easy. It records that identical options are merged, that the hours mean week 1 (confirming ADR 0091 §3) and that the start week is ADR 0079's first week not yet begun.
- **Amend ADR 0015**: `other` is plannable as a Simple Activity with an Activity Kind and Effort Word, time and hardness only. Imports of `other` still land in **Annet**.
- **Glossary**: the new and updated terms above, including the strength-frequency sentence, the Annet definition and the Session Adoption exception.

**Known bugs the new surfaces must not reproduce** (audit):

- I dag's list starting 26 empty weeks back: the full view must land on today, and the default view shows only this week.
- _Marker som ikke gjort_ as the primary action on a future session.
- Completed sessions without a Workout opening a 404.
- _Timer i uka_ pre-filled `0.1` with a decimal point: hours are never below the minimum, always with a decimal comma.
- Prototypes E and F mark every session before today as done when an option is chosen. Forbidden (story 131).

**Slices** (vertical, each demoable on a phone):

1. **S1: Glossary and ADRs.** Record the new terms, write the three new ADRs and the ADR 0015 amendment. No code.
2. **S2: The start's questions and _Uka di_ (no motion).** Level and hours, activities and days (with the strength tap), and preferences screens, all through the widened draft. The Week Sketch shows the top option's week. Run and bike only.
3. **S3: _Tre måter å trene på_.** The _Stor base_ preset change, ranked swipe cards with _Velg denne_, real weeks, merging of identical options, week 1 equal to the hours or said, _Fikk ikke plass_, the start date. Picking one makes the plan through the existing writer. _Planen er klar_ with the curve and _Under panseret_.
4. **S4: Calm I dag.** Today card, _Gjort_ with undo, the week list with _fri_, the before-start state, _Se hele sesongen_ to the existing timeline. Fixes the four audit bugs on the new surface.
5. **S5: _Juster_.** The three intents with undo and Replan Notes and the adoption exception, _Avansert_, and _Bytt økt_ through Bibliotek.
6. **S6: Autopilot.** The setting and migration (on for everyone), apply at close within guards, the next round without a yes, before-images, the notice with _Angre_ / _Angre alt_, and _Spør meg først_ in _Meg_.
7. **S7: Simple Activities.** `other` made plannable with Activity Kind and Effort Word, the hours track, the start placing them, _Fikk ikke plass_ for them, _Gjort_ by hand and linking by hand.
8. **S8: Strength and several endurance sports in the start.** Extra hours tracks with empty mixes, lifting days at the chosen frequency and the Stock Workout session.
9. **S9: Plan tab and three tabs.** Plain picture, _Bytt treningsform_ through the Start Options, the Bibliotek section, _Avansert_ holding today's Sesong, the tab registry, old URLs, and _Meg_'s new settings.
10. **S10: Motion.** _Uka di_ to cards, card to curve, curve to I dag, the celebration, reduced-motion cross-fades, and the e2e motion audit.

---
_Generated by [Claude Code](https://claude.ai/code)_
