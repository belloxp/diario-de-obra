// Chuva caindo (estilo "Just rain") — overlay do card "Chuva acumulada" e dos dias de chuva.
export function RainDrops({ count = 22 }: { count?: number }) {
  const drops = Array.from({ length: count }, (_, i) => ({
    left: (i * 4.67 + (i % 4) * 3.1) % 100,
    delay: ((i % 7) * 0.19).toFixed(2),
    dur: (0.72 + (i % 5) * 0.16).toFixed(2),
    h: 9 + (i % 3) * 5,
  }));
  return (
    <span className="raindrops" aria-hidden="true">
      {drops.map((d, i) => (
        <i
          key={i}
          style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s`, height: `${d.h}px` }}
        />
      ))}
    </span>
  );
}
