import { limits, profileFor, seededRandom } from './profiles.js';
import { csv, Parser } from './parser.js';
import { VirtualDevices } from './devices.js';

// AST interpreter. BASIC values never become JavaScript code or property paths.
export class Machine {
  constructor(program,{dialect='ms8k',seed='1',random,write=()=>{},clock=()=>performance.now(),budgets={},devices=new VirtualDevices()}={}){
    this.profile=profileFor(dialect);this.code=program.compile(this.profile);this.random=random??seededRandom(seed);this.write=write;this.clock=clock;this.limits={...limits,...budgets};
    this.devices=devices;this.types=new Map();this.stringSpace=50;this.row=0;
    this.variables=new Map();this.arrays=new Map();this.functions=new Map();this.calls=[];this.loops=[];this.pc=0;this.status='running';this.steps=0;this.evaluations=0;this.elapsed=0;this.output=0;this.column=0;this.cells=0;this.dataIndex=0;this.lastRandom=0;this.coverage=new Set();this.line=null;this.pending=null;this.depth=0;
  }
  key(name){if(this.profile.trs80){const suffix=/[$%!#]$/.test(name)?name.at(-1):(this.types.get(name[0])??'!');return name.replace(/[$%!#]$/,'').slice(0,this.profile.names)+suffix;}return name.replace(/\$$/,'').slice(0,this.profile.names)+(name.endsWith('$')?'$':'');}
  number(value){if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Numeric type/overflow error');return this.profile.integer?Math.trunc(value):value;}
  string(value){if(typeof value!=='string')throw new Error('String type mismatch');if(value.length>this.limits.string)throw new Error('String limit');return value;}
  integer16(value){const n=Math.floor(this.number(value));if(n< -32768||n>32767)throw Error('Integer overflow');return n;}
  checked(name,value){return name.endsWith('$')?this.string(value):this.profile.trs80&&name.endsWith('%')?this.integer16(value):this.number(value);}
  array(name,args,create=true){
    const key=this.key(name);let a=this.arrays.get(key);
    if(!a&&create){this.dim(name,args.map(()=>10));a=this.arrays.get(key);}
    if(!a||args.length!==a.bounds.length)throw new Error('Array dimension mismatch');
    let index=0;for(let i=0;i<args.length;i++){const n=Math.trunc(this.number(args[i]));if(n<0||n>a.bounds[i])throw new Error('Subscript out of range');index=index*(a.bounds[i]+1)+n;}
    return {a,index};
  }
  dim(name,bounds){const key=this.key(name);if(this.arrays.has(key))throw new Error('Array already dimensioned');if(bounds.length<1||bounds.length>4)throw new Error('Dimension limit');bounds=bounds.map(n=>Math.trunc(this.number(n)));const size=bounds.reduce((n,v)=>n*(v+1),1);if(bounds.some(n=>n<0)||!Number.isSafeInteger(size)||size+this.cells>this.limits.cells)throw new Error('Array memory limit');this.cells+=size;this.arrays.set(key,{bounds,values:new Map()});}
  read(target){const key=this.key(target.name);if(target.args){const {a,index}=this.array(key,target.args.map(x=>this.eval(x)));return a.values.get(index)??(key.endsWith('$')?'':0);}return this.variables.get(key)??(key.endsWith('$')?'':0);}
  assign(target,value){const key=this.key(target.name);value=this.checked(key,value);if(target.args){const {a,index}=this.array(key,target.args.map(x=>this.eval(x)));a.values.set(index,value);}else {if(!this.variables.has(key)&&this.variables.size>=this.limits.variables)throw new Error('Variable limit');this.variables.set(key,value);}}
  eval(node){
    if(++this.evaluations>this.limits.expressions)throw new Error('Expression evaluation budget exhausted');
    if(this.sliceStarted!==undefined && this.evaluations%128===0 && this.elapsed+this.clock()-this.sliceStarted>=this.limits.milliseconds)throw new Error('Execution budget exhausted');
    if(++this.depth>this.limits.depth)throw new Error('Expression/function depth limit');let value;
    try {switch(node.type){
      case 'literal':value=node.value;break;
      case 'variable':if(this.profile.swbasic&&node.args)for(const arg of node.args.slice(0,2))this.eval(arg);value=this.read(node);break;
      case 'unary':{const v=this.number(this.eval(node.right));value=node.op==='-'?-v:node.op==='+'?v:~(this.profile.trs80?this.integer16(v):Math.trunc(v));break;}
      case 'binary':{const a=this.eval(node.left),b=this.eval(node.right),op=node.op;
        if(['=','<>','<','>','<=','>='].includes(op)){if(typeof a!==typeof b)throw new Error('Comparison type mismatch');value=({'=':a===b,'<>':a!==b,'<':a<b,'>':a>b,'<=':a<=b,'>=':a>=b}[op])?this.profile.truth:0;}
        else if(op==='+'&&typeof a==='string'&&typeof b==='string')value=this.string(a+b);
        else{this.number(a);this.number(b);if((op==='/'||op==='MOD')&&b===0)throw new Error('Division by zero');switch(op){case '+':value=a+b;break;case '-':value=a-b;break;case '*':value=a*b;break;case '/':value=a/b;break;case '^':value=a**b;break;case 'MOD':value=a%b;break;case 'AND':value=this.profile.trs80?this.integer16(a)&this.integer16(b):a&b;break;case 'OR':value=this.profile.trs80?this.integer16(a)|this.integer16(b):a|b;break;default:throw new Error('Unknown operator');}}break;}
      // The inspected SWB evaluator visits the first two children before dispatch,
      // then evaluates function arguments again. Keep that quirk profile-local.
      case 'call':if(this.profile.swbasic)for(const arg of node.args.slice(0,2))this.eval(arg);value=this.builtin(node.name,node.args.map(x=>this.eval(x)));break;
      case 'fn':{const f=this.functions.get(this.key(node.name));if(!f||node.args.length!==1)throw new Error('Undefined function/arity');const v=this.eval(node.args[0]),key=this.key(f.arg),had=this.variables.has(key),old=this.variables.get(key);this.assign({name:f.arg},v);try{value=this.eval(f.expression);}finally{if(had)this.variables.set(key,old);else this.variables.delete(key);}break;}
      default:throw new Error('Invalid expression');
    }return typeof value==='number'?this.number(value):this.string(value);}finally{this.depth--;}
  }
  builtin(name,args){
    const count=name==='MEM'?[0]:name==='RND'&&this.profile.swbasic?[0,1]:name==='MID$'?[2,3]:['LEFT$','RIGHT$'].includes(name)?[2]:[1];if(!count.includes(args.length))throw new Error(`Wrong number of arguments for ${name}`);
    const x=args[0],n=i=>this.number(args[i]);
    switch(name){
      case 'RND':{if(this.profile.trs80){const bound=n(0);if(bound<0||bound>32767)throw Error('RND bound range');return bound===0?this.draw():Math.floor(this.draw()*Math.floor(bound))+1;}if(!args.length)return this.draw();n(0);if(this.profile.integerRandom){if(x<1)throw new Error('RND bound must be positive');return Math.floor(this.draw()*Math.trunc(x))+1;}if(x<0&&!this.profile.swbasic)throw new Error('Negative RND reseeding is not implemented; use the session seed');return x===0?this.lastRandom:this.draw();}
      case 'MEM':throw Error('MEM requires a ROM memory layout; use an explicitly documented compatibility listing');
      case 'CINT':return this.integer16(n(0));case 'FIX':return Math.trunc(n(0));case 'CSNG':case 'CDBL':return n(0);
      case 'POS':return this.column%64;case 'EOF':return this.devices.eof(n(0))?-1:0;
      case 'INT':return Math.floor(n(0));case 'ABS':return Math.abs(n(0));case 'SGN':return Math.sign(n(0));
      case 'SQR':return Math.sqrt(n(0));case 'SIN':return Math.sin(n(0));case 'COS':return Math.cos(n(0));case 'TAN':return Math.tan(n(0));case 'ATN':return Math.atan(n(0));case 'LOG':return Math.log(n(0));case 'EXP':return Math.exp(n(0));
      case 'LEN':return this.string(x).length;
      case 'LEFT$':case 'RIGHT$':{const s=this.string(x),length=Math.trunc(n(1));if(length<0)throw new Error('Illegal string length');return name==='LEFT$'?s.slice(0,length):length?s.slice(-length):'';}
      case 'MID$':{const s=this.string(x),start=Math.trunc(n(1)),length=args.length===3?Math.trunc(n(2)):s.length;if(start<1||length<0)throw new Error('Illegal substring');return s.slice(start-1,start-1+length);}
      case 'STR$':return (n(0)>=0&&!this.profile.plainNumbers?' ':'')+String(x);
      case 'VAL':{const match=/^[ \t]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?/i.exec(this.string(x));return match?Number(match[0]):0;}
      case 'ASC':if(!this.string(x).length)throw new Error('Empty ASC');return x.charCodeAt(0);
      case 'CHR$':if(n(0)<0||x>255)throw new Error('CHR$ range');return String.fromCharCode(Math.trunc(x));
      case 'TAB':case 'SPC':{const amount=Math.trunc(n(0));if(amount<0||amount>this.limits.string)throw new Error('Spacing limit');return ' '.repeat(name==='TAB'?Math.max(0,(this.profile.trs80?amount%64:amount)-this.column):amount);}
      default:throw new Error(`Unsupported function ${name}`);
    }
  }
  draw(){const n=this.random();if(!Number.isFinite(n)||n<0||n>=1)throw new Error('Invalid RNG device');return this.lastRandom=n;}
  out(text){if(this.output+text.length>this.limits.output)throw new Error('Output budget exhausted');this.output+=text.length;this.column=text.includes('\n')?text.length-text.lastIndexOf('\n')-1:this.column+text.length;if(this.profile.trs80)this.column%=64;this.write(text);}
  goto(value,sub=false){const target=this.code.locations.get(this.number(value));if(target===undefined)throw new Error(`Undefined line ${value}`);if(sub){if(this.calls.length>=this.limits.stack)throw new Error('GOSUB stack limit');this.calls.push(this.profile.trs80?{pc:this.pc,loops:this.loops.length}:this.pc);}this.pc=target;}
  execute(s){switch(s.op){
    case 'REM':case 'DATA':break;
    case 'TYPE':for(const [start,end]of s.ranges)for(let c=start.charCodeAt(0);c<=end.charCodeAt(0);c++)this.types.set(String.fromCharCode(c),{DEFINT:'%',DEFSNG:'!',DEFDBL:'#',DEFSTR:'$'}[s.kind]);break;
    case 'CLEAR':{const size=s.size?this.number(this.eval(s.size)):this.stringSpace;if(size<0||size>this.limits.source)throw Error('CLEAR string-space range');this.stringSpace=Math.floor(size);this.variables.clear();this.arrays.clear();this.functions.clear();this.loops=[];this.calls=[];this.cells=0;this.dataIndex=0;break;}
    case 'CLS':this.column=0;this.row=0;this.out('\n[Screen cleared]\n');break;
    case 'OPEN':this.devices.open(this.number(this.eval(s.channel)),this.string(this.eval(s.mode)),this.string(this.eval(s.name)));break;
    case 'CLOSE':if(!s.channels.length)this.devices.close();else for(const c of s.channels)this.devices.close(this.number(this.eval(c)));break;
    case 'LET':this.assign(s.target,this.eval(s.expression));break;
    case 'PRINT':if(s.channel){const values=s.parts.filter(p=>p.expression).map(p=>this.eval(p.expression));this.devices.write(this.number(this.eval(s.channel)),values);break;}if(s.position){const position=this.number(this.eval(s.position));if(!Number.isInteger(position)||position<0||position>1023)throw Error('PRINT @ position range');this.out('\n'+' '.repeat(position%64));this.row=Math.floor(position/64);}
      for(const part of s.parts){if(part.separator===',')this.out(' '.repeat(this.profile.plainNumbers?3:this.profile.zone-this.column%this.profile.zone));else if(part.expression){const v=this.eval(part.expression);this.out(typeof v==='number'&&!this.profile.integer&&!this.profile.plainNumbers?(v>=0?' ':'')+String(Number(v.toPrecision(7)))+' ':String(v));}}if(!s.parts.at(-1)?.separator)this.out('\n');break;
    case 'INPUT':if(s.channel){const channel=this.number(this.eval(s.channel)),types=s.targets.map(t=>this.key(t.name).endsWith('$')?'string':'number'),values=this.devices.peek(channel,types);s.targets.forEach((t,i)=>this.checked(this.key(t.name),values[i]));s.targets.forEach((t,i)=>this.assign(t,values[i]));this.devices.advance(channel);break;}this.pending={...s,received:[]};this.status='input';this.out(s.prompt+'? ');break;
    case 'BRANCH':if(!this.number(this.eval(s.test)))this.pc=s.target;break;
    case 'JUMP':this.pc=s.target;break;
    case 'GOTO':case 'GOSUB':this.goto(this.eval(s.destination),s.op==='GOSUB');break;
    case 'ON':{const i=Math.trunc(this.number(this.eval(s.value)));if(i>=1&&i<=s.lines.length)this.goto(this.eval(s.lines[i-1]),s.mode==='GOSUB');break;}
    case 'RETURN':if(!this.calls.length)throw new Error('RETURN without GOSUB');{const frame=this.calls.pop();if(this.profile.trs80){this.pc=frame.pc;this.loops.splice(frame.loops);}else this.pc=frame;}break;
    case 'FOR':{const key=this.key(s.name),start=this.number(this.eval(s.start)),end=this.number(this.eval(s.end)),step=this.number(this.eval(s.step));if(!step)throw new Error('Zero FOR step');this.assign({name:s.name},start);const floor=this.profile.trs80?(this.calls.at(-1)?.loops??0):0;const found=this.loops.findIndex((l,i)=>i>=floor&&l.name===key);if(found>=0)this.loops.splice(found);if(this.loops.length>=this.limits.stack)throw new Error('FOR stack limit');this.loops.push({name:key,end,step,pc:this.pc});break;}
    case 'NEXT':{const index=s.name?this.loops.findLastIndex(l=>l.name===this.key(s.name)):this.loops.length-1;if(index<0||this.profile.trs80&&index<(this.calls.at(-1)?.loops??0))throw new Error('NEXT without FOR');this.loops.splice(index+1);const l=this.loops[index],v=this.checked(l.name,(this.variables.get(l.name)??0)+l.step);this.variables.set(l.name,v);if(l.step>0?v<=l.end:v>=l.end)this.pc=l.pc;else this.loops.pop();break;}
    case 'DIM':for(const t of s.targets){if(!t.args)throw new Error('DIM needs bounds');this.dim(t.name,t.args.map(a=>this.eval(a)));}break;
    case 'READ':for(const t of s.targets){const datum=this.code.data[this.dataIndex++];if(!datum)throw new Error('Out of DATA');const value=this.key(t.name).endsWith('$')?datum.value:Number(datum.value);this.assign(t,value);}break;
    case 'RESTORE':if(!s.destination)this.dataIndex=0;else{const n=this.number(this.eval(s.destination));const at=this.code.data.findIndex(d=>d.line>=n);this.dataIndex=at<0?this.code.data.length:at;}break;
    case 'DEF':this.functions.set(this.key(s.name),s);break;
    case 'STOP':this.stop();break;case 'END':this.status='ended';break;
    default:throw new Error(`Unsupported statement ${s.op}`);
  }}
  inputExpression(text){
    const start=this.clock();this.sliceStarted=start;
    try{const parser=new Parser(text,this.profile),node=parser.expr();if(parser.peek().kind!=='end')throw new Error('Expected one INPUT expression');return this.number(this.eval(node));}
    catch(error){if(error.message.includes('budget')){this.status='error';this.error=`${error.message} in ${this.line}`;}throw error;}
    finally{this.elapsed+=this.clock()-start;this.sliceStarted=undefined;}
  }
  input(text){if(this.profile.trs80)return this.trsInput(text);if(this.status!=='input')throw new Error('Not waiting for INPUT');if(typeof text!=='string'||text.length>this.limits.input)throw new Error('Input length limit');const values=this.profile.caseSensitive&&this.pending.targets.length===1&&this.pending.targets[0].name.endsWith('$')?[text]:csv(this.profile.caseSensitive?text:text.toUpperCase());if(values.length!==this.pending.targets.length)throw new Error('INPUT requires '+this.pending.targets.length+' value(s)');const converted=values.map((v,i)=>this.pending.targets[i].name.endsWith('$')?this.string(v):this.profile.integer?this.inputExpression(v):/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?$/.test(v)?this.number(Number(v)):(()=>{throw new Error('Expected numeric input');})());this.pending.targets.forEach((t,i)=>this.assign(t,converted[i]));this.pending=null;this.column=0;this.status='running';}
  trsInput(text){
    if(this.status!=='input')throw Error('Not waiting for INPUT');if(typeof text!=='string'||text.length>this.limits.input)throw Error('Input length limit');
    const pending=this.pending,offset=pending.received.length,targets=pending.targets.slice(offset);
    if(text===''){for(const t of targets)pending.received.push(this.read(t));}
    else {const fields=csv(text.toUpperCase()),values=fields.slice(0,targets.length).map((value,i)=>{const key=this.key(targets[i].name);if(key.endsWith('$'))return this.string(value);if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?$/.test(value))throw Error('Expected numeric input');return this.checked(key,Number(value));});pending.received.push(...values);if(fields.length>targets.length)this.out('?EXTRA IGNORED\n');}
    this.column=0;if(pending.received.length<pending.targets.length){this.out('?? ');return;}
    pending.targets.forEach((t,i)=>this.assign(t,pending.received[i]));this.pending=null;this.status='running';
  }
  stop(){if(['running','input'].includes(this.status)){this.suspended=this.status;this.status='stopped';}}
  cont(){if(this.status!=='stopped')throw new Error('Cannot continue');this.status=this.suspended??'running';}
  step(quota=500){if(this.status!=='running')return this.status;const start=this.clock();this.sliceStarted=start;try{for(let i=0;i<Math.min(quota,500)&&this.status==='running';i++){
    if(this.steps>=this.limits.instructions||this.elapsed+this.clock()-start>=this.limits.milliseconds)throw new Error('Execution budget exhausted; RUN starts a fresh run');
    if(this.pc>=this.code.instructions.length){this.status='ended';break;}const s=this.code.instructions[this.pc++];this.line=s.line;this.coverage.add(s.line);this.steps++;this.execute(s);
  }}catch(error){this.status='error';this.error=`${error.message} in ${this.line}`;}finally{this.elapsed+=this.clock()-start;this.sliceStarted=undefined;}return this.status;}
}
