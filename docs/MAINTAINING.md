# Independent build and maintenance

Use Node 22+ and Python 3. `npm test` runs the original program/profile, editor, media and security tests. `npm run build` recreates only `dist/computer`, `dist/runtime` and their manifest; existing ZIPs are immutable. `npm run package` creates separate Computer/runtime/source archives. A clean checkout can build without any sibling repository or npm install. The source archive includes build/test/manual inputs; it excludes Git history, evidence, node_modules, local tooling and generated distributions.

Optional browser verification: install Playwright as local development tooling (or set PLAYWRIGHT_MODULE to an existing module's absolute path), install its Chromium/Firefox/WebKit engines, then `npm run test:browser`. No browser tooling is distributed. Automated mobile viewports are not physical touch or human screen-reader acceptance.

Change version/build metadata in `package.json`, `release.json`, the Computer environment manifest, CHANGELOG and prepared notices together. Apache-2.0 covers the original project materials; retain LICENSE and NOTICE and keep historical content outside these distributions. Publish immutable versioned artifacts only after approval. Do not overwrite older ZIPs or move published tags.

For a host update, supply the Computer artifact and `dist/manifest.json` to the separate plugin maintainer. The host must verify every file and record version, source commit and inventory hash in its lock. No runtime auto-update, dynamic GitHub fetch or CDN dependency is permitted. The host may stay on an older approved version until explicitly upgraded.
