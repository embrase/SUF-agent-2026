/**
 * Enhanced in-memory Firestore mock for simulation tests.
 *
 * Unlike helpers/firebase-mock.ts (which returns hardcoded empty results),
 * this mock actually filters, sorts, limits, and supports add(), count(),
 * doc.ref.update(), and doc.ref.delete().
 */
import { randomBytes } from 'crypto';

type Store = Record<string, Record<string, any>>;

const DELETE_SENTINEL = '__FIELD_DELETE__';

interface QueryConstraint {
  type: 'where' | 'orderBy' | 'limit';
  field?: string;
  op?: string;
  value?: any;
  direction?: 'asc' | 'desc';
  limitN?: number;
}

function applyConstraints(
  collection: string,
  store: Store,
  constraints: QueryConstraint[],
  db: any,
) {
  const data = store[collection] || {};
  let entries = Object.entries(data).map(([id, doc]) => ({ id, ...doc }));

  for (const c of constraints) {
    if (c.type === 'where') {
      entries = entries.filter((entry) => {
        const val = entry[c.field!];
        switch (c.op) {
          case '==': return val === c.value;
          case '!=': return val !== c.value;
          case '>': return val > c.value;
          case '>=': return val >= c.value;
          case '<': return val < c.value;
          case '<=': return val <= c.value;
          default: return true;
        }
      });
    }
  }

  const orderBy = constraints.find(c => c.type === 'orderBy');
  if (orderBy) {
    const dir = orderBy.direction === 'desc' ? -1 : 1;
    entries.sort((a, b) => {
      const aVal = a[orderBy.field!];
      const bVal = b[orderBy.field!];
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
  }

  const limit = constraints.find(c => c.type === 'limit');
  if (limit) entries = entries.slice(0, limit.limitN);

  const docs = entries.map(entry => {
    const { id, ...docData } = entry;
    return {
      id,
      exists: true,
      data: () => ({ ...docData }),
      ref: db.collection(collection).doc(id),
    };
  });

  return {
    empty: docs.length === 0,
    docs,
    size: docs.length,
    forEach: (fn: (doc: any) => void) => docs.forEach(fn),
  };
}

function createQueryBuilder(
  collection: string,
  store: Store,
  db: any,
  constraints: QueryConstraint[] = [],
) {
  const builder: any = {
    where(field: string, op: string, value: any) {
      return createQueryBuilder(collection, store, db, [
        ...constraints, { type: 'where', field, op, value },
      ]);
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return createQueryBuilder(collection, store, db, [
        ...constraints, { type: 'orderBy', field, direction },
      ]);
    },
    limit(n: number) {
      return createQueryBuilder(collection, store, db, [
        ...constraints, { type: 'limit', limitN: n },
      ]);
    },
    count() {
      return {
        get: async () => {
          const result = applyConstraints(collection, store, constraints, db);
          return { data: () => ({ count: result.size }) };
        },
      };
    },
    get: async () => applyConstraints(collection, store, constraints, db),
  };
  return builder;
}

function updateDoc(store: Store, collection: string, id: string, data: any) {
  if (!store[collection]) store[collection] = {};
  const existing = store[collection][id] || {};
  for (const [key, value] of Object.entries(data)) {
    if (value === DELETE_SENTINEL) {
      delete existing[key];
    } else {
      existing[key] = value;
    }
  }
  store[collection][id] = existing;
}

export function createSimulationFirestore() {
  const store: Store = {};

  const db: any = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            get: async () => ({
              exists: !!store[name]?.[id],
              data: () => store[name]?.[id] ? { ...store[name][id] } : undefined,
              id,
              ref: db.collection(name).doc(id),
            }),
            set: async (data: any, options?: { merge?: boolean }) => {
              if (!store[name]) store[name] = {};
              if (options?.merge) {
                store[name][id] = { ...store[name][id], ...data };
              } else {
                store[name][id] = { ...data };
              }
            },
            update: async (data: any) => {
              updateDoc(store, name, id, data);
            },
            delete: async () => {
              if (store[name]) delete store[name][id];
            },
            collection(subName: string) {
              return db.collection(`${name}/${id}/${subName}`);
            },
            id,
            path: `${name}/${id}`,
          };
        },
        add: async (data: any) => {
          const id = randomBytes(12).toString('hex');
          if (!store[name]) store[name] = {};
          store[name][id] = { ...data };
          return { id, path: `${name}/${id}` };
        },
        where(field: string, op: string, value: any) {
          return createQueryBuilder(name, store, db, [
            { type: 'where', field, op, value },
          ]);
        },
        orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
          return createQueryBuilder(name, store, db, [
            { type: 'orderBy', field, direction },
          ]);
        },
        limit(n: number) {
          return createQueryBuilder(name, store, db, [
            { type: 'limit', limitN: n },
          ]);
        },
        count() {
          return {
            get: async () => {
              const data = store[name] || {};
              return { data: () => ({ count: Object.keys(data).length }) };
            },
          };
        },
        get: async () => applyConstraints(name, store, [], db),
      };
    },
    _store: store,
  };

  return db;
}
