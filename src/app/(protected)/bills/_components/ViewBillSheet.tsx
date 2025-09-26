'use client';

import { useEffect, useState } from 'react';

import {
  Calendar,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Hash,
  Repeat,
  Star,
  Tag,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';

import type { Bill } from '../page';

interface ViewBillSheetProps {
  bill: Bill;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewBillSheet({
  bill,
  open,
  onOpenChange,
}: ViewBillSheetProps) {
  const [relatedInstallments, setRelatedInstallments] = useState<Bill[]>([]);

  const supabase = createClient();

  useEffect(() => {
    const fetchRelatedInstallments = async () => {
      try {
        const { data, error } = await supabase
          .from('bills')
          .select('*')
          .eq('parent_transaction_id', bill.parent_transaction_id || bill.id)
          .neq('status', 'deleted')
          .order('installment_number', { ascending: true });

        if (error) {
          console.error('❌ Error fetching related installments:', error);
          return;
        }

        setRelatedInstallments(data || []);
      } catch (error) {
        console.error('💥 Unexpected error:', error);
      }
    };

    if (open && bill.total_installments > 1) {
      fetchRelatedInstallments();
    }
  }, [open, bill.id, bill.total_installments]);

  const getStatusColor = (transactionType: string) => {
    return transactionType === 'expense' ? 'text-red-600' : 'text-green-600';
  };

  const getStatusBadge = (transactionType: string) => {
    return transactionType === 'expense' ? 'error' : 'success';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-purple-100 pb-4">
          <SheetTitle className="text-xl font-bold text-purple-900">
            Bill Details
          </SheetTitle>
          <SheetDescription className="text-purple-600">
            View all detailed information for this bill
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Informações Principais */}
          <Card className="border-purple-200">
            <CardHeader className="bg-purple-50">
              <CardTitle className="flex items-center gap-2 text-purple-900">
                <FileText className="h-5 w-5" />
                Main Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Hash className="h-4 w-4" />
                    Name
                  </div>
                  <p className="font-semibold text-purple-900">{bill.name}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <DollarSign className="h-4 w-4" />
                    Amount
                  </div>
                  <p
                    className={`text-lg font-bold ${getStatusColor(bill.transaction_type)}`}
                  >
                    {formatCurrency(bill.amount, 'BRL', 'pt-BR')}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Tag className="h-4 w-4" />
                    Type
                  </div>
                  <Badge
                    variant={getStatusBadge(bill.transaction_type)}
                    className="capitalize"
                  >
                    {bill.transaction_type === 'expense' ? 'Expense' : 'Income'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Calendar className="h-4 w-4" />
                    Date
                  </div>
                  <p className="font-medium text-purple-900">
                    {new Date(bill.date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              {bill.description && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <FileText className="h-4 w-4" />
                    Description
                  </div>
                  <p className="rounded-lg bg-purple-50 p-3 text-purple-900">
                    {bill.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Informações de Pagamento */}
          <Card className="border-purple-200">
            <CardHeader className="bg-purple-50">
              <CardTitle className="flex items-center gap-2 text-purple-900">
                <CreditCard className="h-5 w-5" />
                Payment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <CreditCard className="h-4 w-4" />
                    Payment Method
                  </div>
                  <Badge className="border-purple-300 bg-purple-100 text-purple-700 capitalize">
                    {bill.payment_method}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Tag className="h-4 w-4" />
                    Category
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {bill.category}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Repeat className="h-4 w-4" />
                    Recurring
                  </div>
                  <Badge variant={bill.is_recurring ? 'success' : 'error'}>
                    {bill.is_recurring ? 'Yes' : 'No'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Star className="h-4 w-4" />
                    Essential
                  </div>
                  <Badge variant={bill.is_essential ? 'success' : 'error'}>
                    {bill.is_essential ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações de Parcelamento */}
          {bill.total_installments > 1 && (
            <Card className="border-purple-200">
              <CardHeader className="bg-purple-50">
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <Hash className="h-5 w-5" />
                  Installment Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-purple-600">
                      <Hash className="h-4 w-4" />
                      Current Installment
                    </div>
                    <Badge className="border-purple-300 bg-purple-100 text-purple-700">
                      {bill.installment_number} de {bill.total_installments}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-purple-600">
                      <DollarSign className="h-4 w-4" />
                      Total Amount
                    </div>
                    <p
                      className={`font-bold ${getStatusColor(bill.transaction_type)}`}
                    >
                      {formatCurrency(
                        bill.amount * bill.total_installments,
                        'BRL',
                        'pt-BR'
                      )}
                    </p>
                  </div>
                </div>

                {/* Lista de Parcelas */}
                {relatedInstallments.length > 0 && (
                  <div className="space-y-3">
                    <Separator className="bg-purple-200" />
                    <h4 className="font-semibold text-purple-900">
                      All Installments:
                    </h4>
                    <div className="max-h-60 space-y-2 overflow-y-auto">
                      {relatedInstallments.map((installment) => (
                        <div
                          key={installment.id}
                          className={`flex items-center justify-between rounded-lg border p-3 ${
                            installment.id === bill.id
                              ? 'border-purple-300 bg-purple-100'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={
                                installment.id === bill.id
                                  ? 'default'
                                  : 'secondary'
                              }
                              className="min-w-fit"
                            >
                              {installment.installment_number}/
                              {installment.total_installments}
                            </Badge>
                            <span className="text-sm text-gray-600">
                              {new Date(installment.date).toLocaleDateString(
                                'pt-BR'
                              )}
                            </span>
                          </div>
                          <span
                            className={`font-semibold ${getStatusColor(installment.transaction_type)}`}
                          >
                            {formatCurrency(installment.amount, 'BRL', 'pt-BR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Informações do Sistema */}
          <Card className="border-purple-200">
            <CardHeader className="bg-purple-50">
              <CardTitle className="flex items-center gap-2 text-purple-900">
                <Clock className="h-5 w-5" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Hash className="h-4 w-4" />
                    ID
                  </div>
                  <p className="rounded bg-purple-50 p-2 font-mono text-xs text-purple-900">
                    {bill.id}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Clock className="h-4 w-4" />
                    Created at
                  </div>
                  <p className="text-purple-900">
                    {formatDateTime(bill.created_at, 'pt-BR')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
