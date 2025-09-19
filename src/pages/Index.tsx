import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Filter, Download } from 'lucide-react';
import { FileUpload } from '@/components/FileUpload';
import { ModeToggle } from '@/components/ModeToggle';
import { SearchWithAutocomplete } from '@/components/SearchWithAutocomplete';
import { DateFilters } from '@/components/DateFilters';
import { DataSidebar } from '@/components/DataSidebar';
import { IframeContainer } from '@/components/IframeContainer';
import { AssignmentData, ParsedData, FilterState, SidebarItem } from '@/types/data';
import { toast } from '@/hooks/use-toast';
import heroImage from '@/assets/hero-dashboard.jpg';

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawData, setRawData] = useState<ParsedData[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    mode: 'student',
    searchQuery: '',
    selectedOption: '',
    startDate: undefined,
    endDate: undefined,
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    mode: 'student',
    searchQuery: '',
    selectedOption: '',
    startDate: undefined,
    endDate: undefined,
  });
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<ParsedData | null>(null);

  const parseExcelFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData: AssignmentData[] = XLSX.utils.sheet_to_json(worksheet);
      
      const parsedData: ParsedData[] = jsonData.map((row, index) => {
        // Handle different timestamp formats
        let timestamp: Date;
        try {
          if (row.timestamp) {
            const dateStr = row.timestamp.toString();
            timestamp = new Date(dateStr);
            if (isNaN(timestamp.getTime())) {
              // Try parsing MM/DD/YYYY format
              const parts = dateStr.split(/[\/\s:]/);
              if (parts.length >= 3) {
                timestamp = new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
              } else {
                timestamp = new Date();
              }
            }
          } else {
            timestamp = new Date();
          }
        } catch (e) {
          timestamp = new Date();
        }

        return {
          ...row,
          timestamp,
          fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          title: row.title || '',
          first_name: row.first_name || '',
          last_name: row.last_name || '',
          time: row.time || '',
          difficulty: row.difficulty || '',
          confident: row.confident || '',
          needswork: row.needswork || '',
          suggestions: row.suggestions || '',
          corrections: row.corrections || '',
          locals: row.locals || '',
          share: row.share || '',
        };
      });

      setRawData(parsedData);
      toast({
        title: "File Processed Successfully",
        description: `Loaded ${parsedData.length} assignment records`,
      });
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Processing Error",
        description: "Failed to process the Excel file. Please check the format.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    setUploadedFile(file);
    parseExcelFile(file);
  }, [parseExcelFile]);

  const handleClearFile = useCallback(() => {
    setUploadedFile(null);
    setRawData([]);
    setFilters({
      mode: 'student',
      searchQuery: '',
      selectedOption: '',
      startDate: undefined,
      endDate: undefined,
    });
    setAppliedFilters({
      mode: 'student',
      searchQuery: '',
      selectedOption: '',
      startDate: undefined,
      endDate: undefined,
    });
    setSelectedItem(null);
    setSelectedData(null);
  }, []);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({ ...filters });
    setSelectedItem(null);
    setSelectedData(null);
  }, [filters]);

  const filteredData = useMemo(() => {
    let filtered = rawData;

    // Apply date filters
    if (appliedFilters.startDate) {
      filtered = filtered.filter(item => item.timestamp >= appliedFilters.startDate!);
    }
    if (appliedFilters.endDate) {
      filtered = filtered.filter(item => item.timestamp <= appliedFilters.endDate!);
    }

    // Apply selection filter
    if (appliedFilters.selectedOption) {
      if (appliedFilters.mode === 'student') {
        filtered = filtered.filter(item => item.fullName === appliedFilters.selectedOption);
      } else {
        filtered = filtered.filter(item => item.title === appliedFilters.selectedOption);
      }
    }

    return filtered;
  }, [rawData, appliedFilters]);

  const sidebarItems: SidebarItem[] = useMemo(() => {
    return filteredData.map((item, index) => ({
      id: `${appliedFilters.mode}-${index}`,
      label: appliedFilters.mode === 'student' ? item.title : item.fullName,
      data: item,
    }));
  }, [filteredData, appliedFilters.mode]);

  const handleItemSelect = useCallback((item: SidebarItem) => {
    setSelectedItem(item.id);
    setSelectedData(item.data);
  }, []);

  const hasData = rawData.length > 0;
  const hasAppliedFilters = appliedFilters.selectedOption !== '';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-gradient-to-r from-background to-sidebar-bg">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-6">
            <img 
              src={heroImage} 
              alt="Excel Data Analyzer" 
              className="w-16 h-16 rounded-lg object-cover shadow-md"
            />
            <div>
              <h1 className="text-3xl font-bold">Excel Assignment Analyzer</h1>
              <p className="text-muted-foreground">
                Upload and analyze student assignment data with advanced filtering
              </p>
            </div>
          </div>
          
          <FileUpload
            onFileUpload={handleFileUpload}
            uploadedFile={uploadedFile}
            isProcessing={isProcessing}
            onClearFile={handleClearFile}
          />
        </div>
      </div>

      {hasData && (
        <>
          {/* Controls */}
          <div className="border-b bg-sidebar-bg/50">
            <div className="container mx-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <ModeToggle
                  mode={filters.mode}
                  onChange={(mode) => setFilters(prev => ({ 
                    ...prev, 
                    mode, 
                    searchQuery: '', 
                    selectedOption: '' 
                  }))}
                />
                
                <SearchWithAutocomplete
                  data={rawData}
                  mode={filters.mode}
                  searchQuery={filters.searchQuery}
                  selectedOption={filters.selectedOption}
                  onSearchChange={(query) => setFilters(prev => ({ ...prev, searchQuery: query }))}
                  onOptionSelect={(option) => setFilters(prev => ({ ...prev, selectedOption: option }))}
                />
                
                <DateFilters
                  startDate={filters.startDate}
                  endDate={filters.endDate}
                  onStartDateChange={(date) => setFilters(prev => ({ ...prev, startDate: date }))}
                  onEndDateChange={(date) => setFilters(prev => ({ ...prev, endDate: date }))}
                />
                
                <Card className="p-4 flex items-center">
                  <Button 
                    onClick={handleApplyFilters}
                    className="w-full gap-2"
                    disabled={!filters.selectedOption}
                  >
                    <Filter className="h-4 w-4" />
                    Apply Filters
                  </Button>
                </Card>
              </div>
            </div>
          </div>

          {/* Main Content */}
          {hasAppliedFilters && (
            <div className="container mx-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-280px)]">
                {/* Sidebar */}
                <div className="lg:col-span-1">
                  <DataSidebar
                    items={sidebarItems}
                    mode={appliedFilters.mode}
                    selectedItem={selectedItem}
                    onItemSelect={handleItemSelect}
                  />
                </div>
                
                {/* Iframe Container */}
                <div className="lg:col-span-2">
                  <IframeContainer selectedData={selectedData} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Index;