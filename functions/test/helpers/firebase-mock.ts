import { vi } from 'vitest';

export function createMockFirestore() {
  const store: Record<string, Record<string, any>> = {};

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({
          exists: !!store[name]?.[id],
          data: () => store[name]?.[id],
          id,
        })),
        set: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = data;
        }),
        update: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = { ...store[name][id], ...data };
        }),
      })),
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: true,
            docs: [],
          })),
        })),
      })),
    })),
    _store: store,
  };
}

export function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    headers: {},
    body: {},
    query: {},
    method: 'GET',
    path: '/',
    ...overrides,
  };
}

export function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    status: vi.fn(function (this: any, code: number) { this.statusCode = code; return this; }),
    json: vi.fn(function (this: any, data: any) { this.body = data; return this; }),
    send: vi.fn(function (this: any, data: any) { this.body = data; return this; }),
  };
  return res;
}
