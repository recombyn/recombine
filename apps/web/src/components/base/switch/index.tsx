import React from 'react';
import { Switch as HeadlessSwitch } from '@headlessui/react';
import { cn } from '@/utils/classnames';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Toggle switch (Headless UI). */
const SwitchBase: React.FC<SwitchProps> = ({ checked, onChange, disabled = false, className }) => {
  return (
    <HeadlessSwitch
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className={cn(
        'group relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full p-0.5 transition-colors',
        'focus:outline-none data-[focus]:outline-none',
        checked ? 'bg-[#35C838]' : 'bg-[var(--color-border-default-base)]',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
          'group-data-[checked]:translate-x-3.5 translate-x-0'
        )}
      />
    </HeadlessSwitch>
  );
};

export const Switch = React.memo(SwitchBase);
export default Switch;

