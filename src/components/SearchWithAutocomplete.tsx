import React, { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ParsedData, SearchMode } from '@/types/data';
import { cn } from '@/lib/utils';

interface SearchWithAutocompleteProps {
  data: ParsedData[];
  mode: SearchMode;
  searchQuery: string;
  selectedOption: string;
  onSearchChange: (query: string) => void;
  onOptionSelect: (option: string) => void;
}

export const SearchWithAutocomplete: React.FC<SearchWithAutocompleteProps> = ({
  data,
  mode,
  searchQuery,
  selectedOption,
  onSearchChange,
  onOptionSelect,
}) => {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    if (mode === 'student') {
      const names = new Set<string>();
      data.forEach(item => {
        if (item.fullName.toLowerCase().includes(searchQuery.toLowerCase())) {
          names.add(item.fullName);
        }
      });
      return Array.from(names).sort();
    } else {
      const titles = new Set<string>();
      data.forEach(item => {
        if (item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
          titles.add(item.title);
        }
      });
      return Array.from(titles).sort();
    }
  }, [data, mode, searchQuery]);

  const placeholder = mode === 'student' 
    ? 'Search by student name...' 
    : 'Search by assignment title...';

  return (
    <Card className="p-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">
          {mode === 'student' ? 'Search Students' : 'Search Assignments'}
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className={cn(
                  selectedOption ? "text-foreground" : "text-muted-foreground"
                )}>
                  {selectedOption || placeholder}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput
                placeholder={placeholder}
                value={searchQuery}
                onValueChange={onSearchChange}
              />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  {options.slice(0, 100).map((option) => (
                    <CommandItem
                      key={option}
                      onSelect={() => {
                        onOptionSelect(option);
                        setOpen(false);
                      }}
                    >
                      {option}
                    </CommandItem>
                  ))}
                  {options.length > 100 && (
                    <CommandItem disabled>
                      ... and {options.length - 100} more results
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </Card>
  );
};