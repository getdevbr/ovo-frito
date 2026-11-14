(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.typeEmitters = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function toPascalCase(str) {
    const cleaned = String(str || 'Root')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
    if (!cleaned) return 'Item';
    return /^\d/.test(cleaned) ? `T${cleaned}` : cleaned;
  }

  function isValidIdent(name) {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
  }

  function emitTypeScript(ir, rootName = 'Root') {
    const defs = [];
    function renderNode(node, nameHint) {
      switch (node.kind) {
        case 'string': return 'string';
        case 'integer':
        case 'number': return 'number';
        case 'boolean': return 'boolean';
        case 'null': return 'null';
        case 'unknown': return 'unknown';
        case 'array': return `${renderNode(node.items, `${nameHint}Item`)}[]`;
        case 'union': return node.variants.map((v) => renderNode(v, nameHint)).join(' | ');
        case 'object': {
          const ifaceName = toPascalCase(nameHint);
          const lines = node.fields.map((f) => {
            const key = isValidIdent(f.name) ? f.name : JSON.stringify(f.name);
            const opt = f.optional ? '?' : '';
            const typeStr = renderNode(f.node, `${ifaceName}${toPascalCase(f.name)}`);
            return `  ${key}${opt}: ${typeStr};`;
          });
          defs.push(`export interface ${ifaceName} {\n${lines.join('\n')}\n}`);
          return ifaceName;
        }
        default: return 'unknown';
      }
    }

    const rootType = renderNode(ir, rootName);
    if (ir.kind !== 'object') {
      defs.push(`export type ${toPascalCase(rootName)} = ${rootType};`);
    }
    return defs.join('\n\n');
  }

  function emitZod(ir, rootName = 'Root') {
    function renderNode(node) {
      switch (node.kind) {
        case 'string': return 'z.string()';
        case 'integer': return 'z.number().int()';
        case 'number': return 'z.number()';
        case 'boolean': return 'z.boolean()';
        case 'null': return 'z.null()';
        case 'unknown': return 'z.unknown()';
        case 'array': return `z.array(${renderNode(node.items)})`;
        case 'union': {
          const nonNull = node.variants.filter((v) => v.kind !== 'null');
          const hasNull = nonNull.length < node.variants.length;
          if (nonNull.length === 1 && hasNull) {
            return `${renderNode(nonNull[0])}.nullable()`;
          }
          const inner = `z.union([${node.variants.map(renderNode).join(', ')}])`;
          return hasNull ? `${inner}.nullable()` : inner;
        }
        case 'object': {
          const fields = node.fields.map((f) => {
            const key = isValidIdent(f.name) ? f.name : JSON.stringify(f.name);
            const base = renderNode(f.node);
            return `  ${key}: ${f.optional ? `${base}.optional()` : base},`;
          });
          return `z.object({\n${fields.join('\n')}\n})`;
        }
        default: return 'z.unknown()';
      }
    }
    return `import { z } from 'zod';\n\nexport const ${toPascalCase(rootName)}Schema = ${renderNode(ir)};`;
  }

  function emitPython(ir, rootName = 'Root') {
    const defs = [];
    function renderNode(node, nameHint) {
      switch (node.kind) {
        case 'string': return 'str';
        case 'integer': return 'int';
        case 'number': return 'float';
        case 'boolean': return 'bool';
        case 'null': return 'None';
        case 'unknown': return 'Any';
        case 'array': return `list[${renderNode(node.items, `${nameHint}Item`)}]`;
        case 'union': return node.variants.map((v) => renderNode(v, nameHint)).join(' | ');
        case 'object': {
          const clsName = toPascalCase(nameHint);
          const lines = node.fields.map((f) => {
            const safe = isValidIdent(f.name) ? f.name : f.name.replace(/[^a-zA-Z0-9_]/g, '_');
            let typeStr = renderNode(f.node, `${clsName}${toPascalCase(f.name)}`);
            if (f.optional) typeStr = `${typeStr} | None = None`;
            return `    ${safe}: ${typeStr}`;
          });
          defs.push(`class ${clsName}(BaseModel):\n${lines.length ? lines.join('\n') : '    pass'}`);
          return clsName;
        }
        default: return 'Any';
      }
    }
    renderNode(ir, rootName);
    return `from typing import Any\nfrom pydantic import BaseModel\n\n${defs.join('\n\n')}`;
  }

  function emitJava(ir, rootName = 'Root') {
    const defs = [];
    function renderNode(node, nameHint) {
      switch (node.kind) {
        case 'string': return 'String';
        case 'integer': return 'Long';
        case 'number': return 'Double';
        case 'boolean': return 'Boolean';
        case 'null':
        case 'unknown': return 'Object';
        case 'array': return `List<${renderNode(node.items, `${nameHint}Item`)}>`;
        case 'union': {
          const nonNull = node.variants.filter((v) => v.kind !== 'null');
          return nonNull.length === 1 ? renderNode(nonNull[0], nameHint) : 'Object';
        }
        case 'object': {
          const recName = toPascalCase(nameHint);
          const params = node.fields.map((f) => {
            const safe = isValidIdent(f.name) ? f.name : f.name.replace(/[^a-zA-Z0-9_]/g, '_');
            return `${renderNode(f.node, `${recName}${toPascalCase(f.name)}`)} ${safe}`;
          });
          defs.push(`public record ${recName}(\n  ${params.join(',\n  ')}\n) {}`);
          return recName;
        }
        default: return 'Object';
      }
    }
    renderNode(ir, rootName);
    return `import java.util.List;\n\n${defs.join('\n\n')}`;
  }

  function emitGo(ir, rootName = 'Root') {
    const defs = [];
    function renderNode(node, nameHint) {
      switch (node.kind) {
        case 'string': return 'string';
        case 'integer': return 'int64';
        case 'number': return 'float64';
        case 'boolean': return 'bool';
        case 'null':
        case 'unknown': return 'any';
        case 'array': return `[]${renderNode(node.items, `${nameHint}Item`)}`;
        case 'union': {
          const nonNull = node.variants.filter((v) => v.kind !== 'null');
          return nonNull.length === 1 ? `*${renderNode(nonNull[0], nameHint)}` : 'any';
        }
        case 'object': {
          const structName = toPascalCase(nameHint);
          const lines = node.fields.map((f) => {
            const fieldName = toPascalCase(f.name);
            const t = renderNode(f.node, `${structName}${fieldName}`);
            const omitempty = f.optional ? ',omitempty' : '';
            return `\t${fieldName} ${t} \`json:"${f.name}${omitempty}"\``;
          });
          defs.push(`type ${structName} struct {\n${lines.join('\n')}\n}`);
          return structName;
        }
        default: return 'any';
      }
    }
    renderNode(ir, rootName);
    return defs.join('\n\n');
  }

  const EMITTERS = {
    typescript: { label: 'TypeScript Interface', emit: emitTypeScript },
    zod: { label: 'Zod Schema', emit: emitZod },
    python: { label: 'Python (Pydantic v2)', emit: emitPython },
    java: { label: 'Java Record', emit: emitJava },
    go: { label: 'Go Struct', emit: emitGo }
  };

  function emitTypes(ir, lang, rootName = 'Root') {
    const entry = EMITTERS[lang];
    if (!entry) throw new Error(`Linguagem não suportada: ${lang}`);
    return entry.emit(ir, rootName);
  }

  return {
    EMITTERS,
    emitTypes,
    emitTypeScript,
    emitZod,
    emitPython,
    emitJava,
    emitGo
  };
});
