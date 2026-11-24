import { Program } from './program.js';
import { VirtualDevices } from './devices.js';
import { Machine } from './machine.js';
import { limits, profileFor } from './profiles.js';
export class BasicSession {
  constructor(emit=()=>{}){this.emit=emit;this.program=new Program();this.dialect='ms8k';this.seed='1';this.machine=null;this.editing=null;this.devices=new VirtualDevices();this.deviceState='';}
  source(){this.emit({type:'source',source:this.program.list(),dialect:this.dialect,seed:this.seed});}
  output(text){this.emit({type:'output',text});}
  state(){const m=this.machine;this.emit({type:'state',status:m?.status??'ready',line:m?.line??null,steps:m?.steps??0,error:m?.error??null});const devices=this.devices.catalog(),encoded=JSON.stringify(devices);if(encoded!==this.deviceState){this.deviceState=encoded;this.emit({type:'devices',...devices});}}
  load(source,dialect,seed){profileFor(dialect);if(typeof seed!=='string'||seed.length>128)throw new Error('Seed length limit');const candidate=new Program(source);if(this.editing!==null)throw new Error('Commit or cancel the line edit first');this.devices.close();this.program=candidate;this.dialect=dialect;this.seed=seed;this.machine=null;this.source();this.state();}
  device(action,data){if(this.machine?.status==='running')throw Error('STOP or wait for INPUT before changing devices');if(this.editing!==null)throw Error('Cancel or commit the line edit first');
    if(action==='record'){if(this.devices.files.has(data))throw Error('Choose a new tape name; existing tape preserved');this.devices.mount(data,'O');}
    else if(action==='mount')this.devices.mount(data,'I');
    else if(action==='rewind')this.devices.rewind();
    else if(action==='import')this.devices.import(data);
    else if(action==='export')this.emit({type:'device-export',text:this.devices.export()});
    else throw Error('Unknown device operation');this.state();
  }
  stop(){this.machine?.stop();this.state();}
  beginEdit(line){
    if(this.editing!==null)throw new Error('Commit or cancel the current line edit first');
    if(['running','input'].includes(this.machine?.status))throw new Error('STOP the program before editing a line');
    if(!Number.isInteger(line)||!this.program.lines.has(line))throw new Error(`No program line ${line}`);
    this.editing=line;
    this.emit({type:'edit',line,text:`${line} ${this.program.lines.get(line)}`});
  }
  commitEdit(text){
    if(this.editing===null)throw new Error('No active line edit');
    if(typeof text!=='string'||text.length>limits.line+6||/[\r\n]/.test(text))throw new Error('Enter one numbered BASIC line');
    const match=/^\s*(\d+)(?:\s|$)/.exec(text);
    if(!match||Number(match[1])!==this.editing)throw new Error(`Keep line number ${this.editing}; enter that number alone to delete it`);
    this.program.edit(text);this.machine=null;this.editing=null;
    this.emit({type:'edit-end',committed:true,text});this.source();this.state();
  }
  cancelEdit(){
    if(this.editing===null)return;
    this.editing=null;this.emit({type:'edit-end',committed:false});this.state();
  }
  command(text){
    if(typeof text!=='string'||text.length>limits.line)throw new Error('Command length limit');
    if(this.editing!==null)throw new Error('Commit or cancel the line edit first');
    const upper=text.trim().toUpperCase();
    if(upper==='/STOP'){this.stop();return;}
    if(this.machine?.status==='input'){this.machine.input(text);this.state();return;}
    if(this.machine?.status==='running'){if(upper==='STOP')this.stop();else throw new Error('Program running; STOP first');return;}
    if(/^\s*\d+/.test(text)){this.program.edit(text);this.machine=null;this.source();}
    else if(upper==='NEW'){this.program=new Program();this.machine=null;this.source();this.output('New program.');}
    else if(/^EDIT(?:\s|$)/.test(upper)){if(!/^EDIT\s+\d+$/.test(upper))throw new Error('Use EDIT followed by a line number');this.beginEdit(Number(upper.slice(4).trim()));}
    else if(upper==='LIST')this.emit({type:'output',kind:'listing',text:this.program.list()||'(Empty program)'});
    else if(upper==='RUN'){this.devices.close();this.machine=null;this.machine=new Machine(this.program,{dialect:this.dialect,seed:this.seed,devices:this.devices,write:s=>this.output(s)});}
    else if(upper==='STOP')this.stop();
    else if(upper==='CONT'){if(!this.machine)throw new Error('Cannot continue');this.machine.cont();}
    else if(upper==='HELP')this.output('NEW / LIST / EDIT n / RUN / STOP / CONT\nEDIT 10 retrieves line 10. Enter commits; Escape cancels.\nLeft/Right and Home/End edit the input; Up/Down history resumes afterward.\n10 PRINT "HELLO" inserts or replaces line 10.\n10 deletes line 10. Edits discard CONT state.\nUse the program editor and file controls for text/.bas files.\nSTOP button or Ctrl-C interrupts even at INPUT.\nCONT resumes STOP, including pending INPUT.\nRUN resets variables, DATA and the deterministic seed.\nThis is a bounded prototype; see the compatibility notes.');
    else if(upper)throw new Error('Unknown session command. Type HELP. Immediate statements are not implemented.');
    this.state();
  }
  tick(){if(this.machine?.status==='running'){this.machine.step();this.state();}return this.machine?.status;}
}
