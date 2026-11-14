(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.jsonSchema = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function irToJsonSchema(ir, isRoot = true) {
    const schema = isRoot ? { $schema: 'https://json-schema.org/draft/2020-12/schema' } : {};
    switch (ir.kind) {
      case 'string':
        schema.type = 'string';
        if (ir.formats?.length) schema.format = ir.formats[0];
        return schema;
      case 'integer':
        schema.type = 'integer';
        return schema;
      case 'number':
        schema.type = 'number';
        return schema;
      case 'boolean':
        schema.type = 'boolean';
        return schema;
      case 'null':
        schema.type = 'null';
        return schema;
      case 'unknown':
        return schema;
      case 'array':
        schema.type = 'array';
        if (ir.items && ir.items.kind !== 'unknown') {
          schema.items = irToJsonSchema(ir.items, false);
        }
        return schema;
      case 'union': {
        const types = ir.variants.map((v) => v.kind).filter((k) => k !== 'object' && k !== 'array');
        if (types.length === ir.variants.length) {
          schema.type = types;
        } else {
          schema.anyOf = ir.variants.map((v) => irToJsonSchema(v, false));
        }
        return schema;
      }
      case 'object': {
        schema.type = 'object';
        schema.properties = {};
        const req = [];
        for (const f of ir.fields) {
          schema.properties[f.name] = irToJsonSchema(f.node, false);
          if (!f.optional) req.push(f.name);
        }
        if (req.length > 0) schema.required = req;
        return schema;
      }
      default:
        return schema;
    }
  }

  function getJsonType(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'number';
    return typeof val;
  }

  function matchesType(val, expectedType) {
    const actual = getJsonType(val);
    if (expectedType === 'number') return actual === 'number' || actual === 'integer';
    return actual === expectedType;
  }

  function validateNode(data, schema, ptr, errors) {
    if (!schema || typeof schema !== 'object') return;

    if (Array.isArray(schema.anyOf)) {
      const anyOk = schema.anyOf.some((sub) => {
        const subErrs = [];
        validateNode(data, sub, ptr, subErrs);
        return subErrs.length === 0;
      });
      if (!anyOk) {
        errors.push(`${ptr || '/'}: não corresponde a nenhuma variante de anyOf`);
      }
      return;
    }

    if (schema.type !== undefined) {
      const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!allowed.some((t) => matchesType(data, t))) {
        errors.push(`${ptr || '/'}: esperado ${allowed.join('|')}, recebido ${getJsonType(data)}`);
        return;
      }
    }

    if (schema.const !== undefined && data !== schema.const) {
      errors.push(`${ptr || '/'}: esperado const ${JSON.stringify(schema.const)}`);
    }

    if (Array.isArray(schema.enum) && !schema.enum.includes(data)) {
      errors.push(`${ptr || '/'}: valor fora do enum permitido`);
    }

    if (typeof data === 'string') {
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        errors.push(`${ptr || '/'}: comprimento mínimo ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined && data.length > schema.maxLength) {
        errors.push(`${ptr || '/'}: comprimento máximo ${schema.maxLength}`);
      }
    }

    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${ptr || '/'}: mínimo ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${ptr || '/'}: máximo ${schema.maximum}`);
      }
    }

    if (Array.isArray(data)) {
      if (schema.minItems !== undefined && data.length < schema.minItems) {
        errors.push(`${ptr || '/'}: mínimo de ${schema.minItems} itens`);
      }
      if (schema.maxItems !== undefined && data.length > schema.maxItems) {
        errors.push(`${ptr || '/'}: máximo de ${schema.maxItems} itens`);
      }
      if (schema.items) {
        for (let i = 0; i < data.length; i++) {
          validateNode(data[i], schema.items, `${ptr}/${i}`, errors);
        }
      }
    }

    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      if (Array.isArray(schema.required)) {
        for (const reqKey of schema.required) {
          if (!Object.prototype.hasOwnProperty.call(data, reqKey)) {
            errors.push(`${ptr}/${reqKey}: campo obrigatório ausente`);
          }
        }
      }
      if (schema.properties) {
        for (const [k, propSchema] of Object.entries(schema.properties)) {
          if (Object.prototype.hasOwnProperty.call(data, k)) {
            validateNode(data[k], propSchema, `${ptr}/${k}`, errors);
          }
        }
      }
      if (schema.additionalProperties === false && schema.properties) {
        for (const k of Object.keys(data)) {
          if (!Object.prototype.hasOwnProperty.call(schema.properties, k)) {
            errors.push(`${ptr}/${k}: propriedade adicional não permitida`);
          }
        }
      }
    }
  }

  function validateJsonSchema(data, schema) {
    const errors = [];
    validateNode(data, schema, '', errors);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  return {
    irToJsonSchema,
    validateJsonSchema
  };
});
