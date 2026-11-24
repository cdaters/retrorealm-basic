import { TerminalView } from '../terminal/view.js';
import { receiveOutput } from './output.js';
import { SourceEditor, moveBoundary } from './editor.js';
import { Program, exportWorkspace, importWorkspace } from '../basic/program.js';
import { limits } from '../basic/profiles.js';
import { workerSource, sampleSource, examples } from './generated.js';
const $=id=>document.getElementById(id), key='retrorealm-basic-workspace:1:default';
const terminal=new TerminalView({output:$('output'),viewport:$('screen'),input:$('decision'),prompt:$('prompt'),announce:$('announce'),width:()=>Number($('columns').value)});
let worker, state='ready', pending=false, pendingCount=0, lastMessage=Date.now(), historySize=0, source='', dialect='ms8k',seed='observatory-1';
let editing=null, priorInput='';
const editor=new SourceEditor({input:$('source'),gutter:$('source-rows'),status:$('source-status'),onChange:()=>updateControls()});
function notice(message){$('notice').textContent=message;}
function showError(message){$('error-text').textContent=message;$('error-panel').hidden=false;const line=/ in (\d+)$/.exec(message);$('error-edit').hidden=!line;$('error-edit').dataset.line=line?.[1]??'';}
function clearError(){$('error-panel').hidden=true;}
function updateControls(){
  $('source').readOnly=pending||editing!==null;
  for(const id of ['apply','run','sample','load','import','dialect','seed','new-program','load-example'])$(id).disabled=pending||editing!==null;
  for(const id of ['tape-record','tape-mount','tape-rewind','device-export','device-import'])$(id).disabled=pending||editing!==null||state==='running';
  $('cancel-source').disabled=pending||editing!==null||!editor.dirty;
  $('decision').readOnly=pending&&editing!==null;
  $('cancel-line').hidden=editing===null;$('cancel-line').disabled=pending;
  for(const button of $('output').querySelectorAll('.listing-line'))button.disabled=pending||editing!==null||editor.dirty||['running','input'].includes(state);
  $('prompt').textContent=editing!==null?`EDIT ${editing} / Enter commits / Escape cancels >`:state==='input'?'INPUT >':state==='running'?'RUNNING / STOP to interrupt >':'READY >';
  $('decision').setAttribute('aria-label',editing!==null?`Editing BASIC line ${editing}`:'BASIC command or program input');
}
function requireDraftDecision(allowSource=false){
  if(editing!==null)throw new Error('Commit or cancel the line edit first.');
  if(!allowSource&&editor.dirty)throw new Error('Apply or cancel the source editor changes first.');
  if(pending)throw new Error('Wait for the current request to finish.');
}
function decorateListing(){
  const index=terminal.records.findLastIndex(r=>r.kind==='listing');
  if(index<0)return;
  const record=terminal.records[index],block=$('output').children[index],rows=record.text.split('\n');
  if(rows.length>256||!/^\d+\s/.test(rows[0]))return;
  block.replaceChildren();
  for(const text of rows){const line=Number(text.match(/^\d+/)?.[0]);if(!line)continue;const button=document.createElement('button');button.type='button';button.className='listing-line';button.textContent=terminal.text({text});button.setAttribute('aria-label',`Edit BASIC line ${line}: ${text}`);button.onclick=()=>action(()=>{requireDraftDecision();priorInput=$('decision').value;send({type:'edit-begin',line});});block.append(button);}
  updateControls();
}
function output(text,kind='output'){
  if(historySize+text.length>limits.output){terminal.receive({type:'clear'});historySize=0;}
  if(kind==='listing')for(let i=0;i<terminal.records.length;i++)if(terminal.records[i].kind==='listing'){$('output').children[i].textContent=terminal.text(terminal.records[i]);terminal.records[i].kind='output';}
  historySize+=text.length;receiveOutput(terminal,text,kind);
  while(terminal.records.length>500){const record=terminal.records.shift();historySize-=record.text.length;$('output').firstChild.remove();}
  if(kind==='listing')decorateListing();
}
function send(data){if(!worker){notice('Worker unavailable. Reload the page to retry. Source can still be exported.');return;}pending=true;pendingCount++;document.body.dataset.pending='true';updateControls();lastMessage=Date.now();worker.postMessage(data);}
function loadProgram(text,selectedDialect=$('dialect').value,selectedSeed=$('seed').value){const p=new Program(text);clearError();send({type:'load',source:p.list(),dialect:selectedDialect,seed:selectedSeed});}
function action(fn){try{fn();}catch(error){showError(error.message);notice(error.message);output('? '+error.message+'\n','help');}}
function remember(text){terminal.remember(text);if(terminal.history.length>100){terminal.history.shift();terminal.cursor=terminal.history.length;}}
function cancelLine(){if(editing!==null&&!pending)send({type:'edit-cancel'});}
function cancelSource(){if(pending||editing!==null)return;editor.cancel();notice('Source draft canceled. Program and execution state unchanged.');}
function failWorker(message){worker?.terminate();worker=null;state='error';pending=false;pendingCount=0;document.body.dataset.pending='false';editing=null;updateControls();$('decision').disabled=true;$('status').textContent='Worker stopped';notice(message);}
function begin(){
  const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
  try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);notice('Isolated Worker unavailable: '+error.message);return;}
  worker.onerror=()=>{URL.revokeObjectURL(url);failWorker('Worker failed. Reload to restart; editor source remains available to export.');};
  worker.onmessage=event=>{
    lastMessage=Date.now();const data=event.data;
    if(data.type==='ack'){pendingCount=Math.max(0,pendingCount-1);pending=pendingCount>0;document.body.dataset.pending=String(pending);updateControls();return;}
    if(data.type==='ready'){URL.revokeObjectURL(url);$('decision').disabled=false;loadProgram(sampleSource);output('RETROREALM BASIC\nObservatory example loaded.\nType RUN to begin, LIST to inspect, or HELP.\n');}
    else if(data.type==='devices'){const select=$('tape-file'),old=select.value;select.replaceChildren();for(const f of data.files){const option=document.createElement('option');option.value=f.name;option.textContent=`${f.name} (${f.records} records)`;select.append(option);}if(data.files.some(f=>f.name===old))select.value=old;$('device-status').textContent=data.tapes.map(t=>`Cassette ${t.unit}: ${t.name}, ${t.mode==='O'?'recording':'reading'}, position ${t.position}`).join('; ')||'No cassette inserted.';$('device-channels').textContent=data.channels.map(c=>`Channel ${c.channel}: ${c.name}, ${c.mode==='O'?'writing':'reading'}, record ${c.position}`).join('; ')||'No open file channels.';}
    else if(data.type==='device-export')download('retrorealm-devices-v1.json',data.text,'application/json');
    else if(data.type==='source'){source=data.source;dialect=data.dialect;seed=data.seed;editor.accept(source);$('welcome-message').textContent=source===sampleSource.trimEnd()?'The Observatory example is ready. Type RUN below, or start your own.':source?'Your program is loaded. Type RUN to begin or LIST to inspect it.':'A blank program is ready. Enter numbered lines below or open the source editor.';$('dialect').value=dialect;$('seed').value=seed;describeDialect();}
    else if(data.type==='edit'){editing=data.line;$('decision').value=data.text;$('decision').focus();$('decision').setSelectionRange(data.text.length,data.text.length);notice(`Editing line ${editing}. Enter commits; Escape cancels. Keep the line number, or enter it alone to delete.`);}
    else if(data.type==='edit-end'){
      editing=null;
      if(data.committed){remember(data.text);output('> '+data.text+'\n','input');notice('Line committed. Continuation discarded; type RUN when ready.');}
      else {$('decision').value=priorInput;notice('Line edit canceled. Program and execution state unchanged.');}
      $('decision').focus();priorInput='';
    }
    else if(data.type==='output')output(data.text,data.kind);
    else if(data.type==='notice'){showError(data.text);notice(data.text);output('? '+data.text+'\n','help');}
    else if(data.type==='state'){
      const previous=state;state=data.status;$('status').textContent=`${state.toUpperCase()}${data.line?' / LINE '+data.line:''} / ${data.steps} steps`;
      if(state==='error'&&previous!=='error'){showError(data.error);notice(data.error);output('? '+data.error+'\n','help');}
      else if(state==='stopped'&&previous!=='stopped'){notice('Stopped. CONT resumes this execution.');output('\nSTOPPED — CONT to resume.\n');}
      else if(state==='ended'&&previous!=='ended'){notice('Program ended. RUN starts again with the same seed.');output('\nREADY\n');}
    }
    updateControls();
  };
}
$('action-form').addEventListener('submit',event=>{event.preventDefault();action(()=>{
  const text=$('decision').value;
  if(editing!==null){if(!pending){send({type:'edit-commit',text});}return;}
  requireDraftDecision();priorInput='';remember(text);output('> '+text+'\n','input');send({type:'command',text});
});});
// Capture precedes the unchanged shared terminal's Up/Down history listener.
$('decision').addEventListener('keydown',event=>{
  if(editing===null||event.isComposing)return;
  if(moveBoundary($('decision'),event)){event.stopImmediatePropagation();}
  else if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancelLine();}
  else if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();}
},true);
$('source').addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();cancelSource();}});
$('cancel-line').onclick=cancelLine;$('cancel-source').onclick=cancelSource;
$('stop').onclick=()=>send({type:'stop'});
$('console').addEventListener('keydown',event=>{if(event.ctrlKey&&event.key.toLowerCase()==='c'&&!window.getSelection()?.toString()){event.preventDefault();if(editing!==null)cancelLine();else send({type:'stop'});}});
$('clear').onclick=()=>{terminal.receive({type:'clear'});historySize=0;};$('latest').onclick=()=>terminal.bottom();
$('columns').onchange=()=>{document.body.dataset.columns=$('columns').value;terminal.reflow();decorateListing();};
$('phosphor').onchange=()=>{document.body.dataset.theme=$('phosphor').value;};
$('apply').onclick=()=>action(()=>{requireDraftDecision(true);loadProgram($('source').value);notice('Source applied. Continuation discarded.');});
$('sample').onclick=()=>action(()=>{requireDraftDecision();loadProgram(sampleSource,'ms8k','observatory-1');notice('Original Observatory sample loaded.');});
$('run').onclick=()=>action(()=>{requireDraftDecision(true);loadProgram($('source').value);send({type:'command',text:'RUN'});$('decision').focus();});
for(const id of ['dialect','seed'])$(id).onchange=()=>action(()=>{try{requireDraftDecision();loadProgram(source);notice('Settings applied. RUN starts fresh with this seed.');}catch(error){$('dialect').value=dialect;$('seed').value=seed;throw error;}});
function workspace(){if(editing!==null)throw new Error('Commit or cancel the line edit first.');return exportWorkspace(new Program($('source').value),$('dialect').value,$('seed').value);}
$('save').onclick=()=>action(()=>{localStorage.setItem(key,workspace());notice('Editor workspace saved locally; this does not apply or execute the draft.');});
$('load').onclick=()=>action(()=>{requireDraftDecision();const data=localStorage.getItem(key);if(!data)throw new Error('No BASIC workspace saved here');const w=importWorkspace(data);loadProgram(w.program.list(),w.dialect,w.seed);notice('Workspace restored; type RUN when ready.');});
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Editor export prepared: '+name);}
$('export').onclick=()=>action(()=>{if(editing!==null)throw new Error('Commit or cancel the line edit first.');download('retrorealm-program.bas',new Program($('source').value).list()+'\n','text/plain');});
$('export-workspace').onclick=()=>action(()=>download('retrorealm-workspace-v1.json',workspace(),'application/json'));
$('import').onchange=async()=>{try{requireDraftDecision();const file=$('import').files[0];if(!file)return;if(file.size>limits.source*2)throw new Error('Import file exceeds 256 KiB');const text=await file.text();requireDraftDecision();if(/\.json$/i.test(file.name)){const w=importWorkspace(text);loadProgram(w.program.list(),w.dialect,w.seed);}else{if(!/\.(bas|txt)$/i.test(file.name))throw new Error('Choose .bas, .txt or workspace .json');loadProgram(text);}notice('Imported source. Review it in the editor, then RUN.');}catch(error){showError(error.message);notice('Import rejected: '+error.message);}finally{$('import').value='';}};
for(const [id,operation]of [['tape-record','record'],['tape-mount','mount'],['tape-rewind','rewind'],['device-export','export']])$(id).onclick=()=>action(()=>{requireDraftDecision();send({type:'device',action:operation,data:operation==='record'?$('tape-name').value:operation==='mount'?$('tape-file').value:''});});
$('device-import').onchange=async()=>{try{requireDraftDecision();const file=$('device-import').files[0];if(!file)return;if(file.size>2097152)throw Error('Device image exceeds 2 MiB');const text=await file.text();requireDraftDecision();send({type:'device',action:'import',data:text});}catch(e){showError(e.message);notice('Device import rejected: '+e.message);}finally{$('device-import').value='';}};
setInterval(()=>{if(worker&&(state==='running'||pending)&&Date.now()-lastMessage>5000)failWorker('Worker did not respond for five seconds and was terminated. Export editor source and reload.');},500);
const dialectDescriptions={ms8k:'Microsoft 8K subset · a good starting point for classic numbered BASIC.',tiny:'Tiny BASIC subset · one-letter variables and integer arithmetic.',swbasic:'Simple Web Basic subset · full, case-sensitive variable names.',trs80:'TRS-80 Level II subset · typed variables and virtual cassette records.'};
function describeDialect(){$('dialect-help').textContent=dialectDescriptions[$('dialect').value]+' See the guide for compatibility limits.';}
for(const example of examples){const option=document.createElement('option');option.value=example.id;option.textContent=example.title;$('example-choice').append(option);}
function describeExample(){$('example-description').textContent=examples.find(e=>e.id===$('example-choice').value).description;}
$('example-choice').onchange=describeExample;describeExample();describeDialect();
$('show-examples').onclick=()=>{$('examples').open=true;$('example-choice').focus();};
$('show-files').onclick=()=>{$('files').open=true;$('import').focus();};
let shelfReplacement=null;
function commitShelf(text,dialect){loadProgram(text,dialect);notice(text?'Example loaded. Type RUN to begin.':'Enter numbered lines at the prompt or in the source editor.');$('editor-panel').open=true;$('source').focus();}
function cancelShelf(){shelfReplacement=null;$('replace-program').hidden=true;$('new-program').focus();}
function replaceFromShelf(text,dialect){requireDraftDecision();if(source&&source!==sampleSource.trimEnd()){shelfReplacement={text,dialect};$('replace-program').hidden=false;$('replace-cancel').focus();return;}commitShelf(text,dialect);}
$('replace-confirm').onclick=()=>action(()=>{requireDraftDecision();if(!shelfReplacement)return;const {text,dialect}=shelfReplacement;shelfReplacement=null;$('replace-program').hidden=true;commitShelf(text,dialect);});
$('replace-cancel').onclick=cancelShelf;
$('replace-program').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();cancelShelf();}};
$('new-program').onclick=()=>action(()=>{replaceFromShelf('',$('dialect').value);});
$('load-example').onclick=()=>action(()=>{const example=examples.find(e=>e.id===$('example-choice').value);replaceFromShelf(example.source,example.dialect);});
$('error-edit').onclick=()=>action(()=>{requireDraftDecision();send({type:'edit-begin',line:Number($('error-edit').dataset.line)});});
function updateFullscreen(){const active=!!document.fullscreenElement||document.body.dataset.focus==='true';$('fullscreen').textContent=active?'Exit fullscreen':'Fullscreen';$('fullscreen').setAttribute('aria-pressed',String(active));}
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.body.dataset.focus==='true')delete document.body.dataset.focus;else if(document.querySelector('main').requestFullscreen)await document.querySelector('main').requestFullscreen();else document.body.dataset.focus='true';}catch{document.body.dataset.focus='true';notice('Browser fullscreen unavailable. Focus view is active; Escape exits.');}updateFullscreen();};
document.addEventListener('fullscreenchange',updateFullscreen);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.dataset.focus==='true'){delete document.body.dataset.focus;updateFullscreen();$('fullscreen').focus();}});
if(innerWidth<600)$('columns').value='40';document.body.dataset.columns=$('columns').value;
begin();
