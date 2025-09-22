export interface AssignmentData {
  timestamp: string;
  title: string;
  first_name: string;
  last_name: string;
  time: string;
  difficulty: string;
  confident: string;
  needswork: string;
  suggestions: string;
  corrections: string;
  locals: string;
  share: string;
}

export interface ParsedData {
  timestamp: Date;
  title: string;
  first_name: string;
  last_name: string;
  time: string;
  difficulty: string;
  confident: string;
  needswork: string;
  suggestions: string;
  corrections: string;
  locals: string;
  share: string;
  fullName: string;
}

export type SearchMode = 'student' | 'assignment';

export interface FilterState {
  mode: SearchMode;
  searchQuery: string;
  selectedOption: string;
  startDate?: Date;
  endDate?: Date;
}

export interface SidebarItem {
  id: string;
  label: string;
  data: ParsedData;
}

export interface NotebookData {
  [assignmentId: string]: {
    cells: NotebookCell[];
    isLoading: boolean;
    error?: string;
  };
}

export interface NotebookCell {
  cell_type: 'markdown' | 'code';
  content: string;
}