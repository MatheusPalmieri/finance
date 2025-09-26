'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Download,
  RotateCcw,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';

import type { ImportResult } from '../page';

interface ImportSummaryProps {
  result: ImportResult;
  onStartOver: () => void;
  onGoToBills: () => void;
}

export function ImportSummary({
  result,
  onStartOver,
  onGoToBills,
}: ImportSummaryProps) {
  const successRate = Math.round((result.success / result.total) * 100);

  const exportErrorReport = () => {
    if (result.details.failed.length === 0) return;

    const csvContent = [
      'Linha,Erro,Data,Descrição,Valor',
      ...result.details.failed.map(
        (transaction) =>
          `${transaction.originalRow},"${transaction.errors.join('; ')}","${transaction.date}","${transaction.description}",${transaction.amount}`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'relatorio_erros_importacao.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <Card
        className={`border-2 ${
          result.success === result.total
            ? 'border-green-200 bg-green-50'
            : result.success > 0
              ? 'border-yellow-200 bg-yellow-50'
              : 'border-red-200 bg-red-50'
        }`}
      >
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            {result.success === result.total ? (
              <CheckCircle className="size-16 text-green-600" />
            ) : result.success > 0 ? (
              <AlertTriangle className="size-16 text-yellow-600" />
            ) : (
              <XCircle className="size-16 text-red-600" />
            )}
          </div>

          <CardTitle className="text-2xl">
            {result.success === result.total
              ? 'Import Completed Successfully!'
              : result.success > 0
                ? 'Import Partially Completed'
                : 'Import Failed'}
          </CardTitle>

          <CardDescription className="text-lg">
            {result.success} of {result.total} transactions were imported (
            {successRate}%)
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="mb-1 text-3xl font-bold text-green-600">
              {result.success}
            </div>
            <div className="text-sm text-gray-600">Imported</div>
            <Badge className="mt-2 bg-green-100 text-green-800">Success</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="mb-1 text-3xl font-bold text-yellow-600">
              {result.duplicates}
            </div>
            <div className="text-sm text-gray-600">Duplicates</div>
            <Badge className="mt-2 bg-yellow-100 text-yellow-800">
              Ignored
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="mb-1 text-3xl font-bold text-red-600">
              {result.errors}
            </div>
            <div className="text-sm text-gray-600">Errors</div>
            <Badge className="mt-2 bg-red-100 text-red-800">Failed</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="mb-1 text-3xl font-bold text-purple-600">
              {result.total}
            </div>
            <div className="text-sm text-gray-600">Total</div>
            <Badge className="mt-2 bg-purple-100 text-purple-800">
              Processed
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import Details</CardTitle>
          <CardDescription>
            See details for each category of processed transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="imported" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="imported" className="flex items-center gap-2">
                <CheckCircle className="size-4" />
                Imported ({result.success})
              </TabsTrigger>
              <TabsTrigger
                value="duplicates"
                className="flex items-center gap-2"
              >
                <AlertTriangle className="size-4" />
                Duplicates ({result.duplicates})
              </TabsTrigger>
              <TabsTrigger value="errors" className="flex items-center gap-2">
                <XCircle className="size-4" />
                Errors ({result.errors})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="imported" className="mt-4">
              {result.details.imported.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Categoria</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.details.imported.map((transaction, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-sm">
                            {transaction.date}
                          </TableCell>
                          <TableCell>{transaction.description}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(transaction.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-800">
                              {transaction.category}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No transactions were imported
                </div>
              )}
            </TabsContent>

            <TabsContent value="duplicates" className="mt-4">
              {result.details.duplicates.length > 0 ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Duplicate transactions:</strong> These
                      transactions already exist in the system and were ignored
                      to avoid data duplication.
                    </p>
                  </div>

                  <div className="max-h-64 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Linha</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.details.duplicates.map((transaction, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-sm">
                              {transaction.date}
                            </TableCell>
                            <TableCell>{transaction.description}</TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(transaction.amount)}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-gray-500">
                                #{transaction.originalRow}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No duplicate transactions found
                </div>
              )}
            </TabsContent>

            <TabsContent value="errors" className="mt-4">
              {result.details.failed.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 rounded-lg border border-red-200 bg-red-50 p-4">
                      <p className="text-sm text-red-800">
                        <strong>Transactions with errors:</strong> These
                        transactions could not be imported due to data issues.
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportErrorReport}
                      className="ml-4"
                    >
                      <Download className="mr-2 size-4" />
                      Export Report
                    </Button>
                  </div>

                  <div className="max-h-64 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Linha</TableHead>
                          <TableHead>Erro</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.details.failed.map((transaction, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <span className="text-xs text-gray-500">
                                #{transaction.originalRow}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {transaction.errors.map((error, i) => (
                                  <p key={i} className="text-xs text-red-600">
                                    {error}
                                  </p>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {transaction.date || '-'}
                            </TableCell>
                            <TableCell>
                              {transaction.description || '-'}
                            </TableCell>
                            <TableCell className="font-medium">
                              {transaction.amount !== 0
                                ? formatCurrency(transaction.amount)
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No errors found
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onStartOver}>
          <RotateCcw className="mr-2 size-4" />
          Import Another File
        </Button>

        <Button onClick={onGoToBills}>
          View My Bills
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
