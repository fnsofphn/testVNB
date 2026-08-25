import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

type MotionSurfaceProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
  [key: string]: unknown;
};

export function MotionSurface({
  as,
  children,
  className = '',
  delay = 0,
  style,
  ...props
}: MotionSurfaceProps) {
  const Component = as || 'div';
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    frame = window.requestAnimationFrame(() => {
      observer.observe(element);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const motionDelay = delay ? `${delay}ms` : undefined;

  return (
    <Component
      {...props}
      ref={ref}
      className={`motion-surface ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{ ...style, transitionDelay: motionDelay, animationDelay: motionDelay, '--motion-delay': motionDelay } as CSSProperties}
    >
      {children}
    </Component>
  );
}
