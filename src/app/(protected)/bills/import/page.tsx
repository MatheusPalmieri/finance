'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  FileText,
  FileUp,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { ProtectedMain } from '@/components';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClient } from '@/utils/supabase/client';

import { DataPreview } from './_components/DataPreview';
import { FileUpload } from './_components/FileUpload';
import { ImportSummary } from './_components/ImportSummary';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  transaction_type: 'income' | 'expense';
  identifier?: string;
  category?: string;
  paymentMethod?: string;
  isValid: boolean;
  errors: string[];
  originalRow: number;
}

export interface ImportResult {
  success: number;
  errors: number;
  duplicates: number;
  total: number;
  details: {
    imported: ParsedTransaction[];
    failed: ParsedTransaction[];
    duplicates: ParsedTransaction[];
  };
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'completed';

export default function ImportPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileProcessed = (data: ParsedTransaction[]) => {
    setParsedData(data);
    setCurrentStep('preview');
  };

  const handleImportConfirm = async (
    selectedTransactions: ParsedTransaction[]
  ) => {
    setCurrentStep('importing');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Authentication error. Please login again.');
        return;
      }

      // Buscar transações existentes para detectar duplicatas
      const { data: existingBills } = await supabase
        .from('bills')
        .select('name, amount, date, description')
        .eq('user_id', user.id);

      const existingSet = new Set(
        existingBills?.map((bill) => {
          // Tentar extrair identificador da descrição se existir
          const identifierMatch = bill.description?.match(/ID:([a-f0-9-]+)/);
          if (identifierMatch) {
            return identifierMatch[1];
          }
          // Fallback para chave composta
          return `${bill.name}-${bill.amount}-${bill.date}`;
        }) || []
      );

      const result: ImportResult = {
        success: 0,
        errors: 0,
        duplicates: 0,
        total: selectedTransactions.length,
        details: {
          imported: [],
          failed: [],
          duplicates: [],
        },
      };

      // Processar cada transação
      for (const transaction of selectedTransactions) {
        // Usar identificador único se disponível, senão usar combinação de campos
        const key = transaction.identifier
          ? `${transaction.identifier}`
          : `${transaction.description}-${transaction.amount}-${transaction.date}`;

        // Verificar duplicata
        if (existingSet.has(key)) {
          result.duplicates++;
          result.details.duplicates.push(transaction);
          continue;
        }

        // Tentar inserir
        const { error } = await supabase.from('bills').insert({
          name: transaction.description,
          description: transaction.identifier
            ? `Imported from Nubank - ID:${transaction.identifier} - ${transaction.description}`
            : `Imported from Nubank - ${transaction.description}`,
          amount: transaction.amount, // Always positive now
          transaction_type: transaction.transaction_type,
          date: transaction.date,
          category: transaction.category || 'other',
          payment_method: transaction.paymentMethod || 'other',

          // Installment fields (imported transactions are single payments)
          installment_number: 1,
          total_installments: 1,
          parent_transaction_id: null,

          // Other fields
          is_recurring: false,
          is_essential: false,
          user_id: user.id,
        });

        if (error) {
          result.errors++;
          result.details.failed.push({
            ...transaction,
            errors: [...transaction.errors, error.message],
          });
        } else {
          result.success++;
          result.details.imported.push(transaction);
        }
      }

      setImportResult(result);
      setCurrentStep('completed');

      if (result.success > 0) {
        toast.success(`${result.success} transactions imported successfully!`);
      }
      if (result.duplicates > 0) {
        toast.warning(`${result.duplicates} duplicate transactions ignored.`);
      }
      if (result.errors > 0) {
        toast.error(`${result.errors} transactions failed to import.`);
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Unexpected error during import.');
    }
  };

  const handleStartOver = () => {
    setCurrentStep('upload');
    setParsedData([]);
    setImportResult(null);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return <FileUpload onFileProcessed={handleFileProcessed} />;

      case 'preview':
        return (
          <DataPreview
            data={parsedData}
            onImport={handleImportConfirm}
            onCancel={() => setCurrentStep('upload')}
          />
        );

      case 'importing':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <h3 className="mb-2 text-lg font-semibold">
              Importing transactions...
            </h3>
            <p className="text-gray-600">
              Please wait while we process your data.
            </p>
          </div>
        );

      case 'completed':
        return importResult ? (
          <ImportSummary
            result={importResult}
            onStartOver={handleStartOver}
            onGoToBills={() => router.push('/bills')}
          />
        ) : null;

      default:
        return null;
    }
  };

  const getStepIcon = (step: ImportStep) => {
    switch (step) {
      case 'upload':
        return <Upload className="size-5" />;
      case 'preview':
        return <FileText className="size-5" />;
      case 'importing':
        return <FileUp className="size-5" />;
      case 'completed':
        return <CheckCircle className="size-5" />;
    }
  };

  const getStepTitle = (step: ImportStep) => {
    switch (step) {
      case 'upload':
        return 'Upload File';
      case 'preview':
        return 'Review Data';
      case 'importing':
        return 'Importing';
      case 'completed':
        return 'Completed';
    }
  };

  return (
    <ProtectedMain title="Import Statement">
      <div className="mx-auto max-w-4xl">
        {/* Header with navigation */}
        <div className="mb-6 flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/bills">
              <ArrowLeft className="mr-2 size-4" />
              Back to Bills
            </Link>
          </Button>

          <div className="flex-1">
            <h1 className="text-2xl font-bold">Import Nubank Statement</h1>
            <p className="text-gray-600">
              Import your transactions in CSV format
            </p>
          </div>
        </div>

        {/* Indicador de progresso */}
        <div className="mb-8 flex items-center justify-between rounded-lg bg-gray-50 p-4">
          {(
            ['upload', 'preview', 'importing', 'completed'] as ImportStep[]
          ).map((step, index) => (
            <div key={step} className="flex items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  currentStep === step
                    ? 'bg-purple-600 text-white'
                    : index <
                        (
                          [
                            'upload',
                            'preview',
                            'importing',
                            'completed',
                          ] as ImportStep[]
                        ).indexOf(currentStep)
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                }`}
              >
                {getStepIcon(step)}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  currentStep === step ? 'text-purple-600' : 'text-gray-600'
                }`}
              >
                {getStepTitle(step)}
              </span>
              {index < 3 && (
                <div
                  className={`mx-4 h-0.5 w-12 ${
                    index <
                    (
                      [
                        'upload',
                        'preview',
                        'importing',
                        'completed',
                      ] as ImportStep[]
                    ).indexOf(currentStep)
                      ? 'bg-green-600'
                      : 'bg-gray-300'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Instructions */}
        {currentStep === 'upload' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-purple-600" />
                How to get your Nubank statement
              </CardTitle>
              <CardDescription>
                Follow these steps to export your statement in CSV format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-inside list-decimal space-y-2 text-sm">
                <li>Open the Nubank app</li>
                <li>
                  Go to the {`&quot`}Conta{`&quot`} section
                </li>
                <li>
                  Tap {`&quot`}Pedir extrato{`&quot`}
                </li>
                <li>Select the desired month</li>
                <li>
                  Tap {`&quot`}Exportar extrato{`&quot`}
                </li>
                <li>
                  Choose the <strong>CSV</strong> format
                </li>
                <li>The file will be sent to your email</li>
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Main content */}
        <Card>
          <CardContent className="p-6">{renderStepContent()}</CardContent>
        </Card>
      </div>
    </ProtectedMain>
  );
}
