import { readFileSync } from "fs";
import path from "path";

export class VMTranslator {
  filename: string;
  vmCode: string;
  labelIndex: number = 0;
  callIndex: number = 0;

  constructor(filename: string = '') {
    if (!filename) {
      this.filename = ''; this.vmCode = ''; return;
    }

    this.filename = filename.split(path.sep).pop() as string;

    const fileParts = this.filename.split('.');
    fileParts.pop();
    this.filename = fileParts.join('.');

    this.vmCode = readFileSync(filename).toString();
  }

  translate(): string {
    const lines = this.vmCode.split('\n');

    const translatedLines = lines.map(l => {
      if (!l.trim()) return '';
      if (l.trim().startsWith('//')) return `// ${l}`;
      return `//VMCMD: {${l.trim()}}\n${this.translateLine(l.split('//')[0])}`;
    });

    return translatedLines.join('\n');
  }
  
  translateLine(line: string): string {
    line = line.trim();

    const memOpPattern = /(push|pop) (D|A|local|argument|this|that|constant|static|pointer|temp) ?(\d+)?/;
    const flowPattern = /(goto|label|if-goto) (\S+)/;
    const funcPattern = /(function|call) (\S+) (\d+)/;
    const retPattern = /return/;
    const initLocalsPattern = /initLocals (\d+)/;
    const callRetPattern = /callRet (push|retAddr) (\S+)/;

    const memOpParams = memOpPattern.exec(line);
    const flowParams = flowPattern.exec(line);
    const funcParams = funcPattern.exec(line);
    const initLocalsParams = initLocalsPattern.exec(line);
    const callRetParams = callRetPattern.exec(line);

    if (retPattern.test(line)) {
      return this.inflateSnippet(this.loadSnippet('funcOps' + path.sep + 'return'));
    } else if (flowParams) {
      const cmd = flowParams[1].trim();
      const label = flowParams[2].trim();
      const flowSnippet = this.loadSnippet('flowOps' + path.sep + cmd);
      return this.inflateSnippet(flowSnippet.replace(/(@|\(|\[)label/g, `$1${this.filename}$${label}`), false);
    } else if (funcParams) {
      const cmd = funcParams[1].trim();
      const funcName = funcParams[2].trim(); 
      const num = funcParams[3].trim();
      const funcSnippet = this.loadSnippet('funcOps' + path.sep + cmd);
      return this.inflateSnippet(funcSnippet.replace(/funcName/g, `${funcName}`).replace(/nVar|nArg/g, num), false);
    } else if (initLocalsParams) {
      const initLocalSnippets = [];
      const localCount = Number(initLocalsParams[1]);
      const localsSnippet = this.loadSnippet('funcOps' + path.sep + 'initLocal');
      for (let index = 0; index < localCount; index++) {
        initLocalSnippets.push(this.inflateSnippet(localsSnippet.replace(/index/g, index.toString())));
      }
      if (!initLocalSnippets.length) initLocalSnippets.push('\t\t// no locals declared\n');
      return initLocalSnippets.join('\n');
    } else if (callRetParams) {
      if (callRetParams[1] === 'push')
        return this.inflateSnippet(`\t@${this.filename ? this.filename + '$' : ''}${callRetParams[2]}$ret.${this.callIndex}\n\tD=A\n\t{push D}`);
      else
        return this.inflateSnippet(`\t(${this.filename ? this.filename + '$' : ''}${callRetParams[2]}$ret.${this.callIndex++})`);
    } else if (memOpParams) {
      const memOp = 'memOps' + path.sep + memOpParams[1].trim();
      const segment = memOpParams[2].trim();
      const index = memOpParams[3]?.trim();
      switch (segment) {
        case 'D':
        case 'A':
          return this.inflateSnippet(this.loadSnippet('memOps' + path.sep + line));

        case 'constant':
          const constantSnippet = this.loadSnippet(`${memOp} constant`);
          return this.inflateSnippet(constantSnippet.replace(/value/g, index));
        case 'static':
          const staticSnippet = this.loadSnippet(`${memOp} static`);
          return this.inflateSnippet(staticSnippet.replace(/reference/g, `${this.filename}.${index}`));
        case 'pointer':
          const pointerSnippet = this.loadSnippet(`${memOp} pointer`);
          return this.inflateSnippet(pointerSnippet.replace(/id/g, index === '0' ? 'THIS' : 'THAT'));
        case 'temp':
          const tempSnippet = this.loadSnippet(`${memOp} temp`);
          return this.inflateSnippet(tempSnippet.replace(/reference/g, `${5 + Number(index)}`), false);

        case 'local':
        case 'argument':
        case 'this':
        case 'that':
        default:
          const segmentPtr = segment === 'local' ? 'LCL' : (segment === 'argument' ? 'ARG' : segment.toUpperCase());
          const memSnippet = this.loadSnippet(`${memOp} segment`);
          return this.inflateSnippet(memSnippet.replace(/index/g, index).replace(/segment/g, segmentPtr));
      }
    } else {
      return this.inflateSnippet(this.loadSnippet('aluOps' + path.sep + line));
    }
  }

  loadSnippet(snippetName: string): string {
    const  snippetPath = path.join(__dirname, '../snippets/', snippetName.trim() + '.vasm');
    return readFileSync(snippetPath).toString();
  }

  inflateSnippet(snippet: string, doLabels: boolean = true): string {
    const subSnippetPattern = /\{(.+)\}/;
    const labelPattern = /(?:\n|^)(?:(?!\/\/).)*\((\S+)\)/g;

    const labels = [];
    if (doLabels) for (let label; label = labelPattern.exec(snippet);) {
      labels.push(label[1]);
    }

    labels.forEach(label => {
      snippet = snippet.replaceAll(new RegExp(`(@|\\()${label}`, 'g'), `$1${label}.${this.labelIndex}`);
    });
    if (labels.length) this.labelIndex++;

    const snippetLines = snippet.split('\n');

    return snippetLines.map(l => {
      const subSnippetMatch = subSnippetPattern.exec(l);
      if (!subSnippetMatch) return l;
      return `\t// VM_SUBSNIPPET -> ${subSnippetMatch[1]}\n${this.translateLine(subSnippetMatch[1])}`;
    }).join('\n');
  }
}