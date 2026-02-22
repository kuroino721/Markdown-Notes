export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  color?: string;
  deleted?: boolean;
  window_state?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Adapter {
  // Data operations
  getNotes(): Promise<Note[]>;
  getNote(noteId: string): Promise<Note | null>;
  createNote(): Promise<Note>;
  saveNote(note: Note): Promise<any>;
  deleteNote(noteId: string): Promise<void>;
  deleteNotes(noteIds: string[]): Promise<void>;

  // Sync operations
  initSync(): Promise<void>;
  getUserInfo(): Promise<any>;
  signOut(): Promise<void>;
  signIn(): Promise<void>;
  syncWithDrive(): Promise<void>;
  isSyncEnabled(): boolean;

  // UI/Window operations
  openNote(id: string): Promise<void>;
  confirm(message: string, options?: any): Promise<boolean>;
  setWindowTitle(title: string): Promise<void>;
  closeWindow(): Promise<void>;

  // Window events
  onWindowMoved(callback: (payload: any) => void): () => void;
  onWindowResized(callback: (payload: any) => void): () => void;
  getWindowPosition(): Promise<{ x: number; y: number }>;
  getWindowSize(): Promise<{ width: number; height: number }>;
  updateWindowState(
    noteId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void>;

  // Events
  onFileOpen(callback: (payload: any) => void): () => void;
  readTextFile(path: string): Promise<string>;
}
