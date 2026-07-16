import React, { useMemo, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { cn } from '@/utils/classnames';
import { cva } from 'class-variance-authority';
import { TableHeader } from './TableHeader';
import { TableBody } from './TableBody';
import { Pagination } from './Pagination';

/**
 * Table density / font size token.
 */
export type TableSize = 'small' | 'middle' | 'large';

/**
 * Ant Design–style column descriptor mapped to TanStack columns.
 */
export interface TableColumn<TData = Record<string, unknown>> {
  /**
   * Header cell content.
   */
  title?: React.ReactNode;
  /**
   * Field path on the row object (string or nested keys).
   */
  dataIndex?: string | string[];
  /**
   * Stable column id; falls back to `dataIndex` when omitted.
   */
  key?: string;
  /**
   * Custom body renderer.
   */
  render?: (value: unknown, record: TData, index: number) => React.ReactNode;
  /**
   * Cell alignment (header follows unless `headerAlign` is set).
   */
  align?: 'left' | 'center' | 'right';
  /**
   * Header-only alignment override.
   */
  headerAlign?: 'left' | 'center' | 'right';
  /**
   * Column width hint.
   */
  width?: number | string;
  /**
   * Enable sorting or supply a compare function.
   */
  sorter?: boolean | ((a: TData, b: TData) => number);
}

/**
 * Optional footer pagination settings.
 */
export interface TablePaginationConfig {
  /**
   * Current page (1-based).
   */
  current?: number;
  /**
   * Rows per page.
   */
  pageSize?: number;
  /**
   * Total row count (for page count).
   */
  total?: number;
  /**
   * Show page-size selector.
   */
  showSizeChanger?: boolean;
  /**
   * Options for the page-size selector.
   */
  pageSizeOptions?: string[];
  /**
   * Page or size changed.
   */
  onChange?: (page: number, pageSize: number) => void;
  /**
   * Page size changed (Ant Design signature).
   */
  onShowSizeChange?: (current: number, size: number) => void;
}

/**
 * Table Props
 */
export interface TableProps<TData = Record<string, unknown>> {
  /**
   * Row data (primary prop).
   */
  dataSource?: TData[];
  /**
   * Alias of `dataSource`.
   */
  data?: TData[];
  /**
   * Column definitions.
   */
  columns?: TableColumn<TData>[];
  /**
   * Visual density.
   * @default 'middle'
   */
  size?: TableSize;
  /**
   * Draw outer border.
   * @default true
   */
  bordered?: boolean;
  /**
   * Loading flag or custom spinner node.
   * @default false
   */
  loading?: boolean | { indicator?: React.ReactNode };
  /**
   * Pagination config or `false` to hide.
   */
  pagination?: TablePaginationConfig | false;
  /**
   * Row key field name or getter.
   */
  rowKey?: string | ((record: TData, index: number) => string);
  /**
   * Empty-state body content.
   */
  emptyText?: React.ReactNode;
  /**
   * Wrapper class.
   */
  className?: string;
  /**
   * Scroll / max height for body (sticky header when `y` is set).
   */
  scroll?: { y?: number | string };
  /**
   * Row interaction props factory.
   */
  onRow?: (record: TData, index: number) => {
    onClick?: (event: React.MouseEvent) => void;
    className?: string;
  };
  /**
   * Per-row class name.
   */
  rowClassName?: (record: TData, index: number) => string;
}

/**
 * Table shell variants (size + border).
 */
const tableVariants = cva(
  'w-full border-collapse',
  {
    variants: {
      size: {
        small: 'text-xs',
        middle: 'text-sm',
        large: 'text-base',
      },
      bordered: {
        true: 'border border-[var(--color-border-default-base)]',
        false: '',
      },
    },
    defaultVariants: {
      size: 'middle',
      bordered: true,
    },
  }
);

/**
 * Maps `TableColumn` list to TanStack `ColumnDef` list.
 */
const convertColumns = <TData,>(
  columns: TableColumn<TData>[] = []
): ColumnDef<TData>[] => {
  return columns.map((col) => {
    const columnDef: ColumnDef<TData> = {
      id: col.key || (Array.isArray(col.dataIndex) ? col.dataIndex.join('.') : col.dataIndex?.toString()) || '',
      header: () => (col.title as React.ReactNode) || '',
      cell: (info) => {
        const record = info.row.original;
        const index = info.row.index;
        let value: unknown;

        if (col.dataIndex) {
          if (Array.isArray(col.dataIndex)) {
            let currentValue: Record<string, unknown> | unknown = record as Record<string, unknown>;
            for (const key of col.dataIndex) {
              if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
                currentValue = (currentValue as Record<string, unknown>)[key];
              } else {
                currentValue = undefined;
                break;
              }
            }
            value = currentValue;
          } else {
            value = (record as Record<string, unknown>)?.[col.dataIndex];
          }
        } else {
          value = record;
        }

        if (col.render) {
          return col.render(value, record, index);
        }

        const alignClass = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
        return (
          <span className={cn('text-xs text-text-default-secondary', alignClass)}>
            {String(value ?? '')}
          </span>
        );
      },
    };

    if (col.width) {
      columnDef.size = typeof col.width === 'number' ? col.width : undefined;
    }

    if (col.sorter) {
      columnDef.enableSorting = true;
      if (typeof col.sorter === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columnDef.sortingFn = col.sorter as any;
      }
    }

    return columnDef;
  });
};

/**
 * Data table built on TanStack Table.
 */
const Table = <TData extends Record<string, unknown> = Record<string, unknown>>({
  dataSource,
  data,
  columns = [],
  size = 'middle',
  bordered = true,
  loading = false,
  pagination = false,
  rowKey,
  emptyText = 'No data',
  className,
  scroll,
  onRow,
  rowClassName,
}: TableProps<TData>) => {
  const [sortingState, setSortingState] = React.useState<SortingState>([]);

  const tableData = dataSource || data || [];

  const tanStackColumns = useMemo(
    () => convertColumns(columns),
    [columns]
  );

  const getRowId = useCallback(
    (row: TData, index: number) => {
      if (rowKey) {
        if (typeof rowKey === 'function') {
          return rowKey(row, index);
        }
        return (row as Record<string, unknown>)[rowKey]?.toString() || index.toString();
      }
      return index.toString();
    },
    [rowKey]
  );

  const table = useReactTable({
    data: tableData,
    columns: tanStackColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    state: {
      sorting: sortingState,
    },
    onSortingChange: setSortingState,
    manualPagination: !pagination,
    pageCount: pagination && pagination.total && pagination.pageSize
      ? Math.ceil(pagination.total / pagination.pageSize)
      : undefined,
    getRowId: getRowId,
  });

  useEffect(() => {
    if (pagination && pagination.current && pagination.pageSize) {
      table.setPageIndex(pagination.current - 1);
      table.setPageSize(pagination.pageSize);
    }
  }, [pagination, table]);

  const handlePageChange = useCallback(
    (pageIndex: number) => {
      if (pagination && pagination.onChange) {
        pagination.onChange(pageIndex + 1, table.getState().pagination.pageSize);
      }
    },
    [pagination, table]
  );

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      if (pagination && pagination.onShowSizeChange) {
        pagination.onShowSizeChange(table.getState().pagination.pageIndex + 1, pageSize);
      }
      table.setPageSize(pageSize);
    },
    [pagination, table]
  );

  const isLoading = typeof loading === 'boolean' ? loading : (typeof loading === 'object' && loading !== null && 'indicator' in loading);
  const loadingIndicator = typeof loading === 'object' && loading !== null && 'indicator' in loading ? loading.indicator : undefined;
  const maxHeight =
    scroll?.y == null ? undefined : typeof scroll.y === 'number' ? `${scroll.y}px` : scroll.y;
  /** When body scrolls, put the border on the scrollport so the scrollbar sits inside. */
  const scrollBoxed = Boolean(maxHeight && bordered);

  return (
    <div className={cn('w-full bg-background-default-secondary', className)}>
      <div
        className={cn(
          'overflow-x-auto',
          maxHeight && 'table-scroll-body overflow-y-auto',
          scrollBoxed &&
            'rounded-lg border border-[var(--color-border-default-base)]'
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table
          className={cn(
            tableVariants({ size, bordered: bordered && !scrollBoxed }),
            scrollBoxed && 'border-0'
          )}
        >
          <TableHeader
            headerGroups={table.getHeaderGroups()}
            columns={columns}
            size={size}
            sticky={Boolean(maxHeight)}
          />
          <TableBody
            rows={table.getRowModel().rows}
            columns={columns}
            size={size}
            loading={isLoading}
            loadingIndicator={loadingIndicator}
            emptyText={emptyText}
            onRow={onRow}
            rowClassName={rowClassName}
          />
        </table>
      </div>
      {pagination && (
        <Pagination
          table={table}
          pagination={pagination}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
};

export { Table };
export default Table;
