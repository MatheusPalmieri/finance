'use client';

import { useCallback, useState } from 'react';

import { AlertCircle, FileText, Upload } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/card';

import type { ParsedTransaction } from '../page';

interface FileUploadProps {
  onFileProcessed: (data: ParsedTransaction[]) => void;
}

export function FileUpload({ onFileProcessed }: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Mapeamento de categorias baseado em palavras-chave do Nubank
  const categorizeByCDescription = (description: string): string => {
    const desc = description.toLowerCase();

    // Investimentos e aplicações
    if (
      desc.includes('resgate rdb') ||
      desc.includes('aplicação rdb') ||
      desc.includes('investimento') ||
      desc.includes('renda fixa')
    ) {
      return 'other'; // Pode criar categoria específica para investimentos
    }

    // Transferências e PIX
    if (
      desc.includes('transferência') ||
      desc.includes('pix') ||
      desc.includes('ted') ||
      desc.includes('doc') ||
      desc.includes('crédito em conta')
    ) {
      return 'transfer';
    }

    // Pagamentos de contas e serviços
    if (
      desc.includes('pagamento de fatura') ||
      desc.includes('pagamento de boleto') ||
      desc.includes('celesc') ||
      desc.includes('receita federal') ||
      desc.includes('município') ||
      desc.includes('prefeitura')
    ) {
      return 'other';
    }

    // Educação
    if (
      desc.includes('escola') ||
      desc.includes('educacao') ||
      desc.includes('estacio') ||
      desc.includes('universidade') ||
      desc.includes('curso')
    ) {
      return 'study';
    }

    // Compras e mercados
    if (
      desc.includes('compra no débito') ||
      desc.includes('supermercado') ||
      desc.includes('mercado') ||
      desc.includes('bistek') ||
      desc.includes('padaria') ||
      desc.includes('açougue')
    ) {
      return 'market';
    }

    // Transporte
    if (
      desc.includes('uber') ||
      desc.includes('taxi') ||
      desc.includes('ônibus') ||
      desc.includes('metro') ||
      desc.includes('combustível') ||
      desc.includes('posto')
    ) {
      return 'transport';
    }

    // Saúde
    if (
      desc.includes('farmácia') ||
      desc.includes('hospital') ||
      desc.includes('médico') ||
      desc.includes('clínica') ||
      desc.includes('plano de saúde')
    ) {
      return 'health';
    }

    // Alimentação (restaurantes, delivery)
    if (
      desc.includes('restaurante') ||
      desc.includes('lanchonete') ||
      desc.includes('delivery') ||
      desc.includes('ifood') ||
      desc.includes('uber eats')
    ) {
      return 'food';
    }

    // Entretenimento
    if (
      desc.includes('cinema') ||
      desc.includes('teatro') ||
      desc.includes('show') ||
      desc.includes('netflix') ||
      desc.includes('spotify') ||
      desc.includes('streaming')
    ) {
      return 'entertainment';
    }

    // Escritório e materiais
    if (
      desc.includes('papelaria') ||
      desc.includes('escritório') ||
      desc.includes('material') ||
      desc.includes('office')
    ) {
      return 'office';
    }

    return 'other';
  };

  // Determinar método de pagamento baseado na descrição do Nubank
  const getPaymentMethod = (description: string): string => {
    const desc = description.toLowerCase();

    // PIX (mais comum no Nubank)
    if (desc.includes('pix')) {
      return 'pix';
    }

    // Compras no débito
    if (desc.includes('compra no débito')) {
      return 'debit_card';
    }

    // Compras no crédito ou pagamento de fatura
    if (
      desc.includes('compra no crédito') ||
      desc.includes('pagamento de fatura')
    ) {
      return 'credit_card';
    }

    // Boletos
    if (desc.includes('pagamento de boleto')) {
      return 'boleto';
    }

    // Transferências gerais (TED, DOC, etc)
    if (
      desc.includes('transferência') ||
      desc.includes('ted') ||
      desc.includes('doc') ||
      desc.includes('crédito em conta')
    ) {
      return 'transfer';
    }

    // Investimentos/Aplicações
    if (
      desc.includes('resgate') ||
      desc.includes('aplicação') ||
      desc.includes('rdb')
    ) {
      return 'transfer'; // Pode criar categoria específica
    }

    return 'other';
  };

  // Parser CSV com diferentes formatos possíveis do Nubank
  const parseCSV = (content: string): ParsedTransaction[] => {
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
      throw new Error('CSV file must have at least 2 lines (header + data)');
    }

    // Detectar separador (vírgula ou ponto e vírgula)
    const separator = lines[0].includes(';') ? ';' : ',';

    // Parsear cabeçalho
    const headers = lines[0]
      .split(separator)
      .map((h) => h.trim().replace(/"/g, ''));

    // Possíveis variações de nomes de colunas do Nubank
    const findColumn = (possibleNames: string[]) => {
      return headers.findIndex((header) =>
        possibleNames.some((name) =>
          header.toLowerCase().includes(name.toLowerCase())
        )
      );
    };

    const dateIndex = findColumn(['data', 'date']);
    const amountIndex = findColumn(['valor', 'amount', 'quantia']);
    const identifierIndex = findColumn(['identificador', 'identifier', 'id']);
    const descriptionIndex = findColumn([
      'descrição',
      'description',
      'descricao',
      'histórico',
      'historico',
    ]);

    if (dateIndex === -1 || descriptionIndex === -1 || amountIndex === -1) {
      throw new Error(
        `Could not identify required columns. ` +
          `Found: ${headers.join(', ')}. ` +
          `Required: Date, Description, Amount`
      );
    }

    const transactions: ParsedTransaction[] = [];

    // Processar cada linha de dados
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        // Split respeitando aspas
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];

          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === separator && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim()); // Adicionar último valor

        if (
          values.length <
          Math.max(
            dateIndex,
            descriptionIndex,
            amountIndex,
            identifierIndex || 0
          ) +
            1
        ) {
          throw new Error(`Line ${i + 1}: Insufficient number of columns`);
        }

        // Extrair e validar dados
        const dateStr = values[dateIndex]?.replace(/"/g, '').trim();
        const amountStr = values[amountIndex]?.replace(/"/g, '').trim();
        const identifier =
          identifierIndex >= 0
            ? values[identifierIndex]?.replace(/"/g, '').trim()
            : '';
        const description = values[descriptionIndex]?.replace(/"/g, '').trim();

        const errors: string[] = [];

        // Validate date
        let parsedDate = '';
        if (!dateStr) {
          errors.push('Date is required');
        } else {
          // Tentar diferentes formatos de data
          const dateFormats = [
            /^(\d{2})\/(\d{2})\/(\d{4})$/, // dd/mm/yyyy
            /^(\d{4})-(\d{2})-(\d{2})$/, // yyyy-mm-dd
            /^(\d{2})-(\d{2})-(\d{4})$/, // dd-mm-yyyy
          ];

          let dateMatched = false;
          for (const format of dateFormats) {
            const match = dateStr.match(format);
            if (match) {
              if (format === dateFormats[0] || format === dateFormats[2]) {
                // dd/mm/yyyy or dd-mm-yyyy
                parsedDate = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
              } else {
                // yyyy-mm-dd
                parsedDate = dateStr;
              }
              dateMatched = true;
              break;
            }
          }

          if (!dateMatched) {
            errors.push(
              'Invalid date format. Use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd'
            );
          } else {
            const date = new Date(parsedDate);
            if (isNaN(date.getTime())) {
              errors.push('Invalid date');
            }
          }
        }

        // Validate description
        if (!description) {
          errors.push('Description is required');
        }

        // Validate amount
        let parsedAmount = 0;
        if (!amountStr) {
          errors.push('Amount is required');
        } else {
          // Limpar formato brasileiro de número
          let cleanAmount = amountStr.trim();

          // Detectar se tem vírgula como separador decimal
          const hasCommaDecimal = cleanAmount.match(/,\d{1,2}$/);

          if (hasCommaDecimal) {
            // Formato brasileiro: 1.234,56 ou -1.234,56
            cleanAmount = cleanAmount
              .replace(/\./g, '') // Remover pontos (separadores de milhares)
              .replace(',', '.'); // Trocar vírgula por ponto decimal
          }
          // Senão, assumir formato americano: 1234.56 ou -1234.56

          // Remover caracteres não numéricos exceto . e -
          cleanAmount = cleanAmount.replace(/[^\d.-]/g, '');

          parsedAmount = parseFloat(cleanAmount);

          if (isNaN(parsedAmount)) {
            errors.push('Amount must be a valid number');
          }
        }

        // Determine transaction type and convert to positive amount
        const transactionType = parsedAmount < 0 ? 'expense' : 'income';
        const absoluteAmount = Math.abs(parsedAmount);

        transactions.push({
          date: parsedDate,
          description: description || '',
          amount: absoluteAmount,
          transaction_type: transactionType,
          identifier: identifier || '',
          category: categorizeByCDescription(description || ''),
          paymentMethod: getPaymentMethod(description || ''),
          isValid: errors.length === 0,
          errors,
          originalRow: i + 1,
        });
      } catch (error) {
        transactions.push({
          date: '',
          description: '',
          amount: 0,
          transaction_type: 'expense',
          identifier: '',
          category: 'other',
          paymentMethod: 'other',
          isValid: false,
          errors: [
            `Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ],
          originalRow: i + 1,
        });
      }
    }

    return transactions;
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);

    try {
      const content = await file.text();
      const transactions = parseCSV(content);

      if (transactions.length === 0) {
        throw new Error('No transactions found in file');
      }

      const validTransactions = transactions.filter((t) => t.isValid);
      const invalidTransactions = transactions.filter((t) => !t.isValid);

      toast.success(
        `File processed! ${validTransactions.length} valid transactions found` +
          (invalidTransactions.length > 0
            ? ` (${invalidTransactions.length} with errors)`
            : '')
      );

      onFileProcessed(transactions);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error(
        `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadedFile(file);
      processFile(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxFiles: 1,
    disabled: isProcessing,
  });

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive
            ? 'border-purple-500 bg-purple-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isProcessing ? 'cursor-not-allowed opacity-50' : ''} `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <>
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-purple-600"></div>
              <div>
                <h3 className="text-lg font-semibold">Processing file...</h3>
                <p className="text-gray-600">Analyzing and validating data</p>
              </div>
            </>
          ) : (
            <>
              <Upload className="size-12 text-gray-400" />
              <div>
                <h3 className="mb-2 text-lg font-semibold">
                  {isDragActive
                    ? 'Drop file here'
                    : 'Drag your CSV statement or click to select'}
                </h3>
                <p className="mb-4 text-gray-600">
                  Only CSV files are accepted (maximum 1 file)
                </p>
                <Button variant="outline">
                  <FileText className="mr-2 size-4" />
                  Select File
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {uploadedFile && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-purple-600" />
              <div className="flex-1">
                <p className="font-medium">{uploadedFile.name}</p>
                <p className="text-sm text-gray-600">
                  {(uploadedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {isProcessing && (
                <div className="size-5 animate-spin rounded-full border-b-2 border-purple-600"></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formato esperado */}
      <Card>
        <CardContent className="p-4">
          <h4 className="mb-3 flex items-center gap-2 font-medium">
            <AlertCircle className="size-4 text-purple-600" />
            Expected CSV Format
          </h4>
          <div className="space-y-2 text-sm text-gray-600">
            <p>Your file should contain the following columns:</p>
            <ul className="ml-4 list-inside list-disc space-y-1">
              <li>
                <strong>Data:</strong> dd/mm/yyyy (Nubank format)
              </li>
              <li>
                <strong>Valor:</strong> Amount in reais (300.00 or -200.00)
              </li>
              <li>
                <strong>Identificador:</strong> Transaction UUID (optional)
              </li>
              <li>
                <strong>Descrição:</strong> Transaction details
              </li>
            </ul>
            <p className="mt-3">
              <strong>Nubank Format:</strong>
            </p>
            <code className="block rounded bg-gray-100 p-2 text-xs">
              Data,Valor,Identificador,Descrição
              <br />
              01/09/2025,-45.90,68a1f741-56a9-41f7-b27d-b6a3032748a1,Compra no
              débito - PADARIA DO BAIRRO
              <br />
              02/09/2025,-89.50,68b2f7fa-e6b1-4c9f-8f4f-7c67c2b393b2,Compra no
              débito - SUPERMERCADO EXTRA
              <br />
              03/09/2025,-25.00,68c3b04-9f22-4f34-8279-7b7896087c3,Transferência
              enviada pelo Pix - UBER
              <br />
              05/09/2025,-120.00,68d4d45b-e8d6-48c8-9e7a-66f036e39d4,Compra no
              débito - FARMACIA POPULAR
              <br />
              08/09/2025,-350.75,68e5f741-327a-4174-8a21-38ea21a7ae5,Pagamento
              de boleto - CELESC ENERGIA
              <br />
              10/09/2025,2500.00,68f6b04-55fd-40ba-9eed-f625c52fc3f6,Transferência
              Recebida - SALARIO EMPRESA LTDA
            </code>
            <p className="mt-2 text-xs text-gray-500">
              <strong>Negative values:</strong> Debits/Expenses (e.g.: -72.09)
              <br />
              <strong>Positive values:</strong> Credits/Income (e.g.: 300.00)
              <br />
              <strong>Format:</strong> Nubank uses dot as decimal separator
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
