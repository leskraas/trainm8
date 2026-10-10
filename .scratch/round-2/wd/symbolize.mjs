// Usage: node symbolize.mjs <profile.cpuprofile> [filter]
// Maps a CPU profile's minified frames back through the build's source maps
// and prints self/total time per original file:function.
import fs from "node:fs";
import { SourceMapConsumer } from "/home/user/trainm8/.claude/worktrees/agent-aa8f076f5bf710e28/node_modules/source-map-js/source-map.js";

const assets =
  "/home/user/trainm8/.claude/worktrees/agent-aa8f076f5bf710e28/build/client/assets/";
const profile = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const filter = process.argv[3];
const consumers = new Map();
function consumer(file) {
  if (!consumers.has(file)) {
    const p = assets + file + ".map";
    consumers.set(
      file,
      fs.existsSync(p)
        ? new SourceMapConsumer(JSON.parse(fs.readFileSync(p, "utf8")))
        : null,
    );
  }
  return consumers.get(file);
}
function name(n) {
  const cf = n.callFrame;
  const file = cf.url.split("/").pop();
  if (!file) return cf.functionName || "(native)";
  const c = consumer(file);
  if (!c || cf.lineNumber < 0) return `${cf.functionName} ${file}`;
  const pos = c.originalPositionFor({
    line: cf.lineNumber + 1,
    column: cf.columnNumber,
  });
  const src = (pos.source ?? file)
    .replace(/^.*node_modules\//, "nm/")
    .replace(/^.*\/app\//, "app/");
  return `${pos.name ?? cf.functionName} ${src}:${pos.line}`;
}
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes)
  for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i];
  self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
}
const names = new Map();
const nm = (id) => {
  if (!names.has(id)) names.set(id, name(byId.get(id)));
  return names.get(id);
};
const selfBy = new Map();
const totalBy = new Map();
const fileTotal = new Map();
for (const [id, ms] of self) {
  const k = nm(id);
  selfBy.set(k, (selfBy.get(k) ?? 0) + ms);
  const seen = new Set();
  const seenFiles = new Set();
  let cur = id;
  while (cur != null) {
    const kk = nm(cur);
    if (!seen.has(kk)) {
      totalBy.set(kk, (totalBy.get(kk) ?? 0) + ms);
      seen.add(kk);
    }
    const f = kk.split(" ")[1]?.split(":")[0];
    if (f && !seenFiles.has(f)) {
      fileTotal.set(f, (fileTotal.get(f) ?? 0) + ms);
      seenFiles.add(f);
    }
    cur = parent.get(cur);
  }
}
const top = (m, n) =>
  [...m]
    .filter(([k]) => !filter || k.includes(filter))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${v.toFixed(1).padStart(8)} ms  ${k}`)
    .join("\n");
console.log("--- self ---\n" + top(selfBy, 30));
console.log(
  "--- total (app files) ---\n" +
    top(new Map([...totalBy].filter(([k]) => k.includes("app/"))), 45),
);
console.log("--- total by file ---\n" + top(fileTotal, 30));
