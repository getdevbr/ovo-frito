'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAssertions } = require('../../renderer/lib/assertions');

describe('assertions', () => {
  it('evaluates status, header, json path, and operators', () => {
    const response = {
      status: 201,
      timeMs: 45,
      headers: { 'Content-Type': 'application/json' },
      body: '{"id":10,"name":"Carteiro"}'
    };
    const parsedJson = { id: 10, name: 'Carteiro' };

    const results = evaluateAssertions(
      [
        { source: 'status', operator: '==', target: '201', enabled: true },
        { source: 'timeMs', operator: '<', target: '100', enabled: true },
        { source: 'header.content-type', operator: 'contains', target: 'json', enabled: true },
        { source: 'json.id', operator: 'exists', target: '', enabled: true },
        { source: 'json.name', operator: '!=', target: 'Outro', enabled: true },
        { source: 'status', operator: '==', target: '500', enabled: false }
      ],
      response,
      parsedJson
    );

    assert.equal(results.length, 5);
    assert.equal(results.every((r) => r.passed), true);
  });
});
