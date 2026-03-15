// src/hooks/useFirestoreCollection.ts
// Reads directly from Firestore via the client SDK — no Vercel function invocations.
// Only works for collections with public read rules (agent_profiles, talks, booths, etc.)
import { useState, useEffect } from 'react';
import { getFirestore, collection, doc, getDocs, getDoc, query, orderBy, where } from 'firebase/firestore';
import app from '../config/firebase';

const db = getFirestore(app);

export function useFirestoreCollection<T>(
  collectionName: string,
  options?: { orderByField?: string; orderDirection?: 'asc' | 'desc'; whereField?: string; whereValue?: unknown },
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const ref = collection(db, collectionName);
    let q;
    if (options?.whereField && options?.whereValue !== undefined) {
      q = options.orderByField
        ? query(ref, where(options.whereField, '==', options.whereValue), orderBy(options.orderByField, options.orderDirection || 'desc'))
        : query(ref, where(options.whereField, '==', options.whereValue));
    } else if (options?.orderByField) {
      q = query(ref, orderBy(options.orderByField, options.orderDirection || 'desc'));
    } else {
      q = ref;
    }

    getDocs(q)
      .then((snapshot) => {
        if (!cancelled) {
          const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
          setData(docs);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [collectionName, options?.orderByField, options?.orderDirection, options?.whereField, options?.whereValue]);

  return { data, loading, error };
}

export function useFirestoreDoc<T>(collectionName: string, docId: string | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    getDoc(doc(db, collectionName, docId))
      .then((snapshot) => {
        if (!cancelled) {
          if (snapshot.exists()) {
            setData({ id: snapshot.id, ...snapshot.data() } as T);
          } else {
            setError('Not found');
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [collectionName, docId]);

  return { data, loading, error };
}
