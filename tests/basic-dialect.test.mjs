import test from 'node:test';import assert from 'node:assert/strict';
import {Program,exportWorkspace,importWorkspace} from '../packages/basic/program.js';import {Machine} from '../packages/basic/machine.js';import {profileFor} from '../packages/basic/profiles.js';import {tokenize,parseLine} from '../packages/basic/parser.js';
function run(text,options={}){let output='';const m=new Machine(new Program(text),{dialect:'swbasic',...options,write:s=>output+=s});while(m.status==='running')m.step();return {m,get output(){return output;}};}
test('keyword recognition is profile-specific; strings REM and DATA are not rewritten',()=>{
 for(const dialect of ['tiny','ms8k','trs80'])assert.deepEqual(tokenize('LET LANDTRADE=0',profileFor(dialect)).map(t=>t.value),['LET','L','AND','TRADE','=',0,'']);
 assert.deepEqual(tokenize('LET LANDTRADE=0',profileFor('swbasic')).map(t=>t.value),['LET','LANDTRADE','=',0,'']);
 assert.equal(tokenize('let landTrade=0',profileFor('swbasic'))[1].value,'landTrade');
 for(const dialect of ['tiny','ms8k','trs80','swbasic']){assert.equal(tokenize('PRINT "LANDTRADE AND"',profileFor(dialect))[1].value,'LANDTRADE AND');assert.equal(tokenize('REM LANDTRADE',profileFor(dialect)).length,2);assert.deepEqual(tokenize('DATA LANDTRADE,"AND"',profileFor(dialect))[1].value,['LANDTRADE','AND']);}
});
test('long names and case remain distinct in SWB; historical significance remains intact',()=>{
 const text='10 COL=40:COST=150:COLLAR=7:col=80:PRINT COL;COST;COLLAR;col';const r=run(text);assert.equal(r.m.status,'ended');assert.equal(r.output,'40150780\n');
 for(const dialect of ['ms8k','trs80']){const r=run('10 ABC=7:ABZ=9',{dialect});assert.equal(r.m.variables.size,1);assert.equal(r.m.variables.get(r.m.key('AB')),9);}
 const tiny=run('10 AA=7:AZ=9',{dialect:'tiny'});assert.equal(tiny.m.variables.get('A'),9);
 assert.equal(run('10 FORI=7:STOP=2:RESTORE=3:PRINT FORI+STOP+RESTORE').output,'12\n');
 assert.equal(run('10 FORI=1TO3:PRINT I:NEXTI',{dialect:'ms8k'}).output,' 1 \n 2 \n 3 \n');
});
test('SWB comparison, logical and arithmetic precedence follow inspected evaluator',()=>{
 const r=run('10 A=1<2:B=1 OR 0 AND 0:C=2^3^2:D=-2^2:E=2*3^2:PRINT A;B;C;D;E');assert.deepEqual(Object.fromEntries(r.m.variables),{A:1,B:0,C:64,D:4,E:36});
 const old=run('10 A=1<2:B=1 OR 0 AND 0:C=2^3^2:D=-2^2:E=2*3^2',{dialect:'ms8k'});assert.deepEqual(Object.fromEntries(old.m.variables),{A:-1,B:1,C:512,D:-4,E:18});
});
test('SWB input preserves case and numeric output/STR$ have no Microsoft padding',()=>{
 const r=run('10 INPUT A$\n20 PRINT A$;STR$(12);3,4');r.m.input('MiXeD, quoted "text"');while(r.m.status==='running')r.m.step();assert.match(r.output,/MiXeD, quoted "text"123   4\n$/);
 for(const dialect of ['ms8k','trs80','swbasic'])assert.equal(run('10 PRINT "ELSE";"-";"NOT";"RND";"AND"',{dialect}).m.status,'ended');
});
test('observed SWB argument revisit is isolated and deterministic, including RND zero/negative',()=>{
 const values=[0.1,0.7,0.4,0.9];let n=0;const r=run('10 A=INT(RND(1)*10):B=RND(0):C=RND(-1):D=RND',{random:()=>values[n++]});assert.deepEqual(Object.fromEntries(r.m.variables),{A:7,B:0.7,C:0.4,D:0.9});assert.equal(n,4);
 n=0;const old=run('10 A=INT(RND(1)*10):B=RND(0)',{dialect:'ms8k',random:()=>values[n++]});assert.equal(old.m.variables.get('A'),1);assert.equal(n,1);
 const text='10 FOR I=1 TO 4:PRINT INT(RND(1)*100):NEXT';assert.equal(run(text,{seed:'replay'}).output,run(text,{seed:'replay'}).output);
});
test('dialect diagnostics name the incompatible construct and BASIC line',()=>{
 assert.throws(()=>run('1191 LET LANDTRADE=0',{dialect:'ms8k'}),/AND.*Microsoft 8K.*LANDTRADE.*Simple Web Basic.*1191/);
 for(const word of ['WHILE','RANDOMIZE','TIMER','STRING$','CLS'])assert.throws(()=>parseLine('PRINT '+word+'(1)',profileFor('swbasic')),new RegExp('feature '+word.replace('$','\\$')+' is not implemented'));
 assert.throws(()=>run('10 A%=1'),/Unsupported character %.*Simple Web Basic.*10/);
 assert.throws(()=>run('10 INPUT A$',{dialect:'tiny'}),/String variables unavailable.*Tiny.*10/);
});
test('SWB workspace round trip preserves source/dialect/seed; imports are inert',()=>{
 const source='10 LET LANDTRADE=0\n20 INPUT ANS$';const w=importWorkspace(exportWorkspace(new Program(source),'swbasic','campaign'));assert.equal(w.program.list(),source);assert.equal(w.dialect,'swbasic');assert.equal(w.seed,'campaign');assert.equal(w.program.compile(profileFor(w.dialect)).locations.size,2);
});
