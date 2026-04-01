import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { GASRunner } from '../src/runner.js';
import { DataMasker, type MaskOptions } from '../src/masking.js';

describe('DataMasker', () => {
  it('masks email addresses deterministically', () => {
    const masker = new DataMasker({ emails: true });

    const data = {
      'https://api.example.com/users': {
        statusCode: 200,
        body: {
          users: [
            { name: 'Alice', email: 'alice@company.com' },
            { name: 'Bob', email: 'bob@company.com' },
            { name: 'Alice Again', email: 'alice@company.com' },
          ]
        }
      }
    };

    const masked = masker.maskMockFile(data);
    const users = (masked['https://api.example.com/users'].body as { users: Array<{ email: string }> }).users;

    assert.equal(users[0].email, users[2].email, 'Same email should get same mask');
    assert.notEqual(users[0].email, users[1].email, 'Different emails should get different masks');
    assert.match(users[0].email, /^user-\d+@example\.com$/, 'Should use user-N@example.com format');
  });

  it('masks UUIDs deterministically', () => {
    const masker = new DataMasker({ ids: true });

    const data = {
      'https://api.example.com/items': {
        statusCode: 200,
        body: {
          items: [
            { id: '550e8400-e29b-41d4-a716-446655440000', name: 'first' },
            { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'second' },
            { id: '550e8400-e29b-41d4-a716-446655440000', name: 'first-again' },
          ]
        }
      }
    };

    const masked = masker.maskMockFile(data);
    const items = (masked['https://api.example.com/items'].body as { items: Array<{ id: string }> }).items;

    assert.equal(items[0].id, items[2].id, 'Same UUID should get same mask');
    assert.notEqual(items[0].id, items[1].id, 'Different UUIDs should get different masks');
    assert.match(items[0].id, /^id-\d{4}$/, 'Should use id-NNNN format');
  });

  it('masks specific fields with deterministic replacements', () => {
    const masker = new DataMasker({ fields: ['secret', 'token'] });

    const data = {
      'https://api.example.com/auth': {
        statusCode: 200,
        body: {
          secret: 'admin@secret.com',
          token: 'auth-token-123',
          name: 'keep-this',
        }
      }
    };

    const masked = masker.maskMockFile(data);
    const body = masked['https://api.example.com/auth'].body as Record<string, string>;

    assert.equal(body.secret, 'secret-1', 'String field should get deterministic replacement');
    assert.equal(body.token, 'token-1', 'String field should get deterministic replacement');
    assert.equal(body.name, 'keep-this', 'Non-listed field should be preserved');
  });

  it('masks non-string field values with ***', () => {
    const masker = new DataMasker({ fields: ['secret'] });

    const data = {
      'https://api.example.com/config': {
        statusCode: 200,
        body: {
          secret: 42,
          public: 'visible',
        }
      }
    };

    const masked = masker.maskMockFile(data);
    const body = masked['https://api.example.com/config'].body as Record<string, unknown>;

    assert.equal(body.secret, '***', 'Non-string field value should become ***');
    assert.equal(body.public, 'visible', 'Non-listed field should be preserved');
  });

  it('applies custom regex patterns', () => {
    const masker = new DataMasker({
      patterns: [{ regex: /Bearer [A-Za-z0-9._-]+/g, replacement: 'Bearer [MASKED]' }]
    });

    const data = {
      'https://api.example.com/data': {
        statusCode: 200,
        body: { auth: 'Bearer eyJhbGciOiJIUzI1NiJ9.token' }
      }
    };

    const masked = masker.maskMockFile(data);
    const body = masked['https://api.example.com/data'].body as { auth: string };

    assert.equal(body.auth, 'Bearer [MASKED]');
  });

  it('combines multiple masking options', () => {
    const masker = new DataMasker({
      emails: true,
      ids: true,
      fields: ['apiKey'],
    });

    const data = {
      'https://api.example.com/team': {
        statusCode: 200,
        body: {
          members: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              email: 'alice@company.com',
              apiKey: 99,
            }
          ]
        }
      }
    };

    const masked = masker.maskMockFile(data);
    const member = (masked['https://api.example.com/team'].body as { members: Array<Record<string, string>> }).members[0];

    assert.match(member.id, /^id-\d{4}$/);
    assert.match(member.email, /^user-\d+@example\.com$/);
    assert.equal(member.apiKey, '***');
  });

  it('preserves non-string values', () => {
    const masker = new DataMasker({ emails: true });

    const data = {
      'https://api.example.com/stats': {
        statusCode: 200,
        body: {
          count: 42,
          active: true,
          tags: ['a', 'b'],
          nested: { value: 100 },
        }
      }
    };

    const masked = masker.maskMockFile(data);
    const body = masked['https://api.example.com/stats'].body as Record<string, unknown>;

    assert.equal(body.count, 42);
    assert.equal(body.active, true);
    assert.deepEqual(body.tags, ['a', 'b']);
    assert.deepEqual(body.nested, { value: 100 });
  });

  it('masks long hex string IDs', () => {
    const masker = new DataMasker({ ids: true });

    const data = {
      'https://api.example.com/users': {
        statusCode: 200,
        body: { userId: 'abcdef1234567890abcdef' }
      }
    };

    const masked = masker.maskMockFile(data);
    const body = masked['https://api.example.com/users'].body as { userId: string };

    assert.match(body.userId, /^id-\d{4}$/);
  });

  it('getMappings returns the email and id maps', () => {
    const masker = new DataMasker({ emails: true, ids: true });

    const data = {
      'https://api.example.com': {
        statusCode: 200,
        body: {
          email: 'test@corp.com',
          id: '550e8400-e29b-41d4-a716-446655440000',
        }
      }
    };

    masker.maskMockFile(data);
    const mappings = masker.getMappings();

    assert.ok('test@corp.com' in mappings.emails);
    assert.ok('550e8400-e29b-41d4-a716-446655440000' in mappings.ids);
  });

  it('statusCode is preserved after masking', () => {
    const masker = new DataMasker({ emails: true });

    const data = {
      'https://api.example.com/error': {
        statusCode: 404,
        body: { error: 'not found', contact: 'admin@company.com' }
      }
    };

    const masked = masker.maskMockFile(data);

    assert.equal(masked['https://api.example.com/error'].statusCode, 404);
  });

  it('masks emails found in URL keys', () => {
    const masker = new DataMasker({ emails: true });

    const data = {
      'https://api.example.com/users?email=admin@corp.com': {
        statusCode: 200,
        body: { status: 'ok' }
      }
    };

    const masked = masker.maskMockFile(data);
    const urls = Object.keys(masked);

    assert.equal(urls.length, 1);
    assert.match(urls[0], /user-\d+@example\.com/, 'Email in URL key should be masked');
  });

  it('handles empty body gracefully', () => {
    const masker = new DataMasker({ emails: true, ids: true });

    const data = {
      'https://api.example.com/empty': {
        statusCode: 204,
        body: null as unknown
      }
    };

    const masked = masker.maskMockFile(data);

    assert.equal(masked['https://api.example.com/empty'].statusCode, 204);
    assert.equal(masked['https://api.example.com/empty'].body, null);
  });
});

describe('GASRunner capture mode', () => {
  it('initializes capture map when httpMode is capture', () => {
    const runner = new GASRunner({
      httpMode: 'capture',
      skipSleep: true,
    });

    const captured = runner.getCapturedResponses();
    assert.ok(captured instanceof Map, 'Should have a capture map');
    assert.equal(captured.size, 0, 'Capture map should start empty');
  });

  it('getCapturedResponses returns empty map when not in capture mode', () => {
    const runner = new GASRunner({
      httpMode: 'mock',
      skipSleep: true,
      mockResponses: {},
    });

    const captured = runner.getCapturedResponses();
    assert.ok(captured instanceof Map, 'Should return a Map');
    assert.equal(captured.size, 0);
  });

  it('exportMocks writes captured responses to file with masking', () => {
    const runner = new GASRunner({
      httpMode: 'capture',
      skipSleep: true,
    });

    const capturedMap = runner.getCapturedResponses();
    capturedMap.set('https://api.example.com/test', {
      statusCode: 200,
      body: { result: 'ok', email: 'test@company.com' },
      method: 'GET',
      url: 'https://api.example.com/test',
      timestamp: '2025-05-01T00:00:00Z',
    });

    const tmpPath = path.join(import.meta.dirname, '..', 'tmp-test-mocks.json');

    try {
      runner.exportMocks(tmpPath, { emails: true });

      const content = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));

      assert.ok('https://api.example.com/test' in content);
      assert.equal(content['https://api.example.com/test'].statusCode, 200);

      const body = content['https://api.example.com/test'].body;
      assert.match(body.email, /^user-\d+@example\.com$/, 'Email should be masked');
      assert.equal(body.result, 'ok', 'Non-PII values should be preserved');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  it('exportMocks without mask options writes raw data', () => {
    const runner = new GASRunner({
      httpMode: 'capture',
      skipSleep: true,
    });

    const capturedMap = runner.getCapturedResponses();
    capturedMap.set('https://api.example.com/raw', {
      statusCode: 200,
      body: { email: 'real@company.com' },
      method: 'GET',
      url: 'https://api.example.com/raw',
      timestamp: '2025-05-01T00:00:00Z',
    });

    const tmpPath = path.join(import.meta.dirname, '..', 'tmp-test-raw-mocks.json');

    try {
      runner.exportMocks(tmpPath);

      const content = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
      assert.equal(content['https://api.example.com/raw'].body.email, 'real@company.com');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  it('exportMocks does nothing when no responses captured', () => {
    const runner = new GASRunner({
      httpMode: 'capture',
      skipSleep: true,
    });

    const tmpPath = path.join(import.meta.dirname, '..', 'tmp-test-empty-mocks.json');
    runner.exportMocks(tmpPath);

    assert.equal(fs.existsSync(tmpPath), false, 'Should not create file when nothing captured');
  });
});
