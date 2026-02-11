/**
 * Shared logic for synchronizing note data between local and remote sources.
 */

import { Note } from './types';

export const SyncLogic = {
    /**
     * Merges two arrays of notes using timestamps and tombstone flags.
     * @param {Note[]} localNotes - Current local notes (including tombstones)
     * @param {Note[]} remoteNotes - Current remote notes (including tombstones)
     * @returns {Note[]} - The merged result
     */
    mergeNotes(localNotes: Note[], remoteNotes: Note[]): Note[] {
        const mergedMap = new Map<string, Note>();

        // 1. Put all local notes into map
        localNotes.forEach(n => mergedMap.set(n.id, n));

        // 2. Merge remote notes
        remoteNotes.forEach(remoteNote => {
            const localNote = mergedMap.get(remoteNote.id);
            if (!localNote) {
                // Brand new from remote
                mergedMap.set(remoteNote.id, remoteNote);
            } else {
                // Conflict resolution based on updated_at
                const remoteDate = new Date(remoteNote.updated_at);
                const localDate = new Date(localNote.updated_at);

                if (remoteDate > localDate) {
                    // Remote is newer
                    mergedMap.set(remoteNote.id, remoteNote);
                }
            }
        });

        return Array.from(mergedMap.values());
    }
};
