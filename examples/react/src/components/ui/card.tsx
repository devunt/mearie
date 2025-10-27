import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`border border-neutral-200 bg-white p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}
