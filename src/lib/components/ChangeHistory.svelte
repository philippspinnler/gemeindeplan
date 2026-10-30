<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { formatChangeTime } from '$lib/dates';
	import ChangeList from './ChangeList.svelte';

	let { changes }: { changes: ComponentProps<typeof ChangeList>['changes'] } = $props();
</script>

{#if changes.length}
	<details class="history no-print">
		<summary>
			Zuletzt geändert {formatChangeTime(changes[0].at)} von {changes[0].userName ?? 'Import'}
			<span class="toggle">Verlauf ({changes.length})</span>
		</summary>
		<div class="panel"><ChangeList {changes} /></div>
	</details>
{/if}

<style>
	.history { margin: -0.5rem 0 1rem; }
	summary { cursor: pointer; color: var(--muted); font-size: 0.9rem; list-style: none; display: flex; flex-wrap: wrap; gap: 0 0.6rem; align-items: baseline; border-radius: var(--radius); }
	summary::-webkit-details-marker { display: none; }
	summary:focus { outline: none; }
	summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
	.toggle { color: var(--primary); }
	.toggle::after { content: ' ▾'; }
	.history[open] .toggle::after { content: ' ▴'; }
	.panel { margin-top: 0.5rem; padding-left: 1rem; border-left: 3px solid var(--line); }
</style>
