// src/components/IconAvatar.tsx
interface Props {
  icon: string;
  color: string;
  size?: number;
}

export default function IconAvatar({ icon, color, size = 48 }: Props) {
  return (
    <span
      className="material-icons"
      style={{
        fontSize: size,
        color: '#fff',
        backgroundColor: color,
        borderRadius: '50%',
        width: size * 1.5,
        height: size * 1.5,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
    </span>
  );
}
