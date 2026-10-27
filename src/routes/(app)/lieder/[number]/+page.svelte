<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<p><a class="back" href="/lieder">Lieder</a></p>
<h1>{data.hymn.number} – {data.hymn.title}</h1>
{#if form?.error}<div class="error">{form.error}</div>{/if}
{#if form?.saved}<div class="success">Gespeichert.</div>{/if}

<div class="section">
	{#if data.canEdit}
		<form method="POST" action="?/update" use:enhance class="grid-2">
			<div class="field"><label for="ti">Titel</label><input id="ti" name="title" type="text" required value={data.hymn.title} /></div>
			<div class="field"><label for="du">Dauer (m:ss)</label><input id="du" name="duration" type="text" value={data.hymn.duration} placeholder="3:45" /></div>
			<div class="actions"><button class="btn btn-primary" type="submit">Speichern</button></div>
		</form>
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
