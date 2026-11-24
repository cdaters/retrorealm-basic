// Compatibility targets, not claims of full machine emulation.
export const profiles = Object.freeze({
  'swbasic': Object.freeze({ id:'swbasic', title:'Simple Web Basic — compatibility subset', integer:false, names:Infinity, truth:1, zone:3, integerRandom:false, strings:true, wholeIdentifiers:true, swbasic:true, caseSensitive:true, plainNumbers:true }),
  'tiny': Object.freeze({ id:'tiny', title:'Tiny BASIC — integer prototype', integer:true, names:1, truth:1, zone:8, integerRandom:true, strings:false }),
  'ms8k': Object.freeze({ id:'ms8k', title:'Microsoft 8K — subset prototype', integer:false, names:2, truth:-1, zone:14, integerRandom:false, strings:true }),
  'trs80': Object.freeze({ id:'trs80', title:'TRS-80 Level II — compatibility subset', trs80:true, integer:false, names:2, truth:-1, zone:16, integerRandom:false, strings:true })
});
export const limits = Object.freeze({ source:131072, lines:4096, line:8192, tokens:4096, depth:64, cells:16384, variables:1024, string:4096, stack:128, output:131072, expressions:1000000, instructions:1000000, milliseconds:2000, input:4096 });
export function profileFor(id) { if (!Object.hasOwn(profiles,id)) throw new Error('Unknown dialect'); return profiles[id]; }
export function seededRandom(seed) {
  let state=2166136261;
  for (const char of String(seed)) state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
  if (!state) state=1;
  return () => { state^=state<<13; state^=state>>>17; state^=state<<5; return (state>>>0)/4294967296; };
}
