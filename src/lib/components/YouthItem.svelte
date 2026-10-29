<script lang="ts">
	import type { YouthPageItem } from '$lib/server/youth-page';
	/** A youth date as a card, or with `compact` as a row of the "Danach" list. */
	let { ev, compact = false, href = null }: { ev: YouthPageItem; compact?: boolean; href?: string | null } = $props();
	const sunday = $derived(ev.weekday === 'sunday');
	const special = $derived(ev.kindLabel !== 'Klasse' && ev.kindLabel !== 'Aktivität');
	const who = (p: YouthPageItem['parts'][number]) => ([['Leitung', p.leaderName], ['Lehrer', p.teacherName]] as const).filter((r) => r[1]);
	const facts = $derived(([['Geistiger Gedanke', ev.thoughtName], ['Erwachsene', ev.adults], ['Snack', ev.snack]] as const).filter((f) => f[1]));
</script>

{#snippet topic(text: string | null, url: string | null)}{#if url}<a href={url} rel="noopener noreferrer">{text ?? 'Unterlage'}</a>{:else}{text}{/if}{/snippet}

{#snippet pairs(rows: readonly (readonly [string, string | null])[])}
	{#if rows.length}<dl class="pairs">{#each rows as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}</dl>{/if}
{/snippet}

{#snippet body()}
	{#if ev.noSeminar}<p class="seminar">Seminar fällt aus</p>{/if}
	{#if ev.status === 'off'}
		<p class="title" class:muted={ev.weekday !== 'other'}>{ev.offLabel}</p>
	{:else if ev.status === 'open'}
		<p class="muted">noch nicht geplant</p>
	{:else}
		{#if sunday && (ev.topic || ev.topicUrl)}<p class="title">{@render topic(ev.topic, ev.topicUrl)}</p>{/if}
		{#if ev.joint}
			{@const p = ev.parts[0]}
			{#if p?.text}<p class="title">{p.text}</p>{/if}
			{#if p?.details}<p class="note">{p.details}</p>{/if}
			<div class="aligned">
				{#if p}{@render pairs(who(p))}{/if}
				{#if facts.length}<div class="facts">{@render pairs(facts)}</div>{/if}
			</div>
		{:else}
			<dl class="sides">
				{#each ev.parts as p (p.side)}
					<dt>{p.side.toUpperCase()}</dt>
					<dd>
						{#if !p.planned}
							<span class="muted">noch offen</span>
						{:else}
							{#if sunday ? p.topic || p.topicUrl : p.text}<span class="main">{#if sunday}{@render topic(p.topic, p.topicUrl)}{:else}{p.text}{/if}</span>{/if}
							{@render pairs(who(p))}
							{#if p.details}<span class="note">{p.details}</span>{/if}
						{/if}
					</dd>
				{/each}
			</dl>
			{#if facts.length}<div class="facts">{@render pairs(facts)}</div>{/if}
		{/if}
	{/if}
{/snippet}

{#if compact}
	<div class="row" class:event={ev.weekday === 'other'} class:off={ev.status === 'off' && ev.weekday !== 'other'}>
		<div class="when"><strong>{#if ev.untilLabel}<span class="nowrap">{ev.shortDate} –</span> <span class="nowrap">{ev.untilLabel}</span>{:else}{ev.shortDate}{/if}</strong><span>{ev.kindLabel}</span></div>
		<div>{@render body()}</div>
	</div>
{:else}
	<article class="card" class:off={ev.status === 'off'} class:todo={href && ev.status === 'open'} class:done={href && ev.status === 'planned'}>
		<header>
			<div><h2>{ev.weekdayLabel}</h2><span class="date">{ev.dateLabel}</span></div>
			{#if href}<a class="btn btn-primary btn-small" {href}>Bearbeiten</a>{/if}
		</header>
		{#if special}<span class="badge" class:joint={ev.joint && ev.status !== 'off'}>{ev.kindLabel}</span>{/if}
		{@render body()}
	</article>
{/if}

<style>
	p { margin: 0; }
	.muted { color: var(--muted); }
	.title { font-weight: 600; line-height: 1.35; margin-bottom: 0.25rem; }
	.title a, .main a { color: var(--primary); }
	.note { display: block; color: var(--muted); font-size: 0.9rem; line-height: 1.4; }
	.main { display: block; font-weight: 600; line-height: 1.35; }
	.sides { display: grid; grid-template-columns: 2.4rem 1fr; gap: 0.5rem 0.5rem; margin: 0.5rem 0 0; }
	.sides > dt { font-weight: 700; color: var(--primary); font-size: 0.85rem; padding-top: 0.1rem; }
	.sides > dd { margin: 0; }
	.pairs { display: grid; grid-template-columns: max-content 1fr; gap: 0.15rem 0.75rem; margin: 0.1rem 0 0; font-size: 0.9rem; }
	.pairs dt { color: var(--muted); }
	.pairs dd { margin: 0; }
	.facts { margin-top: 0.85rem; }
	/* Leitung and the facts below share one label column. */
	.aligned { display: grid; grid-template-columns: max-content 1fr; column-gap: 0.75rem; }
	.aligned > .facts, .aligned .pairs { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; }
	.nowrap { white-space: nowrap; }
	.seminar { display: inline-block; font-size: 0.85rem; font-weight: 600; color: #8a4b12; background: #f2e3d5; border-radius: 6px; padding: 0.1rem 0.5rem; margin-bottom: 0.4rem; }

	.card { background: var(--surface); border-radius: var(--radius); padding: 1.1rem 1.25rem 1.25rem; box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); height: 100%; }
	.card header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.6rem; }
	.date { color: var(--muted); }
	.card h2 { margin: 0; font-size: 1.5rem; line-height: 1.15; }
	.badge { display: inline-block; font-size: 0.8rem; font-weight: 600; background: #e3eef5; color: var(--primary); border-radius: 999px; padding: 0.1rem 0.6rem; margin-bottom: 0.6rem; }
	.badge.joint { background: #e0f2e4; color: #1e6b33; }
	/* In the app the edge shows at a glance whether a date still needs planning. */
	.card.done { border-left: 6px solid var(--ok); }
	.card.todo { border-left: 6px solid var(--danger); }
	.card.off .badge { background: #f2e3d5; color: #8a4b12; }

	.row { display: grid; grid-template-columns: 8.5rem 1fr; gap: 0.75rem; padding: 0.7rem 0.6rem; border-top: 1px solid var(--line); }
	.row .when { display: flex; flex-direction: column; font-size: 0.95rem; }
	.row .when span { color: var(--muted); font-size: 0.8rem; }
	.row .sides { margin-top: 0.15rem; }
	.row .facts { margin-top: 0.4rem; }
	.row.event { background: #e8f1f8; border-left: 3px solid var(--primary); border-top-color: transparent; }
	.row.event .when span { color: var(--primary); font-weight: 600; }
	.row.off .when strong, .row.off .title { color: var(--muted); font-weight: 400; }
	@media (max-width: 480px) {
		.row { grid-template-columns: 1fr; gap: 0.3rem; }
		.row .when { flex-direction: row; gap: 0.5rem; align-items: baseline; }
	}
</style>
