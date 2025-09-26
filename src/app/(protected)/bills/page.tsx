'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';

import { ProtectedMain } from '@/components';
import { Button, Input } from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/utils/supabase/client';

import { TableBills } from './_components/TableBills';

type Months =
  | 'January'
  | 'February'
  | 'March'
  | 'April'
  | 'May'
  | 'June'
  | 'July'
  | 'August'
  | 'September'
  | 'October'
  | 'November'
  | 'December';

export interface Bill {
  id: string;
  name: string;
  description: string;
  amount: number;
  date: string;
  type: string;
  payment_method: string;
  is_recurring: boolean;
  is_essential: boolean;
  user_id: string;
  created_at: string;

  // Novos campos para parcelamento
  transaction_type: 'income' | 'expense';
  category: string;
  installment_number: number;
  total_installments: number;
  parent_transaction_id: string | null;

  // Campos para soft delete
  status: 'active' | 'deleted';
  deleted_at: string | null;
}

export default function BillsPage() {
  const [month, setMonth] = useState<Months>(
    new Date().toLocaleString('en-US', { month: 'long' }) as Months
  );
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const supabase = createClient();

  const fetchBills = useCallback(async () => {
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error('❌ Usuário não autenticado');
        return;
      }

      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erro ao buscar contas:', error);
        return;
      }

      const filteredBills =
        data?.filter((bill) => {
          const billDate = new Date(bill.date);
          const billMonth = billDate.toLocaleString('en-US', { month: 'long' });
          return billMonth === month;
        }) || [];

      setBills(filteredBills);
    } catch (error) {
      console.error('💥 Erro inesperado:', error);
    } finally {
      setIsLoading(false);
    }
  }, [month, supabase]);

  useEffect(() => {
    fetchBills();
  }, [month, fetchBills]);

  const filteredBills = bills.filter(
    (bill) =>
      bill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedMain title="Bills">
      <header className="mb-6 flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 p-4">
        <div className="flex items-center gap-4">
          <Select
            value={month}
            onValueChange={setMonth as (value: string) => void}
          >
            <SelectTrigger className="w-[180px] border-purple-200 focus:border-purple-500 focus:ring-purple-500">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent className="border-purple-200">
              <SelectItem value="January">January</SelectItem>
              <SelectItem value="February">February</SelectItem>
              <SelectItem value="March">March</SelectItem>
              <SelectItem value="April">April</SelectItem>
              <SelectItem value="May">May</SelectItem>
              <SelectItem value="June">June</SelectItem>
              <SelectItem value="July">July</SelectItem>
              <SelectItem value="August">August</SelectItem>
              <SelectItem value="September">September</SelectItem>
              <SelectItem value="October">October</SelectItem>
              <SelectItem value="November">November</SelectItem>
              <SelectItem value="December">December</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Search bills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 border-purple-200 focus:border-purple-500 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            asChild
            className="border-purple-200 text-purple-700 hover:border-purple-300 hover:bg-purple-100"
          >
            <Link href="/bills/import">Import CSV</Link>
          </Button>

          <Button
            asChild
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            <Link href="/bills/add">
              {isLoading ? 'Loading...' : 'Add Bill'}
            </Link>
          </Button>
        </div>
      </header>

      <TableBills data={filteredBills} onUpdate={fetchBills} />
    </ProtectedMain>
  );
}
