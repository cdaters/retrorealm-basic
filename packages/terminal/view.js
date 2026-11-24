import { renderView, wrap } from './render.js';

// A line terminal: selectable DOM output plus one native input (IME and touch).
export class TerminalView {
  constructor({ output, viewport, input, prompt, announce, width }) {
    Object.assign(this, { output, viewport, input, prompt, announce, width });
    this.records = []; this.history = []; this.cursor = 0; this.draft = '';
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (this.cursor === this.history.length) this.draft = input.value;
      this.cursor = Math.max(0, Math.min(this.history.length, this.cursor + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = this.cursor === this.history.length ? this.draft : this.history[this.cursor];
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
  text(record) { return record.view ? renderView(record.view, this.width()) : wrap(record.text, this.width()).join('\n'); }
  receive(event) {
    if (event.type === 'clear') { this.records = []; this.output.replaceChildren(); }
    if (['output', 'restore'].includes(event.type)) {
      const nearBottom = this.viewport.scrollHeight - this.viewport.scrollTop - this.viewport.clientHeight < 48;
      this.records.push(event); const block = document.createElement('pre');
      block.className = `terminal-block ${event.kind ?? event.type}`; block.textContent = this.text(event); this.output.append(block);
      if (nearBottom || document.activeElement === this.input) this.bottom();
      this.announce.textContent = (event.text ?? event.view?.lines?.slice(-3).join(' ') ?? '').slice(-600);
    }
    if (event.type === 'prompt') this.prompt.textContent = event.text;
    if (event.type === 'input-request') {
      this.input.inputMode = event.kind === 'number' ? 'numeric' : 'text';
      this.input.name = event.actions.find(a => ['text','number'].includes(a.kind))?.id ?? 'choice';
    }
  }
  reflow() {
    const atBottom = this.viewport.scrollHeight - this.viewport.scrollTop - this.viewport.clientHeight < 48;
    [...this.output.children].forEach((block, i) => { block.textContent = this.text(this.records[i]); });
    if (atBottom) this.bottom();
  }
  remember(text) {
    if (text && this.history.at(-1) !== text) this.history.push(text);
    this.cursor = this.history.length; this.draft = ''; this.input.value = '';
  }
  bottom() { this.viewport.scrollTop = this.viewport.scrollHeight; }
  copyText() { return this.records.map(record => this.text(record)).join('\n\n') + '\n\n' + this.prompt.textContent; }
}
