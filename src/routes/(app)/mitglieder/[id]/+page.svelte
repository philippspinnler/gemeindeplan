<script lang="ts">
	import { enhance } from '$app/forms';
	import { createAutosave } from '$lib/autosave.svelte';
	let { data, form } = $props();
	let formError = $derived(form?.error);
	const m = $derived(data.member);
	const kind = $derived(m.kind);
	const autosave = createAutosave({ deps: () => data, onSaved: () => (formError = undefined) });
</script>

<p><a class="back" href={data.backHref}>{data.backLabel}</a></p>
<h1>{data.title}</h1>
{#if formError}<div class="error">{formError}</div>{/if}

<div class="section">
	{#if data.canEdit}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<form id="memberForm" method="POST" action="?/update" use:enhance={() => autosave.saved('member')} {...autosave.handlers}>
			<input type="hidden" name="version" value={data.version} />
			<div class="grid-2">
				<div class="field"><label for="fn">Vorname</label><input id="fn" name="firstName" type="text" required value={m.firstName} /></div>
				<div class="field"><label for="ln">Nachname</label><input id="ln" name="lastName" type="text" value={m.lastName} /></div>
				<input type="hidden" name="kind" value={kind} />
			</div>
			{#if kind === 'pfahl'}
				<div class="field">
					<label for="calling">Berufung</label>
					<select id="calling" name="stakeCallingId">
						<option value="">– keine –</option>
						{#each data.callings as c}<option value={c.id} selected={c.id === m.stakeCallingId}>{c.name}</option>{/each}
					</select>
				</div>
			{:else}
				<div class="field"><label for="af">Bemerkung (optional, erscheint in Klammern)</label><input id="af" name="affiliation" type="text" value={m.affiliation ?? ''} placeholder="z.B. Missionar" /></div>
			{/if}
			{#if kind === 'gemeinde'}
				<div class="grid-2">
					<div class="field"><label for="nt">Notiz Ansprache</label><input id="nt" name="noteTalk" type="text" value={m.noteTalk ?? ''} /></div>
					<div class="field"><label for="np">Notiz Gebet</label><input id="np" name="notePrayer" type="text" value={m.notePrayer ?? ''} /></div>
				</div>
				<div class="grid-2">
					<label class="check"><input type="checkbox" name="noTalk" value="1" checked={m.noTalk} /> Möchte keine Ansprache halten</label>
					<label class="check"><input type="checkbox" name="noPrayer" value="1" checked={m.noPrayer} /> Möchte kein Gebet sprechen</label>
				</div>
			{/if}
			<label class="check"><input type="checkbox" name="hidden" value="1" checked={!m.active} /> Ausblenden (erscheint nicht in Auswahllisten)</label>
		</form>
		<div class="savebar no-print">
			<span class="savebar-status" class:err={autosave.status.kind === 'error'}>{autosave.status.text}</span>
			{#if autosave.conflict}<button class="btn btn-primary" type="button" onclick={() => location.reload()}>Seite neu laden</button>{/if}
		</div>
	{:else}
		<p><strong>Art:</strong> {m.kind === 'pfahl' ? `Pfahlbeamter${m.calling ? ` (${m.calling})` : ''}` : `Gemeindemitglied${m.affiliation ? ` (${m.affiliation})` : ''}`} · <strong>Status:</strong> {m.active ? 'auswählbar' : 'ausgeblendet'}</p>
		{#if data.stats && m.kind === 'gemeinde'}
			{#if m.noteTalk}<p><strong>Notiz Ansprache:</strong> {m.noteTalk}</p>{/if}
			{#if m.notePrayer}<p><strong>Notiz Gebet:</strong> {m.notePrayer}</p>{/if}
			{#if m.noTalk}<p>Möchte keine Ansprache halten.</p>{/if}
			{#if m.noPrayer}<p>Möchte kein Gebet sprechen.</p>{/if}
		{/if}
	{/if}
</div>

{#if data.stats && m.kind === 'gemeinde'}
	<div class="section">
		<h2>Einsätze</h2>
		{#if data.history.length === 0}
			<p class="muted">Noch keine Ansprachen oder Gebete erfasst.</p>
		{:else}
			<table class="table stack">
				<thead><tr><th>Datum</th><th>Was</th></tr></thead>
				<tbody>
					{#each data.history as h}
						<tr><td class="td-main td-inline"><a href="/sonntag/{h.date}">{h.dateLabel}</a></td><td class="td-inline">{h.what}</td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
{/if}
