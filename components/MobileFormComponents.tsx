'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  XMarkIcon,
  CheckIcon,
  ChevronDownIcon,
  CalendarIcon,
  CameraIcon,
  DocumentIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

// Bottom Sheet Component
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  height?: 'auto' | 'half' | 'full';
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  height = 'auto',
}: BottomSheetProps) {
  const heightClasses = {
    auto: 'max-h-[90vh]',
    half: 'h-[50vh]',
    full: 'h-[90vh]',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-40 ${
          isOpen ? 'bg-opacity-50' : 'bg-opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl transform transition-transform duration-300 z-50 ${
          heightClasses[height]
        } ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-500 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-4 py-4" style={{ maxHeight: 'calc(90vh - 120px)' }}>
          {children}
        </div>
      </div>
    </>
  );
}

// Mobile Date Picker
interface MobileDatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
}

export function MobileDatePicker({
  label,
  value,
  onChange,
  min,
  max,
  required = false,
}: MobileDatePickerProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          required={required}
          className="w-full px-4 py-3 pr-10 text-base bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none touch-manipulation"
        />
        <CalendarIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// Mobile Autocomplete
interface AutocompleteOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface MobileAutocompleteProps {
  label: string;
  options: AutocompleteOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function MobileAutocomplete({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  required = false,
}: MobileAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = options.filter(
    (option) =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      option.subtitle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 text-base bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 active:bg-gray-50 transition-colors touch-manipulation"
        >
          <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDownIcon className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title={label} height="half">
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-3 text-base bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Options */}
        <div className="space-y-1">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                setSearchQuery('');
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors touch-manipulation ${
                value === option.value
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-900 active:bg-gray-50'
              }`}
            >
              <div className="flex-1 text-left">
                <p className="font-medium">{option.label}</p>
                {option.subtitle && (
                  <p className="text-sm text-gray-500 mt-0.5">{option.subtitle}</p>
                )}
              </div>
              {value === option.value && <CheckIcon className="w-5 h-5 ml-2" />}
            </button>
          ))}
        </div>

        {filteredOptions.length === 0 && (
          <div className="text-center py-8 text-gray-500">No results found</div>
        )}
      </BottomSheet>
    </>
  );
}

// Mobile File Upload
interface MobileFileUploadProps {
  label: string;
  accept?: string;
  multiple?: boolean;
  onFileSelect: (files: File[]) => void;
  allowCamera?: boolean;
  required?: boolean;
}

export function MobileFileUpload({
  label,
  accept = 'image/*',
  multiple = false,
  onFileSelect,
  allowCamera = true,
  required = false,
}: MobileFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    onFileSelect(files);

    // Generate previews for images
    if (accept.includes('image')) {
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        {/* File Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center px-4 py-6 bg-white border-2 border-dashed border-gray-300 rounded-lg active:bg-gray-50 transition-colors touch-manipulation"
        >
          <DocumentIcon className="w-8 h-8 text-gray-400 mb-2" />
          <span className="text-sm font-medium text-gray-700">Choose File</span>
        </button>

        {/* Camera Button */}
        {allowCamera && (
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-col items-center justify-center px-4 py-6 bg-white border-2 border-dashed border-gray-300 rounded-lg active:bg-gray-50 transition-colors touch-manipulation"
          >
            <CameraIcon className="w-8 h-8 text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-700">Take Photo</span>
          </button>
        )}
      </div>

      {/* Hidden Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Preview */}
      {preview.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {preview.map((src, index) => (
            <div key={index} className="relative aspect-square">
              <img
                src={src}
                alt={`Preview ${index + 1}`}
                className="w-full h-full object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={() => setPreview((prev) => prev.filter((_, i) => i !== index))}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Signature Pad
interface SignaturePadProps {
  label: string;
  onSave: (signature: string) => void;
  required?: boolean;
}

export function SignaturePad({ label, onSave, required = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
    setIsEmpty(false);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full bg-white touch-none"
        />
      </div>

      <div className="flex space-x-2 mt-2">
        <button
          type="button"
          onClick={clear}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg active:bg-gray-50 transition-colors touch-manipulation"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isEmpty}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-700 transition-colors touch-manipulation"
        >
          Save Signature
        </button>
      </div>
    </div>
  );
}

// Multi-Step Form Stepper
interface Step {
  id: string;
  title: string;
  component: React.ReactNode;
}

interface FormStepperProps {
  steps: Step[];
  onComplete: () => void;
}

export function FormStepper({ steps, onComplete }: FormStepperProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress Bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm text-gray-500">{steps[currentStep].title}</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {steps[currentStep].component}
      </div>

      {/* Navigation Buttons */}
      <div className="px-4 py-3 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex space-x-3">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={prevStep}
              className="flex-1 px-4 py-3 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-lg active:bg-gray-50 transition-colors touch-manipulation"
            >
              Previous
            </button>
          )}
          <button
            type="button"
            onClick={nextStep}
            className="flex-1 px-4 py-3 text-base font-medium text-white bg-blue-600 rounded-lg active:bg-blue-700 transition-colors touch-manipulation"
          >
            {currentStep === steps.length - 1 ? 'Complete' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Mobile Input with Validation
interface MobileInputProps {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  autoComplete?: string;
}

export function MobileInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
  helperText,
  autoComplete,
}: MobileInputProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className={`w-full px-4 py-3 text-base bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
          error
            ? 'border-red-300 focus:ring-red-500 focus:border-transparent'
            : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
        }`}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
}

// Mobile Textarea
interface MobileTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number;
}

export function MobileTextarea({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  rows = 4,
}: MobileTextareaProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={rows}
        className="w-full px-4 py-3 text-base bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
      />
    </div>
  );
}
