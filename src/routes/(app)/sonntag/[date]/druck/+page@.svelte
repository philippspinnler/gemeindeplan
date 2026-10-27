<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	let { data } = $props();
	const T = $derived(data.texts);
	/** Fullscreen for the iPad: sheet only, no bar or frame. Reachable directly via ?vollbild=1. */
	let fullscreen = $state(page.url.searchParams.get('vollbild') === '1');
	const hasChanges = $derived(!data.hasProgram ? false : data.releases.length > 0 || data.sustainings.length > 0 || data.stakeChanges);
	/** On paper the releases/callings section is always printed (for handwritten additions); in fullscreen only if there are entries. */
	const showChanges = $derived(hasChanges || !fullscreen);
	const partNo = $derived((n: number) => (showChanges || n < 2 ? n : n - 1));
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') fullscreen = false; }} />

<svelte:head><title>Leitungszettel {data.dateLabel}</title></svelte:head>

{#if fullscreen}
	<button class="btn btn-small close-fs no-print" type="button" onclick={() => (fullscreen = false)} aria-label="Tablet-Ansicht beenden">✕</button>
{:else}
	<div class="toolbar no-print">
		<button class="btn btn-icon" type="button" aria-label="Tablet-Ansicht" title="Tablet-Ansicht" onclick={() => (fullscreen = true)}><Icon name="tablet" /><span>Tablet-Ansicht</span></button>
		<button class="btn btn-primary btn-icon" type="button" aria-label="Drucken" title="Drucken" onclick={() => window.print()}><Icon name="print" /><span>Drucken</span></button>
	</div>
{/if}

<article class="sheet" class:fullscreen>
	<header class="head">
		<div><span class="lbl">Datum:</span> <strong>{data.dateLabel}</strong></div>
		<div><span class="lbl">Leitung:</span> <strong>{data.presiding || '________'}</strong></div>
		<div><span class="lbl">Vorsitz:</span> <strong>{data.chair || '________'}</strong></div>
	</header>
	{#if data.guest}<p class="theme"><strong>Gast:</strong> {data.guest}</p>{/if}
	{#if data.theme || data.specialNote}
		<p class="theme">{#if data.theme}<strong>Thema:</strong> {data.theme}{/if}{#if data.specialNote} <em>({data.specialNote})</em>{/if}</p>
	{/if}

	{#if !data.hasProgram}
		<p class="big">{data.kindLabel}: kein Leitungszettel nötig.</p>
	{:else}
		<div class="part">
			<span class="part-no" aria-hidden="true">1</span>
			<section>
				<h2>Bekanntmachungen</h2>
				{#if data.announcements.length === 0 && fullscreen}<div class="row muted">keine</div>{/if}
				{#each data.announcements as a}<div class="row"><span class="box">□</span><span>{a}</span></div>{/each}
				<!-- Blank lines for handwritten additions, paper only (not in tablet fullscreen). -->
				<div class="row print-only"><span class="box">□</span><span></span></div>
				<div class="row print-only"><span class="box">□</span><span></span></div>
			</section>
			<section>
				<div class="row"><span class="k">Anfangslied</span><span>{data.hymns.anfang}</span></div>
				<div class="row"><span class="k">Anfangsgebet</span><span>{data.prayers.opening}</span></div>
				{#if !showChanges}<div class="row"><span class="k">Abendmahlslied</span><span>{data.hymns.abendmahl}</span></div>{/if}
			</section>
		</div>

		{#if showChanges}
		<div class="part">
			<span class="part-no" aria-hidden="true">2</span>
			{#if data.releases.length || !fullscreen}
				<section class="boxed">
					<h2>Entlassungen</h2>
					<p class="intro">{T.releaseIntro}</p>
					<ul>{#each data.releases as r}<li><strong>{r.personName}</strong>{#if r.calling}{' – '}{r.calling}{/if}</li>{/each}</ul>
					<div class="row print-only"></div><div class="row print-only"></div>
					<p class="intro">{T.releaseVote}</p>
				</section>
			{/if}
			{#if data.sustainings.length || !fullscreen}
				<section class="boxed">
					<h2>Berufungen</h2>
					<p class="intro">{T.sustainIntro}</p>
					<ul>{#each data.sustainings as s}<li><strong>{s.personName}</strong>{#if s.calling}{' – '}{s.calling}{/if}</li>{/each}</ul>
					<div class="row print-only"></div><div class="row print-only"></div>
					<p class="intro">{T.sustainVote}</p>
					<p class="intro">{T.sustainOpposed}</p>
				</section>
			{/if}
			{#if data.stakeChanges}
				<section class="boxed">
					<h2>Beamtenänderungen vom Pfahl</h2>
					<p class="intro">{T.stakeChanges}</p>
				</section>
			{/if}
			<section>
				<div class="row"><span class="k">Abendmahlslied</span><span>{data.hymns.abendmahl}</span></div>
			</section>
		</div>
		{/if}

		<div class="part">
			<span class="part-no" aria-hidden="true">{partNo(3)}</span>
			<section>
				<p class="intro">{T.sacramentThanks}</p>
				{#if data.isFast}
					<div class="row"><span class="k"><strong>{T.testimonies}</strong></span><span></span></div>
					<div class="row"><span class="k">Zwischenlied</span><span>{data.hymns.zwischen}</span></div>
				{:else}
					{#each data.program as p}
						<div class="row"><span class="k">{p.label}</span><span class="d">{p.detail}</span><span class="t">{p.time}</span></div>
					{/each}
					<div class="row print-only"><span class="k"></span><span class="d"></span></div>
				{/if}
			</section>
		</div>

		<div class="part">
			<span class="part-no" aria-hidden="true">{partNo(4)}</span>
			<section>
				<div class="row"><span class="k">Schlusslied</span><span>{data.hymns.schluss}</span></div>
				<div class="row"><span class="k">Schlussgebet</span><span>{data.prayers.closing}</span></div>
				<p class="intro">{T.closingThanks}</p>
				<div class="row"><span class="k cue">{T.closingMusic}</span><span>Orgel: {data.organist || '____'} · Dirigieren: {data.conductor || '____'}</span></div>
			</section>
		</div>
	{/if}
</article>

<style>
	:global(body) { background: #e9e8e3; }
	.toolbar { display: flex; gap: 0.5rem; justify-content: center; padding: 0.75rem; }
	.sheet { width: 210mm; min-height: 297mm; margin: 0 auto 2rem; background: #fff; padding: 12mm 14mm; box-sizing: border-box; color: #111; font-size: 11pt; line-height: 1.28; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12); }
	.head { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 2px solid #111; padding-bottom: 2.5mm; margin-bottom: 2.5mm; }
	.lbl { color: #555; }
	.theme { margin: 0 0 2.5mm; }
	section { margin-bottom: 2.5mm; }
	/* Sections: number in the margin, rule above. */
	.part { position: relative; padding: 2mm 0 0 8mm; margin-bottom: 2mm; border-top: 1.5px solid #111; }
	.part > section:last-child { margin-bottom: 0.5mm; }
	.part-no { position: absolute; left: 0; top: 2.2mm; width: 5.5mm; height: 5.5mm; border-radius: 50%; background: #111; color: #fff; font-size: 8.5pt; font-weight: 700; line-height: 5.5mm; text-align: center; }
	h2 { font-size: 10.5pt; margin: 0 0 1mm; text-transform: uppercase; letter-spacing: 0.04em; color: #333; }
	.row { display: flex; gap: 3mm; align-items: baseline; padding: 0.7mm 0; border-bottom: 1px dotted #bbb; }
	.row .k { flex: 0 0 48mm; }
	.row .k.cue { color: #6b6b6b; }
	.row .d { flex: 1; }
	.row .t { flex: 0 0 30mm; text-align: right; color: #444; font-variant-numeric: tabular-nums; }
	.box { flex: 0 0 5mm; }
	.boxed { border: 1px solid #111; padding: 2mm 3mm; }
	/* Italic hints smaller than the entries so the sheet fits on one A4 page. */
	.intro { font-style: italic; color: #6b6b6b; margin: 0.8mm 0; font-size: 9.5pt; line-height: 1.25; }
	ul { margin: 0.5mm 0 0.5mm 5mm; padding: 0; }
	.muted { color: #777; }
	.big { font-size: 14pt; }
	@media (max-width: 220mm) { .sheet { width: 100%; min-height: auto; padding: 6mm; } }
	.sheet.fullscreen { width: 100%; max-width: 1100px; min-height: 100vh; margin: 0 auto; padding: 8mm 10mm; box-shadow: none; font-size: clamp(12pt, 1.6vw, 15pt); }
	.sheet.fullscreen .row .k { flex-basis: 64mm; }
	.sheet.fullscreen .print-only { display: none; }
	.print-only { min-height: 5.5mm; }
	:global(body:has(.sheet.fullscreen)) { background: #fff; }
	.close-fs { position: fixed; top: 0.5rem; right: 0.5rem; z-index: 10; opacity: 0.6; }
	.close-fs:hover { opacity: 1; }
	@page { size: A4 portrait; margin: 8mm 12mm; }
	@media print {
		:global(body) { background: #fff; }
		.sheet { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
		section, .boxed { break-inside: avoid; }
	}
</style>
