import { type JSX, splitProps } from 'solid-js';

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

export function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, ['class']);

  return (
    <button
      class={`inline-flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-white text-neutral-950 border border-neutral-300 text-sm px-4 py-2 ${local.class || ''}`}
      {...others}
    />
  );
}
