import React from 'react';
import { flexRender, type HeaderGroup } from '@tanstack/react-table';
import { cn } from '@/utils/classnames';
import type { TableColumn, TableSize } from './index';

interface TableHeaderProps<TData> {
  headerGroups: HeaderGroup<TData>[];
  columns: TableColumn<TData>[];
  size: TableSize;
  /** Stick header while body scrolls. */
  sticky?: boolean;
}

export const TableHeader = <TData,>({
  headerGroups,
  columns,
  size,
  sticky = false,
}: TableHeaderProps<TData>) => {
  return (
    <thead className={cn(sticky && 'sticky top-0 z-[2]')}>
      {headerGroups.map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header, headerIndex) => {
            const col = columns[headerIndex];
            const headerAlign = col?.headerAlign || col?.align || 'left';
            const headerAlignClass = headerAlign === 'center' ? 'text-center' : headerAlign === 'right' ? 'text-right' : 'text-left';

            return (
              <th
                key={header.id}
                className={cn(
                  'px-4 py-3 font-medium text-sm text-text-default-base bg-background-default-secondary border-b border-[var(--color-border-default-base)]',
                  headerAlignClass,
                  size === 'small' && 'px-2 py-2',
                  size === 'large' && 'px-6 py-4',
                  header.column.getCanSort() && 'cursor-pointer select-none hover:bg-background-default-base',
                  header.column.getIsSorted() && 'bg-background-default-base',
                  sticky && 'sticky top-0 z-[2] bg-[var(--surface)] shadow-[0_1px_0_var(--color-border-default-base)]'
                )}
                style={header.getSize() !== 150 ? { width: header.getSize() } : undefined}
                onClick={header.column.getToggleSortingHandler()}
              >
                <div className={cn(
                  'flex items-center gap-2',
                  headerAlign === 'center' && 'justify-center',
                  headerAlign === 'right' && 'justify-end'
                )}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getCanSort() && (
                    <span className='text-text-disabled-secondary'>
                      {(() => {
                        const sorted = header.column.getIsSorted();
                        if (sorted === 'asc') return '↑';
                        if (sorted === 'desc') return '↓';
                        return '⇅';
                      })()}
                    </span>
                  )}
                </div>
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
};

