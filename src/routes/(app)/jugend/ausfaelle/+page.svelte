<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { formatDateShort } from '$lib/dates';
	let { data, form } = $props();
	let newKind = $state('ferien');
</script>

<div class="section-title">
	<h2>Ausfälle & Pfahltermine</h2>
	<div class="actions"><a class="btn" href={data.showAll ? '/jugend/ausfaelle' : '/jugend/ausfaelle?alle=1'}>{data.showAll ? 'Nur kommende' : 'Alle anzeigen'}</a></div>
</div>
<p class="hint">Ferien lassen alle Mittwoche im Zeitraum ausfallen. Ein anderer Termin (Tempel, Supersamstag, Tanzabend, Pfahl) wird nur mit seinem Datum erfasst, "Bis" bleibt leer; die Aktivität am Mittwoch derselben Woche (Montag bis Sonntag) fällt dann aus, ausser das Häkchen "Mittwochsaktivität fällt aus" ist entfernt. Dann steht der Termin nur als Hinweis beim Mittwoch. Ein Klick auf einen Eintrag öffnet ihn zum Bearbeiten.</p>

{#if form?.error}<div class="error">{form.error}</div>{/if}

<div class="section">
	<form method="POST" action="?/create" use:enhance class="grid-2">
		<div class="field">
			<label for="kind">Art</label>
			<select id="kind" name="kind" bind:value={newKind}>
				{#each Object.entries(data.kinds) as [k, l]}<option value={k}>{l}</option>{/each}
			</select>
		</div>
		<div class="field"><label for="label">Bezeichnung</label><input id="label" name="label" type="text" placeholder="z.B. Herbstferien" /></div>
		<div class="field"><label for="from">Von</label><input id="from" name="fromDate" type="date" required /></div>
		<div class="field"><label for="to">Bis</label><input id="to" name="toDate" type="date" /></div>
		{#if newKind !== 'ferien'}<label class="check"><input type="checkbox" name="cancels" value="1" checked /> Mittwochsaktivität fällt aus</label>{/if}
		<div class="actions"><button class="btn btn-primary" type="submit">Hinzufügen</button></div>
	</form>
</div>

<div class="section table-wrap">
	<table class="table stack">
		<thead><tr><th>Zeitraum</th><th>Text</th><th>Art</th><th>Mittwoch</th></tr></thead>
		<tbody>
			{#each data.breaks as b (b.id)}
				<tr class="clickable" onclick={() => goto(`/jugend/ausfaelle/${b.id}`)}>
					<td class="td-main"><a href="/jugend/ausfaelle/{b.id}">{formatDateShort(b.fromDate)}{b.toDate !== b.fromDate ? ` – ${formatDateShort(b.toDate)}` : ''}</a></td>
					<td data-label={b.label ? 'Text' : null}>{b.label ?? ''}</td>
					<td data-label="Art">{data.kinds[b.kind]}</td>
					<td data-label="Mittwoch">{b.cancels ? 'fällt aus' : 'findet statt'}</td>
				</tr>
			{:else}
				<tr><td colspan="4">Keine Einträge.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
