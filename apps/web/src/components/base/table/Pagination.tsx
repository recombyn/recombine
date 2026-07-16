import type { Table as TanStackTable } from '@tanstack/react-table';
import type { TablePaginationConfig } from './index';

interface PaginationProps<TData> {
  table: TanStackTable<TData>;
  pagination: TablePaginationConfig;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export const Pagination = <TData,>({
  table,
  pagination,
  onPageChange,
  onPageSizeChange,
}: PaginationProps<TData>) => {
  return (
    <div className="mt-3 flex w-full items-center justify-between gap-3">
      <div className="shrink-0 text-[12px] text-[var(--muted)]">
        Total {pagination.total ?? table.getRowCount()}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(table.getState().pagination.pageIndex - 1)}
          disabled={!table.getCanPreviousPage()}
          className="rounded border border-[var(--color-border-default-base)] px-3 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--accent-soft)]"
        >
          Previous
        </button>
        <span className="text-[12px] tabular-nums text-[var(--ink)]">
          {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(table.getState().pagination.pageIndex + 1)}
          disabled={!table.getCanNextPage()}
          className="rounded border border-[var(--color-border-default-base)] px-3 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--accent-soft)]"
        >
          Next
        </button>
        {pagination.showSizeChanger && (
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-[var(--color-border-default-base)] bg-[var(--surface)] px-2 py-1 text-[12px]"
          >
            {(pagination.pageSizeOptions || ['10', '20', '50', '100']).map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

