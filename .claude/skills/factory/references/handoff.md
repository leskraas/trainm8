# The handoff

Every message the factory gives a human ends with a **handoff**: what runs
next on its own, what the human does, and what their action sets off. A reader
who reads only the handoff knows whether to act, how, and what follows.

```markdown
**Next**
- **Automatic:** <what runs next without anyone, and when>, or "nothing".
- **You:** <the one action that moves the work on>, or "nothing".
- **After that:** <what the human's action sets off>.
```

**Automatic** names the task and the item, and when it runs. `$D config`
prints `schedule`:

- `hourly`: a scheduled task runs `/factory-dispatch` every hour, which
  starts a session per item, so a labelled item is taken "at the next factory
  run, within the hour".
- `none`: nothing runs until someone types `/factory`. Automatic is then
  "nothing", and the command goes under **You**.

**You** is an instruction the human carries out without reading anything
else: the link, the exact words to write ("answer `yes` in a comment on #207"),
or the command to type (`/factory 208`). Name one action; when the work needs
two, number them in the order they happen. Under **You**, "nothing" is a
complete answer, and the right one whenever the factory carries on by itself.

**After that** follows every **You** that is not "nothing": the task the
action starts, where it runs, and when ("the factory writes the spec for
#208, then designs and builds it; it stops for you only at a one-way door").
Leave it out when **You** is "nothing".

When a run returned `human_steps`, **You** also points to the issue that
collects them, and says they hold up nothing in the factory.

Write the handoff in the human's language. `conductor.py` writes the one at
the end of every run comment on GitHub, in English, from the same rules.
