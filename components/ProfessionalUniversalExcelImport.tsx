import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Reservation } from '../types';
import { UploadIcon, CheckCircleIcon, AlertIcon, CloseIcon, DownloadIcon, RefreshIcon, MagicIcon, DocumentIcon, ChartBarIcon } from './icons';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ColumnMapping {
  sourceColumn: string;
  targetField: keyof Reservation | null;
  confidence: number;
  dataType: 'string' | 'number' | 'date' | 'email' | 'phone' | 'boolean';
  sampleValues: any[];
}

interface ValidationError {
  row: number;
  column: string;
  value: any;
  error: string;
  severity: 'error' | 'warning';
}

interface ImportStats {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  qualityScore: number;
}

interface SheetData {
  name: string;
  data: any[][];
  headerRow: number;
  dataRows: number;
}

interface MappingTemplate {
  name: string;
  mappings: Record<string, keyof Reservation>;
  dateCreated: string;
}

// ============================================================================
// UTILITY FUNCTIONS - LEVENSHTEIN DISTANCE & FUZZY MATCHING
// ============================================================================

const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

const calculateSimilarity = (str1: string, str2: string): number => {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return maxLength === 0 ? 100 : ((maxLength - distance) / maxLength) * 100;
};

// ============================================================================
// COLUMN DETECTION DICTIONARIES
// ============================================================================

const COLUMN_PATTERNS: Record<string, string[]> = {
  customerName: [
    'name', 'customer', 'client', 'full name', 'customer name', 'client name',
    'guest', 'guest name', 'renter', 'renter name', 'tenant', 'passenger',
    'nom', 'nombre', 'kunde', 'khách hàng', '客户', '顧客', 'العميل'
  ],
  email: [
    'email', 'e-mail', 'mail', 'email address', 'e-mail address',
    'electronic mail', 'contact email', 'customer email', 'client email',
    'correo', 'courriel', 'correio', 'البريد الإلكتروني', '邮箱', 'メール'
  ],
  phone: [
    'phone', 'tel', 'telephone', 'mobile', 'cell', 'contact', 'phone number',
    'telephone number', 'mobile number', 'cell number', 'contact number',
    'téléphone', 'telefon', 'teléfono', 'telefone', 'điện thoại', '电话', '電話'
  ],
  startDate: [
    'start', 'start date', 'pickup', 'pickup date', 'check-in', 'checkin',
    'from', 'from date', 'begin', 'begin date', 'departure', 'rental start',
    'début', 'inicio', 'ngày bắt đầu', '开始日期', '開始日'
  ],
  endDate: [
    'end', 'end date', 'return', 'return date', 'check-out', 'checkout',
    'to', 'to date', 'finish', 'finish date', 'arrival', 'rental end',
    'fin', 'final', 'ngày kết thúc', '结束日期', '終了日'
  ],
  vehicleType: [
    'vehicle', 'car', 'vehicle type', 'car type', 'model', 'vehicle model',
    'car model', 'type', 'vehicle category', 'category', 'auto', 'automobile',
    'véhicule', 'vehículo', 'xe', '车辆', '車両'
  ],
  dailyRate: [
    'rate', 'daily rate', 'price', 'daily price', 'cost', 'daily cost',
    'price per day', 'day rate', 'rental rate', 'tariff', 'fee', 'charge',
    'tarif', 'precio', 'giá', '价格', '料金'
  ],
  deposit: [
    'deposit', 'security deposit', 'down payment', 'advance', 'caution',
    'security', 'guarantee', 'bond', 'acompte', 'depósito', 'đặt cọc', '押金'
  ],
  status: [
    'status', 'state', 'condition', 'reservation status', 'booking status',
    'état', 'estado', 'trạng thái', '状态', 'ステータス'
  ],
  notes: [
    'notes', 'note', 'comments', 'comment', 'remarks', 'remark', 'description',
    'details', 'observations', 'memo', 'remarques', 'notas', 'ghi chú', '备注'
  ]
};

// ============================================================================
// PATTERN RECOGNITION
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s\-\+\(\)\.]{7,}$/;
const DATE_PATTERNS = [
  /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/,  // MM/DD/YYYY or DD/MM/YYYY
  /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/,    // YYYY-MM-DD
  /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{2,4}$/, // 15 Jan 2025
  /^[A-Za-z]{3,}\s+\d{1,2},?\s+\d{4}$/, // Jan 15, 2025
];

const detectDataType = (value: any): 'string' | 'number' | 'date' | 'email' | 'phone' | 'boolean' => {
  if (value === null || value === undefined || value === '') return 'string';

  const strValue = String(value).trim();

  // Email detection
  if (EMAIL_REGEX.test(strValue)) return 'email';

  // Phone detection
  if (PHONE_REGEX.test(strValue) && /\d{7,}/.test(strValue.replace(/\D/g, ''))) return 'phone';

  // Boolean detection
  if (['true', 'false', 'yes', 'no', '1', '0'].includes(strValue.toLowerCase())) return 'boolean';

  // Number detection
  if (!isNaN(Number(strValue)) && strValue !== '') return 'number';

  // Date detection
  if (DATE_PATTERNS.some(pattern => pattern.test(strValue))) return 'date';

  // Excel date serial number
  if (!isNaN(Number(value)) && Number(value) > 25569 && Number(value) < 73050) return 'date';

  return 'string';
};

const detectDataTypeFromSamples = (samples: any[]): 'string' | 'number' | 'date' | 'email' | 'phone' | 'boolean' => {
  const validSamples = samples.filter(s => s !== null && s !== undefined && s !== '');
  if (validSamples.length === 0) return 'string';

  const types = validSamples.slice(0, 10).map(detectDataType);
  const typeCounts = types.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dominantType = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] as any;

  return dominantType || 'string';
};

// ============================================================================
// DATE PARSING
// ============================================================================

const parseDate = (value: any): Date | null => {
  if (!value) return null;

  // Excel serial number
  if (typeof value === 'number' && value > 25569 && value < 73050) {
    const date = new Date((value - 25569) * 86400 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  // Standard date parsing
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed;

  // Try various formats
  const strValue = String(value).trim();

  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = strValue.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (slashMatch) {
    const [, a, b, c] = slashMatch;
    const year = c.length === 2 ? 2000 + parseInt(c) : parseInt(c);

    // Try DD/MM/YYYY first
    const date1 = new Date(year, parseInt(b) - 1, parseInt(a));
    if (!isNaN(date1.getTime()) && parseInt(b) <= 12) return date1;

    // Try MM/DD/YYYY
    const date2 = new Date(year, parseInt(a) - 1, parseInt(b));
    if (!isNaN(date2.getTime())) return date2;
  }

  return null;
};

// ============================================================================
// PHONE NUMBER NORMALIZATION
// ============================================================================

const normalizePhone = (value: any): string => {
  if (!value) return '';
  const cleaned = String(value).replace(/\D/g, '');

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  return String(value);
};

// ============================================================================
// HEADER ROW DETECTION
// ============================================================================

const detectHeaderRow = (data: any[][]): number => {
  if (!data || data.length === 0) return 0;

  let bestScore = -1;
  let bestRow = 0;

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    let score = 0;

    // Check for text headers (not numbers)
    const textCells = row.filter(cell =>
      cell && typeof cell === 'string' && cell.trim().length > 0
    ).length;
    score += textCells * 10;

    // Check for known column names
    const knownColumns = row.filter(cell => {
      if (!cell || typeof cell !== 'string') return false;
      const cellLower = cell.toLowerCase().trim();
      return Object.values(COLUMN_PATTERNS).some(patterns =>
        patterns.some(pattern => cellLower.includes(pattern) || calculateSimilarity(cellLower, pattern) > 70)
      );
    }).length;
    score += knownColumns * 50;

    // Check for uniqueness
    const uniqueCells = new Set(row.filter(c => c)).size;
    score += uniqueCells * 5;

    // Penalize rows with many numbers
    const numberCells = row.filter(cell => !isNaN(Number(cell)) && cell !== '').length;
    score -= numberCells * 5;

    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  return bestRow;
};

// ============================================================================
// AI-POWERED COLUMN MAPPING
// ============================================================================

const autoMapColumns = (headers: string[], sampleData: any[][]): ColumnMapping[] => {
  const mappings: ColumnMapping[] = [];

  headers.forEach((header, index) => {
    if (!header || typeof header !== 'string') {
      mappings.push({
        sourceColumn: header || `Column ${index + 1}`,
        targetField: null,
        confidence: 0,
        dataType: 'string',
        sampleValues: []
      });
      return;
    }

    const headerLower = header.toLowerCase().trim();
    const columnSamples = sampleData.map(row => row[index]).filter(v => v !== null && v !== undefined);
    const dataType = detectDataTypeFromSamples(columnSamples);

    let bestMatch: keyof Reservation | null = null;
    let bestScore = 0;

    // Try to match with known patterns
    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      for (const pattern of patterns) {
        const similarity = calculateSimilarity(headerLower, pattern);

        // Check if header contains the pattern
        const containsPattern = headerLower.includes(pattern) || pattern.includes(headerLower);
        const finalScore = containsPattern ? Math.max(similarity, 85) : similarity;

        if (finalScore > bestScore && finalScore > 60) {
          bestScore = finalScore;
          bestMatch = field as keyof Reservation;
        }
      }
    }

    // Boost confidence if data type matches expected type
    if (bestMatch && dataType) {
      if (bestMatch === 'email' && dataType === 'email') bestScore = Math.min(100, bestScore + 15);
      if (bestMatch === 'phone' && dataType === 'phone') bestScore = Math.min(100, bestScore + 15);
      if ((bestMatch === 'startDate' || bestMatch === 'endDate') && dataType === 'date') {
        bestScore = Math.min(100, bestScore + 15);
      }
      if ((bestMatch === 'dailyRate' || bestMatch === 'deposit') && dataType === 'number') {
        bestScore = Math.min(100, bestScore + 10);
      }
    }

    mappings.push({
      sourceColumn: header,
      targetField: bestMatch,
      confidence: Math.round(bestScore),
      dataType,
      sampleValues: columnSamples.slice(0, 5)
    });
  });

  return mappings;
};

// ============================================================================
// DATA VALIDATION
// ============================================================================

const validateRow = (
  row: any[],
  mappings: ColumnMapping[],
  rowIndex: number
): ValidationError[] => {
  const errors: ValidationError[] = [];

  mappings.forEach((mapping, colIndex) => {
    const value = row[colIndex];

    if (!mapping.targetField) return;

    // Required field validation
    const requiredFields: (keyof Reservation)[] = ['customerName', 'startDate', 'endDate'];
    if (requiredFields.includes(mapping.targetField) && (!value || String(value).trim() === '')) {
      errors.push({
        row: rowIndex,
        column: mapping.sourceColumn,
        value,
        error: `Required field "${mapping.targetField}" is empty`,
        severity: 'error'
      });
      return;
    }

    if (!value || String(value).trim() === '') return;

    // Email validation
    if (mapping.targetField === 'email' && !EMAIL_REGEX.test(String(value))) {
      errors.push({
        row: rowIndex,
        column: mapping.sourceColumn,
        value,
        error: 'Invalid email format',
        severity: 'warning'
      });
    }

    // Date validation
    if ((mapping.targetField === 'startDate' || mapping.targetField === 'endDate')) {
      const parsedDate = parseDate(value);
      if (!parsedDate) {
        errors.push({
          row: rowIndex,
          column: mapping.sourceColumn,
          value,
          error: 'Invalid date format',
          severity: 'error'
        });
      }
    }

    // Number validation
    if ((mapping.targetField === 'dailyRate' || mapping.targetField === 'deposit')) {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        errors.push({
          row: rowIndex,
          column: mapping.sourceColumn,
          value,
          error: 'Invalid number or negative value',
          severity: 'warning'
        });
      }
    }
  });

  return errors;
};

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

const transformRowToReservation = (
  row: any[],
  mappings: ColumnMapping[],
  idOffset: number
): Partial<Reservation> => {
  const reservation: Partial<Reservation> = {
    id: idOffset,
    status: 'confirmed'
  };

  mappings.forEach((mapping, index) => {
    if (!mapping.targetField || !row[index]) return;

    const value = row[index];

    switch (mapping.targetField) {
      case 'startDate':
      case 'endDate':
        const date = parseDate(value);
        if (date) {
          reservation[mapping.targetField] = date.toISOString().split('T')[0];
        }
        break;

      case 'phone':
        reservation[mapping.targetField] = normalizePhone(value);
        break;

      case 'email':
        reservation[mapping.targetField] = String(value).toLowerCase().trim();
        break;

      case 'dailyRate':
      case 'deposit':
        const num = Number(String(value).replace(/[^0-9.-]/g, ''));
        if (!isNaN(num)) {
          reservation[mapping.targetField] = num;
        }
        break;

      default:
        reservation[mapping.targetField] = String(value).trim();
    }
  });

  return reservation;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ProfessionalUniversalExcelImportProps {
  onImport: (reservations: Reservation[]) => void;
  onClose: () => void;
  existingReservations?: Reservation[];
}

const ProfessionalUniversalExcelImport: React.FC<ProfessionalUniversalExcelImportProps> = ({
  onImport,
  onClose,
  existingReservations = []
}) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [step, setStep] = useState<'upload' | 'sheet-select' | 'map' | 'validate' | 'preview' | 'import'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<SheetData | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rawData, setRawData] = useState<any[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [previewData, setPreviewData] = useState<Partial<Reservation>[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<MappingTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // ============================================================================
  // FILE UPLOAD & PARSING
  // ============================================================================

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const parseExcelFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProgress(10);

    try {
      const buffer = await file.arrayBuffer();
      setProgress(30);

      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      setProgress(50);

      const sheetsData: SheetData[] = workbook.SheetNames.map(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          dateNF: 'yyyy-mm-dd'
        });

        const headerRow = detectHeaderRow(data);
        const dataRows = data.length - headerRow - 1;

        return {
          name: sheetName,
          data,
          headerRow,
          dataRows
        };
      });

      setProgress(70);
      setSheets(sheetsData);

      if (sheetsData.length === 1) {
        // Auto-select if only one sheet
        selectSheet(sheetsData[0]);
      } else {
        setStep('sheet-select');
      }

      setProgress(100);
    } catch (error) {
      console.error('Error parsing file:', error);
      alert('Error parsing file. Please ensure it is a valid Excel file.');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const selectSheet = useCallback((sheet: SheetData) => {
    setSelectedSheet(sheet);

    const headerRow = sheet.headerRow;
    const headers = sheet.data[headerRow] || [];
    const dataRows = sheet.data.slice(headerRow + 1).filter(row =>
      row && row.some(cell => cell !== null && cell !== undefined && cell !== '')
    );

    setHeaders(headers);
    setRawData(dataRows);

    // Auto-map columns
    const autoMappings = autoMapColumns(headers, dataRows.slice(0, 100));
    setMappings(autoMappings);

    setStep('map');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFile(file);
      parseExcelFile(file);
    }
  }, [parseExcelFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFile(file);
      parseExcelFile(file);
    }
  }, [parseExcelFile]);

  // ============================================================================
  // MAPPING MANAGEMENT
  // ============================================================================

  const updateMapping = useCallback((index: number, targetField: keyof Reservation | null) => {
    setMappings(prev => {
      const newMappings = [...prev];
      newMappings[index] = {
        ...newMappings[index],
        targetField,
        confidence: targetField ? 100 : 0
      };
      return newMappings;
    });
  }, []);

  const saveTemplate = useCallback(() => {
    const templateName = prompt('Enter a name for this mapping template:');
    if (!templateName) return;

    const template: MappingTemplate = {
      name: templateName,
      mappings: mappings.reduce((acc, m) => {
        if (m.targetField) {
          acc[m.sourceColumn] = m.targetField;
        }
        return acc;
      }, {} as Record<string, keyof Reservation>),
      dateCreated: new Date().toISOString()
    };

    setSavedTemplates(prev => [...prev, template]);
    alert('Template saved successfully!');
  }, [mappings]);

  const loadTemplate = useCallback((template: MappingTemplate) => {
    setMappings(prev => prev.map(m => ({
      ...m,
      targetField: template.mappings[m.sourceColumn] || m.targetField,
      confidence: template.mappings[m.sourceColumn] ? 100 : m.confidence
    })));
    setShowTemplates(false);
  }, []);

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateData = useCallback(() => {
    setIsProcessing(true);
    setProgress(0);

    const errors: ValidationError[] = [];
    const batchSize = 100;

    for (let i = 0; i < rawData.length; i += batchSize) {
      const batch = rawData.slice(i, i + batchSize);
      batch.forEach((row, batchIndex) => {
        const rowErrors = validateRow(row, mappings, i + batchIndex + 2); // +2 for header and 1-based indexing
        errors.push(...rowErrors);
      });
      setProgress(Math.round(((i + batchSize) / rawData.length) * 100));
    }

    setValidationErrors(errors);

    const errorRows = new Set(errors.filter(e => e.severity === 'error').map(e => e.row)).size;
    const warningRows = new Set(errors.filter(e => e.severity === 'warning').map(e => e.row)).size;
    const validRows = rawData.length - errorRows;

    const stats: ImportStats = {
      totalRows: rawData.length,
      validRows,
      errorRows,
      warningRows,
      qualityScore: Math.round((validRows / rawData.length) * 100)
    };

    setImportStats(stats);
    setIsProcessing(false);
    setStep('validate');
  }, [rawData, mappings]);

  // ============================================================================
  // PREVIEW GENERATION
  // ============================================================================

  const generatePreview = useCallback(() => {
    const preview = rawData.slice(0, 10).map((row, index) =>
      transformRowToReservation(row, mappings, existingReservations.length + index + 1)
    );
    setPreviewData(preview);
    setStep('preview');
  }, [rawData, mappings, existingReservations.length]);

  // ============================================================================
  // IMPORT EXECUTION
  // ============================================================================

  const executeImport = useCallback(() => {
    setIsProcessing(true);
    setStep('import');
    setProgress(0);

    const errorRowIndices = new Set(
      validationErrors.filter(e => e.severity === 'error').map(e => e.row - 2)
    );

    const validRows = rawData.filter((_, index) => !errorRowIndices.has(index));
    const batchSize = 100;
    const imported: Reservation[] = [];

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      batch.forEach((row, batchIndex) => {
        const reservation = transformRowToReservation(
          row,
          mappings,
          existingReservations.length + imported.length + 1
        );
        imported.push(reservation as Reservation);
      });
      setProgress(Math.round(((i + batchSize) / validRows.length) * 100));
    }

    setTimeout(() => {
      onImport(imported);
      setIsProcessing(false);
    }, 500);
  }, [rawData, mappings, validationErrors, existingReservations.length, onImport]);

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 bg-slate-900">
          <UploadIcon className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Universal Excel Import</h2>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Upload any Excel file and our AI will automatically detect and map your columns.
          Supports Excel (.xlsx, .xls), CSV, and multiple languages.
        </p>
      </div>

      <div
        className={`border-3 border-dashed rounded-2xl p-12 text-center transition-all ${
          dragActive
            ? 'border-sky-500 bg-sky-50 scale-105'
            : 'border-slate-300 hover:border-sky-400 hover:bg-slate-50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <DocumentIcon className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <p className="text-xl font-semibold text-slate-700 mb-2">
          Drag & Drop your file here
        </p>
        <p className="text-slate-500 mb-6">or</p>
        <label className="inline-flex items-center px-6 py-3 text-white rounded-lg cursor-pointer transition-all transform hover:scale-105 shadow-lg bg-emerald-600 hover:bg-emerald-700">
          <UploadIcon className="w-5 h-5 mr-2" />
          Browse Files
          <input
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
          />
        </label>
        <p className="text-sm text-slate-500 mt-4">
          Supported formats: Excel (.xlsx, .xls), CSV (.csv)
        </p>
      </div>

      {isProcessing && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Processing file...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <div
              className="h-full transition-all duration-300 rounded-full bg-slate-900"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderSheetSelectStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Select Sheet</h2>
        <p className="text-slate-600">Your file contains multiple sheets. Please select one to import.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sheets.map((sheet, index) => (
          <button
            key={index}
            onClick={() => selectSheet(sheet)}
            className="p-6 border-2 border-slate-300 rounded-xl hover:border-sky-500 hover:bg-sky-50 transition-all text-left group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg text-slate-900 group-hover:text-sky-600 mb-2">
                  {sheet.name}
                </h3>
                <p className="text-sm text-slate-600">
                  {sheet.dataRows} data rows
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Header at row {sheet.headerRow + 1}
                </p>
              </div>
              <DocumentIcon className="w-8 h-8 text-slate-400 group-hover:text-sky-500" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderMappingStep = () => {
    const mappedCount = mappings.filter(m => m.targetField).length;
    const highConfidenceCount = mappings.filter(m => m.confidence >= 80).length;
    const avgConfidence = mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Column Mapping</h2>
            <p className="text-slate-600">
              AI has automatically mapped {mappedCount} of {mappings.length} columns
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="px-4 py-2 bg-white border-2 border-slate-300 rounded-lg hover:border-sky-500 transition-all flex items-center space-x-2"
            >
              <DocumentIcon className="w-5 h-5" />
              <span>Templates</span>
            </button>
            <button
              onClick={saveTemplate}
              className="px-4 py-2 bg-white border-2 border-slate-300 rounded-lg hover:border-sky-500 transition-all flex items-center space-x-2"
            >
              <DownloadIcon className="w-5 h-5" />
              <span>Save Template</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-sky-200 bg-slate-50">
            <div className="text-2xl font-bold text-sky-700">{mappedCount}/{mappings.length}</div>
            <div className="text-sm text-sky-600">Columns Mapped</div>
          </div>
          <div className="p-4 rounded-xl border border-emerald-200 bg-slate-50">
            <div className="text-2xl font-bold text-emerald-700">{highConfidenceCount}</div>
            <div className="text-sm text-emerald-600">High Confidence</div>
          </div>
          <div className="p-4 rounded-xl border border-emerald-200 bg-slate-50">
            <div className="text-2xl font-bold text-emerald-700">{Math.round(avgConfidence)}%</div>
            <div className="text-sm text-emerald-600">Avg. Confidence</div>
          </div>
        </div>

        {showTemplates && savedTemplates.length > 0 && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Saved Templates</h3>
            <div className="space-y-2">
              {savedTemplates.map((template, index) => (
                <button
                  key={index}
                  onClick={() => loadTemplate(template)}
                  className="w-full p-3 bg-white rounded-lg hover:bg-sky-100 text-left transition-all"
                >
                  <div className="font-medium text-slate-900">{template.name}</div>
                  <div className="text-xs text-slate-500">
                    {Object.keys(template.mappings).length} mappings • {new Date(template.dateCreated).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Source Column</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Data Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Sample Values</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Maps To</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {mappings.map((mapping, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {mapping.sourceColumn}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        mapping.dataType === 'email' ? 'bg-sky-100 text-sky-700' :
                        mapping.dataType === 'phone' ? 'bg-emerald-100 text-emerald-700' :
                        mapping.dataType === 'date' ? 'bg-emerald-100 text-emerald-700' :
                        mapping.dataType === 'number' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {mapping.dataType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {mapping.sampleValues.slice(0, 2).map(v => String(v).substring(0, 20)).join(', ')}
                      {mapping.sampleValues.length > 2 && '...'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={mapping.targetField || ''}
                        onChange={(e) => updateMapping(index, e.target.value as keyof Reservation || null)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
                      >
                        <option value="">-- Do Not Import --</option>
                        <option value="customerName">Customer Name</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="startDate">Start Date</option>
                        <option value="endDate">End Date</option>
                        <option value="vehicleType">Vehicle Type</option>
                        <option value="dailyRate">Daily Rate</option>
                        <option value="deposit">Deposit</option>
                        <option value="status">Status</option>
                        <option value="notes">Notes</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              mapping.confidence >= 80 ? 'bg-emerald-500' :
                              mapping.confidence >= 60 ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`}
                            style={{ width: `${mapping.confidence}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-700 w-10 text-right">
                          {mapping.confidence}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => setStep('upload')}
            className="px-6 py-3 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
          >
            Back
          </button>
          <button
            onClick={validateData}
            disabled={mappedCount === 0}
            className="px-6 py-3 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <MagicIcon className="w-5 h-5" />
            <span>Validate Data</span>
          </button>
        </div>
      </div>
    );
  };

  const renderValidationStep = () => {
    if (!importStats) return null;

    const errorsByRow = validationErrors.reduce((acc, error) => {
      if (!acc[error.row]) acc[error.row] = [];
      acc[error.row].push(error);
      return acc;
    }, {} as Record<number, ValidationError[]>);

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Data Validation Results</h2>
          <p className="text-slate-600">
            Review the validation results before importing
          </p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="p-6 rounded-xl border border-sky-200 bg-slate-50">
            <div className="text-3xl font-bold text-sky-700">{importStats.totalRows}</div>
            <div className="text-sm text-sky-600 mt-1">Total Rows</div>
          </div>
          <div className="p-6 rounded-xl border border-emerald-200 bg-slate-50">
            <div className="text-3xl font-bold text-emerald-700">{importStats.validRows}</div>
            <div className="text-sm text-emerald-600 mt-1">Valid Rows</div>
          </div>
          <div className="p-6 rounded-xl border border-rose-200 bg-slate-50">
            <div className="text-3xl font-bold text-rose-700">{importStats.errorRows}</div>
            <div className="text-sm text-rose-600 mt-1">Error Rows</div>
          </div>
          <div className="p-6 rounded-xl border border-amber-200 bg-slate-50">
            <div className="text-3xl font-bold text-amber-700">{importStats.warningRows}</div>
            <div className="text-sm text-amber-600 mt-1">Warning Rows</div>
          </div>
        </div>

        <div className="bg-white border-2 border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Data Quality Score</h3>
            <span className={`text-3xl font-bold ${
              importStats.qualityScore >= 90 ? 'text-emerald-600' :
              importStats.qualityScore >= 70 ? 'text-amber-600' :
              'text-rose-600'
            }`}>
              {importStats.qualityScore}%
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                importStats.qualityScore >= 90 ? 'bg-emerald-500' :
                importStats.qualityScore >= 70 ? 'bg-amber-500' :
                'bg-rose-500'
              }`}
              style={{ width: `${importStats.qualityScore}%` }}
            />
          </div>
        </div>

        {validationErrors.length > 0 && (
          <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                Validation Issues ({validationErrors.length})
              </h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Row</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Column</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Value</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Error</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {validationErrors.slice(0, 100).map((error, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {error.row}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {error.column}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {String(error.value).substring(0, 30)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {error.error}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          error.severity === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {error.severity === 'error' ? <AlertIcon className="w-3 h-3 mr-1" /> : null}
                          {error.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validationErrors.length > 100 && (
                <div className="px-4 py-3 text-sm text-slate-600 text-center bg-slate-50">
                  Showing first 100 of {validationErrors.length} issues
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button
            onClick={() => setStep('map')}
            className="px-6 py-3 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
          >
            Back to Mapping
          </button>
          <div className="flex space-x-3">
            {importStats.validRows > 0 && (
              <button
                onClick={generatePreview}
                className="px-6 py-3 text-white rounded-lg transition-all flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <span>Preview Import ({importStats.validRows} rows)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Import Preview</h2>
        <p className="text-slate-600">
          Review the first 10 records before importing
        </p>
      </div>

      <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Customer</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Phone</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Start Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">End Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Vehicle</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {previewData.map((reservation, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {reservation.customerName || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {reservation.email || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {reservation.phone || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {reservation.startDate || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {reservation.endDate || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {reservation.vehicleType || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {reservation.dailyRate ? `$${reservation.dailyRate}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <CheckCircleIcon className="w-6 h-6 text-sky-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sky-900 mb-1">Ready to Import</h3>
            <p className="text-sm text-sky-700">
              {importStats?.validRows} valid rows will be imported. Rows with errors will be skipped.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep('validate')}
          className="px-6 py-3 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
        >
          Back
        </button>
        <button
          onClick={executeImport}
          className="px-6 py-3 text-white rounded-lg transition-all flex items-center space-x-2 shadow-lg bg-emerald-600 hover:bg-emerald-700"
        >
          <CheckCircleIcon className="w-5 h-5" />
          <span>Import {importStats?.validRows} Reservations</span>
        </button>
      </div>
    </div>
  );

  const renderImportStep = () => (
    <div className="space-y-6 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 animate-pulse bg-slate-900">
        {isProcessing ? (
          <RefreshIcon className="w-10 h-10 text-white animate-spin" />
        ) : (
          <CheckCircleIcon className="w-10 h-10 text-white" />
        )}
      </div>

      <h2 className="text-3xl font-bold text-slate-900">
        {isProcessing ? 'Importing Data...' : 'Import Complete!'}
      </h2>

      <p className="text-slate-600 max-w-md mx-auto">
        {isProcessing
          ? 'Please wait while we import your reservations into the system.'
          : `Successfully imported ${importStats?.validRows} reservations.`}
      </p>

      {isProcessing && (
        <div className="space-y-3 max-w-md mx-auto">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <div
              className="h-full transition-all duration-300 rounded-full bg-slate-900"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {!isProcessing && (
        <div className="flex justify-center space-x-3">
          <button
            onClick={() => {
              setStep('upload');
              setFile(null);
              setSheets([]);
              setSelectedSheet(null);
              setMappings([]);
              setRawData([]);
              setHeaders([]);
              setValidationErrors([]);
              setImportStats(null);
              setPreviewData([]);
            }}
            className="px-6 py-3 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
          >
            Import Another File
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 text-white rounded-lg transition-all bg-emerald-600 hover:bg-emerald-700"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 flex items-center justify-between z-10 bg-slate-900">
          <div className="flex items-center space-x-3">
            <MagicIcon className="w-6 h-6 text-white" />
            <h1 className="text-xl font-bold text-white">Universal Excel Import</h1>
            {step !== 'upload' && (
              <span className="text-sm text-sky-100">
                Step {
                  step === 'sheet-select' ? '2' :
                  step === 'map' ? '3' :
                  step === 'validate' ? '4' :
                  step === 'preview' ? '5' : '6'
                } of 6
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-all"
          >
            <CloseIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        <div className="p-6">
          {step === 'upload' && renderUploadStep()}
          {step === 'sheet-select' && renderSheetSelectStep()}
          {step === 'map' && renderMappingStep()}
          {step === 'validate' && renderValidationStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'import' && renderImportStep()}
        </div>
      </div>
    </div>
  );
};

export default ProfessionalUniversalExcelImport;
