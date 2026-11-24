# RetroRealm BASIC

An independent JavaScript BASIC interpreter and offline BASIC Computer. Write numbered programs, edit source, choose a compatibility profile, and keep portable copies of your work. No Grav installation, account, CDN, telemetry or runtime package dependency is required.

**v0.7.1 public beta · beta1.** Apache-2.0, copyright Craig Daters. See [LICENSE](LICENSE) and [NOTICE](NOTICE). [Release downloads](https://github.com/cdaters/retrorealm-basic/releases/tag/v0.7.1).

## Build and use

Requires Node 22+ for the build/tests and Python 3 for ZIP packaging. Browser users need only the built Computer files.

```sh
npm test
npm run build
npm run package
```

Open `dist/computer/index.html` directly from disk. Type RUN to explore the original Observatory program; STOP pauses, CONT resumes. The source editor, EDIT command, seven original examples and HTML manual are included. Green/amber/white themes, 40/80 columns and fullscreen/focus view work without a host site.

`dist/runtime/index.js` exports Program, Machine, BasicSession, VirtualDevices, profiles, tokenizer/parser, seeded randomness and workspace helpers. Import `./index.js` from this source repository for development. See [architecture](docs/ARCHITECTURE.md) and the generated `dist/computer/manual/programmer.html`.

## What is supported

Tiny BASIC, Microsoft 8K BASIC, Simple Web Basic and TRS-80 Level II are explicit, bounded compatibility subsets. Their syntax, numeric, string, input and random behavior intentionally differ. The generated manual's profile chapters describe limitations; none claims complete historical hardware/ROM emulation. Imports do not auto-execute or guess a dialect. Workspaces store source/settings, not a running-machine snapshot. Virtual media must be exported before closing the tab.

The browser app uses a separate Worker, finite budgets, restrictive CSP and validated requests. The library API is synchronous: integrators must provide their own isolation and must not expose callbacks/budget overrides to untrusted callers. BASIC has no arbitrary JavaScript, DOM, shell or host-network primitive. See [security boundaries](docs/SECURITY.md).

## Development and releases

The source of truth is `packages/`, `samples/basic/` and `docs/manual/`. The dependency-free builder produces Computer and runtime artifacts from those sources; it never reads a Grav checkout. `dist/manifest.json` inventories every output. ZIP generation is deterministic and refuses to replace differing existing artifacts. [Maintenance instructions](docs/MAINTAINING.md) describe versioning and optional browser checks.

This repository contains no historical games, proprietary research, private development history or production configuration. The separately maintained `grav-plugin-retrorealm-basic-lab` integration vendors a verified, version-pinned Computer release. Updating that host never requires an online runtime download.

Report beta feedback to [craig@daters.net](mailto:craig@daters.net) or [GitHub issues](https://github.com/cdaters/retrorealm-basic/issues). Include a minimal original reproduction, version, browser, profile, seed and error; do not share private source or copyrighted listings. Send security-sensitive reports by email. Human VoiceOver and physical-device testing remain follow-up work; automated browser checks are not a substitute.
