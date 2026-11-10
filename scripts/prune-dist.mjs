// Deletes JavaScript files in dist/_astro that nothing in the built output
// uses. A file counts as used if a built HTML or CSS file references it, or
// if another used JS file imports it (static or dynamic import(), so the
// lazy-loaded city chunk stays: the view-switch script references it by
// file name). Prints every file it removes.
import { readdir, readFile, rm, stat } from "node:fs/promises"
import path from "node:path"

const dist = path.resolve("dist")
const assets = path.join(dist, "_astro")

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

let files
try {
  files = await walk(dist)
} catch {
  console.log("prune-dist: no dist folder, nothing to do")
  process.exit(0)
}

const scripts = files.filter(
  (f) => f.startsWith(assets + path.sep) && f.endsWith(".js")
)
const roots = files.filter((f) => /\.(html|css)$/.test(f))

const sources = new Map()
for (const file of [...scripts, ...roots]) {
  sources.set(file, await readFile(file, "utf8"))
}

const used = new Set()
const queue = []
function markReferencedBy(text) {
  for (const script of scripts) {
    if (!used.has(script) && text.includes(path.basename(script))) {
      used.add(script)
      queue.push(script)
    }
  }
}
for (const root of roots) markReferencedBy(sources.get(root))
while (queue.length) markReferencedBy(sources.get(queue.pop()))

let removedBytes = 0
let removed = 0
for (const script of scripts) {
  if (used.has(script)) continue
  const { size } = await stat(script)
  await rm(script)
  removed += 1
  removedBytes += size
  console.log(
    `prune-dist: removed ${path.relative(dist, script)} (${(size / 1024).toFixed(1)} KB)`
  )
}
console.log(
  removed
    ? `prune-dist: removed ${removed} unreferenced file(s), ${(removedBytes / 1024).toFixed(1)} KB`
    : "prune-dist: no unreferenced JS files"
)
