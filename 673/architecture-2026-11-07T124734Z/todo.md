# Todo: #673 architecture

1. [x] **Read where it stands.** Fetch the issue with its decisions and its `Design` section. On a resumed run, return each door the human approved with `approved_by` set to their login, and settle each door they changed again with their answer. Done when you know which doors are already settled.
2. [x] **Check the issue against the domain.** Read the glossary and every ADR in the area the issue touches, then the code there, for: Drift; Strained seams; One-way doors. Done when every term in the acceptance criteria maps to the glossary, and every door and strained seam is named.
3. [x] **Settle them.** Each door is a decision ... A restructuring with no door goes into the `Architecture` section as work the build does in the same PR.
4. [x] **Write it down.** ... Done when every settled door has its ADR, its glossary line, or a line in your comment on why it needs neither.
