// Worker scheduling is not a BASIC newline. Join an unfinished PRINT across slices.
// Scoped to BASIC Computer; shared native-game TerminalView remains unchanged.
export function receiveOutput(terminal,text,kind='output') {
  const previous=terminal.records.at(-1);
  if(kind==='output'&&previous?.kind==='output'&&!previous.text.endsWith('\n')) {
    const follow=terminal.viewport.scrollHeight-terminal.viewport.scrollTop-terminal.viewport.clientHeight<48||terminal.input.ownerDocument.activeElement===terminal.input;
    previous.text+=text;
    terminal.output.lastElementChild.textContent=terminal.text(previous);
    terminal.announce.textContent=text.slice(-600);
    if(follow)terminal.bottom();
  } else terminal.receive({type:'output',text,kind});
}
