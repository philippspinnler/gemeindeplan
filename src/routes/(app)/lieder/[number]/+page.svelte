<script lang="ts">
	import { enhance } from '$app/forms';
	import { createAutosave } from '$lib/autosave.svelte';
	let { data, form } = $props();
	let formError = $derived(form?.error);
	const autosave = createAutosave({ deps: () => data, onSaved: () => (formError = undefined) });
</script>

<p><a class="back" href="/lieder">Lieder</a></p>
<h1>{data.hymn.number} – {data.hymn.title}</h1>
{#if formError}<div class="error">{formError}</div>{/if}

<div class="section">
	{#if data.canEdit}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<form id="hymnForm" method="POST" action="?/update" use:enhance={() => autosave.saved('hymn')} class="grid-2" {...autosave.handlers}>
			<input type="hidden" name="version" value={data.version} />
			<div class="field"><label for="ti">Titel</label><input id="ti" name="title" type="text" required value={data.hymn.title} /></div>
			<div class="field"><label for="du">Dauer (m:ss, optional)</label><input id="du" name="duration" type="text" value={data.hymn.duration} placeholder="z.B. 3:45" /></div>
		</form>
		<div class="savebar no-print">
			<span class="savebar-status" class:err={autosave.status.kind === 'error'}>{autosave.status.text}</span>
			{#if autosave.conflict}<button class="btn btn-primary" type="button" onclick={() => location.reload()}>Seite neu laden</button>{/if}
		</div>
	{:else}
		<p><strong>Buch:</strong> {data.hymn.book === 'neu' ? 'Neue Lieder' : 'Gesangbuch'} · <strong>Dauer:</strong> {data.hymn.duration || 'unbekannt'}</p>
	{/if}
</div>

<div class="section">
	<h2>Gesungen</h2>
	{#if data.history.length === 0}
		<p class="muted">Noch nie geplant.</p>
	{:else}
		<table class="table stack">
			<thead><tr><th>Datum</th><th>Als</th></tr></thead>
			<tbody>{#each data.history as h}<tr><td class="td-main td-inline"><a href="/sonntag/{h.date}">{h.dateLabel}</a></td><td class="td-inline muted">{h.slot}</td></tr>{/each}</tbody>
		</table>
	{/if}
</div>
