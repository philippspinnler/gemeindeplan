<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatChangeTime } from '$lib/dates';

	type Change = {
		id: number;
		at: string;
		userName: string | null;
		label: string;
		target: { label: string; href: string | null };
		lines: string[];
		resettable: boolean;
	};
	let { changes, showTarget = false }: { changes: Change[]; showTarget?: boolean } = $props();

	let conflict = $state<{ id: number; name: string | null; at: string } | null>(null);
	let error = $state<{ id: number; text: string } | null>(null);

	const submit = (id: number) => () => {
		conflict = null;
		error = null;
		return async ({ result, update }: { result: { type: string; status?: number; data?: Record<string, unknown> }; update: () => Promise<void> }) => {
			if (result.type === 'failure' && result.data?.conflict) conflict = { id, ...(result.data.conflict as { name: string | null; at: string }) };
			else if (result.type === 'failure') error = { id, text: String(result.data?.error ?? 'Zurücksetzen fehlgeschlagen.') };
			else await update();
		};
	};
</script>

{#if changes.length === 0}
	<p class="hint">Noch keine Änderungen.</p>
{:else}
	<ul class="changes">
		{#each changes as c (c.id)}
			<li>
				<div class="head">
					<strong>{c.userName ?? 'Import'}</strong>
					<span class="hint">{formatChangeTime(c.at)}</span>
				</div>
				<div class="where">
					{c.label}{#if showTarget}{' – '}{#if c.target.href}<a href={c.target.href}>{c.target.label}</a>{:else}{c.target.label}{/if}{/if}
				</div>
				<ul class="lines">
					{#each c.lines as line}<li>{line}</li>{/each}
				</ul>
				{#if c.resettable}
					<form method="POST" action="/aenderungen?/reset" use:enhance={submit(c.id)}>
						<input type="hidden" name="id" value={c.id} />
						{#if conflict?.id === c.id}
							<p class="warn">Seither von {conflict.name ?? 'jemandem'} geändert ({formatChangeTime(conflict.at)}). Trotzdem zurücksetzen?</p>
							<button class="btn btn-small btn-danger" type="submit" name="force" value="1">Trotzdem zurücksetzen</button>
							<button class="btn btn-small" type="button" onclick={() => (conflict = null)}>Abbrechen</button>
						{:else}
							<button class="btn btn-small" type="submit" title="Setzt den Abschnitt auf den Stand vor dieser Änderung zurück.">Auf diesen Stand zurücksetzen</button>
						{/if}
						{#if error?.id === c.id}<p class="error">{error.text}</p>{/if}
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.changes { list-style: none; margin: 0; padding: 0; }
	.changes > li { padding: 0.75rem 0; border-top: 1px solid var(--line); }
	.changes > li:first-child { border-top: 0; }
	.head { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; align-items: baseline; }
	.where { color: var(--muted); font-size: 0.9rem; margin-top: 0.15rem; }
	.lines { margin: 0.35rem 0 0.5rem; padding-left: 1.2rem; overflow-wrap: anywhere; }
	.warn { margin: 0 0 0.4rem; }
	form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
	form p { flex-basis: 100%; }
</style>
