import React from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { cn } from '@/utils/classnames';

export interface TabsItem {
  value: string;
  label: React.ReactNode;
  /** Panel body; omit all to hide `TabPanels` */
  content?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabsItem[];
  /** Controlled index; omit for uncontrolled (starts at 0) */
  selectedIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
  TabListClass?: string;
  TabClass?: string;
  TabPanelsClass?: string;
}

/** Tab list + optional panels (Headless UI) */
export const Tabs: React.FC<TabsProps> = ({
  items,
  selectedIndex,
  onChange,
  className,
  TabListClass,
  TabClass,
  TabPanelsClass,
}) => {
  const isControlled = selectedIndex !== undefined;

  return (
    <TabGroup
      defaultIndex={isControlled ? undefined : 0}
      selectedIndex={selectedIndex}
      onChange={onChange}
      className={cn('w-full', className)}
    >
      {/* Tabs Navigator */}
      <div className="flex w-full shrink-0 flex-col items-center">
        <TabList
          className={cn(
            'mb-[10px] flex items-center justify-between gap-[10px] rounded-[6px] bg-[var(--color-background-default-secondary)] p-[6px]',
            TabListClass
          )}
        >
          {items.map((item) => (
            <Tab
              key={item.value}
              disabled={item.disabled}
              className={cn(
                'h-6 px-3 rounded-[4px] text-[12px] font-medium flex items-center justify-center',
                'text-[var(--color-text-default-base)]',
                'outline-none focus:outline-none focus-visible:outline-none',
                'data-[selected]:!bg-[var(--color-background-default-base)] data-[selected]:!text-[var(--color-text-default-base)] data-[selected]:!shadow-[0px_1px_4px_0px_rgba(12,12,13,0.05)] data-[selected]:!shadow-[0px_1px_8px_1px_rgba(12,12,13,0.05)]',
                'data-[selected]:!outline-none data-[selected]:!ring-0 data-[selected]:!border-0',
                'data-[hover]:bg-[var(--color-background-neutral-tertiary)]',
                'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
                TabClass
              )}
            >
              {item.label}
            </Tab>
          ))}
        </TabList>
      </div>

      {/* Panels only when at least one item defines content */}
      {items.some((item) => item.content !== undefined) && (
        <TabPanels className={TabPanelsClass}>
          {items.map((item) => (
            <TabPanel
              key={item.value}
              className="flex min-h-0 w-full flex-1 flex-col"
            >
              {item.content}
            </TabPanel>
          ))}
        </TabPanels>
      )}
    </TabGroup>
  );
};

export default Tabs;

