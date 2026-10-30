<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { formatChangeTime } from '$lib/dates';
	import ChangeList from './ChangeList.svelte';
	import Icon from './Icon.svelte';

	let { changes }: { changes: ComponentProps<typeof ChangeList>['changes'] } = $props();
	let dialog = $state<HTMLDialogElement>();
	const title = $derived(changes.length ? `Verlauf: zuletzt geändert ${formatChangeTime(changes[0].at)} von ${changes[0].userName ?? 'Import'}` : '');
</script>

{#if changes.length}
	<button class="btn btn-icon history no-print" type="button" onclick={() => dialog?.showModal()} aria-label={title} {title}>
		<Icon name="history" />
		<b class="count" aria-hidden="true">{changes.length}</b>
	</button>
	<dialog bind:this={dialog} class="news-dialog history-dialog" closedby="any">
		<div class="head">
			<h2>Verlauf</h2>
			<button class="btn btn-small" type="button" onclick={() => dialog?.close()}>Schliessen</button>
		</div>
		<ChangeList {changes} />
	</dialog>
{/if}

<style>
	.history { position: relative; }
	.count { position: absolute; top: -0.4rem; right: -0.4rem; min-width: 1.25rem; height: 1.25rem; padding: 0 0.3rem; box-sizing: border-box; border-radius: 999px; background: var(--bg); border: 1px solid var(--line); color: var(--muted); font-size: 0.7rem; font-weight: 600; line-height: calc(1.25rem - 2px); text-align: center; font-variant-numeric: tabular-nums; }
	.history-dialog { max-width: 44rem; max-height: min(80vh, 48rem); overflow: auto; }
	.head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; }
	.head h2 { margin: 0; }
</style>
