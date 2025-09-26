'use client';

import { useState } from 'react';

import { Edit, Eye, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/utils/supabase/client';

import type { Bill } from '../page';
import { EditBillSheet } from './EditBillSheet';
import { ViewBillSheet } from './ViewBillSheet';

interface BillActionsProps {
  bill: Bill;
  onUpdate: () => void;
}

export function BillActions({ bill, onUpdate }: BillActionsProps) {
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const supabase = createClient();

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from('bills')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
        })
        .eq('id', bill.id);

      if (error) {
        console.error('❌ Error deleting bill:', error);
        toast.error('Error deleting bill');
        return;
      }

      toast.success('Bill deleted successfully');
      onUpdate();
    } catch (error) {
      console.error('💥 Unexpected error:', error);
      toast.error('Unexpected error deleting bill');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-purple-50 focus:ring-purple-500"
          >
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4 text-purple-600" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-purple-200">
          <DropdownMenuItem
            onClick={() => setIsViewOpen(true)}
            className="cursor-pointer hover:bg-purple-50 focus:bg-purple-50"
          >
            <Eye className="mr-2 h-4 w-4 text-purple-600" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setIsEditOpen(true)}
            className="cursor-pointer hover:bg-purple-50 focus:bg-purple-50"
          >
            <Edit className="mr-2 h-4 w-4 text-purple-600" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleDelete}
            disabled={isDeleting}
            className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ViewBillSheet
        bill={bill}
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
      />

      <EditBillSheet
        bill={bill}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onUpdate={onUpdate}
      />
    </>
  );
}
