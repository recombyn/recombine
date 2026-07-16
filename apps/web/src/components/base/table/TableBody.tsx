import React from 'react';
import { flexRender, type Row } from '@tanstack/react-table';
import { cn } from '@/utils/classnames';
import type { TableColumn, TableSize } from './index';

interface TableBodyProps<TData> {
  rows: Row<TData>[];
  columns: TableColumn<TData>[];
  size: TableSize;
  loading: boolean;
  loadingIndicator?: React.ReactNode;
  emptyText: React.ReactNode;
  onRow?: (record: TData, index: number) => {
    onClick?: (event: React.MouseEvent) => void;
    className?: string;
  };
  rowClassName?: (record: TData, index: number) => string;
}

export const TableBody = <TData,>({
  rows,
  columns,
  size,
  loading,
  loadingIndicator,
  emptyText,
  onRow,
  rowClassName,
}: TableBodyProps<TData>) => {
  if (loading) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={columns.length}
            className='px-4 py-8 text-center text-text-disabled-secondary'
          >
            {loadingIndicator || 'Loading…'}
          </td>
        </tr>
      </tbody>
    );
  }

  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={columns.length}
            className='px-4 py-8 text-center text-text-disabled-secondary'
          >
            {emptyText}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row, index) => {
        const record = row.original;
        const rowProps = onRow?.(record, index) || {};
        const customClassName = rowClassName?.(record, index);

        return (
          <tr
            key={row.id}
            className={cn(
              'border-b border-[var(--color-border-default-base)]',
              index % 2 === 1 && 'bg-background-default-secondary',
              rowProps.onClick && 'cursor-pointer hover:bg-background-default-base',
              rowProps.className,
              customClassName
            )}
            onClick={rowProps.onClick}
          >
            {row.getVisibleCells().map((cell, cellIndex) => {
              const col = columns[cellIndex];
              const align = col?.align || 'left';
              const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

              return (
                <td
                  key={cell.id}
                  className={cn(
                    'px-4 py-3 text-xs text-text-default-secondary',
                    alignClass,
                    size === 'small' && 'px-2 py-2',
                    size === 'large' && 'px-6 py-4'
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );
};

