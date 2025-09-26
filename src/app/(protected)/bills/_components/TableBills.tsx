'use client';

import * as React from 'react';

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDateSimple } from '@/lib/utils';

import type { Bill } from '../page';
import { BillActions } from './BillActions';

export function createColumns(onUpdate: () => void): ColumnDef<Bill>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="overflow-hidden font-medium text-ellipsis text-purple-900 capitalize md:max-w-40 lg:max-w-60 2xl:max-w-2xl">
          {row.getValue('name')}
        </div>
      ),
    },
    {
      accessorKey: 'installments',
      header: 'Installments',
      cell: ({ row }) => {
        const totalInstallments = row.original.total_installments;
        const currentInstallment = row.original.installment_number;

        if (totalInstallments > 1) {
          return (
            <Badge className="border-purple-300 bg-purple-100 text-xs text-purple-700">
              📋 {currentInstallment}/{totalInstallments}
            </Badge>
          );
        }

        return (
          <Badge
            variant="secondary"
            className="bg-gray-100 text-xs text-gray-700"
          >
            💳 Single
          </Badge>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => {
        const amount = parseFloat(row.getValue('amount'));
        const transactionType = row.original.transaction_type;

        return (
          <span
            className={`font-semibold ${
              transactionType === 'expense' ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(amount, 'BRL', 'pt-BR')}
          </span>
        );
      },
    },
    {
      accessorKey: 'payment_method',
      header: 'Payment Method',
      cell: ({ row }) => (
        <Badge className="border-purple-300 bg-purple-100 text-purple-700 capitalize">
          {row.getValue('payment_method')}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_recurring',
      header: 'Recurring',
      cell: ({ row }) => (
        <Badge
          variant={row.getValue('is_recurring') ? 'success' : 'error'}
          className="capitalize"
        >
          {row.getValue('is_recurring') ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_essential',
      header: 'Essential',
      cell: ({ row }) => (
        <Badge
          variant={row.getValue('is_essential') ? 'success' : 'error'}
          className="capitalize"
        >
          {row.getValue('is_essential') ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => {
        const date = new Date(row.getValue('date'));
        const formatted = formatDateSimple(date, 'pt-BR');

        return <div className="font-medium text-purple-900">{formatted}</div>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      cell: ({ row }) => {
        return <BillActions bill={row.original} onUpdate={onUpdate} />;
      },
    },
  ];
}

export function TableBills({
  data,
  onUpdate,
}: {
  data: Bill[];
  onUpdate: () => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const columns = React.useMemo(() => createColumns(onUpdate), [onUpdate]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  });

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-lg border border-purple-200 shadow-sm">
        <Table>
          <TableHeader className="bg-purple-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-purple-200 hover:bg-purple-100"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="font-semibold text-purple-900"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-purple-100 hover:bg-purple-50 data-[state=selected]:bg-purple-100"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-purple-600"
                >
                  No bills found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2 border-t border-purple-100 py-4">
        <div className="flex-1 text-sm text-purple-600">
          <span className="font-medium">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount()}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="border-purple-200 text-purple-700 hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="border-purple-200 text-purple-700 hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
