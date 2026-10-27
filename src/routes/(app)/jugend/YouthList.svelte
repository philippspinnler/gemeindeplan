<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { monthLabel } from '$lib/dates';
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
		{#each data.next as ev (ev.date)}
			<div class="card big-card" class:has-open={ev.status === 'open'}>
				<div class="section-title">
					<div><span class="kind-tag">{ev.weekdayLabel} · {ev.kindLabel}</span><h2 class="next-date">{ev.dateLabel}</h2></div>
					<a class="btn btn-primary btn-small" href="/jugend/{ev.date}">Bearbeiten</a>
				</div>
				{#if ev.status === 'off'}
					<p>{ev.offLabel}</p>
				{:else if ev.status === 'open'}
					<p class="muted">noch nicht geplant</p>
				{:else}
					{#if ev.weekday === 'sunday' && (ev.topic || ev.topicUrl)}
						<p class="next-topic">{#if ev.topicUrl}<a href={ev.topicUrl} rel="noopener noreferrer">{ev.topic ?? 'Unterlage'}</a>{:else}{ev.topic}{/if}</p>
					{/if}
					<div class="next-parts" class:single={ev.joint}>
						{#each ev.parts as p (p.side)}
							<div>
								{#if p.label}<div class="kind-tag">{p.label}</div>{/if}
								{#if !p.planned}<p class="muted">noch nicht geplant</p>{/if}
								{#if p.text && ev.weekday !== 'sunday'}<p class="next-what">{p.text}</p>{/if}
								{#if p.details}<p class="hint">{p.details}</p>{/if}
								<p class="hint">
									{#if p.leaderName}Leitung: {p.leaderName}<br />{/if}
									{#if p.teacherName}Lehrer: {p.teacherName}{/if}
								</p>
							</div>
						{/each}
					</div>
					{#if ev.thoughtName}<p class="hint">Gedanke: {ev.thoughtName}</p>{/if}
					{#if ev.snack}<p class="hint">Snack: {ev.snack}</p>{/if}
				{/if}
			</div>
		{/each}
	</div>
{/if}

<div class="section-title">
	<h2>{sunday ? 'Sonntage' : 'Aktivitäten'}{data.year ? ` ${data.year}` : ''}</h2>
	<div class="actions">
		<a class="btn btn-small" href={page.url.pathname} class:btn-primary={!data.year}>Kommende</a>
		{#each data.years as y}<a class="btn btn-small" href="{page.url.pathname}?jahr={y}" class:btn-primary={data.year === y}>{y}</a>{/each}
	</div>
</div>
<p class="hint">{sunday ? 'Sonntagsklassen der Jungen Damen und Jungen Männer: Wer leitet, wer unterrichtet, welches Thema.' : 'Mittwochaktivitäten der Jungen Damen und Jungen Männer: Was, wer leitet, wer den Gedanken gibt.'} Ein Klick auf das Datum öffnet den Termin.</p>
{#if data.rows.length === 0}
	<div class="section"><p class="muted">Keine Termine in diesem Zeitraum.</p></div>
{:else}
	{#each groups as g}
		<h2 class="month-title">{g.label}</h2>
		<div class="section table-wrap">
			<table class="table overview stack">
				<colgroup><col class="c-day" /><col class="c-kind" /><col class="c-person" /><col class="c-person" />{#if !sunday}<col class="c-person" /><col class="c-person" />{/if}<col /><col /></colgroup>
				<thead>
					<tr><th class="col-day">Datum</th><th>Art</th><th>JD</th><th>JM</th>{#if !sunday}<th>Bereich</th><th>Gedanke</th>{/if}<th>{sunday ? 'Thema' : 'Snack'}</th><th>Hinweis</th></tr>
				</thead>
				<tbody>
					{#each g.items as r}
						{@const off = r.status === 'off'}
						<tr class:clickable={!off} class:muted={r.date < data.today} class:no-meeting={off} onclick={off ? undefined : () => goto(`/jugend/${r.date}`)}>
							<td class="col-day td-main td-inline">{#if off}{r.dateLabel}{:else}<a href="/jugend/{r.date}">{r.dateLabel}</a>{/if}</td>
							<td class="td-inline td-kind">{r.kindLabel}</td>
							{#if r.status === 'off'}
								<td colspan={sunday ? 4 : 6}>{r.offLabel ?? ''}</td>
							{:else}
								<td data-label="JD">{@render cell(r, r.jd)}</td>
								<td data-label="JM">{@render cell(r, r.jm)}</td>
								{#if !sunday}<td data-label={r.area ? 'Bereich' : null}>{r.area ?? ''}</td><td data-label={r.thought ? 'Gedanke' : null}>{r.thought ?? ''}</td>{/if}
								<td data-label={r.extra ? (sunday ? 'Thema' : 'Snack') : null}>{r.extra ?? ''}</td>
								<td>{r.hint ?? ''}</td>
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
	.next-grid .card { margin-bottom: 0; }
	.next-date { font-size: 1.25rem; }
	.next-topic { font-weight: 600; margin: 0 0 0.5rem; }
	.next-parts { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.next-parts.single { grid-template-columns: 1fr; }
	.next-what { font-weight: 600; margin: 0.2rem 0; }
	@media (max-width: 640px) { .next-grid, .next-parts { grid-template-columns: 1fr; } }
</style>
