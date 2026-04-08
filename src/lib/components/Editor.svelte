<script lang="ts">
	import {
		parsedLyrics,
		lrcMetadata,
		audioFile,
		selectedLineId,
		currentLineIndex,
		currentTime,
		updateLyricLine,
		addLyricLine,
		insertLyricLine,
		deleteLyricLine,
		clearLyrics
	} from '../stores';
	import { parseLRC, parsePlainText, generateLRC, formatLRCTime } from '../lrc-parser';
	import type { LRCMetadata } from '../lrc-parser';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import { Textarea } from './ui/textarea';
	import * as DropdownMenu from './ui/dropdown-menu';
	import * as Dialog from './ui/dialog';
	import { Label } from './ui/label';
	import { ScrollArea } from './ui/scroll-area';

	let editingLineId: string | null = $state(null);
	let lyricsContainer: HTMLDivElement | undefined = $state();
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	// 元标签编辑 Dialog 状态
	let metadataDialogOpen = $state(false);
	let editingMetadata: LRCMetadata = $state({});

	// 文本输入歌词 Dialog 状态
	let lyricsTextDialogOpen = $state(false);
	let lyricsTextInput = $state('');
	let lyricsTextClipboardError = $state('');

	const openLyricsTextDialog = () => {
		lyricsTextInput = '';
		lyricsTextClipboardError = '';
		lyricsTextDialogOpen = true;
	};

	const handlePasteFromClipboard = async () => {
		lyricsTextClipboardError = '';
		try {
			const text = await navigator.clipboard.readText();
			lyricsTextInput = text;
		} catch {
			lyricsTextClipboardError = '无法读取剪贴板，请手动粘贴（Ctrl+V / ⌘V）';
		}
	};

	const handleImportFromText = () => {
		const content = lyricsTextInput.trim();
		if (!content) return;

		// 自动检测：包含 LRC 时间标签则按 LRC 解析，否则按纯文本解析
		const looksLikeLRC = /\[\d{2}:\d{2}[.:]\d{2,3}\]/.test(content);
		if (looksLikeLRC) {
			const result = parseLRC(content);
			parsedLyrics.set(result.lines);
			lrcMetadata.set(result.metadata);
		} else {
			const lines = parsePlainText(content);
			parsedLyrics.set(lines);
		}
		lyricsTextDialogOpen = false;
		lyricsTextInput = '';
	};

	const openMetadataDialog = () => {
		editingMetadata = { ...$lrcMetadata };
		metadataDialogOpen = true;
	};

	const saveMetadata = () => {
		// 过滤空字符串，不保存空值（offset 为 0 时保留）
		const cleaned: LRCMetadata = {};
		if (editingMetadata.ti?.trim()) cleaned.ti = editingMetadata.ti.trim();
		if (editingMetadata.ar?.trim()) cleaned.ar = editingMetadata.ar.trim();
		if (editingMetadata.al?.trim()) cleaned.al = editingMetadata.al.trim();
		if (editingMetadata.by?.trim()) cleaned.by = editingMetadata.by.trim();
		if (editingMetadata.offset !== undefined && editingMetadata.offset !== null && !isNaN(Number(editingMetadata.offset))) {
			cleaned.offset = Number(editingMetadata.offset);
		}
		lrcMetadata.set(cleaned);
		metadataDialogOpen = false;
	};

	const handleLongPressStart = (e: TouchEvent, id: string) => {
		longPressTimer = setTimeout(() => {
			editingLineId = id;
			selectedLineId.set(id);
			longPressTimer = null;
		}, 500);
	};

	const handleLongPressEnd = () => {
		if (longPressTimer !== null) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	};

	const handleImportFile = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			if (file.name.toLowerCase().endsWith('.lrc')) {
				const result = parseLRC(content);
				parsedLyrics.set(result.lines);
				lrcMetadata.set(result.metadata);
			} else {
				const lines = parsePlainText(content);
				parsedLyrics.set(lines);
			}
			target.value = ''; // 重置 input，允许重新选择同一文件
		};
		reader.readAsText(file, 'utf-8');
	};

	const handleExport = () => {
		if ($parsedLyrics.length === 0) return;
		const content = generateLRC($parsedLyrics, $lrcMetadata);
		const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		// 优先使用 LRC 歌名标签，其次使用音频文件名（去掉扩展名），最后使用默认值
		const audioFileName = $audioFile?.name.replace(/\.[^/.]+$/, '') || '';
		const fileName = $lrcMetadata.ti || audioFileName || 'lyrics';
		a.download = `${fileName}.lrc`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleStampTime = (id: string) => {
		const offsetTime = $currentTime + (($lrcMetadata.offset || 0) / 1000);
		updateLyricLine(id, { time: offsetTime });

		// 自动选择下一行
		const idx = $parsedLyrics.findIndex(l => l.id === id);
		if (idx >= 0 && idx < $parsedLyrics.length - 1) {
			selectedLineId.set($parsedLyrics[idx + 1].id);
		}
	};

	const handleAddInterlude = () => {
		const offsetTime = $currentTime + (($lrcMetadata.offset || 0) / 1000);

		if ($selectedLineId) {
			const idx = $parsedLyrics.findIndex(l => l.id === $selectedLineId);
			if (idx >= 0) {
				insertLyricLine(idx + 1, offsetTime, '♪ 间奏 ♪');
				return;
			}
		}
		addLyricLine(offsetTime, '♪ 间奏 ♪');
	};

	const handleTimeAdjust = (id: string, delta: number) => {
		const line = $parsedLyrics.find(l => l.id === id);
		if (line && line.time >= 0) {
			updateLyricLine(id, { time: Math.max(0, line.time + delta) });
		}
	};

	const scrollToLine = (index: number) => {
		if (!lyricsContainer) return;
		const lines = lyricsContainer.querySelectorAll('.lyric-line');
		if (lines[index]) {
			(lines[index] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	};

	// 自动滚动到当前播放行
	$effect(() => {
		if ($currentLineIndex >= 0 && !$selectedLineId) {
			scrollToLine($currentLineIndex);
		}
	});
</script>

{#snippet triggerButton()}
	<Button variant="outline" size="sm" class="gap-1">
		<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
		添加
	</Button>
{/snippet}

{#snippet moreMenuButton()}
	<Button variant="ghost" size="icon" class="h-7 w-7">
		<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
	</Button>
{/snippet}

<div class="flex flex-col h-full gap-0 border rounded-xl bg-card overflow-hidden">
	<!-- 工具栏 -->
	<div class="p-3 border-b flex flex-wrap items-center gap-2 bg-muted/30 shrink-0">
		<!-- 导入歌词 -->
		<div>
			<input
				type="file"
				id="lyrics-upload"
				accept=".lrc,.txt"
				class="hidden"
				onchange={handleImportFile}
			/>
			<Button variant="outline" size="sm" asChild>
				<label for="lyrics-upload" class="cursor-pointer flex items-center gap-1 whitespace-nowrap">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
					导入文件
				</label>
			</Button>
		</div>

		<!-- 输入/粘贴歌词 -->
		<Button variant="outline" size="sm" onclick={openLyricsTextDialog} class="gap-1 whitespace-nowrap">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
			输入歌词
		</Button>

		<!-- 导出 LRC -->
		<Button
			variant="outline"
			size="sm"
			disabled={$parsedLyrics.length === 0}
			onclick={handleExport}
			class="gap-1"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
			导出 LRC
		</Button>

		<!-- 编辑元信息 -->
		<Button
			variant="outline"
			size="sm"
			onclick={openMetadataDialog}
			class="gap-1"
			title="编辑歌曲信息（ti/ar/al/by/offset）"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
			编辑信息
		</Button>

		<div class="flex-1"></div>

		<!-- 添加行菜单 -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				{@render triggerButton()}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				<DropdownMenu.Item onclick={() => addLyricLine(-1, '')}>
					末尾添加空行
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={handleAddInterlude}>
					插入当前时间间奏
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- 清空歌词 -->
		<Button
			variant="ghost"
			size="icon"
			class="h-8 w-8 text-destructive hover:text-destructive"
			disabled={$parsedLyrics.length === 0}
			onclick={() => {
				if (confirm('确定清空所有歌词吗？')) clearLyrics();
			}}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
		</Button>
	</div>

	<!-- 编辑区域 -->
	<div class="flex-1 overflow-hidden relative">
		{#if $parsedLyrics.length === 0}
			<!-- 空状态提示 -->
			<div class="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-4 text-center gap-3">
				<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mb-1 opacity-20"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
				<p class="font-medium">导入或输入歌词开始编辑</p>
				<p class="text-sm opacity-70">支持导入 .lrc / .txt 文件，或直接输入/粘贴歌词文本</p>
				<div class="flex gap-2 mt-1">
					<label for="lyrics-upload-empty" class="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm bg-background hover:bg-muted transition-colors">
						<input
							type="file"
							id="lyrics-upload-empty"
							accept=".lrc,.txt"
							class="hidden"
							onchange={handleImportFile}
						/>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
						导入文件
					</label>
					<button
						class="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm bg-background hover:bg-muted transition-colors"
						onclick={openLyricsTextDialog}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
						输入/粘贴歌词
					</button>
				</div>
			</div>
		{:else}
			<ScrollArea class="h-full">
				<div class="p-3 flex flex-col gap-0.5 pb-32" bind:this={lyricsContainer}>
					{#each $parsedLyrics as line, i (line.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="lyric-line group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors border border-transparent
								{$currentLineIndex === i ? 'bg-primary/8 border-primary/25' : 'hover:bg-muted/60'}
								{$selectedLineId === line.id ? 'ring-1 ring-primary/40 bg-muted/50' : ''}"
							onclick={(e) => {
								// 如果点击的是时间戳按钮或操作按钮，不做处理（已由各自的onclick处理）
								if (e.target.closest('button')) return;

								// 如果点击的是歌词文本区域且有时间戳，则跳转到该时间点
								if (e.target.closest('.min-w-0') && line.time >= 0) {
									currentTime.set(line.time - (($lrcMetadata.offset || 0) / 1000));
									selectedLineId.set(line.id);
									return;
								}

								// 否则切换选中状态
								if (editingLineId !== line.id) {
									selectedLineId.set($selectedLineId === line.id ? null : line.id);
								}
							}}
						>
							<!-- 时间戳按钮 -->
							<button
								class="w-16 shrink-0 text-left font-mono text-xs rounded px-1 py-0.5 transition-colors
									{line.time >= 0
										? ($currentLineIndex === i
											? 'text-primary font-semibold bg-primary/10'
											: 'text-muted-foreground hover:text-foreground hover:bg-muted')
										: 'text-destructive/70 hover:text-destructive hover:bg-destructive/10'}"
								onclick={(e) => { e.stopPropagation(); handleStampTime(line.id); }}
								title="点击打时间戳"
							>
								{line.time >= 0 ? formatLRCTime(line.time).slice(1, -1) : '⏱ 打点'}
							</button>

							<!-- 歌词内容 -->
							<div
								class="flex-1 min-w-0 cursor-pointer {line.time >= 0 ? '' : 'cursor-default'}"
								title={line.time >= 0 ? '点击跳转到此时间点 · 双击编辑' : '双击编辑'}
								ondblclick={(e) => {
									e.stopPropagation();
									editingLineId = line.id;
									selectedLineId.set(line.id);
								}}
								ontouchstart={(e) => { e.stopPropagation(); handleLongPressStart(e, line.id); }}
								ontouchend={(e) => { e.stopPropagation(); handleLongPressEnd(); }}
								ontouchcancel={(e) => { e.stopPropagation(); handleLongPressEnd(); }}
							>
								{#if editingLineId === line.id}
									<Input
										value={line.text}
										class="h-7 text-sm"
										autofocus
										onblur={(e) => {
											updateLyricLine(line.id, { text: (e.currentTarget as HTMLInputElement).value });
											editingLineId = null;
										}}
										onkeydown={(e) => {
											if (e.key === 'Enter') {
												updateLyricLine(line.id, { text: (e.currentTarget as HTMLInputElement).value });
												editingLineId = null;
											} else if (e.key === 'Escape') {
												editingLineId = null;
											}
										}}
									/>
								{:else}
									<div class="truncate text-sm
										{line.isInterlude ? 'text-primary/60 italic' : ''}
										{$currentLineIndex === i ? 'font-semibold' : ''}
										{!line.text ? 'text-muted-foreground/50' : ''}
									">
										{line.text || '(空行)'}
									</div>
								{/if}
							</div>

							<!-- 行操作按钮（hover 或选中时显示） -->
							<div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity
								{$selectedLineId === line.id ? '!opacity-100' : ''}">
								{#if line.time >= 0}
									<button
										class="inline-flex items-center justify-center h-6 w-6 rounded text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
										onclick={(e) => { e.stopPropagation(); handleTimeAdjust(line.id, -0.1); }}
										title="提前 0.1 秒"
									>
										−
									</button>
									<button
										class="inline-flex items-center justify-center h-6 w-6 rounded text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
										onclick={(e) => { e.stopPropagation(); handleTimeAdjust(line.id, 0.1); }}
										title="延后 0.1 秒"
									>
										+
									</button>
								{/if}

								<!-- 更多操作菜单 -->
								<DropdownMenu.Root>
									<DropdownMenu.Trigger asChild onclick={(e: Event) => e.stopPropagation()}>
										{@render moreMenuButton()}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content>
										<DropdownMenu.Item onclick={() => {
											editingLineId = line.id;
											selectedLineId.set(line.id);
										}}>
											编辑文本
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => updateLyricLine(line.id, { time: -1 })}>
											清除时间戳
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item onclick={() => insertLyricLine(i, line.time, '')}>
											在此前插入空行
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => insertLyricLine(i + 1, line.time, '')}>
											在此后插入空行
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => insertLyricLine(i + 1, $currentTime, '♪ 间奏 ♪')}>
											在此后插入间奏
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											class="text-destructive focus:text-destructive"
											onclick={() => deleteLyricLine(line.id)}
										>
											删除此行
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
						</div>
					{/each}
				</div>
			</ScrollArea>
		{/if}
	</div>

	<!-- 底部快捷操作栏（当有歌词时显示） -->
	{#if $parsedLyrics.length > 0}
		<div class="p-2 border-t bg-muted/20 shrink-0 flex items-center justify-between text-xs text-muted-foreground">
			<span>共 {$parsedLyrics.length} 行</span>
			<span>点击时间戳打点 · 点击文字跳转 · 双击/长按编辑</span>
		</div>
	{/if}
</div>

<!-- 编辑元信息 Dialog -->
<Dialog.Root bind:open={metadataDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>编辑歌曲信息</Dialog.Title>
				<Dialog.Description>
					编辑 LRC 文件的元标签信息，这些信息会写入导出的 .lrc 文件中。
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-4 py-4">
				<!-- 歌曲名 ti -->
				<div class="grid grid-cols-4 items-center gap-4">
					<Label for="meta-ti" class="text-right text-sm">歌曲名</Label>
					<div class="col-span-3">
						<Input
							id="meta-ti"
							placeholder="[ti:歌曲名]"
							bind:value={editingMetadata.ti}
						/>
					</div>
				</div>

				<!-- 歌手名 ar -->
				<div class="grid grid-cols-4 items-center gap-4">
					<Label for="meta-ar" class="text-right text-sm">歌手名</Label>
					<div class="col-span-3">
						<Input
							id="meta-ar"
							placeholder="[ar:歌手名]"
							bind:value={editingMetadata.ar}
						/>
					</div>
				</div>

				<!-- 专辑名 al -->
				<div class="grid grid-cols-4 items-center gap-4">
					<Label for="meta-al" class="text-right text-sm">专辑名</Label>
					<div class="col-span-3">
						<Input
							id="meta-al"
							placeholder="[al:专辑名]"
							bind:value={editingMetadata.al}
						/>
					</div>
				</div>

				<!-- 制作者 by -->
				<div class="grid grid-cols-4 items-center gap-4">
					<Label for="meta-by" class="text-right text-sm">制作者</Label>
					<div class="col-span-3">
						<Input
							id="meta-by"
							placeholder="[by:制作者]"
							bind:value={editingMetadata.by}
						/>
					</div>
				</div>

				<!-- 时间补偿 offset -->
				<div class="grid grid-cols-4 items-center gap-4">
					<Label for="meta-offset" class="text-right text-sm">时间补偿</Label>
					<div class="col-span-3">
						<Input
							id="meta-offset"
							type="number"
							placeholder="[offset:0]（单位：毫秒）"
							value={editingMetadata.offset ?? ''}
							oninput={(e) => {
								const val = (e.currentTarget as HTMLInputElement).value;
								editingMetadata.offset = val === '' ? undefined : parseInt(val, 10);
							}}
						/>
					</div>
				</div>
			</div>

			<Dialog.Footer>
				<Dialog.Close asChild>
					<Button variant="outline">取消</Button>
				</Dialog.Close>
				<Button onclick={saveMetadata}>保存</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- 输入/粘贴歌词 Dialog -->
<Dialog.Root bind:open={lyricsTextDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg max-h-[90dvh] flex flex-col">
			<Dialog.Header class="shrink-0">
				<Dialog.Title>输入歌词</Dialog.Title>
				<Dialog.Description>
					将歌词文本粘贴或输入到下方文本框。支持 LRC 格式（含时间标签）和纯文本格式（每行一句歌词）。
				</Dialog.Description>
			</Dialog.Header>

			<div class="flex flex-col gap-3 py-3 overflow-y-auto flex-1 min-h-0">
				<!-- 剪贴板粘贴按钮 -->
				<div class="flex items-center gap-2 shrink-0">
					<Button variant="outline" size="sm" onclick={handlePasteFromClipboard} class="gap-1.5">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
						从剪贴板粘贴
					</Button>
					{#if lyricsTextClipboardError}
						<span class="text-xs text-destructive">{lyricsTextClipboardError}</span>
					{/if}
				</div>

				<!-- 歌词文本输入框 -->
				<Textarea
					bind:value={lyricsTextInput}
					placeholder={"在此粘贴或输入歌词...\n\n支持 LRC 格式：\n[00:12.34]歌词内容\n\n或纯文本格式（每行一句）：\n第一行歌词\n第二行歌词"}
					class="min-h-[180px] flex-1 font-mono text-sm resize-none"
				/>

				<p class="text-xs text-muted-foreground shrink-0">
					提示：含 <code class="bg-muted px-1 rounded">[分:秒.毫秒]</code> 时间标签则按 LRC 解析，否则按纯文本每行分割。
				</p>
			</div>

			<Dialog.Footer class="shrink-0">
				<Dialog.Close asChild>
					<Button variant="outline">取消</Button>
				</Dialog.Close>
				<Button
					onclick={handleImportFromText}
					disabled={!lyricsTextInput.trim()}
				>
					导入歌词
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
