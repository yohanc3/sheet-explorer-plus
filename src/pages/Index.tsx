import React, { useState, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Filter, Download } from "lucide-react";
import { FileUpload } from "@/components/FileUpload";
import { ModeToggle } from "@/components/ModeToggle";
import { SearchWithAutocomplete } from "@/components/SearchWithAutocomplete";
import { DateFilters } from "@/components/DateFilters";
import { DataSidebar } from "@/components/DataSidebar";
import { NotebookRenderer } from "@/components/NotebookRenderer";
import {
  AssignmentData,
  ParsedData,
  FilterState,
  SidebarItem,
  NotebookData,
  NotebookCell,
} from "@/types/data";
import {
  extractFileIdFromUrl,
  downloadNotebook,
} from "@/utils/notebookDownloader";
import { toast } from "@/hooks/use-toast";
import heroImage from "@/assets/hero-dashboard.jpg";
import { excelSerialToDate } from "@/lib/utils";

// Class definitions - should match DataSidebar
const CLASS_DEFINITIONS = [
  {
    id: "cs127-fall2025",
    name: "CS 127 - Fall 2025",
    students: [
      "Nisha Ajana",
      "Anna Beckman",
      "Richard Bofeko",
      "Joe Castaneda",
      "Selina Dai",
      "Roman Flores",
      "Layah Glover",
      "Jaxson Goodrich",
      "Miles Kallsen",
      "Zayd Khan",
      "Anastasia Lamberes",
      "Edgar Linares",
      "Ruby Lipscomb",
      "Laura Mahlum",
      "Angel Mendez",
      "Chris Mueller",
      "Malika Mukanbaeva",
      "Bryce Nicolas-Penn",
      "Nathan Nicolas",
      "David Pina",
      "Brookly Pottie",
      "Alexis Ramirez",
      "Ahmad Shahroz",
      "Daniel Smazil",
      "Javon Smith",
      "Karl Swanson",
      "Corey Tucker",
    ],
  },
];

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawData, setRawData] = useState<ParsedData[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    mode: "student",
    searchQuery: "",
    selectedOption: "",
    startDate: undefined,
    endDate: undefined,
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    mode: "student",
    searchQuery: "",
    selectedOption: "",
    startDate: undefined,
    endDate: undefined,
  });
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<ParsedData | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [notebookData, setNotebookData] = useState<NotebookData>({});
  const [currentNotebook, setCurrentNotebook] = useState<{
    cells: NotebookCell[];
    isLoading: boolean;
    error?: string;
  } | null>(null);

  const parseExcelFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData: AssignmentData[] = XLSX.utils.sheet_to_json(worksheet);

      const parsedData: ParsedData[] = jsonData.map((row, index) => {
        // Handle different timestamp formats
        const timestamp: Date = excelSerialToDate(row.Timestamp) || new Date();

        let first_name = "";
        let last_name = "";
        if (typeof row.first_name === "string")
          first_name = row.first_name.trim();
        if (typeof row.last_name === "string") last_name = row.last_name.trim();

        return {
          ...row,
          timestamp,
          fullName: `${first_name} ${last_name}`.trim(),
          title: row.title || "",
          first_name: first_name,
          last_name: last_name,
          time: row.time || "",
          difficulty: row.difficulty || "",
          confident: row.confident || "",
          needswork: row.needswork || "",
          suggestions: row.suggestions || "",
          corrections: row.corrections || "",
          locals: row.locals || "",
          share: row.share || "",
        };
      });

      setRawData(parsedData);
      toast({
        title: "File Processed Successfully",
        description: `Loaded ${parsedData.length} assignment records`,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        title: "Processing Error",
        description:
          "Failed to process the Excel file. Please check the format.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleFileUpload = useCallback(
    (file: File) => {
      setUploadedFile(file);
      parseExcelFile(file);
    },
    [parseExcelFile]
  );

  const handleClearFile = useCallback(() => {
    setUploadedFile(null);
    setRawData([]);
    setFilters({
      mode: "student",
      searchQuery: "",
      selectedOption: "",
      startDate: undefined,
      endDate: undefined,
    });
    setAppliedFilters({
      mode: "student",
      searchQuery: "",
      selectedOption: "",
      startDate: undefined,
      endDate: undefined,
    });
    setSelectedItem(null);
    setSelectedData(null);
    setSelectedClass(null);
    setNotebookData({});
    setCurrentNotebook(null);
  }, []);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({ ...filters });
    setSelectedItem(null);
    setSelectedData(null);
    setCurrentNotebook(null);
  }, [filters]);

  const handleClassSelect = useCallback((classId: string | null) => {
    setSelectedClass(classId);
    setSelectedItem(null);
    setSelectedData(null);
    setCurrentNotebook(null);
  }, []);

  const filteredData = useMemo(() => {
    let filtered = rawData;

    // Apply date filters
    if (appliedFilters.startDate) {
      filtered = filtered.filter(
        (item) => item.timestamp >= appliedFilters.startDate!
      );
    }
    if (appliedFilters.endDate) {
      filtered = filtered.filter(
        (item) => item.timestamp <= appliedFilters.endDate!
      );
    }

    // Apply selection filter
    if (appliedFilters.selectedOption) {
      if (appliedFilters.mode === "student") {
        filtered = filtered.filter(
          (item) => item.fullName === appliedFilters.selectedOption
        );
      } else {
        filtered = filtered.filter(
          (item) => item.title === appliedFilters.selectedOption
        );
      }
    }

    return filtered;
  }, [rawData, appliedFilters]);

  const sidebarItems: SidebarItem[] = useMemo(() => {
    if (appliedFilters.mode === "student") {
      // In student mode, just show assignments normally
      return filteredData.map((item, index) => ({
        id: `${appliedFilters.mode}-${index}`,
        label: item.title,
        data: item,
      }));
    } else {
      // In assignment mode, group by student name and track attempts
      const studentGroups: { [fullName: string]: ParsedData[] } = {};

      filteredData.forEach((item) => {
        if (!studentGroups[item.fullName]) {
          studentGroups[item.fullName] = [];
        }
        studentGroups[item.fullName].push(item);
      });

      const items: SidebarItem[] = [];
      Object.entries(studentGroups).forEach(([fullName, attempts]) => {
        if (attempts.length === 1) {
          // Single attempt - show normally
          items.push({
            id: `assignment-${fullName}-0`,
            label: fullName,
            data: attempts[0],
          });
        } else {
          // Multiple attempts - show with attempt numbers
          attempts.forEach((attempt, index) => {
            items.push({
              id: `assignment-${fullName}-${index}`,
              label: `${fullName} (Attempt ${index + 1})`,
              data: attempt,
            });
          });
        }
      });

      // Apply the same sorting logic as DataSidebar when a class is selected
      if (selectedClass && appliedFilters.mode === "assignment") {
        const selectedClassDef = CLASS_DEFINITIONS.find(
          (c) => c.id === selectedClass
        );
        if (selectedClassDef) {
          // Filter items by class and sort by class definition order
          const filteredByClass = items.filter((item) =>
            selectedClassDef.students.includes(item.data.fullName)
          );

          const sortedItems = filteredByClass.sort((a, b) => {
            const indexA = selectedClassDef.students.indexOf(a.data.fullName);
            const indexB = selectedClassDef.students.indexOf(b.data.fullName);
            return indexA - indexB;
          });

          return sortedItems;
        }
      }

      return items;
    }
  }, [filteredData, appliedFilters.mode, selectedClass]);

  const handleItemSelect = useCallback(
    async (item: SidebarItem) => {
      setSelectedItem(item.id);
      setSelectedData(item.data);

      // Check if we already have this notebook data
      const notebookId = `${item.data.fullName}-${item.data.title}`;
      if (notebookData[notebookId]) {
        setCurrentNotebook(notebookData[notebookId]);
        return;
      }

      // Extract file ID from the share URL
      const fileId = extractFileIdFromUrl(item.data.share);
      if (!fileId) {
        setCurrentNotebook({
          cells: [],
          isLoading: false,
          error: "Invalid Google Colab URL - cannot extract file ID",
        });
        return;
      }

      // Set loading state
      const loadingState = { cells: [], isLoading: true };
      setCurrentNotebook(loadingState);
      setNotebookData((prev) => ({ ...prev, [notebookId]: loadingState }));

      try {
        // Download and parse the notebook
        const cells = await downloadNotebook(fileId);
        const successState = { cells, isLoading: false };

        setCurrentNotebook(successState);
        setNotebookData((prev) => ({ ...prev, [notebookId]: successState }));
      } catch (error) {
        const errorState = {
          cells: [],
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to download notebook",
        };

        setCurrentNotebook(errorState);
        setNotebookData((prev) => ({ ...prev, [notebookId]: errorState }));
      }
    },
    [notebookData]
  );

  // Navigation for quick grading
  const handleNavigatePrevious = useCallback(() => {
    const currentIndex = sidebarItems.findIndex(
      (item) => item.id === selectedItem
    );
    if (currentIndex > 0) {
      const previousItem = sidebarItems[currentIndex - 1];
      handleItemSelect(previousItem);
    }
  }, [sidebarItems, selectedItem, handleItemSelect]);

  const handleNavigateNext = useCallback(() => {
    const currentIndex = sidebarItems.findIndex(
      (item) => item.id === selectedItem
    );
    if (currentIndex < sidebarItems.length - 1) {
      const nextItem = sidebarItems[currentIndex + 1];
      handleItemSelect(nextItem);
    }
  }, [sidebarItems, selectedItem, handleItemSelect]);

  const canNavigatePrevious = useMemo(() => {
    const currentIndex = sidebarItems.findIndex(
      (item) => item.id === selectedItem
    );
    return currentIndex > 0;
  }, [sidebarItems, selectedItem]);

  const canNavigateNext = useMemo(() => {
    const currentIndex = sidebarItems.findIndex(
      (item) => item.id === selectedItem
    );
    return currentIndex < sidebarItems.length - 1 && currentIndex !== -1;
  }, [sidebarItems, selectedItem]);

  const hasData = rawData.length > 0;
  const hasAppliedFilters = appliedFilters.selectedOption !== "";

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
                Upload and analyze student assignment data with advanced
                filtering
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
                  onChange={(mode) =>
                    setFilters((prev) => ({
                      ...prev,
                      mode,
                      searchQuery: "",
                      selectedOption: "",
                    }))
                  }
                />

                <SearchWithAutocomplete
                  data={rawData}
                  mode={filters.mode}
                  searchQuery={filters.searchQuery}
                  selectedOption={filters.selectedOption}
                  onSearchChange={(query) =>
                    setFilters((prev) => ({ ...prev, searchQuery: query }))
                  }
                  onOptionSelect={(option) =>
                    setFilters((prev) => ({ ...prev, selectedOption: option }))
                  }
                />

                <DateFilters
                  startDate={filters.startDate}
                  endDate={filters.endDate}
                  onStartDateChange={(date) =>
                    setFilters((prev) => ({ ...prev, startDate: date }))
                  }
                  onEndDateChange={(date) =>
                    setFilters((prev) => ({ ...prev, endDate: date }))
                  }
                />

                <Card className="p-4 flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-2 w-2 rounded-full bg-accent"></div>
                    <label className="text-sm font-medium">Apply Changes</label>
                  </div>
                  <div className="flex flex-1 items-center">
                    <Button
                      onClick={handleApplyFilters}
                      className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
                      disabled={!filters.selectedOption}
                    >
                      <Filter className="h-4 w-4" />
                      Apply Filters
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* Main Content */}
          {hasAppliedFilters && (
            <div className="container mx-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sidebar */}
                <div className="lg:col-span-1">
                  <DataSidebar
                    items={sidebarItems}
                    mode={appliedFilters.mode}
                    selectedItem={selectedItem}
                    selectedClass={selectedClass}
                    onItemSelect={handleItemSelect}
                    onClassSelect={handleClassSelect}
                    allData={rawData}
                    selectedAssignment={appliedFilters.selectedOption}
                  />
                </div>

                {/* Notebook Renderer */}
                <div className="lg:col-span-2">
                  <NotebookRenderer
                    cells={currentNotebook?.cells || []}
                    isLoading={currentNotebook?.isLoading || false}
                    error={currentNotebook?.error}
                    studentName={selectedData?.fullName}
                    assignmentTitle={selectedData?.title}
                    notebookUrl={selectedData?.share}
                    onNavigatePrevious={handleNavigatePrevious}
                    onNavigateNext={handleNavigateNext}
                    canNavigatePrevious={canNavigatePrevious}
                    canNavigateNext={canNavigateNext}
                  />
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