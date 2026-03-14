// src/components/LoadingSpinner.tsx
export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem' }}>
      <div>{message}</div>
    </div>
  );
}
