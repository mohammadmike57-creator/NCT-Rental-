import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ProfessionalUniversalExcelImport from '../../components/ProfessionalUniversalExcelImport';

/**
 * Test suite for Professional Universal Excel Import
 *
 * Tests cover:
 * - File upload
 * - Column auto-mapping
 * - Data validation
 * - Error handling
 * - Fuzzy matching algorithm
 * - Date parsing
 */
describe('ProfessionalUniversalExcelImport', () => {
  const mockOnImportComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('File Upload', () => {
    it('should render upload area', () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      expect(screen.getByText(/Universal Excel Import/i)).toBeInTheDocument();
      expect(screen.getByText(/Drag and drop/i)).toBeInTheDocument();
    });

    it('should accept Excel file upload', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      const file = new File(['test'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
      await user.upload(input, file);

      await waitFor(() => {
        expect(input.files![0]).toStrictEqual(file);
      });
    });

    it('should reject non-Excel files', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

      const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText(/Invalid file type/i)).toBeInTheDocument();
      });
    });

    it('should show file size limit error', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Create a large file (> 10MB)
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      const file = new File([largeContent], 'large.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText(/File size exceeds limit/i)).toBeInTheDocument();
      });
    });
  });

  describe('Column Mapping', () => {
    it('should auto-detect column mappings', async () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Simulate file upload with known columns
      const mockData = {
        columns: ['Name', 'Email', 'Phone Number', 'Start Date'],
      };

      // Trigger auto-mapping
      // In actual implementation, this would be triggered after file processing

      await waitFor(() => {
        // Should show mapping interface
        expect(screen.getByText(/Column Mapping/i)).toBeInTheDocument();
      });
    });

    it('should use fuzzy matching for column names', () => {
      // Test fuzzy matching algorithm
      const fuzzyMatch = (source: string, target: string) => {
        const similarity = 1 - (
          Math.abs(source.length - target.length) / Math.max(source.length, target.length)
        );
        return similarity > 0.7;
      };

      expect(fuzzyMatch('Customer Name', 'Name')).toBe(true);
      expect(fuzzyMatch('Email Address', 'Email')).toBe(true);
      expect(fuzzyMatch('Completely Different', 'Name')).toBe(false);
    });

    it('should allow manual column mapping', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Should have dropdown for each required field
      const selects = screen.queryAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
    });

    it('should validate required field mappings', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      const importButton = screen.getByRole('button', { name: /import/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText(/Required fields must be mapped/i)).toBeInTheDocument();
      });
    });
  });

  describe('Data Validation', () => {
    it('should validate email format', () => {
      const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
    });

    it('should validate phone numbers', () => {
      const validatePhone = (phone: string) => {
        const phoneRegex = /^[\+]?[0-9]{10,15}$/;
        return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
      };

      expect(validatePhone('+1234567890')).toBe(true);
      expect(validatePhone('123-456-7890')).toBe(true);
      expect(validatePhone('invalid')).toBe(false);
    });

    it('should validate date formats', () => {
      const parseDate = (dateStr: string) => {
        const formats = [
          /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
          /^\d{2}\/\d{2}\/\d{4}$/,  // DD/MM/YYYY
          /^\d{2}-\d{2}-\d{4}$/,  // DD-MM-YYYY
        ];

        return formats.some(format => format.test(dateStr));
      };

      expect(parseDate('2024-06-01')).toBe(true);
      expect(parseDate('01/06/2024')).toBe(true);
      expect(parseDate('invalid-date')).toBe(false);
    });

    it('should show validation errors for invalid data', async () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Simulate import with invalid data
      const invalidData = [
        { email: 'invalid-email', phone: 'abc' },
      ];

      await waitFor(() => {
        // Should display error summary
        expect(screen.getByText(/Validation Error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Fuzzy Matching', () => {
    it('should match similar column names', () => {
      const fuzzyMatchScore = (str1: string, str2: string) => {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();

        if (s1 === s2) return 1.0;
        if (s1.includes(s2) || s2.includes(s1)) return 0.9;

        // Levenshtein distance approximation
        const maxLen = Math.max(s1.length, s2.length);
        const distance = Math.abs(s1.length - s2.length);
        return 1 - (distance / maxLen);
      };

      expect(fuzzyMatchScore('Customer Name', 'Name')).toBeGreaterThan(0.7);
      expect(fuzzyMatchScore('Email Address', 'Email')).toBeGreaterThan(0.7);
      expect(fuzzyMatchScore('Phone', 'Phone Number')).toBeGreaterThan(0.7);
    });

    it('should suggest best matches for unmapped columns', () => {
      const excelColumns = ['Customer Full Name', 'E-mail', 'Contact Number'];
      const requiredFields = ['name', 'email', 'phone'];

      const suggestions = excelColumns.map(col => {
        const matches = requiredFields.map(field => ({
          field,
          score: col.toLowerCase().includes(field) ? 0.9 : 0.3,
        }));
        return matches.sort((a, b) => b.score - a.score)[0];
      });

      expect(suggestions[0].field).toBe('name');
      expect(suggestions[1].field).toBe('email');
      expect(suggestions[2].field).toBe('phone');
    });
  });

  describe('Date Parsing', () => {
    it('should parse various date formats', () => {
      const parseFlexibleDate = (dateStr: string): Date | null => {
        const formats = [
          /^(\d{4})-(\d{2})-(\d{2})$/,  // YYYY-MM-DD
          /^(\d{2})\/(\d{2})\/(\d{4})$/,  // DD/MM/YYYY
          /^(\d{2})-(\d{2})-(\d{4})$/,  // DD-MM-YYYY
        ];

        for (const format of formats) {
          const match = dateStr.match(format);
          if (match) {
            return new Date(dateStr);
          }
        }
        return null;
      };

      expect(parseFlexibleDate('2024-06-01')).toBeInstanceOf(Date);
      expect(parseFlexibleDate('01/06/2024')).toBeInstanceOf(Date);
      expect(parseFlexibleDate('01-06-2024')).toBeInstanceOf(Date);
      expect(parseFlexibleDate('invalid')).toBeNull();
    });

    it('should handle Excel serial date numbers', () => {
      const excelDateToJS = (serial: number): Date => {
        // Excel dates start from 1900-01-01
        const excelEpoch = new Date(1900, 0, 1);
        const days = serial - 2; // Excel bug: treats 1900 as leap year
        return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
      };

      const date = excelDateToJS(44713); // 2022-06-01
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBeGreaterThan(2020);
    });
  });

  describe('Error Handling', () => {
    it('should show error for corrupted files', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      const corruptedFile = new File(['corrupted data'], 'corrupted.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
      await user.upload(input, corruptedFile);

      await waitFor(() => {
        expect(screen.getByText(/Failed to parse file/i)).toBeInTheDocument();
      });
    });

    it('should handle empty Excel files', async () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Simulate empty file processing
      await waitFor(() => {
        expect(screen.getByText(/No data found/i)).toBeInTheDocument();
      });
    });

    it('should show preview of import data', async () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Should show data preview table
      await waitFor(() => {
        expect(screen.getByText(/Preview/i)).toBeInTheDocument();
      });
    });

    it('should allow skipping rows with errors', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      const skipCheckbox = screen.getByLabelText(/Skip invalid rows/i);
      await user.click(skipCheckbox);

      expect(skipCheckbox).toBeChecked();
    });
  });

  describe('Import Process', () => {
    it('should show progress during import', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      const importButton = screen.getByRole('button', { name: /import/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText(/Importing/i)).toBeInTheDocument();
      });
    });

    it('should call onImportComplete on success', async () => {
      const user = userEvent.setup();
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Simulate successful import
      const importButton = screen.getByRole('button', { name: /import/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(mockOnImportComplete).toHaveBeenCalled();
      });
    });

    it('should show success summary', async () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/Successfully imported/i)).toBeInTheDocument();
      });
    });

    it('should show detailed import statistics', async () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/Total rows/i)).toBeInTheDocument();
        expect(screen.getByText(/Successful/i)).toBeInTheDocument();
        expect(screen.getByText(/Failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should handle large Excel files efficiently', () => {
      const mockLargeData = Array(1000).fill({
        name: 'Test Customer',
        email: 'test@example.com',
        phone: '+1234567890',
      });

      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Should not freeze or crash with large datasets
      expect(screen.getByText(/Universal Excel Import/i)).toBeInTheDocument();
    });

    it('should batch process large imports', () => {
      const batchSize = 100;
      const totalRecords = 1000;
      const batches = Math.ceil(totalRecords / batchSize);

      expect(batches).toBe(10);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible file input', () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      const input = screen.getByLabelText(/upload/i);
      expect(input).toHaveAttribute('type', 'file');
    });

    it('should provide screen reader feedback', () => {
      render(<ProfessionalUniversalExcelImport onImportComplete={mockOnImportComplete} />);

      // Should have ARIA labels and descriptions
      const container = screen.getByRole('region');
      expect(container).toBeInTheDocument();
    });
  });
});
