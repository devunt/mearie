import { type JSX, splitProps } from 'solid-js';

interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export function Card(props: CardProps) {
  const [local, others] = splitProps(props, ['class', 'children']);

  return (
    <div class={`border border-neutral-200 bg-white p-6 ${local.class || ''}`} {...others}>
      {local.children}
    </div>
  );
}
