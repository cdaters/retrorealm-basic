# Architecture and extension boundaries

`packages/basic/` is the portable engine: profile-specific tokenization/parsing, numbered Program storage, bounded AST execution in Machine, BasicSession and virtual devices. `index.js` is the source API; `runtime-index.js` becomes the standalone runtime entry point. No engine import references a browser or Grav API.

`packages/basic-session/` owns the browser application, source editor and Worker protocol. `packages/terminal/{render,view}.js` provides accessible transcript rendering. `packages/player/{embed.js,player.css}` is the shared visual/iframe helper; the directory name is retained for reproducible module identities, and does not contain any game. `scripts/build.mjs` generates a local module bundle and embeds a Worker plus original examples. There is no eval-based compilation, network module loading or production dependency install.

The compiler changes only at an explicit language milestone. Add small original regression programs for each profile semantic change; keep other profiles isolated. Imports/exports and virtual media have independent versioned schemas; do not silently migrate running states. Keep source/statement/expression/time/output/array/string/device ceilings intact. Tests exercise profile differences, edit cancellation, STOP/CONT, deterministic randomness, safe output and invalid imports.

A trusted host can construct `new Machine(new Program(source), {dialect, seed, write})`, step while running, provide `input(text)` at INPUT, and stop/continue. This synchronous API is suitable for a trusted integration, not direct execution of hostile input on a page's main thread. Use the Computer Worker or supply an equivalent bounded process boundary. No game adapter is needed to execute actual BASIC.

The HTML manual is authored as chapter JSON and a stylesheet in `docs/manual/`; it is compiled by the same build. The seven `samples/basic` programs are original project examples. Add examples to `examples.json` with a declared profile and test inputs; the example regression test runs every registered example.
