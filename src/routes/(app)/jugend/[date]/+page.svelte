<script lang="ts">
	import { enhance } from '$app/forms';
	import MemberSelect from '$lib/components/MemberSelect.svelte';
	import { createAutosave } from '$lib/autosave.svelte';
	let { data, form } = $props();
	/** Cleared by a later successful save, which skips `applyAction` (see `saved`). */
	let formError = $derived(form?.error);

	type Side = 'jd' | 'jm' | 'both';
	type Option = { value: string; label: string };
	type Idea = { id: number; text: string; note: string | null };

	const ev = $derived(data.full.event);
	/** Follows the select before it is saved; "Mit Basel" is always joint. */
	let kind = $derived(ev.kind);
	const kindLabel = $derived(data.kinds.find((k) => k.value === ev.kind)?.label ?? ev.kind);
	const part = (side: Side) => data.full.parts.find((p) => p.side === side);
	const canBoth = $derived(data.canJd || data.canJm);
	const thoughtOptions = $derived([...data.jdThoughtOptions, ...data.jmThoughtOptions].filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i));
	const sections = $derived.by(() => {
		if (ev.joint) {
			const groups = [...data.groupsJd, ...data.groupsJm].filter((g, i, all) => all.findIndex((x) => x.value === g.value) === i);
			return [{ side: 'both' as Side, title: 'Gemeinsam', canEdit: canBoth, version: data.versions.both, options: [...data.jdOptions, ...data.jmOptions], thoughtOptions, groups, ideas: data.ideasBoth }];
		}
		return [
			{ side: 'jd' as Side, title: 'JD', canEdit: data.canJd, version: data.versions.jd, options: data.jdOptions, thoughtOptions: data.jdThoughtOptions, groups: data.groupsJd, ideas: data.ideasJd },
			{ side: 'jm' as Side, title: 'JM', canEdit: data.canJm, version: data.versions.jm, options: data.jmOptions, thoughtOptions: data.jmThoughtOptions, groups: data.groupsJm, ideas: data.ideasJm }
		];
	});
	const presentLabel = (p: boolean | null) => (p === true ? 'anwesend' : p === false ? 'abwesend' : '–');

	/** Idea taken over per side; the side action plans it together with the saved text. */
	let takenIdea = $state<Record<string, number | null>>({});

	const autosave = createAutosave({
		deps: () => data,
		onSaved: (key) => {
			takenIdea[key] = null;
			formError = undefined;
		}
	});
	function takeIdea(side: Side, idea: Idea) {
		const field = document.getElementById(`${side}_text`) as HTMLInputElement | null;
		if (!field || autosave.conflict) return;
		field.value = idea.text;
		autosave.mark(field);
		takenIdea[side] = idea.id;
		autosave.touch(`${side}Form`);
	}
</script>

{#snippet partSection(s: { side: Side; title: string; canEdit: boolean; options: { id: number; label: string; hint: string }[]; thoughtOptions: { id: number; label: string; hint: string }[]; groups: Option[]; ideas: Idea[] })}
	{@const p = part(s.side)}
	{@const formId = `${s.side}Form`}
	<div class="section">
		<h2>{s.title}</h2>
		{#if !data.isSunday}
			<div class="grid-2">
				<div class="field">
					<label for="{s.side}_text">Aktivität</label>
					{#if s.canEdit}
						<input id="{s.side}_text" name="text" type="text" form={formId} value={p?.text ?? ''} />
					{:else}
						<p>{p?.text ?? '–'}</p>
					{/if}
				</div>
				{#if kind !== 'basel'}
					<div class="field">
						<label for="{s.side}_area">Bereich</label>
						{#if s.canEdit}
							<select id="{s.side}_area" name="area" form={formId}>
								<option value="" selected={!p?.area}>–</option>
								{#each data.areas as a}<option value={a.value} selected={a.value === p?.area}>{a.label}</option>{/each}
							</select>
						{:else}
							<p>{data.areas.find((a) => a.value === p?.area)?.label ?? '–'}</p>
						{/if}
					</div>
				{/if}
			</div>
			{#if s.canEdit && s.ideas.length}
				<div class="field">
					<span class="label">Ideen</span>
					<ul class="row-list">
						{#each s.ideas as i (i.id)}
							<li>
								<span title={i.note ? `${i.text} – ${i.note}` : i.text}>{i.text}</span>
								<button class="btn btn-small" type="button" title={i.note ? `${i.text} – ${i.note}` : i.text} onclick={() => takeIdea(s.side, i)}>übernehmen</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			<div class="field">
				<label for="{s.side}_details">Details</label>
				{#if s.canEdit}
					<input id="{s.side}_details" name="details" type="text" form={formId} value={p?.details ?? ''} placeholder="z.B. Treffpunkt, was mitbringen" />
				{:else}
					<p>{p?.details ?? '–'}</p>
				{/if}
			</div>
		{/if}
		{#if kind !== 'basel'}
		<div class="grid-2">
			<div class="field">
				<label for="{s.side}_leader">Leitung</label>
				{#if !s.canEdit}
					<p>{data.isSunday ? (s.groups.find((g) => g.value === p?.leaderGroup)?.label ?? '–') : (p?.leaderName ?? '–')}</p>
				{:else if data.isSunday}
					<select id="{s.side}_leader" name="leaderGroup" form={formId}>
						<option value="" selected={!p?.leaderGroup}>–</option>
						{#each s.groups as g}<option value={g.value} selected={g.value === p?.leaderGroup}>{g.label}</option>{/each}
					</select>
				{:else}
					<MemberSelect id="{s.side}_leader" name="leader" form={formId} options={s.options} value={p?.leaderId ?? null} />
				{/if}
			</div>
			{#if data.isSunday}
				<div class="field">
					<label for="{s.side}_teacher">Lehrer</label>
					{#if s.canEdit}
						<MemberSelect id="{s.side}_teacher" name="teacher" form={formId} options={s.thoughtOptions} value={p?.teacherId ?? null} />
					{:else}
						<p>{p?.teacherName ?? '–'}</p>
					{/if}
				</div>
			{/if}
		</div>
		{/if}
	</div>
{/snippet}

<p class="no-print"><a class="back" href={data.isSunday ? '/jugend/sonntage' : '/jugend'}>{data.isSunday ? 'Sonntage' : 'Aktivitäten'}</a></p>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="has-savebar" {...autosave.handlers}>
	<div class="section-title">
		<div>
			<span class="kind-tag">{kindLabel}</span>
			<h2>{data.dateLabel}</h2>
		</div>
	</div>
	{#if formError}<div class="error">{formError}</div>{/if}
	{#if data.offNotice}<p class="hint">{data.isSunday ? 'Keine Klasse' : 'Kein JD/JM'}: {data.offNotice}</p>{/if}
	{#if data.breakHint}<p class="hint">Liegt in: {data.breakHint}</p>{/if}

	{#if data.canCommon}
		<form id="commonForm" method="POST" action="?/common" use:enhance={() => autosave.saved('common')}><input type="hidden" name="version" value={data.versions.common} /></form>
		<form id="adultsForm" method="POST" action="?/adults" use:enhance={() => autosave.saved('adults')}><input type="hidden" name="version" value={data.versions.adults} /></form>
	{/if}
	{#each sections as s (s.side)}
		{#if s.canEdit}
			<form id="{s.side}Form" method="POST" action="?/{s.side}" use:enhance={() => autosave.saved(s.side)}><input type="hidden" name="version" value={s.version} /><input type="hidden" name="ideaId" value={takenIdea[s.side] ?? ''} /></form>
		{/if}
	{/each}

	<div class="section">
		<h2>Allgemein</h2>
		<div class="grid-2">
			<div class="field">
				<label for="kind">Art</label>
				{#if data.canCommon}
					<select id="kind" name="kind" form="commonForm" onchange={(e) => (kind = e.currentTarget.value as typeof kind)}>{#each data.kinds as k}<option value={k.value} selected={k.value === ev.kind}>{k.label}</option>{/each}</select>
				{:else}
					<p>{kindLabel}</p>
				{/if}
			</div>
			<div class="field">
				<span class="label">JD und JM</span>
				{#if data.canCommon}
					<label class="check"><input type="checkbox" name="joint" value="1" form="commonForm" checked={ev.joint || kind.startsWith('basel')} disabled={kind.startsWith('basel')} /> gemeinsam</label>
				{:else}
					<p>{ev.joint ? 'gemeinsam' : 'getrennt'}</p>
				{/if}
			</div>
		</div>
		{#if data.off}
			<div class="field">
				<label for="details">Begründung</label>
				{#if data.canCommon}
					<input id="details" name="details" type="text" form="commonForm" value={ev.details ?? ''} placeholder="z.B. Gemeindeanlass" />
				{:else}
					<p>{ev.details ?? '–'}</p>
				{/if}
			</div>
		{:else if data.canCommon}
			<input type="hidden" name="details" form="commonForm" value={ev.details ?? ''} />
		{/if}
		{#if data.isSunday && data.off}
			{#if data.canCommon}
				<input type="hidden" name="topic" form="commonForm" value={ev.topic ?? ''} />
				<input type="hidden" name="topicUrl" form="commonForm" value={ev.topicUrl ?? ''} />
			{/if}
		{:else if data.isSunday}
			<div class="grid-2">
				<div class="field">
					<label for="topic">Thema</label>
					{#if data.canCommon}
						<input id="topic" name="topic" type="text" form="commonForm" value={ev.topic ?? ''} />
					{:else}
						<p>{ev.topic ?? '–'}</p>
					{/if}
				</div>
				<div class="field">
					<label for="topicUrl">Link</label>
					{#if data.canCommon}
						<div class="link-row">
							<input id="topicUrl" name="topicUrl" type="text" inputmode="url" form="commonForm" value={ev.topicUrl ?? ''} placeholder="https://" />
							{#if ev.topicUrl}<a class="btn" href={ev.topicUrl} target="_blank" rel="noopener noreferrer">Öffnen</a>{/if}
						</div>
					{:else if ev.topicUrl}
						<p><a href={ev.topicUrl} target="_blank" rel="noopener noreferrer">{ev.topicUrl}</a></p>
					{:else}
						<p>–</p>
					{/if}
				</div>
			</div>
		{:else}
			<div class="grid-2">
				{#if !data.off && kind !== 'basel'}
					<div class="field">
						<label for="thought">Geistiger Gedanke</label>
						{#if data.canCommon}
							<MemberSelect id="thought" name="thought" form="commonForm" options={thoughtOptions} value={data.full.thoughtId} />
						{:else}
							<p>{data.full.thoughtName ?? '–'}</p>
						{/if}
					</div>
				{:else if data.canCommon}
					<input type="hidden" name="thought" form="commonForm" value={data.full.thoughtId ?? ''} />
				{/if}
				<div class="field">
					<label for="snack">Snack</label>
					{#if data.canCommon}
						<input id="snack" name="snack" type="text" form="commonForm" value={ev.snack ?? ''} />
					{:else}
						<p>{ev.snack ?? '–'}</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if !data.off && kind === 'basel'}
		<p class="hint">Basel leitet: Leitung und Gedanke übernimmt Basel, der Snack ist freiwillig.</p>
	{/if}
	{#if !data.off}
		{#each sections as s (s.side)}{@render partSection(s)}{/each}

		{#if !data.isSunday}
		<div class="section">
			<h2>Erwachsene</h2>
			{#if !data.adults.length}
				<p class="hint">Noch keine Bischofschaft oder Jugendleitung erfasst.</p>
			{/if}
			<div class="adults">
				{#each data.adults as a (a.id)}
					<div class="adult" class:is-present={a.present === true} class:is-absent={a.present === false}>
						<span class="adult-name">{a.name}</span>
						{#if data.canCommon}
							<div class="seg" role="radiogroup" aria-label="Anwesenheit {a.name}">
								<label><input type="radio" name="adult_{a.id}" value="" form="adultsForm" checked={a.present === null} /><span>–</span></label>
								<label><input type="radio" name="adult_{a.id}" value="1" form="adultsForm" checked={a.present === true} /><span>anwesend</span></label>
								<label><input type="radio" name="adult_{a.id}" value="0" form="adultsForm" checked={a.present === false} /><span>abwesend</span></label>
							</div>
						{:else}
							<span class="adult-state">{presentLabel(a.present)}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
		{/if}
	{/if}
</div>

<div class="savebar no-print">
	<span class="savebar-status" class:err={autosave.status.kind === 'error'}>{autosave.status.text}</span>
	{#if autosave.conflict}<button class="btn btn-primary" type="button" onclick={() => location.reload()}>Seite neu laden</button>{/if}
</div>

<style>
	.link-row { display: flex; gap: 0.5rem; }
	.link-row input { flex: 1; min-width: 0; }
	.adults { display: flex; flex-direction: column; }
	.adult { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-top: 1px solid var(--line); }
	.adult:first-child { border-top: 0; }
	.adult-name { font-weight: 600; }
	.adult.is-present .adult-name { color: var(--ok); }
	.adult.is-absent .adult-name { color: var(--danger); }
	.adult-state { color: var(--muted); }
	/* Segmented control over the real radios: keyboard and autosave stay untouched. */
	.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; background: var(--surface); }
	.seg label { position: relative; cursor: pointer; }
	.seg input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
	.seg span { display: block; padding: 0.3rem 0.8rem; font-size: 0.9rem; color: var(--muted); min-width: 2.2rem; text-align: center; border-left: 1px solid var(--line); }
	.seg label:first-child span { border-left: 0; }
	.seg input:focus-visible + span { outline: 2px solid var(--primary); outline-offset: -2px; }
	.seg input:checked + span { color: #fff; }
	.seg label:nth-child(1) input:checked + span { background: var(--muted); }
	.seg label:nth-child(2) input:checked + span { background: var(--ok); }
	.seg label:nth-child(3) input:checked + span { background: var(--danger); }
	@media (max-width: 640px) { .adult { flex-direction: column; align-items: flex-start; gap: 0.3rem; } }
</style>
