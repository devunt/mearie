import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {}

export function Button({ className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-white text-neutral-950 border border-neutral-300 text-sm px-4 py-2 ${className}`}
      {...props}
    />
  );
}
