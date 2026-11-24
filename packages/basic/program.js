import { limits, profileFor } from './profiles.js';
import { parseLine } from './parser.js';
export class Program {
  constructor(source=''){this.lines=new Map();this.load(source);}
  load(source){
    if(typeof source!=='string'||source.length>limits.source)throw new Error('Source limit (128 KiB characters)');
    const lines=new Map();for(const row of source.replaceAll('\r\n','\n').split('\n')){if(!row.trim())continue;const m=/^\s*(\d+)\s?(.*)$/.exec(row);if(!m)throw new Error('Expected numbered source line (multiline records unsupported)');const n=Number(m[1]);if(n<1||n>65529||m[2].length>limits.line)throw new Error('Line number/length limit');if(m[2].trim())lines.set(n,m[2]);else lines.delete(n);}
    if(lines.size>limits.lines)throw new Error('Program line limit');this.lines=lines;
  }
  edit(row){const candidate=new Program(this.list());candidate.load(candidate.list()+'\n'+row);this.lines=candidate.lines;}
  list(){return [...this.lines].sort((a,b)=>a[0]-b[0]).map(([n,s])=>`${n} ${s}`).join('\n');}
  compile(profile){
    const instructions=[],locations=new Map(),data=[];
    function emit(nodes,line){for(const node of nodes){if(node.op==='IF'){const test={op:'BRANCH',test:node.test,line};instructions.push(test);emit(node.yes,line);const skip={op:'JUMP',line};instructions.push(skip);test.target=instructions.length;emit(node.no,line);skip.target=instructions.length;}
      else {instructions.push({...node,line});if(node.op==='DATA')for(const value of node.values)data.push({value,line});}}
    }
    for(const [line,source] of [...this.lines].sort((a,b)=>a[0]-b[0])){locations.set(line,instructions.length);try{emit(parseLine(source,profile),line);}catch(error){throw new Error(`${error.message} in ${line}`);}}
    return {instructions,locations,data};
  }
}
export function exportWorkspace(program,dialect,seed){profileFor(dialect);return JSON.stringify({format:'retrorealm-basic-workspace',version:1,dialect,seed:String(seed).slice(0,128),source:program.list()},null,2);}
export function importWorkspace(text){if(typeof text!=='string'||text.length>limits.source*2)throw new Error('Workspace size limit');const data=JSON.parse(text);if(data.format!=='retrorealm-basic-workspace'||data.version!==1||typeof data.source!=='string'||typeof data.seed!=='string'||data.seed.length>128)throw new Error('Unsupported BASIC workspace');profileFor(data.dialect);return {program:new Program(data.source),dialect:data.dialect,seed:data.seed};}
