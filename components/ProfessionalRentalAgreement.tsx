import React, { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {
  CheckCircleIcon,
  XCircleIcon,
  CarIcon,
  UserIcon,
  DocumentReportIcon,
  PencilIcon,
  PrinterIcon,
  SaveIcon,
  ClockIcon
} from './icons';

interface RentalAgreementProps {
  reservation?: any;
  onComplete?: (agreement: any) => void;
}

const ProfessionalRentalAgreement: React.FC<RentalAgreementProps> = ({
  reservation,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [agreementData, setAgreementData] = useState({
    // Customer Information
    customerFullName: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    customerCity: '',
    customerCountry: '',
    customerPostalCode: '',

    // Driver License
    licenseNumber: '',
    licenseCountry: '',
    licenseIssueDate: '',
    licenseExpiryDate: '',
    driverAge: '',

    // Rental Details
    pickupDate: '',
    pickupTime: '',
    returnDate: '',
    returnTime: '',
    pickupLocation: '',
    returnLocation: '',

    // Vehicle Details
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
    licensePlate: '',
    vinNumber: '',
    odometerStart: '',
    fuelLevelStart: 'FULL',

    // Pricing
    dailyRate: '',
    rentalDays: '',
    baseRentalCost: '',
    airportFee: '0',
    youngDriverFee: '0',
    additionalDriverFee: '0',
    oneWayFee: '0',
    extrasCost: '0',
    insuranceCost: '0',
    insuranceType: 'CDW',
    taxPercentage: '10',
    securityDeposit: '300',
    excessAmount: '1000',

    // Additional
    additionalDrivers: '0',
    includedMileage: '0',
    extraMileageCharge: '0',
    specialInstructions: ''
  });

  const [customerSignature, setCustomerSignature] = useState<string>('');
  const [agentSignature, setAgentSignature] = useState<string>('');

  const customerSigRef = useRef<SignatureCanvas>(null);
  const agentSigRef = useRef<SignatureCanvas>(null);

  const steps = [
    { id: 1, name: 'Customer Details', icon: UserIcon },
    { id: 2, name: 'Vehicle Inspection', icon: CarIcon },
    { id: 3, name: 'Terms & Pricing', icon: DocumentReportIcon },
    { id: 4, name: 'Signatures', icon: PencilIcon }
  ];

  const calculateTotals = () => {
    const baseRental = parseFloat(agreementData.dailyRate || '0') * parseInt(agreementData.rentalDays || '1');
    const airportFee = parseFloat(agreementData.airportFee || '0');
    const youngDriver = parseFloat(agreementData.youngDriverFee || '0');
    const additionalDriver = parseFloat(agreementData.additionalDriverFee || '0');
    const oneWay = parseFloat(agreementData.oneWayFee || '0');
    const extras = parseFloat(agreementData.extrasCost || '0');
    const insurance = parseFloat(agreementData.insuranceCost || '0');

    const subtotal = baseRental + airportFee + youngDriver + additionalDriver + oneWay + extras + insurance;
    const tax = subtotal * (parseFloat(agreementData.taxPercentage || '0') / 100);
    const total = subtotal + tax;

    return { baseRental, subtotal, tax, total };
  };

  const handleInputChange = (field: string, value: string) => {
    setAgreementData(prev => ({ ...prev, [field]: value }));
  };

  const saveCustomerSignature = () => {
    if (customerSigRef.current) {
      setCustomerSignature(customerSigRef.current.toDataURL());
    }
  };

  const clearCustomerSignature = () => {
    if (customerSigRef.current) {
      customerSigRef.current.clear();
      setCustomerSignature('');
    }
  };

  const saveAgentSignature = () => {
    if (agentSigRef.current) {
      setAgentSignature(agentSigRef.current.toDataURL());
    }
  };

  const clearAgentSignature = () => {
    if (agentSigRef.current) {
      agentSigRef.current.clear();
      setAgentSignature('');
    }
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="professional-card mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Professional Rental Agreement
              </h1>
              <p className="text-gray-600">
                Complete and sign rental agreement - Agreement #{Date.now().toString().slice(-8)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-professional-secondary">
                <SaveIcon className="w-5 h-5" />
                Save Draft
              </button>
              <button className="btn-professional-secondary">
                <PrinterIcon className="w-5 h-5" />
                Print
              </button>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="professional-card mb-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                      currentStep >= step.id
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <CheckCircleIcon className="w-6 h-6" />
                    ) : (
                      <step.icon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="ml-3">
                    <p className={`text-sm font-semibold ${
                      currentStep >= step.id ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                      Step {step.id}
                    </p>
                    <p className="text-xs text-gray-600">{step.name}</p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-4 rounded-full transition-all duration-300 ${
                    currentStep > step.id ? 'bg-blue-600' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Customer Details */}
            {currentStep === 1 && (
              <div className="professional-card animate-fade-in">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <UserIcon className="w-6 h-6 text-blue-600" />
                  Customer & Driver Information
                </h2>

                <div className="space-y-6">
                  {/* Personal Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Personal Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={agreementData.customerFullName}
                          onChange={(e) => handleInputChange('customerFullName', e.target.value)}
                          className="input-professional"
                          placeholder="John Doe"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={agreementData.customerEmail}
                          onChange={(e) => handleInputChange('customerEmail', e.target.value)}
                          className="input-professional"
                          placeholder="john@example.com"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          value={agreementData.customerPhone}
                          onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                          className="input-professional"
                          placeholder="+1 (555) 123-4567"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Date of Birth / Age <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          value={agreementData.driverAge}
                          onChange={(e) => handleInputChange('driverAge', e.target.value)}
                          className="input-professional"
                          placeholder="25"
                          min="18"
                          max="99"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Address Information</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Street Address
                        </label>
                        <input
                          type="text"
                          value={agreementData.customerAddress}
                          onChange={(e) => handleInputChange('customerAddress', e.target.value)}
                          className="input-professional"
                          placeholder="123 Main Street, Apt 4B"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            City
                          </label>
                          <input
                            type="text"
                            value={agreementData.customerCity}
                            onChange={(e) => handleInputChange('customerCity', e.target.value)}
                            className="input-professional"
                            placeholder="New York"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Postal Code
                          </label>
                          <input
                            type="text"
                            value={agreementData.customerPostalCode}
                            onChange={(e) => handleInputChange('customerPostalCode', e.target.value)}
                            className="input-professional"
                            placeholder="10001"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Country
                          </label>
                          <input
                            type="text"
                            value={agreementData.customerCountry}
                            onChange={(e) => handleInputChange('customerCountry', e.target.value)}
                            className="input-professional"
                            placeholder="USA"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Driver License */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Driver's License Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          License Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={agreementData.licenseNumber}
                          onChange={(e) => handleInputChange('licenseNumber', e.target.value)}
                          className="input-professional"
                          placeholder="D1234567"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          License Country <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={agreementData.licenseCountry}
                          onChange={(e) => handleInputChange('licenseCountry', e.target.value)}
                          className="input-professional"
                          placeholder="USA"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Issue Date
                        </label>
                        <input
                          type="date"
                          value={agreementData.licenseIssueDate}
                          onChange={(e) => handleInputChange('licenseIssueDate', e.target.value)}
                          className="input-professional"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expiry Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={agreementData.licenseExpiryDate}
                          onChange={(e) => handleInputChange('licenseExpiryDate', e.target.value)}
                          className="input-professional"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rental Period */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Rental Period</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Pickup Date & Time <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={agreementData.pickupDate}
                            onChange={(e) => handleInputChange('pickupDate', e.target.value)}
                            className="input-professional"
                            required
                          />
                          <input
                            type="time"
                            value={agreementData.pickupTime}
                            onChange={(e) => handleInputChange('pickupTime', e.target.value)}
                            className="input-professional"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Date & Time <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={agreementData.returnDate}
                            onChange={(e) => handleInputChange('returnDate', e.target.value)}
                            className="input-professional"
                            required
                          />
                          <input
                            type="time"
                            value={agreementData.returnTime}
                            onChange={(e) => handleInputChange('returnTime', e.target.value)}
                            className="input-professional"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Pickup Location <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={agreementData.pickupLocation}
                          onChange={(e) => handleInputChange('pickupLocation', e.target.value)}
                          className="input-professional"
                          placeholder="Amman Queen Alia Airport"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Location <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={agreementData.returnLocation}
                          onChange={(e) => handleInputChange('returnLocation', e.target.value)}
                          className="input-professional"
                          placeholder="Amman Queen Alia Airport"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
                className="btn-professional-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentStep(Math.min(4, currentStep + 1))}
                className="btn-professional-primary"
              >
                {currentStep === 4 ? 'Complete Agreement' : 'Next Step'}
              </button>
            </div>
          </div>

          {/* Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="professional-card sticky top-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Agreement Summary</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500">Customer</p>
                  <p className="text-sm font-medium text-gray-900">
                    {agreementData.customerFullName || 'Not entered'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Rental Period</p>
                  <p className="text-sm font-medium text-gray-900">
                    {agreementData.rentalDays || '0'} days
                  </p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Base Rental</span>
                    <span className="font-medium">${totals.baseRental.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Fees & Extras</span>
                    <span className="font-medium">
                      ${(totals.subtotal - totals.baseRental).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Tax ({agreementData.taxPercentage}%)</span>
                    <span className="font-medium">${totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-300">
                    <span>Total Amount</span>
                    <span>${totals.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Security Deposit</span>
                    <span className="font-semibold text-blue-600">
                      ${agreementData.securityDeposit}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalRentalAgreement;
