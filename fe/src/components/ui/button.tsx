import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 focus-visible:ring-offset-trading-bg",
  {
    variants: {
      variant: {
        // Primary button - uses custom button-primary color
        default: 'bg-button-primary text-text-primary hover:bg-button-primary-hover',

        // Destructive/Error button
        destructive: 'bg-error text-text-primary hover:bg-error-dark',

        // Outline button - uses trading surface colors
        outline:
          'border border-border-default bg-transparent hover:bg-trading-elevated hover:text-text-primary',

        // Secondary button - uses custom button-secondary color
        secondary: 'bg-button-secondary text-text-primary hover:bg-button-secondary-hover',

        // Ghost button - transparent with hover
        ghost: 'bg-button-ghost hover:bg-button-ghost-hover hover:text-text-primary',

        // Link button
        link: 'text-info underline-offset-4 hover:underline hover:text-info-light',

        // Trading-specific variants
        long: 'bg-long text-text-primary hover:bg-long-hover',
        short: 'bg-short text-text-primary hover:bg-short-hover',
        swap: 'bg-swap text-text-primary hover:bg-swap-hover',

        // Success/Warning variants
        success: 'bg-success text-text-primary hover:bg-success-dark',
        warning: 'bg-warning text-text-inverse hover:bg-warning-dark',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        xl: 'h-12 rounded-lg px-8 has-[>svg]:px-6 text-base',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
