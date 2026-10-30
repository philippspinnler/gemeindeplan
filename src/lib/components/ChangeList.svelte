<script lang="ts">
	import { enhance } from '$app/forms';
	import { changeClock, changeDay, formatChangeTime } from '$lib/dates';

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

	const days = $derived.by(() => {
		const out: { day: string; items: Change[] }[] = [];
		for (const c of changes) {
			const day = changeDay(c.at);
			if (out.at(-1)?.day === day) out.at(-1)!.items.push(c);
			else out.push({ day, items: [c] });
		}
		return out;
	});

	/** "Label: before → after" split for display; other lines (imports, "Link neu erzeugt") stay plain. */
	function parse(line: string) {
		const arrow = line.lastIndexOf(' → ');
		const colon = line.indexOf(': ');
		if (arrow < 0 || colon < 0 || colon > arrow) return null;
		return { label: line.slice(0, colon), before: line.slice(colon + 2, arrow), after: line.slice(arrow + 3) };
	}

	let conflict = $state<{ id: number; name: string | null; at: string } | null>(null);
	let error = $state<{ id: number; text: string } | null>(null);

	const submit = (id: number) => () => {
		conflict = null;
		error = null;
		return async ({ result, update }: { result: { type: string; data?: Record<string, unknown> }; update: () => Promise<void> }) => {
			if (result.type === 'failure' && result.data?.conflict) conflict = { id, ...(result.data.conflict as { name: string | null; at: string }) };
			else if (result.type === 'failure') error = { id, text: String(result.data?.error ?? 'Rückgängig machen fehlgeschlagen.') };
			else if (result.type === 'error') error = { id, text: 'Rückgängig machen fehlgeschlagen.' };
			else await update();
		};
	};
</script>

{#if changes.length === 0}
	<p class="hint">Noch keine Änderungen.</p>
{:else}
	{#each days as d (d.day)}
		<h3 class="day">{d.day}</h3>
		<ol class="changes">
			{#each d.items as c (c.id)}
				<li>
					<div class="meta">
						<time datetime={c.at}>{changeClock(c.at)}</time>
						<span class="who">{c.userName ?? 'Import'}</span>
					</div>
					<div class="what">
						<div class="where">
							<strong>{c.label}</strong>
							{#if showTarget}
								{#if c.target.href}<a href={c.target.href}>{c.target.label}</a>{:else}<span>{c.target.label}</span>{/if}
							{/if}
						</div>
						{#each c.lines as line}
							{@const p = parse(line)}
							<p class="line">
								{#if p}
									<span class="label">{p.label}</span>
									{#if p.before !== '–'}<del>{p.before}</del>{/if}
									<ins class:empty={p.after === '–'}>{p.after === '–' ? 'leer' : p.after}</ins>
								{:else}{line}{/if}
							</p>
						{/each}
						{#if conflict?.id === c.id || error?.id === c.id}
							<form class="confirm" method="POST" action="/aenderungen?/reset" use:enhance={submit(c.id)}>
								<input type="hidden" name="id" value={c.id} />
								{#if conflict?.id === c.id}
									<p>Seither von {conflict.name ?? 'jemandem'} geändert ({formatChangeTime(conflict.at)}). Trotzdem rückgängig machen?</p>
									<button class="btn btn-small btn-danger" type="submit" name="force" value="1">Trotzdem rückgängig</button>
									<button class="btn btn-small" type="button" onclick={() => (conflict = null)}>Abbrechen</button>
								{:else if error}
									<p class="error">{error.text}</p>
								{/if}
							</form>
						{/if}
					</div>
					{#if c.resettable}
						<form method="POST" action="/aenderungen?/reset" use:enhance={submit(c.id)}>
							<input type="hidden" name="id" value={c.id} />
							<button class="undo" type="submit" title="Setzt {c.label} auf den Stand vor dieser Änderung zurück.">Rückgängig</button>
						</form>
					{/if}
				</li>
			{/each}
		</ol>
	{/each}
{/if}

<style>
	.day { font-size: 0.85rem; font-weight: 600; color: var(--muted); margin: 1rem 0 0.25rem; }
	.day:first-child { margin-top: 0.25rem; }
	.changes { list-style: none; margin: 0; padding: 0; }
	.changes > li { display: grid; grid-template-columns: 7.5rem 1fr auto; gap: 0.25rem 1rem; align-items: start; padding: 0.6rem 0; border-top: 1px solid var(--line); }
	.changes > li:first-child { border-top: 0; }
	.meta { display: flex; flex-direction: column; font-size: 0.85rem; line-height: 1.35; }
	.meta time { font-variant-numeric: tabular-nums; font-weight: 600; }
	.who { color: var(--muted); overflow-wrap: anywhere; }
	.where { display: flex; flex-wrap: wrap; gap: 0 0.6rem; align-items: baseline; }
	.where a, .where span { font-size: 0.9rem; color: var(--muted); }
	.where a:hover { color: var(--primary); }
	.line { margin: 0.15rem 0 0; overflow-wrap: anywhere; }
	.label { color: var(--muted); margin-right: 0.35rem; }
	.label::after { content: ':'; }
	del { color: var(--muted); margin-right: 0.35rem; }
	ins { text-decoration: none; font-weight: 500; }
	ins.empty { color: var(--muted); font-style: italic; font-weight: 400; }
	.undo { font: inherit; font-size: 0.85rem; color: var(--primary); background: none; border: 1px solid transparent; border-radius: var(--radius); padding: 0.3rem 0.55rem; cursor: pointer; white-space: nowrap; }
	.undo:hover { border-color: var(--line); background: var(--bg); }
	.undo:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
	.confirm { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
	.confirm p { flex-basis: 100%; margin: 0; }
	@media (max-width: 560px) {
		.changes > li { grid-template-columns: 1fr auto; }
		.meta { grid-column: 1 / -1; flex-direction: row; gap: 0.5rem; }
		.what { grid-column: 1; }
	}
</style>
