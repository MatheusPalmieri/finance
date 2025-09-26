'use client';

import { useMemo, useState } from 'react';

import { AlertCircle, ArrowLeft, CheckCircle, Upload } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

import type { ParsedTransaction } from '../page';

interface DataPreviewProps {
  data: ParsedTransaction[];
  onImport: (selectedTransactions: ParsedTransaction[]) => void;
  onCancel: () => void;
}

export function DataPreview({ data, onImport, onCancel }: DataPreviewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showOnlyValid, setShowOnlyValid] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const stats = useMemo(() => {
    const valid = data.filter((t) => t.isValid);
    const invalid = data.filter((t) => !t.isValid);
    const totalAmount = valid.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalInput = valid.reduce(
      (sum, t) => sum + (t.amount > 0 ? t.amount : 0),
      0
    );
    const totalOutput = valid.reduce(
      (sum, t) => sum + (t.amount < 0 ? t.amount : 0),
      0
    );

    return {
      total: data.length,
      valid: valid.length,
      invalid: invalid.length,
      totalAmount,
      totalInput,
      totalOutput,
      categories: [...new Set(valid.map((t) => t.category))].length,
    };
  }, [data]);

  const filteredData = useMemo(() => {
    let filtered = [...data];

    if (showOnlyValid) {
      filtered = filtered.filter((t) => t.isValid);
    }

    if (showOnlySelected) {
      filtered = filtered.filter((_, index) => selectedIds.has(index));
    }

    return filtered;
  }, [data, showOnlyValid, showOnlySelected, selectedIds]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const validIndices = data
        .map((t, index) => ({ t, index }))
        .filter(({ t }) => t.isValid)
        .map(({ index }) => index);
      setSelectedIds(new Set(validIndices));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectTransaction = (index: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(index);
    } else {
      newSelected.delete(index);
    }
    setSelectedIds(newSelected);
  };

  const selectedTransactions = data.filter((_, index) =>
    selectedIds.has(index)
  );

  const selectedAmount = selectedTransactions.reduce(
    (sum, t) => sum + Math.abs(t.amount),
    0
  );

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      market: 'bg-green-100 text-green-800',
      transport: 'bg-purple-100 text-purple-800',
      health: 'bg-red-100 text-red-800',
      food: 'bg-orange-100 text-orange-800',
      entertainment: 'bg-purple-100 text-purple-800',
      study: 'bg-indigo-100 text-indigo-800',
      office: 'bg-gray-100 text-gray-800',
      birthday: 'bg-pink-100 text-pink-800',
      other: 'bg-gray-100 text-gray-600',
    };
    return colors[category] || colors.other;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      market: 'Mercado',
      transport: 'Transporte',
      health: 'Saúde',
      food: 'Alimentação',
      entertainment: 'Entretenimento',
      study: 'Estudos',
      office: 'Escritório',
      birthday: 'Presente',
      other: 'Outros',
    };
    return labels[category] || 'Outros';
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      pix: 'PIX',
      credit_card: 'Cartão de Crédito',
      debit_card: 'Cartão de Débito',
      transfer: 'Transferência',
      boleto: 'Boleto',
      cash: 'Dinheiro',
      other: 'Outros',
    };
    return labels[method] || 'Outros';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">
              {stats.total}
            </div>
            <div className="text-sm text-gray-600">Total transactions</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {stats.valid}
            </div>
            <div className="text-sm text-gray-600">Valid</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">
              {stats.invalid}
            </div>
            <div className="text-sm text-gray-600">With errors</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(stats.totalAmount)}
            </div>
            <div className="text-sm text-gray-600">Total moved</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalInput)}
            </div>
            <div className="text-sm text-gray-600">Total input</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalOutput)}
            </div>
            <div className="text-sm text-gray-600">Total output</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Display Controls</CardTitle>
          <CardDescription>
            Filter and select the transactions you want to import
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="show-valid"
                checked={showOnlyValid}
                onCheckedChange={setShowOnlyValid}
              />
              <label htmlFor="show-valid" className="text-sm font-medium">
                Show only valid
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="show-selected"
                checked={showOnlySelected}
                onCheckedChange={setShowOnlySelected}
              />
              <label htmlFor="show-selected" className="text-sm font-medium">
                Show only selected
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all"
                checked={
                  selectedIds.size > 0 && selectedIds.size === stats.valid
                }
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                Select all valid ({stats.valid})
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-purple-900">
                  {selectedIds.size} transactions selected
                </p>
                <p className="text-sm text-purple-700">
                  Total amount: {formatCurrency(selectedAmount)}
                </p>
              </div>
              <CheckCircle className="size-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Data Preview ({filteredData.length} transactions)
          </CardTitle>
          <CardDescription>
            Review data before importing. Transactions with errors cannot be
            selected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Sel.</TableHead>
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Line</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((transaction) => {
                  const originalIndex = data.indexOf(transaction);
                  const isSelected = selectedIds.has(originalIndex);

                  return (
                    <TableRow
                      key={originalIndex}
                      className={` ${!transaction.isValid ? 'bg-red-50' : ''} ${isSelected ? 'bg-purple-50' : ''} `}
                    >
                      <TableCell>
                        {transaction.isValid && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleSelectTransaction(originalIndex, !!checked)
                            }
                          />
                        )}
                      </TableCell>

                      <TableCell>
                        {transaction.isValid ? (
                          <CheckCircle className="size-4 text-green-600" />
                        ) : (
                          <AlertCircle className="size-4 text-red-600" />
                        )}
                      </TableCell>

                      <TableCell className="font-mono text-sm">
                        {transaction.date || '-'}
                      </TableCell>

                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {transaction.description || '-'}
                          </p>
                          {transaction.errors.length > 0 && (
                            <div className="mt-1">
                              {transaction.errors.map((error, i) => (
                                <p key={i} className="text-xs text-red-600">
                                  {error}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            transaction.transaction_type === 'expense'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {transaction.transaction_type === 'expense'
                            ? '💸 Expense'
                            : '💰 Income'}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span
                          className={`font-medium ${
                            transaction.transaction_type === 'expense'
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}
                        >
                          {transaction.amount !== 0
                            ? formatCurrency(transaction.amount)
                            : '-'}
                        </span>
                      </TableCell>

                      <TableCell>
                        {transaction.category && (
                          <Badge
                            className={getCategoryColor(transaction.category)}
                          >
                            {getCategoryLabel(transaction.category)}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {getPaymentMethodLabel(
                            transaction.paymentMethod || 'other'
                          )}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs text-gray-500">
                          #{transaction.originalRow}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">
            {selectedIds.size === 0
              ? 'Select at least one transaction to continue'
              : `${selectedIds.size} transaction(s) will be imported`}
          </p>

          <Button
            onClick={() => onImport(selectedTransactions)}
            disabled={selectedIds.size === 0}
          >
            <Upload className="mr-2 size-4" />
            Import Selected
          </Button>
        </div>
      </div>
    </div>
  );
}
