<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { Button } from './ui/button';
	import { Slider } from './ui/slider';
	import {
		audioFile,
		audioUrl,
		isPlaying,
		currentTime,
		duration,
		playbackRate
	} from '../stores';

	let audioElement: HTMLAudioElement | undefined = $state();
	let audioError: string | null = $state(null);
	// 用于追踪用户是否正在拖动进度条，防止音频播放更新与滑块更新产生循环
	let isSeeking = $state(false);
	// 拖动时的本地时间，只在拖动完成后才 seek 音频
	let seekingTime = $state(0);

	const formatTime = (timeInSeconds: number) => {
		if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return '00:00';
		const m = Math.floor(timeInSeconds / 60);
		const s = Math.floor(timeInSeconds % 60);
		return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	};

	const handleFileSelect = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const currentUrl = get(audioUrl);
			if (currentUrl) {
				URL.revokeObjectURL(currentUrl);
			}
			const url = URL.createObjectURL(file);
			audioFile.set(file);
			audioUrl.set(url);
			// 重置状态
			currentTime.set(0);
			duration.set(0);
			isPlaying.set(false);
		}
	};

	const togglePlay = async () => {
		if (!audioElement) return;
		try {
			if (get(isPlaying)) {
				audioElement.pause();
			} else {
				await audioElement.play();
			}
		} catch (error) {
			console.error('Playback error:', error);
			audioError = `播放失败: ${error}`;
		}
	};

	const handleTimeUpdate = () => {
		if (audioElement && !isSeeking) {
			// 直接从audio元素获取当前时间，确保是最新的
			currentTime.set(audioElement.currentTime);
		}
	};

	// 手机端timeupdate更新频率低，使用requestAnimationFrame补充更新
	$effect(() => {
		if (!isSeeking && audioElement && $isPlaying) {
			let rafId: number;
			const updateTime = () => {
				if (audioElement && $isPlaying && !isSeeking) {
					// 直接从audio元素获取最新时间
					currentTime.set(audioElement.currentTime);
					rafId = requestAnimationFrame(updateTime);
				}
			};
			// 启动高频更新
			rafId = requestAnimationFrame(updateTime);
			return () => cancelAnimationFrame(rafId);
		}
	});

	const handleLoadedMetadata = () => {
		if (audioElement) {
			duration.set(audioElement.duration);
			audioError = null;
		}
	};

	const handleEnded = () => {
		isPlaying.set(false);
	};

	// 用户开始拖动进度条
	const handleSeekStart = (event: Event) => {
		isSeeking = true;
		seekingTime = parseFloat((event.target as HTMLInputElement).value);
	};

	// 用户拖动进度条过程中（实时显示时间，但不 seek 音频）
	const handleSeekInput = (event: Event) => {
		seekingTime = parseFloat((event.target as HTMLInputElement).value);
	};

	// 用户松开进度条，实际执行 seek
	const handleSeekEnd = (event: Event) => {
		const val = parseFloat((event.target as HTMLInputElement).value);
		if (audioElement) {
			audioElement.currentTime = val;
		}
		currentTime.set(val);
		// 稍微延迟重置，确保 seek 完成后再恢复 timeupdate 更新
		setTimeout(() => {
			isSeeking = false;
		}, 100);
	};

	// 快进/快退
	const skipBackward = () => {
		if (audioElement) {
			const newTime = Math.max(0, audioElement.currentTime - 5);
			audioElement.currentTime = newTime;
			currentTime.set(newTime);
		}
	};

	const skipForward = () => {
		if (audioElement) {
			const dur = get(duration);
			const newTime = Math.min(dur, audioElement.currentTime + 5);
			audioElement.currentTime = newTime;
			currentTime.set(newTime);
		}
	};

	$effect(() => {
		if (audioElement) {
			audioElement.playbackRate = $playbackRate;
		}
	});

	// 当currentTime被外部更新时（如点击歌词跳转），同步到audio元素
	$effect(() => {
		if (audioElement && !isSeeking) {
			// 只有当差异超过0.2秒时才seek，避免频繁操作
			if (Math.abs(audioElement.currentTime - $currentTime) > 0.2) {
				audioElement.currentTime = $currentTime;
			}
		}
	});

	onDestroy(() => {
		const currentUrl = get(audioUrl);
		if (currentUrl) {
			URL.revokeObjectURL(currentUrl);
		}
	});

	// 当前显示的进度值（拖动时显示 seekingTime，否则显示实际 currentTime）
	const displayTime = $derived(isSeeking ? seekingTime : $currentTime);
</script>

<div class="flex flex-col gap-4 p-4 border rounded-xl bg-card">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">音频控制</h2>
		<div>
			<input
				type="file"
				id="audio-upload"
				accept="audio/mp3,audio/wav,audio/flac,audio/*"
				class="hidden"
				onchange={handleFileSelect}
			/>
			<label
				for="audio-upload"
				class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 cursor-pointer"
			>
				选择音乐
			</label>
		</div>
	</div>

	{#if $audioUrl}
		<!-- 隐藏的 audio 元素 -->
		<audio
			bind:this={audioElement}
			src={$audioUrl}
			preload="metadata"
			onplay={() => isPlaying.set(true)}
			onpause={() => isPlaying.set(false)}
			ontimeupdate={handleTimeUpdate}
			onloadedmetadata={handleLoadedMetadata}
			oncanplay={() => { audioError = null; }}
			onended={handleEnded}
			onerror={(e) => {
				const target = e.target as HTMLAudioElement;
				audioError = `音频播放错误: ${target?.error?.code || '未知'}`;
			}}
		></audio>

		<!-- 显示文件名 -->
		{#if $audioFile}
			<div class="text-sm text-muted-foreground truncate">🎵 {$audioFile.name}</div>
		{/if}

		<!-- 进度条区域 -->
		<div class="flex flex-col gap-1">
			<div class="flex items-center justify-between text-sm tabular-nums text-muted-foreground">
				<span>{formatTime(displayTime)}</span>
				<span>{formatTime($duration)}</span>
			</div>

			<!-- 原生 input range，彻底避免响应式循环 -->
			<input
				type="range"
				min="0"
				max={$duration || 100}
				step="0.1"
				value={displayTime}
				onmousedown={handleSeekStart}
				ontouchstart={handleSeekStart}
				oninput={handleSeekInput}
				onchange={handleSeekEnd}
				onmouseup={handleSeekEnd}
				ontouchend={handleSeekEnd}
				class="w-full h-2 rounded-full accent-primary cursor-pointer"
				style="--slider-progress: {$duration > 0 ? (displayTime / $duration) * 100 : 0}%"
			/>
		</div>

		<!-- 播放控制按钮 -->
		<div class="flex items-center justify-center gap-4">
			<Button variant="outline" size="icon" onclick={skipBackward} title="后退5秒">
				<span class="sr-only">后退5秒</span>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>
			</Button>

			<Button size="icon" class="h-12 w-12 rounded-full" onclick={togglePlay}>
				<span class="sr-only">{$isPlaying ? '暂停' : '播放'}</span>
				{#if $isPlaying}
					<!-- 暂停图标 -->
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
				{:else}
					<!-- 播放图标 -->
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="translate-x-[2px]"><polygon points="6 3 20 12 6 21 6 3"/></svg>
				{/if}
			</Button>

			<Button variant="outline" size="icon" onclick={skipForward} title="前进5秒">
				<span class="sr-only">前进5秒</span>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>
			</Button>
		</div>

		<!-- 倍速控制（保留 Slider，因为倍速不会产生循环） -->
		<div class="flex items-center gap-3">
			<span class="text-xs text-muted-foreground whitespace-nowrap w-16 shrink-0">倍速: {$playbackRate.toFixed(1)}x</span>
			<Slider
				value={[$playbackRate]}
				min={0.5}
				max={2}
				step={0.1}
				onValueChange={(v: number[]) => playbackRate.set(v[0])}
				class="flex-1"
			/>
		</div>
	{:else}
		<div class="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
			<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-2 opacity-50"><path d="M9 18V5l12-2v13"/><path d="m9 9 12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
			<p>暂未选择音乐</p>
			<p class="text-xs mt-1 opacity-60">支持 MP3 / WAV / FLAC</p>
		</div>
	{/if}

	{#if audioError}
		<div class="p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg text-sm">
			{audioError}
		</div>
	{/if}
</div>
