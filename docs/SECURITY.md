# Security and privacy boundaries

The evaluator interprets bounded AST operations, never JavaScript source. It exposes no host path, network, cookie, DOM or shell operation. Strings render through textContent. The Computer executes in a Worker with validated message fields, finite budgets and a watchdog; the page CSP restricts scripts/styles to local files, blocks connections/forms and permits only the generated Blob Worker. UI imports are validated and do not execute automatically. Workspace/media imports preserve prior data on rejected input.

Limits reduce resource exhaustion but are not a complete browser/OS sandbox. The runtime API accepts trusted callbacks and overrides; never give hostile callers those options. A same-origin iframe with scripts/same-origin privileges cannot defend against a compromised host or malicious replacement JavaScript. Only trusted code should be installed. The optional resize bridge validates source window, origin, token, version/type and bounded dimensions; it never transports BASIC input.

No telemetry or cloud service is used. Browser storage, exports and in-tab media stay local unless shared. Hosting a page still generates ordinary server access requests/logs and may use host cookies. Extensions and other same-origin applications are outside the boundary. Browser file-URL storage varies; export important work.

No public security contact exists until publication approval. Do not put credentials, personal data or private program text in a public issue. A later owner-approved contact belongs in this file and the manual. These tests are not a security certification.
