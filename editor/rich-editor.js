import {Schema} from 'prosemirror-model';
import {EditorState, AllSelection, TextSelection} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {MarkdownParser, defaultMarkdownParser, defaultMarkdownSerializer} from 'prosemirror-markdown';
import {inputRules, InputRule, textblockTypeInputRule, wrappingInputRule, undoInputRule} from 'prosemirror-inputrules';
import {keymap} from 'prosemirror-keymap';
import {baseKeymap, toggleMark, setBlockType, wrapIn, lift, chainCommands, exitCode} from 'prosemirror-commands';
import {wrapInList, splitListItem, liftListItem, sinkListItem} from 'prosemirror-schema-list';
import {history, undo, redo} from 'prosemirror-history';

const safeHref = href => /^(https?:|mailto:)/i.test(href || '');
const link = {...defaultMarkdownParser.schema.spec.marks.get('link'),
  parseDOM: [{tag: 'a[href]', getAttrs: dom => safeHref(dom.getAttribute('href')) ? {href: dom.getAttribute('href'), title: dom.getAttribute('title')} : false}]};
const schema = new Schema({nodes: defaultMarkdownParser.schema.spec.nodes.remove('image').update('heading',{...defaultMarkdownParser.schema.spec.nodes.get('heading'),content:'text*'}),
  marks: defaultMarkdownParser.schema.spec.marks.update('link', link)});
const tokens = {...defaultMarkdownParser.tokens}; delete tokens.image;
const parser = new MarkdownParser(schema, defaultMarkdownParser.tokenizer.disable('image'), tokens);
function markRule(regex, mark) {
  return new InputRule(regex, (state, match, start, end) => {
    const text = match[2];
    return state.tr.insertText(text, start, end).addMark(start, start + text.length, mark.create()).removeStoredMark(mark);
  });
}
function create(container, options) {
  let original = options.value || '', changed = false;
  const rules = [
    wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
    wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
    wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, m => ({order: +m[1]})),
    textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, m => ({level: m[1].length})),
    textblockTypeInputRule(/^```$/, schema.nodes.code_block),
    markRule(/(\*\*)([^*\n]+)\*\*$/, schema.marks.strong),
    markRule(/(?<!\*)(\*)([^*\n]+)\*$/, schema.marks.em),
    markRule(/(`)([^`\n]+)`$/, schema.marks.code),
    new InputRule(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)$/, (state,m,start,end) =>
      state.tr.insertText(m[1],start,end).addMark(start,start+m[1].length,schema.marks.link.create({href:m[2]})).removeStoredMark(schema.marks.link))
  ];
  const shortcuts = {
    'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo, Backspace: undoInputRule,
    'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em),
    'Mod-`': toggleMark(schema.marks.code), 'Mod-Enter': exitCode,
    Enter: splitListItem(schema.nodes.list_item), Tab: sinkListItem(schema.nodes.list_item),
    'Shift-Tab': liftListItem(schema.nodes.list_item)
  };
  const makeState = text => EditorState.create({schema, doc: parser.parse(text),
    plugins: [inputRules({rules}), history(), keymap(shortcuts), keymap(baseKeymap)]});
  const view = new EditorView(container, {
    state: makeState(original), attributes: {class: 'rich-text', role: 'textbox', 'aria-label': 'Markdown 编辑器', 'aria-multiline': 'true'},
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
      if (tr.docChanged) { changed = true; options.onChange?.(); }
      options.onState?.();
    },
    handlePaste(view,event) {
      if (event.clipboardData?.getData('text/html')) return false;
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return false;
      view.dispatch(view.state.tr.replaceSelection(parser.parse(text).slice(0)).scrollIntoView()); return true;
    },
    handleDOMEvents: {click: (_,event) => { if (event.target.closest('a')) event.preventDefault(); }}
  });
  function active(name) {
    const {selection, storedMarks} = view.state;
    const marks = {bold: 'strong', italic: 'em', code: 'code', link: 'link'};
    if (marks[name]) return !!schema.marks[marks[name]].isInSet(storedMarks || selection.$from.marks()) ||
      (!selection.empty && view.state.doc.rangeHasMark(selection.from, selection.to, schema.marks[marks[name]]));
    const node = {heading: 'heading', list: 'bullet_list', quote: 'blockquote'}[name];
    for (let d=selection.$from.depth;d>0;d--) if (selection.$from.node(d).type.name === node) return true;
    let found=false;view.state.doc.nodesBetween(selection.from,selection.to,n=>{if(n.type.name===node)found=true;});return found;
  }
  return {
    view, active,
    get: () => changed ? defaultMarkdownSerializer.serialize(view.state.doc) : original,
    set: text => { original = text; changed = false; view.updateState(makeState(text)); options.onState?.(); },
    focus: () => view.focus(), destroy: () => view.destroy(),
    command(name,href) {
      if(view.state.selection instanceof AllSelection){const doc=view.state.doc;view.dispatch(view.state.tr.setSelection(TextSelection.between(doc.resolve(0),doc.resolve(doc.content.size))));}
      const commands = {
        bold: toggleMark(schema.marks.strong), italic: toggleMark(schema.marks.em),
        heading: setBlockType(active('heading') ? schema.nodes.paragraph : schema.nodes.heading, {level:2}),
        list: active('list') ? liftListItem(schema.nodes.list_item) : wrapInList(schema.nodes.bullet_list), quote: active('quote') ? lift : wrapIn(schema.nodes.blockquote),
        code: chainCommands(toggleMark(schema.marks.code), setBlockType(schema.nodes.code_block)),
        link: safeHref(href) ? toggleMark(schema.marks.link,{href}) : null
      };
      commands[name]?.(view.state,view.dispatch,view); view.focus();
    }
  };
}
globalThis.DNRichEditor = {create};
