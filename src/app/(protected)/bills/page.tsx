'use client';

import { useState } from 'react';

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

export default function BillsPage() {
  const [month, setMonth] = useState<Months>(
    new Date().toLocaleString('en-US', { month: 'long' }) as Months
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
          <Input placeholder="Search for a bill" />

          <Button asChild>
            <Link href="/bills/add">Add Bill</Link>
          </Button>
        </div>
      </header>
    </ProtectedMain>
  );
}
