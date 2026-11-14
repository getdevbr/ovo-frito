'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { inferIr } = require('../../renderer/lib/schema-ir');
const { emitTypes } = require('../../renderer/lib/type-emitters');

describe('schema-ir and type-emitters', () => {
  const sample = {
    id: 1,
    score: 9.5,
    active: true,
    nickname: null,
    'kebab-key': 'ok',
    tags: ['a', 'b'],
    items: [
      { sku: 'A1', qty: 2 },
      { sku: 'B2' }
    ]
  };

  it('infers optional fields and unions from heterogeneous arrays', () => {
    const ir = inferIr(sample);
    assert.equal(ir.kind, 'object');
    const itemsField = ir.fields.find((f) => f.name === 'items');
    assert.equal(itemsField.node.kind, 'array');
    const qtyField = itemsField.node.items.fields.find((f) => f.name === 'qty');
    assert.equal(qtyField.optional, true);
  });

  it('emits TypeScript, Zod, Python, Java, and Go', () => {
    const ir = inferIr(sample);
    assert.match(emitTypes(ir, 'typescript', 'Order'), /export interface Order/);
    assert.match(emitTypes(ir, 'typescript', 'Order'), /"kebab-key": string;/);
    assert.match(emitTypes(ir, 'zod', 'Order'), /export const OrderSchema = z\.object/);
    assert.match(emitTypes(ir, 'python', 'Order'), /class Order\(BaseModel\):/);
    assert.match(emitTypes(ir, 'java', 'Order'), /public record Order\(/);
    assert.match(emitTypes(ir, 'go', 'Order'), /type Order struct/);
  });

  it('handles root array', () => {
    const ir = inferIr([{ id: 1 }, { id: 2 }]);
    const ts = emitTypes(ir, 'typescript', 'Users');
    assert.match(ts, /export type Users = UsersItem\[\];/);
  });
});
