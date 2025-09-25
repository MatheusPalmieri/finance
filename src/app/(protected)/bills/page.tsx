'use client';

import { useEffect, useState } from 'react';

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
}

export default function BillsPage() {
  const [month, setMonth] = useState<Months>(
    new Date().toLocaleString('en-US', { month: 'long' }) as Months
  );
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const supabase = createClient();

  const fetchBills = async () => {
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
  };

  useEffect(() => {
    fetchBills();
  }, [month]);

  const filteredBills = bills.filter(
    (bill) =>
      bill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedMain title="Bills">
      <header className="flex items-center justify-between">
        <Select
          value={month}
          onValueChange={setMonth as (value: string) => void}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
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

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search for a bill"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <Button asChild>
            <Link href="/bills/add">
              {isLoading ? 'Loading...' : 'Add Bill'}
            </Link>
          </Button>
        </div>
      </header>

      {/* Indicador temporário para debug */}
      <div className="mt-4 rounded-lg bg-gray-100 p-4">
        <p className="text-sm text-gray-600">
          {isLoading ? (
            '🔄 Carregando contas...'
          ) : (
            <>
              📊 <strong>{bills.length}</strong> contas encontradas no mês de{' '}
              <strong>{month}</strong>
              {searchTerm && (
                <span>
                  {' '}
                  | 🔎 <strong>{filteredBills.length}</strong> após filtro de
                  busca
                </span>
              )}
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Abra o console do navegador (F12) para ver os detalhes das contas
        </p>
      </div>

      <TableBills data={bills} />
    </ProtectedMain>
  );
}
