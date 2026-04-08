<script lang="ts">
	import Player from './lib/components/Player.svelte';
	import Editor from './lib/components/Editor.svelte';
</script>

<div class="h-dvh flex flex-col bg-background text-foreground max-w-2xl mx-auto md:p-4">
	<header class="p-4 border-b md:border-b-0 md:mb-4 flex items-center justify-between shrink-0">
		<h1 class="text-xl font-bold flex items-center gap-2">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-music"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
			LRC 编辑器
		</h1>
		<div class="text-xs text-muted-foreground"></div>
	</header>

	<main class="flex-1 flex flex-col gap-4 p-4 md:p-0 overflow-hidden">
		<div class="shrink-0">
			<Player />
		</div>
		<div class="flex-1 overflow-hidden min-h-[300px]">
			<Editor />
		</div>
	</main>
</div>
