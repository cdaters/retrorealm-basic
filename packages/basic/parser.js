import { limits, profileFor } from './profiles.js';

const words = 'RESTORE RETURN GOSUB PRINT INPUT IF GOTO THEN ELSE NEXT STEP STOP READ DATA FOR DIM LET END REM DEF FN ON TO AND OR NOT MOD ABS INT RND SQR SIN COS TAN ATN LOG EXP SGN LEN LEFT$ RIGHT$ MID$ STR$ VAL ASC CHR$ TAB SPC'.split(' ').sort((a,b)=>b.length-a.length);
// Vocabulary is dialect data; unsupported SWB features fail explicitly.
const trsWords=[...words,...'DEFINT DEFSNG DEFDBL DEFSTR CLEAR CLS OPEN CLOSE CINT CSNG CDBL FIX POS MEM EOF'.split(' ')].sort((a,b)=>b.length-a.length);
const webWords = 'IF THEN ELSE FOR TO STEP GOTO GOSUB RETURN NEXT INPUT LET CLS END PRINT DIM DATA READ REM OR AND MOD WHILE WEND RANDOMIZE SYSTEM KEY CLEAR VAL STR$ LEFT$ RIGHT$ MID$ LEN RND INT INSTR ABS ASC CHR$ SQR STRING$ SIN COS TAN TIMER'.split(' ');
const webUnsupported = new Set('CLS WHILE WEND RANDOMIZE SYSTEM KEY CLEAR INSTR STRING$ TIMER'.split(' '));
const functions = new Set('ABS INT RND SQR SIN COS TAN ATN LOG EXP SGN LEN LEFT$ RIGHT$ MID$ STR$ VAL ASC CHR$ TAB SPC'.split(' '));
export function csv(text) {
  const fields=[]; let start=0,quoted=false;
  for(let i=0;i<text.length;i++) {
    if(text[i]==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}
    else if(text[i]===','&&!quoted){fields.push(text.slice(start,i));start=i+1;}
  }
  if(quoted)throw new Error('Unterminated DATA/input string');fields.push(text.slice(start));
  return fields.map(raw=>{const field=raw.trim();return field.startsWith('"')&&field.endsWith('"')?field.slice(1,-1).replaceAll('""','"'):field;});
}
export function tokenize(source,profile=profileFor('ms8k')) {
  const tokens=[]; let p=0;const vocabulary=profile.wholeIdentifiers?webWords:profile.trs80?trsWords:words;
  const add=(kind,value)=>{if(tokens.length>=limits.tokens)throw new Error('Token limit');tokens.push({kind,value});};
  while(p<source.length){
    const c=source[p]; if(/\s/.test(c)){p++;continue;}
    if(c==="'"){add('keyword','REM');break;}
    if(c==='"'){let v='';p++;while(p<source.length&&source[p]!=='"')v+=source[p++];if(source[p]!=='"')throw new Error('Unterminated string');p++;add('string',v);continue;}
    const tail=source.slice(p).toUpperCase();
    const num=/^(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?/.exec(tail);
    if(num){add('number',Number(num[0]));p+=num[0].length;if(profile.trs80&&['!','#'].includes(source[p]))p++;continue;}
    const whole=/^[A-Z][A-Z0-9]*\$?/.exec(tail)?.[0];
    const keyword=vocabulary.find(word=>profile.wholeIdentifiers?whole===word:tail.startsWith(word));
    if(keyword){if(profile.swbasic&&webUnsupported.has(keyword))throw new Error(`Simple Web Basic feature ${keyword} is not implemented in this compatibility subset`);add('keyword',keyword);p+=keyword.length;if(keyword==='REM')break;
      if(keyword==='DATA'){let start=p,q=false;while(p<source.length){if(source[p]==='"')q=!q;if(source[p]===':'&&!q)break;p++;}add('data',csv(source.slice(start,p)));}continue;}
    if(profile.wholeIdentifiers&&whole){add('name',profile.caseSensitive?source.slice(p,p+whole.length):whole);p+=whole.length;continue;}
    if(/[A-Z]/i.test(c)){let v=c.toUpperCase();p++;while(p<source.length&&/[A-Z0-9]/i.test(source[p])&&!vocabulary.some(w=>source.slice(p).toUpperCase().startsWith(w)))v+=source[p++].toUpperCase();if((profile.trs80?'$%!#':'$').includes(source[p])&&source[p])v+=source[p++];add('name',v);continue;}
    const op=(profile.trs80?/^(<>|<=|>=|[+\-*/^=<>(),:;?#@])/:/^(<>|<=|>=|[+\-*/^=<>(),:;?])/).exec(tail);if(!op)throw new Error(`Unsupported character ${c}`);add('symbol',op[0]==='?'?'PRINT':op[0]);p+=op[0].length;
  }
  add('end','');return tokens;
}
const precedence={OR:1,AND:2,'=':3,'<>':3,'<':3,'>':3,'<=':3,'>=':3,'+':4,'-':4,'*':5,'/':5,MOD:5,'^':7};
export class Parser {
  constructor(source,profile){this.tokens=tokenize(source,profile);this.p=0;this.depth=0;this.profile=profile;}
  peek(){return this.tokens[this.p];}
  is(v){return ['keyword','symbol'].includes(this.peek().kind)&&this.peek().value===v;}
  take(v){if(this.is(v)){this.p++;return true;}return false;}
  expect(v){if(!this.take(v))throw new Error(`Expected ${v}; found ${this.peek().value||'end of line'}`);}
  name(){const t=this.peek();if(t.kind!=='name')throw new Error(`Expected variable; found ${t.value}`);this.p++;if(t.value.endsWith('$')&&!this.profile.strings)throw new Error('String variables unavailable in Tiny profile');return t.value;}
  args(){this.expect('(');const a=[this.expr()];while(this.take(','))a.push(this.expr());this.expect(')');return a;}
  target(){const name=this.name();return {name,args:this.is('(')?this.args():null};}
  expr(min=0){
    if(++this.depth>limits.depth)throw new Error('Expression nesting limit');
    let node,t=this.peek();
    if(this.take('-')||this.take('+')||this.take('NOT')){node={type:'unary',op:t.value,right:this.expr(t.value==='NOT'?3:this.profile.wholeIdentifiers?8:6)};}
    else if(this.take('(')){node=this.expr();this.expect(')');}
    else if(t.kind==='number'||t.kind==='string'){this.p++;node={type:'literal',value:t.value};}
    else if(this.take('FN')){const name=this.name();node={type:'fn',name,args:this.args()};}
    else if(this.profile.trs80&&this.take('MEM'))node={type:'call',name:'MEM',args:[]};
    else if(t.kind==='keyword'&&(functions.has(t.value)||this.profile.trs80&&['CINT','CSNG','CDBL','FIX','POS','EOF'].includes(t.value))){this.p++;node={type:'call',name:t.value,args:this.profile.wholeIdentifiers&&t.value==='RND'&&this.peek().value!=='('?[]:this.args()};}
    else if(t.kind==='name'){node={type:'variable',...this.target()};}
    else throw new Error(`Expected expression; found ${t.value||'end of line'}`);
    const order=this.profile.wholeIdentifiers?{...precedence,AND:1,'^':5}:precedence;
    while(['keyword','symbol'].includes(this.peek().kind)&&Object.hasOwn(order,this.peek().value)&&order[this.peek().value]>=min){const op=this.tokens[this.p++].value;node={type:'binary',op,left:node,right:this.expr(order[op]+(op==='^'&&!this.profile.wholeIdentifiers?0:1))};}
    this.depth--;return node;
  }
  end(){return this.peek().kind==='end'||(this.is(':')||this.is('ELSE'));}
  targets(){const a=[this.target()];while(this.take(','))a.push(this.target());return a;}
  statements(level=0){
    if(level>limits.depth)throw new Error('Statement nesting limit');const result=[];
    while(this.peek().kind!=='end'&&!this.is('ELSE')){
      if(this.take(':'))continue;
      const t=this.peek(), op=t.value;
      if(this.take('REM')){result.push({op:'REM'});break;}
      if(this.take('PRINT')){let channel=null,position=null;if(this.profile.trs80&&this.take('#')){channel=this.expr();this.expect(',');}else if(this.profile.trs80&&this.take('@')){position=this.expr();this.expect(',');}const parts=[];while(!this.end()){if(this.take(';')||this.take(','))parts.push({separator:this.tokens[this.p-1].value});else parts.push({expression:this.expr()});}result.push({op:'PRINT',parts,channel,position});}
      else if(this.take('INPUT')){let channel=null;if(this.profile.trs80&&this.take('#')){channel=this.expr();this.expect(',');}let prompt='';if(this.peek().kind==='string'){prompt=this.tokens[this.p++].value;if(!this.take(';')&&!this.take(','))throw new Error('Expected INPUT separator');}result.push({op:'INPUT',prompt,channel,targets:this.targets()});}
      else if(this.take('IF')){const test=this.expr();if(!this.take('THEN')&&!this.profile.trs80)throw new Error('Expected THEN');let yes;
        if(this.peek().kind==='number'){yes=[{op:'GOTO',destination:this.expr()}];if(this.take(':'))yes.push(...this.statements(level+1));}
        else yes=this.statements(level+1);
        let no=[];if(this.take('ELSE')){if(this.peek().kind==='number'){no=[{op:'GOTO',destination:this.expr()}];if(this.take(':'))no.push(...this.statements(level+1));}else no=this.statements(level+1);}
        result.push({op:'IF',test,yes,no});break;
      }
      else if(t.kind==='keyword'&&['GOTO','GOSUB'].includes(op)){this.p++;result.push({op,destination:this.expr()});}
      else if(this.take('ON')){const value=this.expr();const mode=this.peek().value;if(!['GOTO','GOSUB'].includes(mode))throw new Error('Expected ON GOTO/GOSUB');this.p++;const lines=[this.expr()];while(this.take(','))lines.push(this.expr());result.push({op:'ON',mode,value,lines});}
      else if(this.take('FOR')){const name=this.name();this.expect('=');const start=this.expr();this.expect('TO');const end=this.expr();const step=this.take('STEP')?this.expr():{type:'literal',value:1};result.push({op:'FOR',name,start,end,step});}
      else if(this.take('NEXT')){const names=[];if(!this.end()){names.push(this.name());while(this.take(','))names.push(this.name());}for(const name of names.length?names:[null])result.push({op:'NEXT',name});}
      else if(this.take('DIM'))result.push({op:'DIM',targets:this.targets()});
      else if(this.take('READ'))result.push({op:'READ',targets:this.targets()});
      else if(this.take('DATA'))result.push({op:'DATA',values:this.tokens[this.p++].value});
      else if(this.take('RESTORE'))result.push({op:'RESTORE',destination:this.end()?null:this.expr()});
      else if(this.profile.trs80&&['DEFINT','DEFSNG','DEFDBL','DEFSTR'].includes(op)){this.p++;const ranges=[];do{const start=this.name(),end=this.take('-')?this.name():start;if(!/^[A-Z]$/.test(start)||!/^[A-Z]$/.test(end)||end<start)throw Error('Invalid type letter range');ranges.push([start,end]);}while(this.take(','));result.push({op:'TYPE',kind:op,ranges});}
      else if(this.profile.trs80&&this.take('CLEAR'))result.push({op:'CLEAR',size:this.end()?null:this.expr()});
      else if(this.profile.trs80&&this.take('CLS'))result.push({op:'CLS'});
      else if(this.profile.trs80&&this.take('OPEN')){const mode=this.expr();this.expect(',');this.take('#');const channel=this.expr();this.expect(',');const name=this.expr();result.push({op:'OPEN',mode,channel,name});}
      else if(this.profile.trs80&&this.take('CLOSE')){const channels=[];if(!this.end())do{this.take('#');channels.push(this.expr());}while(this.take(','));result.push({op:'CLOSE',channels});}
      else if(this.take('DEF')){this.expect('FN');const name=this.name();this.expect('(');const arg=this.name();this.expect(')');this.expect('=');result.push({op:'DEF',name,arg,expression:this.expr()});}
      else if(t.kind==='keyword'&&['RETURN','STOP','END'].includes(op)){this.p++;result.push({op});}
      else {this.take('LET');const target=this.target();this.expect('=');result.push({op:'LET',target,expression:this.expr()});}
      if(!this.end())throw new Error(`Unexpected ${this.peek().value}`);if(this.is('ELSE'))break;this.take(':');
    }return result;
  }
}
export function parseLine(source,profile){
  try{const parser=new Parser(source,profile);const result=parser.statements();if(parser.peek().kind!=='end')throw new Error(`Unexpected ${parser.peek().value}`);return result;}
  catch(error){
    if(!profile.wholeIdentifiers){
      const candidate=tokenize(source,{...profileFor('swbasic'),swbasic:false}).find(t=>t.kind==='name'&&words.some(w=>t.value.toUpperCase().includes(w)));
      if(candidate)throw new Error(`${error.message}. ${profile.title} recognizes keywords inside names such as ${candidate.value}; use Simple Web Basic for full identifiers (do not rename the reference source)`);
    }
    throw new Error(`${error.message} [${profile.title}]`);
  }
}
