import React, { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, BookOpen, Calendar, Clock, GraduationCap } from "lucide-react";
import {
  SidebarItem,
  SearchMode,
  ClassDefinition,
  ParsedData,
} from "@/types/data";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";

// Fuzzy name matching utility
const matchesStudentName = (
  rosterName: string,
  submittedFullName: string
): boolean => {
  // Common name suffixes to ignore when extracting last name
  const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'jr.', 'sr.'];

  // Split both names into parts
  const rosterParts = rosterName.trim().split(/\s+/);
  const submittedParts = submittedFullName.trim().split(/\s+/);

  // Need at least first and last name
  if (rosterParts.length < 2 || submittedParts.length < 2) {
    return rosterName.toLowerCase() === submittedFullName.toLowerCase();
  }

  // Helper function to extract last name, ignoring suffixes
  const getLastName = (parts: string[]): string => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].toLowerCase().replace(/[.,]/g, '');
      if (!suffixes.includes(part)) {
        return parts[i].toLowerCase();
      }
    }
    return parts[parts.length - 1].toLowerCase();
  };

  // Extract first and last names from roster
  const rosterFirstName = rosterParts[0].toLowerCase();
  const rosterLastName = getLastName(rosterParts);

  // Extract first and last names from submission
  const submittedFirstName = submittedParts[0].toLowerCase();
  const submittedLastName = getLastName(submittedParts);

  // Check if roster first name is contained in submitted first name
  // and roster last name is contained in submitted last name
  const firstNameMatches = submittedFirstName.includes(rosterFirstName) || rosterFirstName.includes(submittedFirstName);
  const lastNameMatches = submittedLastName.includes(rosterLastName) || rosterLastName.includes(submittedLastName);

  return firstNameMatches && lastNameMatches;
};

interface DataSidebarProps {
  items: SidebarItem[];
  mode: SearchMode;
  selectedItem: string | null;
  selectedClass: string | null;
  onItemSelect: (item: SidebarItem) => void;
  onClassSelect: (classId: string | null) => void;
  allData?: ParsedData[];
  selectedAssignment?: string;
}

const CLASS_DEFINITIONS: ClassDefinition[] = [
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

export const DataSidebar: React.FC<DataSidebarProps> = ({
  items,
  mode,
  selectedItem,
  selectedClass,
  onItemSelect,
  onClassSelect,
  allData = [],
  selectedAssignment,
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);

  // Scroll to selected item when it changes
  useEffect(() => {
    if (selectedButtonRef.current && scrollAreaRef.current) {
      selectedButtonRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [selectedItem]);

  // Filter items based on selected class when in assignment mode
  const filteredItems = React.useMemo(() => {
    if (mode !== "assignment" || !selectedClass) {
      return items;
    }

    const selectedClassDef = CLASS_DEFINITIONS.find(
      (c) => c.id === selectedClass
    );
    if (!selectedClassDef) {
      return items;
    }

    const filteredByClass = items.filter((item) => {
      return selectedClassDef.students.some((rosterName) =>
        matchesStudentName(rosterName, item.data.fullName)
      );
    });

    // Sort by the order in the class definition
    return filteredByClass.sort((a, b) => {
      // Find the matching roster name for each item
      const rosterNameA = selectedClassDef.students.find((rosterName) =>
        matchesStudentName(rosterName, a.data.fullName)
      );
      const rosterNameB = selectedClassDef.students.find((rosterName) =>
        matchesStudentName(rosterName, b.data.fullName)
      );

      const indexA = rosterNameA ? selectedClassDef.students.indexOf(rosterNameA) : -1;
      const indexB = rosterNameB ? selectedClassDef.students.indexOf(rosterNameB) : -1;
      return indexA - indexB;
    });
  }, [items, mode, selectedClass]);

  // Find possible matches - students with matching last names but different first names
  const possibleMatches = React.useMemo(() => {
    if (mode !== "assignment" || !selectedClass || !selectedAssignment) {
      return [];
    }

    const selectedClassDef = CLASS_DEFINITIONS.find(
      (c) => c.id === selectedClass
    );
    if (!selectedClassDef) {
      return [];
    }

    // Get last names of students already shown in filteredItems
    const existingStudentNames = new Set(
      filteredItems.map((item) => item.data.fullName)
    );

    // Get last names from the class definition (CS 127 students)
    const classLastNames = new Set(
      selectedClassDef.students.map((studentName) => {
        const parts = studentName.trim().split(" ");
        return parts[parts.length - 1].toLowerCase(); // Get last name
      })
    );

    // Find students in allData with matching assignment + matching last name from class roster + different first name
    const matches = allData.filter((data) => {
      // Must have the same assignment
      if (data.title !== selectedAssignment) return false;

      // Must not already be in the main list
      if (existingStudentNames.has(data.fullName)) return false;

      // Must have a matching last name with someone in the class roster
      const dataLastName = data.last_name.toLowerCase();
      return classLastNames.has(dataLastName);
    });

    // Convert to SidebarItems
    return matches.map((data, index) => ({
      id: `possible-match-${data.fullName}-${index}`,
      label: `${data.fullName} (Possible match)`,
      data,
    }));
  }, [mode, selectedClass, selectedAssignment, allData, filteredItems]);

  if (filteredItems.length === 0 && possibleMatches.length === 0) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
        <Card className="h-full flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground">
            <div className="mb-4">
              {mode === "student" ? (
                <BookOpen className="h-12 w-12 mx-auto opacity-50" />
              ) : (
                <Users className="h-12 w-12 mx-auto opacity-50" />
              )}
            </div>
            <p className="text-lg font-medium">No Results</p>
            <p className="text-sm">
              {mode === "student"
                ? "Select a student to see their assignments"
                : "Select an assignment to see student submissions"}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
      <Card className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 p-4 border-b bg-sidebar-bg space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            {mode === "student" ? (
              <>
                <BookOpen className="h-5 w-5" />
                Assignments ({filteredItems.length})
              </>
            ) : (
              <>
                <Users className="h-5 w-5" />
                Students ({filteredItems.length})
              </>
            )}
          </h3>

          {mode === "assignment" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <GraduationCap className="h-4 w-4" />
                Filter by Class
              </div>
              <Select
                value={selectedClass || "all"}
                onValueChange={(value) =>
                  onClassSelect(value === "all" ? null : value)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Students" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  {CLASS_DEFINITIONS.map((classDef) => (
                    <SelectItem key={classDef.id} value={classDef.id}>
                      {classDef.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="p-2 space-y-1">
            {filteredItems.map((item) => (
              <Button
                key={item.id}
                ref={selectedItem === item.id ? selectedButtonRef : undefined}
                variant="ghost"
                className={cn(
                  "w-full justify-start h-auto p-3 text-left flex-shrink-0",
                  selectedItem === item.id &&
                    "bg-accent/10 text-accent border border-accent/30 shadow-sm font-medium"
                )}
                onClick={() => onItemSelect(item)}
              >
                <div className="w-full">
                  <div className="font-medium line-clamp-2 mb-1">
                    {item.label}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatInTimeZone(
                        item.data.timestamp,
                        "America/Chicago",
                        "MMM d, yyyy h:mma"
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.data.time}
                    </div>
                  </div>
                  {mode === "assignment" && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Difficulty: {item.data.difficulty}
                    </div>
                  )}
                </div>
              </Button>
            ))}

            {possibleMatches.length > 0 && (
              <>
                {filteredItems.length > 0 && (
                  <div className="px-1 py-2">
                    <Separator />
                  </div>
                )}
                <div className="px-1 py-2">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-3 w-3" />
                    Possible matches ({possibleMatches.length})
                  </div>
                </div>
                {possibleMatches.map((item) => (
                  <Button
                    key={item.id}
                    ref={selectedItem === item.id ? selectedButtonRef : undefined}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start h-auto p-3 text-left flex-shrink-0 opacity-75",
                      selectedItem === item.id &&
                        "bg-accent/10 text-accent border border-accent/30 opacity-100 shadow-sm font-medium"
                    )}
                    onClick={() => onItemSelect(item)}
                  >
                    <div className="w-full">
                      <div className="font-medium line-clamp-2 mb-1">
                        {item.label}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatInTimeZone(
                            item.data.timestamp,
                            "America/Chicago",
                            "MMM d, yyyy h:mma"
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {item.data.time}
                        </div>
                      </div>
                      {mode === "assignment" && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Difficulty: {item.data.difficulty}
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
};
