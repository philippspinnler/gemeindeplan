<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { monthLabel } from '$lib/dates';
	import YouthItem from '$lib/components/YouthItem.svelte';
	import type { youthList } from '$lib/server/youth-list';
	let { data }: { data: ReturnType<typeof youthList> } = $props();
	const sunday = $derived(data.weekday === 'sunday');
	const groups = $derived(
		data.rows.reduce<{ label: string; items: typeof data.rows }[]>((acc, r) => {
			const label = monthLabel(r.date);
			const last = acc[acc.length - 1];
			if (last && last.label === label) last.items.push(r);
			else acc.push({ label, items: [r] });
			return acc;
		}, [])
	);
</script>

{#snippet cell(r: (typeof data.rows)[number], v: string | null)}{#if v}{v}{:else if r.status === 'open'}<span class="muted">offen</span>{/if}{/snippet}

{#if data.next.length}
	<div class="next-grid">
		{#each data.next as ev (ev.date)}<YouthItem {ev} href="/jugend/{ev.date}" />{/each}
	</div>
{/if}

<div class="section-title">
	<h2>{sunday ? 'Sonntage' : 'Aktivitäten'}{data.year ? ` ${data.year}` : ''}</h2>
	<div class="actions">
		<a class="btn btn-small" href={page.url.pathname} class:btn-primary={!data.year}>Kommende</a>
		{#each data.years as y}<a class="btn btn-small" href="{page.url.pathname}?jahr={y}" class:btn-primary={data.year === y}>{y}</a>{/each}
	</div>
</div>
<p class="hint">{sunday ? 'Sonntagsklassen der Jungen Damen und Jungen Männer: Wer leitet, wer unterrichtet, welches Thema.' : 'Mittwochaktivitäten der Jungen Damen und Jungen Männer: Was, wer leitet, wer den Geistigen Gedanken gibt.'} Ein Klick auf das Datum öffnet den Termin.</p>
{#if data.rows.length === 0}
	<div class="section"><p class="muted">Keine Termine in diesem Zeitraum.</p></div>
{:else}
	{#each groups as g}
		<h2 class="month-title">{g.label}</h2>
		<div class="section table-wrap">
			<table class="table overview stack">
				<colgroup><col class="c-day" /><col class="c-kind" /><col class="c-person" /><col class="c-person" />{#if !sunday}<col class="c-short" /><col class="c-short" />{/if}<col /><col /></colgroup>
				<thead>
					<tr><th class="col-day">Datum</th><th>Art</th><th>JD</th><th>JM</th>{#if !sunday}<th>Bereich</th><th>Geistiger Gedanke</th>{/if}<th>{sunday ? 'Thema' : 'Snack'}</th><th>{sunday ? 'Hinweis' : 'Erwachsene'}</th></tr>
				</thead>
				<tbody>
					{#each g.items as r}
						{@const off = r.status === 'off'}
						<tr class:clickable={r.href} class:muted={r.date < data.today} class:no-meeting={off && !r.isEvent} class:stake-event={r.isEvent} onclick={r.href ? () => goto(r.href!) : undefined}>
							<td class="col-day td-main td-inline">{#if r.href}<a href={r.href}>{r.dateLabel}</a>{:else}{r.dateLabel}{/if}</td>
							<td class="td-inline td-kind">{r.kindLabel}</td>
							{#if r.status === 'off'}
								<td colspan={sunday ? 4 : 6}>{r.offLabel ?? ''}</td>
							{:else}
								{#if r.joint}
									<td colspan="2" data-label="JD / JM">{@render cell(r, r.jd)}</td>
								{:else}
									<td data-label="JD">{@render cell(r, r.jd)}</td>
									<td data-label="JM">{@render cell(r, r.jm)}</td>
								{/if}
								{#if !sunday}<td data-label={r.area ? 'Bereich' : null}>{r.area ?? ''}</td><td data-label={r.thought ? 'Geistiger Gedanke' : null}>{r.thought ?? ''}</td>{/if}
								<td data-label={r.extra ? (sunday ? 'Thema' : 'Snack') : null}>{r.extra ?? ''}</td>
								{#if sunday}<td>{r.hint ?? ''}</td>{:else}<td data-label={r.adults ? 'Erwachsene' : null}>{r.adults ?? ''}</td>{/if}
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}
{/if}

<style>
	.next-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
	@media (max-width: 640px) { .next-grid { grid-template-columns: 1fr; } }
</style>
