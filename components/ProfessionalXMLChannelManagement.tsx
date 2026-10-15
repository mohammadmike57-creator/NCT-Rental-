import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// Types
interface Reservation {
  id: string;
  vehicleId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  totalCost: number;
  status: string;
  channelSource?: string;
  confirmationNumber?: string;
}

interface DistributionChannel {
  id: string;
  name: string;
  type: 'booking.com' | 'expedia' | 'airbnb' | 'custom';
  status: 'connected' | 'disconnected' | 'error';
  apiEndpoint: string;
  apiKey: string;
  username?: string;
  hotelId?: string;
  lastSync?: string;
  totalReservations?: number;
  settings?: {
    autoSync: boolean;
    syncInterval: number;
    pushARI: boolean;
    pullReservations: boolean;
  };
}

interface RatePlan {
  id: string;
  name: string;
  baseRate: number;
  currency: string;
}

interface Fleet {
  id: string;
  vehicles: any[];
}

interface ProfessionalXMLChannelManagementProps {
  onImportReservations: (reservations: Reservation[]) => void;
  onUpdateChannels: (channels: DistributionChannel[]) => void;
  channels: DistributionChannel[];
  ratePlans?: RatePlan[];
  fleet: Fleet;
}

interface XMLImportHistory {
  id: string;
  timestamp: string;
  filename: string;
  status: 'success' | 'failed' | 'partial';
  reservationsCount: number;
  errorMessage?: string;
  channelType?: string;
  xmlContent?: string;
}

interface XMLValidationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

// XML Parser and Validator
class XMLChannelParser {
  static detectChannelType(xmlContent: string): string {
    if (xmlContent.includes('xmlns:ota') || xmlContent.includes('OTA_')) {
      return 'OTA';
    } else if (xmlContent.includes('booking.com') || xmlContent.includes('<reservation')) {
      return 'Booking.com';
    } else if (xmlContent.includes('expedia') || xmlContent.includes('<PropertyDataSet')) {
      return 'Expedia';
    } else if (xmlContent.includes('airbnb') || xmlContent.includes('<listing')) {
      return 'Airbnb';
    }
    return 'Unknown';
  }

  static validateXML(xmlContent: string): { isValid: boolean; errors: XMLValidationError[] } {
    const errors: XMLValidationError[] = [];
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      const errorText = parserError.textContent || 'Unknown XML parsing error';
      const lineMatch = errorText.match(/line (\d+)/);
      const line = lineMatch ? parseInt(lineMatch[1]) : 1;

      errors.push({
        line,
        column: 0,
        message: errorText,
        severity: 'error',
      });
    }

    // Additional validation rules
    if (!xmlContent.trim().startsWith('<?xml')) {
      errors.push({
        line: 1,
        column: 0,
        message: 'XML declaration missing. Expected: <?xml version="1.0" encoding="UTF-8"?>',
        severity: 'warning',
      });
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
    };
  }

  static parseOTAReservations(xmlContent: string): Reservation[] {
    const reservations: Reservation[] = [];
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const resElements = xmlDoc.querySelectorAll('HotelReservation, Reservation, RoomStay');
    resElements.forEach((resEl, index) => {
      const startDate = resEl.querySelector('Start, CheckInDate, TimeSpan[Start]')?.getAttribute('Start') ||
                        resEl.querySelector('Start, CheckInDate')?.textContent || '';
      const endDate = resEl.querySelector('End, CheckOutDate, TimeSpan[End]')?.getAttribute('End') ||
                      resEl.querySelector('End, CheckOutDate')?.textContent || '';
      const confirmationNumber = resEl.querySelector('UniqueID')?.textContent || `RES-${Date.now()}-${index}`;
      const totalCost = parseFloat(resEl.querySelector('Total, AmountAfterTax')?.textContent || '0');

      reservations.push({
        id: confirmationNumber,
        vehicleId: 'unknown',
        customerId: resEl.querySelector('Customer, GuestName')?.textContent || 'Unknown',
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || new Date(Date.now() + 86400000).toISOString(),
        totalCost: totalCost || 0,
        status: 'confirmed',
        channelSource: 'OTA',
        confirmationNumber,
      });
    });

    return reservations;
  }

  static parseBookingComReservations(xmlContent: string): Reservation[] {
    const reservations: Reservation[] = [];
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const resElements = xmlDoc.querySelectorAll('reservation');
    resElements.forEach((resEl, index) => {
      reservations.push({
        id: resEl.querySelector('id')?.textContent || `BOOK-${Date.now()}-${index}`,
        vehicleId: resEl.querySelector('room_id, vehicle_id')?.textContent || 'unknown',
        customerId: resEl.querySelector('guest > name')?.textContent || 'Unknown',
        startDate: resEl.querySelector('checkin, arrival')?.textContent || new Date().toISOString(),
        endDate: resEl.querySelector('checkout, departure')?.textContent || new Date(Date.now() + 86400000).toISOString(),
        totalCost: parseFloat(resEl.querySelector('price, total')?.textContent || '0'),
        status: 'confirmed',
        channelSource: 'Booking.com',
        confirmationNumber: resEl.querySelector('confirmation_number')?.textContent || '',
      });
    });

    return reservations;
  }

  static parseReservations(xmlContent: string, channelType: string): Reservation[] {
    switch (channelType) {
      case 'OTA':
        return this.parseOTAReservations(xmlContent);
      case 'Booking.com':
        return this.parseBookingComReservations(xmlContent);
      case 'Expedia':
      case 'Airbnb':
        // Similar parsing logic for other channels
        return this.parseOTAReservations(xmlContent);
      default:
        return this.parseOTAReservations(xmlContent);
    }
  }
}

// XML Syntax Highlighter Component
const XMLSyntaxHighlighter: React.FC<{ xml: string; errors?: XMLValidationError[] }> = ({ xml, errors = [] }) => {
  const highlightXML = (xmlString: string): JSX.Element[] => {
    const lines = xmlString.split('\n');
    const errorLines = new Set(errors.map(e => e.line));

    return lines.map((line, lineIndex) => {
      const lineNumber = lineIndex + 1;
      const hasError = errorLines.has(lineNumber);

      // Simple XML syntax highlighting
      let highlightedLine = line
        .replace(/(&lt;)([^&\s>]+)/g, '<span class="text-blue-400">&lt;$2</span>')
        .replace(/(&lt;\/[^&>]+&gt;|\/&gt;)/g, '<span class="text-blue-400">$1</span>')
        .replace(/(&gt;)/g, '<span class="text-blue-400">$1</span>')
        .replace(/([a-zA-Z0-9_-]+)=/g, '<span class="text-green-400">$1</span>=')
        .replace(/"([^"]*)"/g, '"<span class="text-yellow-300">$1</span>"')
        .replace(/(&lt;!--.*?--&gt;)/g, '<span class="text-gray-500 italic">$1</span>');

      // Convert actual < > to encoded versions for display
      if (!highlightedLine.includes('&lt;')) {
        highlightedLine = line
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/(&lt;)([^&\s>]+)/g, '<span class="text-blue-400">&lt;$2</span>')
          .replace(/(&lt;\/[^&>]+&gt;|\/&gt;)/g, '<span class="text-blue-400">$1</span>')
          .replace(/(&gt;)/g, '<span class="text-blue-400">$1</span>')
          .replace(/([a-zA-Z0-9_-]+)=/g, '<span class="text-green-400">$1</span>=')
          .replace(/"([^"]*)"/g, '"<span class="text-yellow-300">$1</span>"')
          .replace(/(&lt;!--.*?--&gt;)/g, '<span class="text-gray-500 italic">$1</span>');
      }

      return (
        <div
          key={lineIndex}
          className={`flex ${hasError ? 'bg-red-900/20 border-l-4 border-red-500' : ''}`}
        >
          <span className="inline-block w-12 text-right pr-4 text-gray-500 select-none">
            {lineNumber}
          </span>
          <span
            className="flex-1"
            dangerouslySetInnerHTML={{ __html: highlightedLine || '&nbsp;' }}
          />
        </div>
      );
    });
  };

  return (
    <div className="font-mono text-sm leading-relaxed">
      {highlightXML(xml)}
    </div>
  );
};

// Main Component
const ProfessionalXMLChannelManagement: React.FC<ProfessionalXMLChannelManagementProps> = ({
  onImportReservations,
  onUpdateChannels,
  channels: initialChannels,
  ratePlans = [],
  fleet,
}) => {
  // State Management
  const [activeTab, setActiveTab] = useState<'import' | 'channels' | 'history' | 'export'>('import');
  const [xmlContent, setXmlContent] = useState('');
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors: XMLValidationError[] } | null>(null);
  const [detectedChannel, setDetectedChannel] = useState<string>('');
  const [parsedReservations, setParsedReservations] = useState<Reservation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importHistory, setImportHistory] = useState<XMLImportHistory[]>([]);
  const [channels, setChannels] = useState<DistributionChannel[]>(initialChannels);
  const [editingChannel, setEditingChannel] = useState<DistributionChannel | null>(null);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<XMLImportHistory | null>(null);
  const [exportType, setExportType] = useState<'ARI' | 'Confirmation' | 'Modification' | 'Cancellation'>('ARI');
  const [generatedXML, setGeneratedXML] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Statistics
  const stats = useMemo(() => {
    const totalImports = importHistory.length;
    const successfulImports = importHistory.filter(h => h.status === 'success').length;
    const failedImports = importHistory.filter(h => h.status === 'failed').length;
    const pendingImports = importHistory.filter(h => h.status === 'partial').length;
    const activeChannels = channels.filter(c => c.status === 'connected').length;
    const successRate = totalImports > 0 ? ((successfulImports / totalImports) * 100).toFixed(1) : '0';

    return {
      totalImports,
      successRate: `${successRate}%`,
      pendingImports,
      failedImports,
      activeChannels,
    };
  }, [importHistory, channels]);

  // File Upload Handlers
  const handleFileSelect = useCallback((file: File) => {
    setXmlFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setXmlContent(content);

      // Auto-detect channel
      const channelType = XMLChannelParser.detectChannelType(content);
      setDetectedChannel(channelType);

      // Validate XML
      const validation = XMLChannelParser.validateXML(content);
      setValidationResult(validation);

      // Parse if valid
      if (validation.isValid) {
        const reservations = XMLChannelParser.parseReservations(content, channelType);
        setParsedReservations(reservations);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/xml' || file.name.endsWith('.xml'))) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleXMLContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    setXmlContent(content);

    if (content.trim()) {
      const channelType = XMLChannelParser.detectChannelType(content);
      setDetectedChannel(channelType);

      const validation = XMLChannelParser.validateXML(content);
      setValidationResult(validation);

      if (validation.isValid) {
        const reservations = XMLChannelParser.parseReservations(content, channelType);
        setParsedReservations(reservations);
      }
    }
  }, []);

  // Import Handler
  const handleImport = useCallback(async () => {
    if (!validationResult?.isValid) {
      alert('Cannot import: XML validation failed');
      return;
    }

    setIsProcessing(true);

    try {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Import reservations
      onImportReservations(parsedReservations);

      // Add to history
      const historyItem: XMLImportHistory = {
        id: `IMP-${Date.now()}`,
        timestamp: new Date().toISOString(),
        filename: xmlFile?.name || 'Manual Input',
        status: 'success',
        reservationsCount: parsedReservations.length,
        channelType: detectedChannel,
        xmlContent,
      };

      setImportHistory(prev => [historyItem, ...prev]);

      // Reset form
      setXmlContent('');
      setXmlFile(null);
      setParsedReservations([]);
      setValidationResult(null);
      setDetectedChannel('');

      alert(`Successfully imported ${parsedReservations.length} reservations`);
    } catch (error) {
      const historyItem: XMLImportHistory = {
        id: `IMP-${Date.now()}`,
        timestamp: new Date().toISOString(),
        filename: xmlFile?.name || 'Manual Input',
        status: 'failed',
        reservationsCount: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        channelType: detectedChannel,
        xmlContent,
      };

      setImportHistory(prev => [historyItem, ...prev]);
      alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  }, [validationResult, parsedReservations, onImportReservations, xmlFile, detectedChannel, xmlContent]);

  // Channel Management
  const handleAddChannel = useCallback(() => {
    setEditingChannel({
      id: `CH-${Date.now()}`,
      name: '',
      type: 'booking.com',
      status: 'disconnected',
      apiEndpoint: '',
      apiKey: '',
      settings: {
        autoSync: false,
        syncInterval: 300,
        pushARI: true,
        pullReservations: true,
      },
    });
    setShowChannelModal(true);
  }, []);

  const handleEditChannel = useCallback((channel: DistributionChannel) => {
    setEditingChannel({ ...channel });
    setShowChannelModal(true);
  }, []);

  const handleSaveChannel = useCallback(() => {
    if (!editingChannel) return;

    const existingIndex = channels.findIndex(c => c.id === editingChannel.id);
    let updatedChannels: DistributionChannel[];

    if (existingIndex >= 0) {
      updatedChannels = [...channels];
      updatedChannels[existingIndex] = editingChannel;
    } else {
      updatedChannels = [...channels, editingChannel];
    }

    setChannels(updatedChannels);
    onUpdateChannels(updatedChannels);
    setShowChannelModal(false);
    setEditingChannel(null);
  }, [editingChannel, channels, onUpdateChannels]);

  const handleDeleteChannel = useCallback((channelId: string) => {
    if (confirm('Are you sure you want to delete this channel?')) {
      const updatedChannels = channels.filter(c => c.id !== channelId);
      setChannels(updatedChannels);
      onUpdateChannels(updatedChannels);
    }
  }, [channels, onUpdateChannels]);

  const handleTestConnection = useCallback(async (channel: DistributionChannel) => {
    alert(`Testing connection to ${channel.name}...\n\nThis would test the actual API connection in production.`);
  }, []);

  // XML Export Generator
  const generateExportXML = useCallback(() => {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';

    switch (exportType) {
      case 'ARI':
        xml += `<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
  <AvailStatusMessages HotelCode="${fleet.id}">
    ${fleet.vehicles.slice(0, 3).map((vehicle, idx) => `
    <AvailStatusMessage>
      <StatusApplicationControl Start="${new Date().toISOString().split('T')[0]}" End="${new Date(Date.now() + 2592000000).toISOString().split('T')[0]}" InvTypeCode="${vehicle.id || `VEH-${idx}`}"/>
      <RestrictionStatus Status="Open"/>
      <LengthsOfStay>
        <LengthOfStay MinMaxMessageType="SetMinLOS" Time="1"/>
      </LengthsOfStay>
    </AvailStatusMessage>`).join('')}
  </AvailStatusMessages>
</OTA_HotelAvailNotifRQ>`;
        break;

      case 'Confirmation':
        xml += `<OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
  <HotelReservations>
    <HotelReservation CreateDateTime="${new Date().toISOString()}">
      <UniqueID Type="14" ID="RES-${Date.now()}"/>
      <RoomStays>
        <RoomStay>
          <RatePlans>
            <RatePlan RatePlanCode="${ratePlans[0]?.id || 'STANDARD'}"/>
          </RatePlans>
          <TimeSpan Start="${new Date().toISOString().split('T')[0]}" End="${new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]}"/>
          <Total AmountAfterTax="250.00" CurrencyCode="USD"/>
        </RoomStay>
      </RoomStays>
      <ResGuests>
        <ResGuest>
          <Profiles>
            <Profile>
              <Customer>
                <PersonName>
                  <GivenName>John</GivenName>
                  <Surname>Doe</Surname>
                </PersonName>
              </Customer>
            </Profile>
          </Profiles>
        </ResGuest>
      </ResGuests>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRQ>`;
        break;

      case 'Modification':
        xml += `<OTA_HotelResModifyNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
  <HotelResModifies>
    <HotelResModify>
      <UniqueID Type="14" ID="RES-${Date.now()}"/>
      <ResGlobalInfo>
        <TimeSpan Start="${new Date().toISOString().split('T')[0]}" End="${new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0]}"/>
      </ResGlobalInfo>
    </HotelResModify>
  </HotelResModifies>
</OTA_HotelResModifyNotifRQ>`;
        break;

      case 'Cancellation':
        xml += `<OTA_CancelRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
  <UniqueID Type="14" ID="RES-${Date.now()}"/>
  <Verification>
    <PersonName>
      <GivenName>John</GivenName>
      <Surname>Doe</Surname>
    </PersonName>
  </Verification>
</OTA_CancelRQ>`;
        break;
    }

    setGeneratedXML(xml);
  }, [exportType, fleet, ratePlans]);

  const handleDownloadXML = useCallback(() => {
    const blob = new Blob([generatedXML], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportType}_${Date.now()}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [generatedXML, exportType]);

  // Render Functions
  const renderImportTab = () => (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">XML File Upload</h3>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 bg-gray-50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <div>
              <p className="text-lg font-medium text-gray-700 mb-1">
                Drag and drop XML file here
              </p>
              <p className="text-sm text-gray-500">or click to browse</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md"
            >
              Select File
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {xmlFile && (
              <div className="flex items-center space-x-2 text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{xmlFile.name}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Split Pane: XML Editor and Preview */}
      {xmlContent && (
        <div className="grid grid-cols-2 gap-6">
          {/* Left: XML Editor */}
          <div className="bg-gray-900 rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="text-white font-medium">XML Source</span>
              </div>

              {detectedChannel && (
                <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-400/30">
                  {detectedChannel}
                </span>
              )}
            </div>

            <div className="p-4 overflow-auto max-h-[600px] bg-gray-900">
              <XMLSyntaxHighlighter xml={xmlContent} errors={validationResult?.errors} />
            </div>

            {validationResult && !validationResult.isValid && (
              <div className="border-t border-gray-700 p-4 bg-gray-800">
                <div className="space-y-2">
                  {validationResult.errors.map((error, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start space-x-2 text-sm p-2 rounded ${
                        error.severity === 'error'
                          ? 'bg-red-900/30 text-red-300'
                          : 'bg-yellow-900/30 text-yellow-300'
                      }`}
                    >
                      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-medium">Line {error.line}: {error.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Parsed Preview */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-teal-600 px-4 py-3">
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-white font-medium">Parsed Reservations ({parsedReservations.length})</span>
              </div>
            </div>

            <div className="p-4 overflow-auto max-h-[600px]">
              {parsedReservations.length > 0 ? (
                <div className="space-y-3">
                  {parsedReservations.map((reservation, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:border-green-500 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-semibold text-gray-800">#{reservation.id}</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              {reservation.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{reservation.customerId}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Check-in</p>
                          <p className="font-medium text-gray-800">
                            {new Date(reservation.startDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Check-out</p>
                          <p className="font-medium text-gray-800">
                            {new Date(reservation.endDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Total</p>
                          <p className="font-medium text-gray-800">${reservation.totalCost.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Source</p>
                          <p className="font-medium text-gray-800">{reservation.channelSource}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No reservations parsed yet</p>
                  <p className="text-sm mt-1">Upload a valid XML file to see reservations</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {xmlContent && validationResult?.isValid && (
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => {
              setXmlContent('');
              setXmlFile(null);
              setParsedReservations([]);
              setValidationResult(null);
              setDetectedChannel('');
            }}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Clear
          </button>

          <button
            onClick={handleImport}
            disabled={isProcessing}
            className="px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Import {parsedReservations.length} Reservations</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  const renderChannelsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Distribution Channels</h3>
        <button
          onClick={handleAddChannel}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Channel</span>
        </button>
      </div>

      <div className="grid gap-4">
        {channels.map(channel => (
          <div key={channel.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  channel.status === 'connected' ? 'bg-green-100' :
                  channel.status === 'error' ? 'bg-red-100' : 'bg-gray-100'
                }`}>
                  <svg className={`w-6 h-6 ${
                    channel.status === 'connected' ? 'text-green-600' :
                    channel.status === 'error' ? 'text-red-600' : 'text-gray-600'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-gray-800">{channel.name}</h4>
                  <p className="text-sm text-gray-500 capitalize">{channel.type}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      channel.status === 'connected' ? 'bg-green-100 text-green-700' :
                      channel.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {channel.status}
                    </span>
                    {channel.lastSync && (
                      <span className="text-xs text-gray-500">
                        Last sync: {new Date(channel.lastSync).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTestConnection(channel)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Test Connection"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                <button
                  onClick={() => handleEditChannel(channel)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>

                <button
                  onClick={() => handleDeleteChannel(channel.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">Endpoint</p>
                <p className="font-mono text-xs text-gray-800 truncate">{channel.apiEndpoint}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">API Key</p>
                <p className="font-mono text-xs text-gray-800">{'*'.repeat(20)}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Reservations</p>
                <p className="font-semibold text-gray-800">{channel.totalReservations || 0}</p>
              </div>
            </div>

            {channel.settings && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center space-x-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <span className={`w-3 h-3 rounded-full ${channel.settings.autoSync ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-gray-600">Auto Sync</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`w-3 h-3 rounded-full ${channel.settings.pushARI ? 'bg-blue-500' : 'bg-gray-300'}`} />
                    <span className="text-gray-600">Push ARI</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`w-3 h-3 rounded-full ${channel.settings.pullReservations ? 'bg-purple-500' : 'bg-gray-300'}`} />
                    <span className="text-gray-600">Pull Reservations</span>
                  </div>
                  <div className="text-gray-600">
                    Sync Interval: {channel.settings.syncInterval}s
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {channels.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <p className="text-gray-500 mb-4">No distribution channels configured</p>
            <button
              onClick={handleAddChannel}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md"
            >
              Add Your First Channel
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">Import History</h3>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Filename
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Channel
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reservations
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {importHistory.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(item.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {item.filename}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                    {item.channelType || 'Unknown'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    item.status === 'success' ? 'bg-green-100 text-green-700' :
                    item.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {item.reservationsCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => setSelectedHistoryItem(item)}
                    className="text-blue-600 hover:text-blue-800 mr-3"
                    title="View Details"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  {item.status === 'failed' && (
                    <button
                      onClick={() => {
                        setXmlContent(item.xmlContent || '');
                        setActiveTab('import');
                      }}
                      className="text-orange-600 hover:text-orange-800"
                      title="Retry"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {importHistory.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No import history yet</p>
            <p className="text-sm mt-1">Start importing XML files to see history</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderExportTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Generate XML Export</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Type
            </label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ARI">ARI (Availability, Rate, Inventory)</option>
              <option value="Confirmation">Reservation Confirmation</option>
              <option value="Modification">Reservation Modification</option>
              <option value="Cancellation">Reservation Cancellation</option>
            </select>
          </div>

          <button
            onClick={generateExportXML}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span>Generate XML</span>
          </button>
        </div>
      </div>

      {generatedXML && (
        <div className="bg-gray-900 rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-white font-medium">Generated {exportType} XML</span>
            </div>

            <button
              onClick={handleDownloadXML}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download</span>
            </button>
          </div>

          <div className="p-4 overflow-auto max-h-[600px] bg-gray-900">
            <XMLSyntaxHighlighter xml={generatedXML} />
          </div>
        </div>
      )}
    </div>
  );

  // Main Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-lg shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">XML Channel Management</h1>
                <p className="text-blue-100 mt-1">Professional OTA Integration System</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Imports</p>
                <p className="text-2xl font-bold text-gray-800">{stats.totalImports}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Success Rate</p>
                <p className="text-2xl font-bold text-green-600">{stats.successRate}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingImports}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failedImports}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Channels</p>
                <p className="text-2xl font-bold text-purple-600">{stats.activeChannels}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'import'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>XML Import</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('channels')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'channels'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span>Channels ({channels.length})</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>History ({importHistory.length})</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'export'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export</span>
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'import' && renderImportTab()}
          {activeTab === 'channels' && renderChannelsTab()}
          {activeTab === 'history' && renderHistoryTab()}
          {activeTab === 'export' && renderExportTab()}
        </div>
      </div>

      {/* Channel Edit Modal */}
      {showChannelModal && editingChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">
                {editingChannel.id.startsWith('CH-') ? 'Add' : 'Edit'} Channel
              </h3>
              <button
                onClick={() => {
                  setShowChannelModal(false);
                  setEditingChannel(null);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Channel Name
                  </label>
                  <input
                    type="text"
                    value={editingChannel.name}
                    onChange={(e) => setEditingChannel({ ...editingChannel, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Booking.com US"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Channel Type
                  </label>
                  <select
                    value={editingChannel.type}
                    onChange={(e) => setEditingChannel({ ...editingChannel, type: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="booking.com">Booking.com</option>
                    <option value="expedia">Expedia</option>
                    <option value="airbnb">Airbnb</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Endpoint
                </label>
                <input
                  type="text"
                  value={editingChannel.apiEndpoint}
                  onChange={(e) => setEditingChannel({ ...editingChannel, apiEndpoint: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://api.example.com/v1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={editingChannel.apiKey}
                  onChange={(e) => setEditingChannel({ ...editingChannel, apiKey: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter API key"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username (Optional)
                  </label>
                  <input
                    type="text"
                    value={editingChannel.username || ''}
                    onChange={(e) => setEditingChannel({ ...editingChannel, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hotel/Property ID
                  </label>
                  <input
                    type="text"
                    value={editingChannel.hotelId || ''}
                    onChange={(e) => setEditingChannel({ ...editingChannel, hotelId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h4 className="font-medium text-gray-800 mb-3">Channel Settings</h4>

                <div className="space-y-3">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={editingChannel.settings?.autoSync || false}
                      onChange={(e) => setEditingChannel({
                        ...editingChannel,
                        settings: { ...editingChannel.settings!, autoSync: e.target.checked }
                      })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Enable Auto Sync</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={editingChannel.settings?.pushARI || false}
                      onChange={(e) => setEditingChannel({
                        ...editingChannel,
                        settings: { ...editingChannel.settings!, pushARI: e.target.checked }
                      })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Push ARI Updates</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={editingChannel.settings?.pullReservations || false}
                      onChange={(e) => setEditingChannel({
                        ...editingChannel,
                        settings: { ...editingChannel.settings!, pullReservations: e.target.checked }
                      })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Pull Reservations</span>
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sync Interval (seconds)
                    </label>
                    <input
                      type="number"
                      value={editingChannel.settings?.syncInterval || 300}
                      onChange={(e) => setEditingChannel({
                        ...editingChannel,
                        settings: { ...editingChannel.settings!, syncInterval: parseInt(e.target.value) }
                      })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="60"
                      step="60"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowChannelModal(false);
                  setEditingChannel(null);
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChannel}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md"
              >
                Save Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Detail Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Import Details</h3>
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Filename</p>
                  <p className="font-medium text-gray-800">{selectedHistoryItem.filename}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Timestamp</p>
                  <p className="font-medium text-gray-800">
                    {new Date(selectedHistoryItem.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Channel Type</p>
                  <p className="font-medium text-gray-800">{selectedHistoryItem.channelType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    selectedHistoryItem.status === 'success' ? 'bg-green-100 text-green-700' :
                    selectedHistoryItem.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedHistoryItem.status}
                  </span>
                </div>
              </div>

              {selectedHistoryItem.errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800">Error Message:</p>
                  <p className="text-sm text-red-700 mt-1">{selectedHistoryItem.errorMessage}</p>
                </div>
              )}

              {selectedHistoryItem.xmlContent && (
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  <div className="bg-gray-800 px-4 py-2">
                    <p className="text-sm text-white font-medium">XML Content</p>
                  </div>
                  <div className="p-4 overflow-auto max-h-96">
                    <XMLSyntaxHighlighter xml={selectedHistoryItem.xmlContent} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessionalXMLChannelManagement;
