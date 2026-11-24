import { BasicSession } from '../basic/session.js';
let buffer='',timer=null;
const session=new BasicSession(event=>{if(event.type==='output'&&!event.kind)buffer+=event.text;else {flush();self.postMessage(event);}});
function flush(){if(buffer){self.postMessage({type:'output',text:buffer});buffer='';}}
function pump(){timer=null;session.tick();flush();if(session.machine?.status==='running')timer=setTimeout(pump,0);}
self.onmessage=event=>{
  try{
    const data=event.data;
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid Worker request');
    if(data.type==='load'&&Object.keys(data).sort().join(',')==='dialect,seed,source,type')session.load(data.source,data.dialect,data.seed);
    else if(data.type==='command'&&Object.keys(data).sort().join(',')==='text,type')session.command(data.text);
    else if(data.type==='edit-begin'&&Object.keys(data).sort().join(',')==='line,type')session.beginEdit(data.line);
    else if(data.type==='edit-commit'&&Object.keys(data).sort().join(',')==='text,type')session.commitEdit(data.text);
    else if(data.type==='edit-cancel'&&Object.keys(data).join(',')==='type')session.cancelEdit();
    else if(data.type==='device'&&Object.keys(data).sort().join(',')==='action,data,type'&&typeof data.action==='string'&&typeof data.data==='string')session.device(data.action,data.data);
    else if(data.type==='stop'&&Object.keys(data).join(',')==='type')session.stop();
    else throw new Error('Invalid Worker request');
    flush();if(session.machine?.status==='running'&&timer===null)timer=setTimeout(pump,0);
  }catch(error){flush();self.postMessage({type:'notice',text:error.message});session.state();}finally{self.postMessage({type:'ack'});}
};
self.postMessage({type:'ready'});
