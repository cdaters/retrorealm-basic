# RetroRealm BASIC 0.7.0 — standalone runtime public beta · beta1

Dependency-free ES modules. Import from index.js in a trusted Node or browser Worker host. The modules require modern JavaScript (Node 22+ for local tests). No Grav, DOM, native game module or third-party interpreter is required.

```js
import {Program, Machine} from './index.js';
const machine = new Machine(new Program('10 PRINT 2+3\n20 END'), {
  dialect: 'ms8k', seed: 'example', write: text => console.log(text)
});
while (machine.status === 'running') machine.step();
if (machine.status === 'error') throw new Error(machine.error);
```

For untrusted programs, put this code in a Worker/process and validate host messages. Do not expose budget overrides or host callbacks to source authors. step() is bounded but synchronous. input(text), stop() and cont() handle interactive execution. Program, Machine, BasicSession, VirtualDevices and all exported helpers are documented under manual/.

No historical source or data is included. Apache-2.0 applies to original project materials; see LICENSE, NOTICE and THIRD-PARTY-NOTICES.md. Public beta feedback: craig@daters.net.
