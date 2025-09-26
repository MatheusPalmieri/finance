'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ProtectedMain } from '@/components';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/utils/supabase/client';

const formSchema = z.object({
  name: z.string().min(2, {
    message: 'Name must be at least 2 characters.',
  }),
  description: z.string().optional(),
  amount: z.number().min(0.01, {
    message: 'Amount must be greater than 0.',
  }),
  transaction_type: z.enum(['income', 'expense'], {
    message: 'Please select if this is income or expense.',
  }),
  date: z.date(),
  category: z.enum([
    'salary',
    'freelance',
    'investment',
    'gift',
    'market',
    'food',
    'transport',
    'health',
    'education',
    'entertainment',
    'utilities',
    'rent',
    'insurance',
    'shopping',
    'travel',
    'other',
  ]),
  payment_method: z.enum([
    'credit_card',
    'debit_card',
    'pix',
    'cash',
    'boleto',
    'transfer',
    'bank_slip',
    'other',
  ]),
  installments: z.number().min(1).max(48),
  is_recurring: z.boolean(),
  is_essential: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

export default function BillsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      amount: 0,
      transaction_type: 'expense',
      date: new Date(),
      category: 'other',
      payment_method: 'pix',
      installments: 1,
      is_recurring: false,
      is_essential: false,
    },
  });

  async function onSubmit(values: FormData) {
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Authentication error. Please login again.');
        return;
      }

      // Generate unique ID for grouping installments
      const parentTransactionId = crypto.randomUUID();
      const installments = values.installments || 1;
      const installmentAmount = values.amount / installments;

      // Create array of bills (one for each installment)
      const billsToInsert = [];

      for (let i = 1; i <= installments; i++) {
        const dueDate = new Date(values.date);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));

        const billData = {
          name:
            installments > 1
              ? `${values.name} (${i}/${installments})`
              : values.name,
          description: values.description || '',
          amount: Number(installmentAmount.toFixed(2)), // Round to 2 decimal places
          transaction_type: values.transaction_type,
          date: dueDate.toISOString().split('T')[0],
          category: values.category,
          payment_method: values.payment_method,

          // Installment fields
          installment_number: i,
          total_installments: installments,
          parent_transaction_id: installments > 1 ? parentTransactionId : null,

          // Other fields
          is_recurring: values.is_recurring,
          is_essential: values.is_essential,
          user_id: user.id,
        };

        billsToInsert.push(billData);
      }

      const { error } = await supabase
        .from('bills')
        .insert(billsToInsert)
        .select();

      if (error) {
        console.error('Error inserting bill:', error);
        toast.error('Error saving bill. Please try again.');
        return;
      }

      const successMessage =
        installments > 1
          ? `${installments} installments created successfully!`
          : 'Bill added successfully!';

      toast.success(successMessage);

      form.reset();

      router.push('/bills');
    } catch (error) {
      console.error('Unexpected error:', error);
      toast.error('Unexpected error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ProtectedMain title="Add Bill">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid grid-cols-2 gap-4"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input placeholder="Description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="transaction_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Transaction Type</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">💸 Expense</SelectItem>
                      <SelectItem value="income">💰 Income</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Total Amount (R$)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      field.onChange(value);
                    }}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormDescription>
                  💡 Enter the <strong>total amount</strong>. If using
                  installments, the system will automatically divide this value.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <DatePicker onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salary">💼 Salary</SelectItem>
                      <SelectItem value="freelance">🎯 Freelance</SelectItem>
                      <SelectItem value="investment">📈 Investment</SelectItem>
                      <SelectItem value="gift">🎁 Gift</SelectItem>
                      <SelectItem value="market">🛒 Market</SelectItem>
                      <SelectItem value="food">🍕 Food & Dining</SelectItem>
                      <SelectItem value="transport">🚗 Transport</SelectItem>
                      <SelectItem value="health">🏥 Health</SelectItem>
                      <SelectItem value="education">📚 Education</SelectItem>
                      <SelectItem value="entertainment">
                        🎬 Entertainment
                      </SelectItem>
                      <SelectItem value="utilities">⚡ Utilities</SelectItem>
                      <SelectItem value="rent">🏠 Rent</SelectItem>
                      <SelectItem value="insurance">🛡️ Insurance</SelectItem>
                      <SelectItem value="shopping">🛍️ Shopping</SelectItem>
                      <SelectItem value="travel">✈️ Travel</SelectItem>
                      <SelectItem value="other">📋 Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="payment_method"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Payment Method</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">🔄 PIX</SelectItem>
                      <SelectItem value="credit_card">
                        💳 Credit Card
                      </SelectItem>
                      <SelectItem value="debit_card">💳 Debit Card</SelectItem>
                      <SelectItem value="cash">💵 Cash</SelectItem>
                      <SelectItem value="boleto">📄 Boleto</SelectItem>
                      <SelectItem value="transfer">🏦 Bank Transfer</SelectItem>
                      <SelectItem value="bank_slip">📋 Bank Slip</SelectItem>
                      <SelectItem value="other">❓ Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="installments"
            render={({ field }) => {
              const amount = form.watch('amount') || 0;
              const installments = field.value || 1;
              const installmentAmount = amount / installments;

              return (
                <FormItem>
                  <FormLabel>Number of Installments</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="48"
                      placeholder="1"
                      {...field}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 1;
                        field.onChange(value);
                      }}
                      value={field.value || 1}
                    />
                  </FormControl>
                  <FormDescription>
                    {installments > 1 && amount > 0 ? (
                      <span className="font-medium text-blue-600">
                        💳 {installments}x of R$ {installmentAmount.toFixed(2)}{' '}
                        each
                      </span>
                    ) : (
                      'Number of monthly installments (1-48)'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="is_recurring"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel className="flex items-center gap-2">
                    🔄 Recurring Transaction
                  </FormLabel>
                  <FormDescription>
                    Automatically repeat this transaction monthly
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_essential"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel className="flex items-center gap-2">
                    ⭐ Essential Expense
                  </FormLabel>
                  <FormDescription>
                    Mark as essential for budget planning
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Installment Preview */}
          {form.watch('installments') > 1 && form.watch('amount') > 0 && (
            <div className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-blue-900">
                📋 Installment Preview
              </h4>
              <div className="text-sm text-blue-800">
                <p className="mb-2">
                  <strong>Total:</strong> R${' '}
                  {form.watch('amount')?.toFixed(2) || '0.00'}
                </p>
                <p className="mb-2">
                  <strong>Installments:</strong> {form.watch('installments')}{' '}
                  monthly payments
                </p>
                <p className="mb-3">
                  <strong>Each installment:</strong> R${' '}
                  {(
                    (form.watch('amount') || 0) /
                    (form.watch('installments') || 1)
                  ).toFixed(2)}
                </p>
                <div className="text-xs text-blue-600">
                  💡 The system will create {form.watch('installments')}{' '}
                  separate bills with consecutive due dates
                </div>
              </div>
            </div>
          )}

          <div className="col-span-2 flex items-center justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/bills')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Transaction'}
            </Button>
          </div>
        </form>
      </Form>
    </ProtectedMain>
  );
}
