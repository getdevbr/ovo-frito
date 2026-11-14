'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { inferIr } = require('../../renderer/lib/schema-ir');
const { irToJsonSchema, validateJsonSchema } = require('../../renderer/lib/json-schema');

describe('json-schema', () => {
  it('generates draft 2020-12 schema from IR and validates matching data', () => {
    const sample = { id: 1, name: 'Ana', tags: ['a'] };
    const schema = irToJsonSchema(inferIr(sample));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(validateJsonSchema(sample, schema).valid, true);
  });

  it('reports JSON Pointer errors for invalid data', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer' },
        items: { type: 'array', items: { type: 'string', minLength: 2 } }
      },
      additionalProperties: false
    };
    const res = validateJsonSchema({ items: ['a'], extra: 1 }, schema);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('/id')));
    assert.ok(res.errors.some((e) => e.includes('/items/0')));
    assert.ok(res.errors.some((e) => e.includes('/extra')));
  });
});
