<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>JD / JM {data.ward}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<div class="cards">
	{#each data.big as ev (ev.date)}
		<div class="ev big">
			<div class="when">{ev.weekdayLabel}</div>
			<div class="date">{ev.dateLabel}</div>
			<span class="kind" class:off={ev.status === 'off'} class:joint={ev.joint && ev.status !== 'off'}>{ev.kindLabel}</span>
			{#if ev.status === 'off'}
				<p class="what">{ev.offLabel}</p>
			{:else if ev.status === 'open'}
				<p class="muted">noch nicht geplant</p>
			{:else}
				{#if ev.weekday === 'sunday'}
					{#if ev.topic}
						<p class="topic">{#if ev.topicUrl}<a href={ev.topicUrl} rel="noopener noreferrer">{ev.topic}</a>{:else}{ev.topic}{/if}</p>
					{:else if ev.topicUrl}
						<p class="topic"><a href={ev.topicUrl} rel="noopener noreferrer">Unterlage</a></p>
					{/if}
				{/if}
				<div class="grp" class:single={ev.joint}>
					{#each ev.parts as p (p.side)}
						<div class="g">
							{#if p.label}<h4>{p.label}</h4>{/if}
							{#if p.topic || p.topicUrl}<p class="topic">{#if p.topicUrl}<a href={p.topicUrl} rel="noopener noreferrer">{p.topic ?? 'Unterlage'}</a>{:else}{p.topic}{/if}</p>{/if}
							{#if !p.planned}<p class="muted">noch nicht geplant</p>{/if}
							{#if p.text && ev.weekday !== 'sunday'}<p class="what">{p.text}</p>{/if}
							<p class="who">
								{#if p.leaderName}Leitung: {p.leaderName}<br />{/if}
								{#if p.teacherName}Lehrer: {p.teacherName}{/if}
							</p>
						</div>
					{/each}
				</div>
				{#if ev.thoughtName}<p class="meta">Geistiger Gedanke: {ev.thoughtName}</p>{/if}
				{#if ev.snack}<p class="meta">Snack: {ev.snack}</p>{/if}
			{/if}
		</div>
	{/each}
	</div>

	{#if data.small.length}
		<div class="ev compact">
			<div class="when">Danach</div>
			{#each data.small as ev (ev.date + ev.weekday)}
				<div class="row"><span class="d">{ev.shortDate}</span><span class="t" class:muted={ev.status !== 'planned'}>{ev.text}</span></div>
			{/each}
		</div>
	{/if}
</main>

<style>
	main { max-width: 440px; margin: 0 auto; padding: 14px; font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; }
	.ev { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
	.ev.big { padding: 16px; }
	.when { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #1f5f8b; font-weight: 700; }
	.date { font-size: 22px; font-weight: 700; margin: 2px 0 8px; }
	.kind { display: inline-block; font-size: 11px; background: #e3eef5; color: #1f5f8b; border-radius: 999px; padding: 2px 8px; margin-bottom: 8px; }
	.kind.off { background: #f2e3d5; color: #8a4b12; }
	.kind.joint { background: #e0f2e4; color: #1e6b33; }
	.grp { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.grp.single { grid-template-columns: 1fr; }
	.g h4 { margin: 0 0 3px; font-size: 12px; color: #777; text-transform: uppercase; letter-spacing: .04em; }
	.what { font-weight: 600; font-size: 15px; margin: 0 0 4px; }
	.who { font-size: 13px; color: #444; margin: 0; line-height: 1.4; }
	.topic { font-weight: 600; font-size: 15px; margin: 0 0 8px; }
	.topic a { color: #1f5f8b; }
	.meta { font-size: 13px; color: #444; margin: 8px 0 0; padding-top: 8px; border-top: 1px dotted #ccc; }
	.compact .row { display: flex; gap: 10px; align-items: baseline; font-size: 13px; padding: 4px 0; border-top: 1px dotted #e4e4e4; }
	.compact .when + .row { border-top: 0; }
	.compact .d { flex: 0 0 92px; font-weight: 700; }
	.compact .t { flex: 1; color: #333; }
	.muted { color: #888; }
	@media (min-width: 720px) {
		main { max-width: 900px; padding: 24px; }
		.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
		.cards .ev { margin-bottom: 0; }
		.ev.big { padding: 20px; }
		.date { font-size: 26px; }
		.what, .topic { font-size: 17px; }
		.who, .meta, .compact .row { font-size: 14px; }
	}
</style>
