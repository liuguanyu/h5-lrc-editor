import { writable, derived } from 'svelte/store';
import type { LyricLine, LRCMetadata } from './lrc-parser';
import { generateLyricId } from './lrc-parser';

// Audio Context State
export const audioFile = writable<File | null>(null);
export const audioUrl = writable<string | null>(null);
export const isPlaying = writable<boolean>(false);
export const currentTime = writable<number>(0);
export const duration = writable<number>(0);
export const playbackRate = writable<number>(1);

// Lyrics State
export const parsedLyrics = writable<LyricLine[]>([]);
export const lrcMetadata = writable<LRCMetadata>({});
export const selectedLineId = writable<string | null>(null);

// Derived stores
export const hasAudio = derived(audioUrl, ($url) => $url !== null);
export const hasLyrics = derived(parsedLyrics, ($lyrics) => $lyrics.length > 0);
export const currentLineIndex = derived(
	[parsedLyrics, currentTime, lrcMetadata],
	([$lyrics, $time, $metadata]) => {
		if ($lyrics.length === 0) return -1;
		const offsetTime = $time + (($metadata.offset || 0) / 1000);
		
		// Find the last line whose time is less than or equal to current time
		let idx = -1;
		for (let i = 0; i < $lyrics.length; i++) {
			if ($lyrics[i].time !== -1 && $lyrics[i].time <= offsetTime) {
				idx = i;
			}
		}
		return idx;
	}
);

// Actions
export const updateLyricLine = (id: string, updates: Partial<LyricLine>) => {
	parsedLyrics.update(lines => {
		const idx = lines.findIndex(l => l.id === id);
		if (idx === -1) return lines;
		
		const newLines = [...lines];
		newLines[idx] = { ...newLines[idx], ...updates };
		return newLines;
	});
};

export const addLyricLine = (time: number, text: string = '') => {
	const id = generateLyricId();
	parsedLyrics.update(lines => {
		const newLine: LyricLine = { id, time, text, isInterlude: text === '♪ 间奏 ♪' };
		// Sort by time if time is valid
		if (time >= 0) {
			const newLines = [...lines, newLine];
			return newLines.sort((a, b) => {
				if (a.time === -1) return 1;
				if (b.time === -1) return -1;
				return a.time - b.time;
			});
		} else {
			return [...lines, newLine];
		}
	});
	return id;
};

export const insertLyricLine = (index: number, time: number, text: string = '') => {
    const id = generateLyricId();
    parsedLyrics.update(lines => {
        const newLine: LyricLine = { id, time, text, isInterlude: text === '♪ 间奏 ♪' };
        const newLines = [...lines];
        newLines.splice(index, 0, newLine);
        return newLines;
    });
    return id;
};

export const deleteLyricLine = (id: string) => {
	parsedLyrics.update(lines => lines.filter(l => l.id !== id));
};

export const clearLyrics = () => {
	parsedLyrics.set([]);
	lrcMetadata.set({});
	selectedLineId.set(null);
};
