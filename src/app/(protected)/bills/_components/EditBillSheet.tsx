'use client';

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon, Save, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn, formatDateSimple } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';

import type { Bill } from '../page';

const editBillSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  amount: z.number().min(0.01, 'Amount must be greater than zero'),
  date: z.date(),
  transaction_type: z.enum(['income', 'expense']),
  category: z.string().min(1, 'Category is required'),
  payment_method: z.string().min(1, 'Payment method is required'),
  is_recurring: z.boolean(),
  is_essential: z.boolean(),
});

type EditBillFormData = z.infer<typeof editBillSchema>;

interface EditBillSheetProps {
  bill: Bill;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function EditBillSheet({
  bill,
  open,
  onOpenChange,
  onUpdate,
}: EditBillSheetProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const supabase = createClient();

  const form = useForm<EditBillFormData>({
    resolver: zodResolver(editBillSchema),
    defaultValues: {
      name: bill.name,
      description: bill.description || '',
      amount: bill.amount,
      date: new Date(bill.date),
      transaction_type: bill.transaction_type,
      category: bill.category,
      payment_method: bill.payment_method,
      is_recurring: bill.is_recurring,
      is_essential: bill.is_essential,
    },
  });

  // Reset form when bill changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: bill.name,
        description: bill.description || '',
        amount: bill.amount,
        date: new Date(bill.date),
        transaction_type: bill.transaction_type,
        category: bill.category,
        payment_method: bill.payment_method,
        is_recurring: bill.is_recurring,
        is_essential: bill.is_essential,
      });
    }
  }, [bill, open, form]);

  const onSubmit = async (data: EditBillFormData) => {
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('bills')
        .update({
          name: data.name,
          description: data.description || null,
          amount: data.amount,
          date: data.date.toISOString(),
          transaction_type: data.transaction_type,
          category: data.category,
          payment_method: data.payment_method,
          is_recurring: data.is_recurring,
          is_essential: data.is_essential,
        })
        .eq('id', bill.id);

      if (error) {
        console.error('❌ Error updating bill:', error);
        toast.error('Error updating bill');
        return;
      }

      toast.success('Bill updated successfully!');
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('💥 Unexpected error:', error);
      toast.error('Unexpected error updating bill');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-purple-100 pb-4">
          <SheetTitle className="text-xl font-bold text-purple-900">
            Edit Bill
          </SheetTitle>
          <SheetDescription className="text-purple-600">
            Edit the information for this bill. Fields marked with * are
            required.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 py-6"
          >
            {/* Informações Básicas */}
            <div className="space-y-4">
              <h3 className="border-b border-purple-200 pb-2 text-lg font-semibold text-purple-900">
                Basic Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-purple-700">Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Bill name"
                          className="border-purple-200 focus:border-purple-500 focus:ring-purple-500"
                          {...field}
                        />
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
                      <FormLabel className="text-purple-700">
                        Amount *
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          className="border-purple-200 focus:border-purple-500 focus:ring-purple-500"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-purple-700">
                      Description
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional bill description"
                        className="border-purple-200 focus:border-purple-500 focus:ring-purple-500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Informações de Transação */}
            <div className="space-y-4">
              <h3 className="border-b border-purple-200 pb-2 text-lg font-semibold text-purple-900">
                Transaction Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="transaction_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-purple-700">Type *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="border-purple-200 focus:border-purple-500 focus:ring-purple-500">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-purple-700">
                        Category *
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Food, Transport"
                          className="border-purple-200 focus:border-purple-500 focus:ring-purple-500"
                          {...field}
                        />
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
                      <FormLabel className="text-purple-700">
                        Payment Method *
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="border-purple-200 focus:border-purple-500 focus:ring-purple-500">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="credit_card">
                            Credit Card
                          </SelectItem>
                          <SelectItem value="debit_card">Debit Card</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="bank_transfer">
                            Bank Transfer
                          </SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-purple-700">Date *</FormLabel>
                      <Popover
                        open={calendarOpen}
                        onOpenChange={setCalendarOpen}
                      >
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full border-purple-200 pl-3 text-left font-normal focus:border-purple-500 focus:ring-purple-500',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? (
                                formatDateSimple(field.value, 'pt-BR')
                              ) : (
                                <span>Select a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              field.onChange(date);
                              setCalendarOpen(false);
                            }}
                            disabled={(date) =>
                              date > new Date() || date < new Date('1900-01-01')
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Configurações Adicionais */}
            <div className="space-y-4">
              <h3 className="border-b border-purple-200 pb-2 text-lg font-semibold text-purple-900">
                Additional Settings
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="is_recurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-y-0 space-x-3 rounded-md border border-purple-200 p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="border-purple-300 data-[state=checked]:border-purple-600 data-[state=checked]:bg-purple-600"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-purple-700">
                          Recurring Bill
                        </FormLabel>
                        <p className="text-sm text-purple-600">
                          This bill repeats monthly
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_essential"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-y-0 space-x-3 rounded-md border border-purple-200 p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="border-purple-300 data-[state=checked]:border-purple-600 data-[state=checked]:bg-purple-600"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-purple-700">
                          Essential Bill
                        </FormLabel>
                        <p className="text-sm text-purple-600">
                          This is an essential/priority bill
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <SheetFooter className="border-t border-purple-100 pt-4">
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  className="flex-1 border-purple-200 text-purple-700 hover:bg-purple-50"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-purple-600 text-white hover:bg-purple-700"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
