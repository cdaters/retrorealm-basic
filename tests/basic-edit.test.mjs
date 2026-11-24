import test from 'node:test';
import assert from 'node:assert/strict';
import {BasicSession} from '../packages/basic/session.js';
function stopped(){const events=[],s=new BasicSession(e=>events.push(e));s.load('5 A=RND(1)\n10 STOP\n20 B=RND(1)\n30 END','ms8k','editing');s.command('RUN');s.tick();return {s,events};}
test('EDIT and cancel preserve stopped VM identity, state and deterministic continuation',()=>{
 const {s,events}=stopped(),control=stopped().s,m=s.machine;
 const before={pc:m.pc,steps:m.steps,random:m.lastRandom,vars:[...m.variables]};
 s.command('EDIT 5');assert.deepEqual(events.find(e=>e.type==='edit'),{type:'edit',line:5,text:'5 A=RND(1)'});
 assert.equal(s.machine,m);s.cancelEdit();assert.deepEqual({pc:m.pc,steps:m.steps,random:m.lastRandom,vars:[...m.variables]},before);
 s.command('CONT');control.command('CONT');s.tick();control.tick();assert.deepEqual([...s.machine.variables],[...control.machine.variables]);
});
test('editing fixes the reported NEXT RUN mistake without running on commit',()=>{
 const s=new BasicSession();s.load('5 FOR I=1 TO 5:PRINT I*I:NEXT RUN\n10 END','ms8k','fixed');s.command('RUN');s.tick();assert.match(s.machine.error,/NEXT without FOR/);
 s.command('EDIT 5');s.commitEdit('5 FOR I=1 TO 5:PRINT I*I:NEXT');assert.equal(s.machine,null);assert.equal(s.program.lines.get(5),'FOR I=1 TO 5:PRINT I*I:NEXT');s.command('RUN');s.tick();assert.equal(s.machine.status,'ended');assert.equal(s.machine.variables.get('I'),6);
});
test('line edit validates atomically, accepts bare-number deletion, and preserves ordinary replacement',()=>{
 const {s}=stopped(),before=s.program.list(),m=s.machine;s.beginEdit(5);
 for(const text of ['RUN','6 PRINT 1','5 PRINT 1\n6 END']){assert.throws(()=>s.commitEdit(text));assert.equal(s.program.list(),before);assert.equal(s.machine,m);assert.equal(s.editing,5);}
 assert.throws(()=>s.command('RUN'),/cancel/);assert.throws(()=>s.load('10 END','ms8k','1'),/cancel/);
 s.commitEdit('5');assert.equal(s.program.lines.has(5),false);assert.equal(s.machine,null);assert.throws(()=>s.command('CONT'));
 s.command('5 PRINT 1');s.command('5 PRINT 2');assert.equal(s.program.lines.get(5),'PRINT 2');s.command('5');assert.equal(s.program.lines.has(5),false);
});
test('missing/malformed EDIT and active execution guards never alter source or RNG',()=>{
 const {s}=stopped(),m=s.machine,before=s.program.list();for(const text of ['EDIT','EDIT FIVE','EDIT 999','EDIT 5 RUN'])assert.throws(()=>s.command(text));assert.equal(s.editing,null);assert.equal(s.machine,m);assert.equal(s.program.list(),before);
 s.command('CONT');assert.throws(()=>s.beginEdit(5),/STOP/);s.stop();s.beginEdit(5);s.cancelEdit();s.load('5 INPUT A$','ms8k','1');s.command('RUN');s.tick();assert.throws(()=>s.beginEdit(5),/STOP/);s.command('EDIT 5');assert.equal(s.machine.variables.get('A$'),'EDIT 5');
});
test('LIST carries selectable presentation metadata without changing program state',()=>{const {s,events}=stopped(),m=s.machine;s.command('LIST');const listing=events.find(e=>e.kind==='listing');assert.equal(listing.text,s.program.list());assert.equal(s.machine,m);assert.equal(s.editing,null);});
import {moveBoundary} from '../packages/basic-session/editor.js';
test('Home/End preserve Shift selection and multiline row/document boundaries',()=>{
 const input={value:'5 PRINT 1\n10 END',selectionStart:4,selectionEnd:4,selectionDirection:'none',setSelectionRange(start,end,direction='none'){Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction});}};
 const key=(name,extra={})=>moveBoundary(input,{key:name,preventDefault(){},...extra},true);
 key('End',{shiftKey:true});assert.deepEqual([input.selectionStart,input.selectionEnd],[4,9]);key('Home',{shiftKey:true});assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectionDirection],[0,4,'backward']);
 key('End',{ctrlKey:true});assert.equal(input.selectionStart,16);key('Home');assert.equal(input.selectionStart,10);key('Home',{ctrlKey:true});assert.equal(input.selectionStart,0);
 input.value='\n10 END';key('Home');assert.equal(input.selectionStart,0);
});
