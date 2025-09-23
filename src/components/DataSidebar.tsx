import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, BookOpen, Calendar, Clock } from "lucide-react";
import { SidebarItem, SearchMode } from "@/types/data";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DataSidebarProps {
  items: SidebarItem[];
  mode: SearchMode;
  selectedItem: string | null;
  onItemSelect: (item: SidebarItem) => void;
}

export const DataSidebar: React.FC<DataSidebarProps> = ({
  items,
  mode,
  selectedItem,
  onItemSelect,
}) => {
  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col">
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
    <div className="h-full flex flex-col">
      <Card className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 p-4 border-b bg-sidebar-bg">
          <h3 className="font-semibold flex items-center gap-2">
            {mode === "student" ? (
              <>
                <BookOpen className="h-5 w-5" />
                Assignments ({items.length})
              </>
            ) : (
              <>
                <Users className="h-5 w-5" />
                Students ({items.length})
              </>
            )}
          </h3>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {items.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start h-auto p-3 text-left flex-shrink-0",
                  selectedItem === item.id &&
                    "bg-primary/10 text-primary border border-primary/20"
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
                      {format(item.data.timestamp, "MMM d, yyyy")}
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
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
};
