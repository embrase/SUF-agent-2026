import { onRequest } from 'firebase-functions/v2/https';

export const api = onRequest({ cors: true }, (req, res) => {
  res.json({ status: 'ok', message: 'SUF Agent Platform API' });
});
