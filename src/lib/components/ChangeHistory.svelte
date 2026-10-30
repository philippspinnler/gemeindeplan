<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { formatChangeTime } from '$lib/dates';
	import ChangeList from './ChangeList.svelte';

	let { changes }: { changes: ComponentProps<typeof ChangeList>['changes'] } = $props();
</script>

{#if changes.length}
	<details class="history no-print">
		<summary>Zuletzt geändert von {changes[0].userName ?? 'Import'}, {formatChangeTime(changes[0].at)}</summary>
		<ChangeList {changes} />
	</details>
{/if}

<style>
	.history { margin: -0.5rem 0 1rem; }
	summary { cursor: pointer; color: var(--muted); font-size: 0.9rem; }
	.history[open] { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.5rem 1rem; }
</style>
