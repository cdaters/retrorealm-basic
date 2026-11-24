// Explicit Home/End behavior also works on macOS, where these keys may scroll.
export function moveBoundary(input,event,multiline=false){
  if(!['Home','End'].includes(event.key)||event.isComposing||event.altKey)return false;
  event.preventDefault();
  const anchor=input.selectionDirection==='backward'?input.selectionEnd:input.selectionStart;
  const caret=input.selectionDirection==='backward'?input.selectionStart:input.selectionEnd;
  let target=event.key==='Home'?0:input.value.length;
  if(multiline&&!event.ctrlKey&&!event.metaKey){target=event.key==='Home'?(caret===0?0:input.value.lastIndexOf('\n',caret-1)+1):input.value.indexOf('\n',caret);if(target<0)target=input.value.length;}
  if(event.shiftKey)input.setSelectionRange(Math.min(anchor,target),Math.max(anchor,target),target<anchor?'backward':'forward');
  else input.setSelectionRange(target,target);
  return true;
}
// BASIC Computer only: native textarea navigation and transactional source drafts.
export class SourceEditor {
  constructor({input,gutter,status,onChange}) {
    Object.assign(this,{input,gutter,status,onChange});this.applied='';
    input.addEventListener('keydown',event=>{if(moveBoundary(input,event,true))this.position();});
    input.addEventListener('input',()=>{this.refresh();onChange();});
    for(const event of ['click','keyup','select'])input.addEventListener(event,()=>this.position());
    input.addEventListener('scroll',()=>{gutter.style.transform=`translateY(${-input.scrollTop}px)`;});
    this.refresh();
  }
  get dirty(){return this.input.value!==this.applied;}
  accept(source){this.applied=source;this.input.value=source;this.refresh();}
  cancel(){this.input.value=this.applied;this.refresh();this.onChange();}
  refresh(){this.gutter.textContent=Array.from({length:this.input.value.split('\n').length},(_,i)=>i+1).join('\n');this.position();this.gutter.style.transform=`translateY(${-this.input.scrollTop}px)`;}
  position(){const before=this.input.value.slice(0,this.input.selectionStart),rows=before.split('\n'),row=rows.length,col=rows.at(-1).length+1;const line=this.input.value.split('\n')[row-1]?.match(/^\s*(\d+)/)?.[1];this.status.textContent=`${this.dirty?'Unapplied changes':'Source applied'} · Row ${row}, column ${col}${line?' · BASIC line '+line:''}`;}
}
